/*! eyeflow-svm-mcu — Embassy MCU firmware entry point
 *
 * Spec §8.4 / §15 — no_std SVM runtime for Cortex-M4F / STM32F4xx
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ Embassy async executor (single-threaded; no heap required)          │
 *   │                                                                     │
 *   │  [edge_link_task]   USART2 ↔ EdgeNode binary framing               │
 *   │        │                                                            │
 *   │        ▼  IR artifact (compiled EyeFlow rule bytecode)             │
 *   │  [svm_task]         MicroSVM::execute()                            │
 *   │        │                                                            │
 *   │        ▼  opcodes: CALL_SERVICE | CALL_ACTION | BRANCH | RETURN    │
 *   │  [offline_task]     OfflineBuffer::flush_or_queue()                │
 *   │        │            – queues when offline, flushes on reconnect     │
 *   │        ▼                                                            │
 *   │  [led_task]         heartbeat LED (PA5 on Nucleo-F4)               │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * Invariants:
 *   – `#![no_std]` — zero libc / allocator dependency
 *   – All buffers are compile-time-sized via `heapless::Vec`
 *   – Panic halts with defmt error + LED blink code (never unwinds)
 */

#![no_std]
#![no_main]

use defmt_rtt as _;        // RTT transport for defmt
use panic_probe as _;      // Panic handler → RTT + halt

use embassy_executor::Spawner;
use embassy_stm32::{
    gpio::{Level, Output, Speed},
    usart::{Config as UsartConfig, Uart},
    Config,
};
use embassy_time::{Duration, Timer};

mod svm;
mod offline;

use svm::{MicroSvm, SvmResult};
use offline::OfflineBuffer;

// ── Heartbeat LED ─────────────────────────────────────────────────────────────

#[embassy_executor::task]
async fn led_task(mut led: Output<'static>) {
    loop {
        led.set_high();
        Timer::after(Duration::from_millis(100)).await;
        led.set_low();
        Timer::after(Duration::from_millis(900)).await;
    }
}

// ── Edge-link receive task ────────────────────────────────────────────────────

/// Maximum size of a received IR artifact frame (bytes).
const MAX_FRAME_LEN: usize = 4096;

/// Shared channel capacity between edge_link_task and svm_task.
/// We keep a single-slot channel — the SVM must consume before the next frame.
static SVM_CHANNEL: embassy_executor::raw::TaskStorage<svm::SvmTaskState> =
    embassy_executor::raw::TaskStorage::new();

#[embassy_executor::task]
async fn edge_link_task(
    mut uart: Uart<'static>,
    spawner: Spawner,
) {
    defmt::info!("EyeFlow edge-link ready (USART2 115200 8N1)");

    let mut rx_buf: heapless::Vec<u8, MAX_FRAME_LEN> = heapless::Vec::new();

    loop {
        let mut byte = [0u8; 1];
        match uart.read(&mut byte).await {
            Ok(_) => {
                // Simple framing: 0xAA 0x55 <len_hi> <len_lo> <payload...> — see spec §8.4
                if !rx_buf.is_empty() || byte[0] == 0xAA {
                    if rx_buf.push(byte[0]).is_err() {
                        defmt::warn!("RX buffer overflow — discarding frame");
                        rx_buf.clear();
                        continue;
                    }
                }

                // Detect complete frame
                if rx_buf.len() >= 4 && rx_buf[0] == 0xAA && rx_buf[1] == 0x55 {
                    let payload_len =
                        ((rx_buf[2] as usize) << 8) | (rx_buf[3] as usize);
                    if rx_buf.len() == 4 + payload_len {
                        let payload = &rx_buf[4..];
                        defmt::debug!("Frame received: {} bytes", payload.len());

                        // Execute in the SVM synchronously (this task drives the SVM)
                        execute_svm_frame(payload).await;
                        rx_buf.clear();
                    }
                }
            }
            Err(e) => {
                defmt::error!("USART read error: {:?}", e);
                Timer::after(Duration::from_millis(10)).await;
            }
        }
    }
}

/// Drive the MicroSVM for one received frame.
async fn execute_svm_frame(payload: &[u8]) {
    let mut svm = MicroSvm::new();
    let mut offline = OfflineBuffer::new();

    match svm.execute(payload, &mut offline).await {
        SvmResult::Ok(output_len) => {
            defmt::info!("SVM ok: {} output bytes", output_len);
            offline.flush_pending().await;
        }
        SvmResult::ValidationError(code) => {
            defmt::error!("SVM IR validation error: {}", code);
        }
        SvmResult::RuntimeError(code) => {
            defmt::error!("SVM runtime error: {}", code);
        }
        SvmResult::OfflineQueued(n) => {
            defmt::warn!("SVM offline: {} actions queued", n);
        }
    }
}

// ── Firmware entry point ──────────────────────────────────────────────────────

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    // Board initialization — use default clocks (HSI 16 MHz) for portability.
    // Production firmware should configure the PLL for 168 MHz here.
    let p = embassy_stm32::init(Config::default());

    defmt::info!("EyeFlow SVM MCU firmware v{}", env!("CARGO_PKG_VERSION"));
    defmt::info!("Target: Cortex-M4F / STM32F4xx");

    // Heartbeat LED — PA5 (Nucleo-F407 on-board LED)
    let led = Output::new(p.PA5, Level::Low, Speed::Low);
    spawner.spawn(led_task(led)).unwrap();

    // USART2 — PA2 (TX) / PA3 (RX) — 115200 bps
    let mut usart_cfg = UsartConfig::default();
    usart_cfg.baudrate = 115_200;
    let uart = Uart::new(
        p.USART2,
        p.PA3, // RX
        p.PA2, // TX
        crate::Irqs,
        p.DMA1_CH6, // TX DMA
        p.DMA1_CH5, // RX DMA
        usart_cfg,
    )
    .unwrap();

    spawner.spawn(edge_link_task(uart, spawner)).unwrap();

    // Main task loops forever (Embassy needs at least one live task)
    loop {
        Timer::after(Duration::from_secs(60)).await;
    }
}

// ── Interrupt bindings ────────────────────────────────────────────────────────
embassy_stm32::bind_interrupts!(struct Irqs {
    USART2 => embassy_stm32::usart::InterruptHandler<embassy_stm32::peripherals::USART2>;
});
