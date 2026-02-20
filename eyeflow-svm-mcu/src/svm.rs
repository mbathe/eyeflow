/*! eyeflow-svm-mcu::svm — Minimal no_std SVM executor
 *
 * Spec §8.4 — MCU-resident SVM subset
 *
 * Supported opcodes:
 *   0x01  CALL_SERVICE  — invoke a local sensor/actuator service
 *   0x02  CALL_ACTION   — invoke an output action (relay, GPIO, etc.)
 *   0x03  BRANCH        — conditional jump based on register flag
 *   0x04  RETURN        — halt execution and return output slot
 *
 * IR binary layout (per spec §5.3 MCU profile):
 * ┌─────────────────────────────────────────────────────┐
 * │ Header (8 bytes)                                    │
 * │   [0..2]  magic    : 0xEF_F1                        │
 * │   [2]     version  : u8 (must be 1)                 │
 * │   [3]     flags    : u8 (0x01 = no_std profile)     │
 * │   [4..6]  num_instr: u16 BE                         │
 * │   [6..8]  reserved : u16                            │
 * ├─────────────────────────────────────────────────────┤
 * │ Instructions (variable)                             │
 * │   [0]   opcode  : u8                                │
 * │   [1]   operands: 7 bytes (opcode-specific)         │
 * └─────────────────────────────────────────────────────┘
 *
 * Registers:
 *   R[0..7]  — 8 × u16 general-purpose registers
 *   flags    — u8 bitmask (bit 0 = Zero, bit 1 = Carry, bit 2 = Error)
 *
 * No heap, no alloc — all buffers are heapless.
 */

use heapless::{Vec, String};
use defmt;

use crate::offline::OfflineBuffer;

// ── Constants ─────────────────────────────────────────────────────────────────

const MAGIC_HI: u8 = 0xEF;
const MAGIC_LO: u8 = 0xF1;

const IR_VERSION:  u8 = 1;
const FLAG_NO_STD: u8 = 0x01;

const HEADER_LEN: usize = 8;
const INSTR_LEN:  usize = 8; // opcode(1) + operands(7)

const MAX_INSTRUCTIONS: usize = 256;
const MAX_OUTPUT_LEN:   usize = 512;
const MAX_SERVICE_ID:   u8    = 64;

// ── Register file ─────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct Registers {
    pub r:     [u16; 8],
    pub flags: u8,
}

impl Registers {
    pub fn zero_flag(&self)  -> bool { self.flags & 0x01 != 0 }
    pub fn error_flag(&self) -> bool { self.flags & 0x04 != 0 }
    pub fn set_zero(&mut self, v: bool) {
        if v { self.flags |= 0x01 } else { self.flags &= !0x01 }
    }
    pub fn set_error(&mut self, v: bool) {
        if v { self.flags |= 0x04 } else { self.flags &= !0x04 }
    }
}

// ── SVM result ────────────────────────────────────────────────────────────────

#[derive(Debug, defmt::Format)]
pub enum SvmResult {
    /// Execution completed successfully; contains output byte count.
    Ok(usize),
    /// IR header/version check failed; contains error code.
    ValidationError(u8),
    /// Runtime fault (illegal opcode, out-of-bounds, etc.).
    RuntimeError(u8),
    /// Service/action execution failed — result queued offline.
    OfflineQueued(usize),
}

// ── Task state (for channel) ──────────────────────────────────────────────────

pub struct SvmTaskState;

// ── Micro SVM ─────────────────────────────────────────────────────────────────

pub struct MicroSvm {
    pub regs:   Registers,
    /// Output accumulation buffer — written by RETURN opcode
    pub output: Vec<u8, MAX_OUTPUT_LEN>,
}

impl MicroSvm {
    pub fn new() -> Self {
        Self {
            regs:   Registers::default(),
            output: Vec::new(),
        }
    }

    /// Execute a compiled IR artifact from a byte slice.
    ///
    /// # Safety
    /// `payload` must originate from a trusted, cryptographically-verified
    /// edge node. MCU-side signature verification is not (yet) implemented
    /// in this profile — the connection trust model is the transport layer
    /// (TLS/DTLS on the USART framing bridge).
    pub async fn execute(
        &mut self,
        payload: &[u8],
        offline: &mut OfflineBuffer,
    ) -> SvmResult {
        // ── Header validation ──────────────────────────────────────────────
        if payload.len() < HEADER_LEN {
            defmt::error!("IR too short: {} bytes", payload.len());
            return SvmResult::ValidationError(0x01);
        }

        if payload[0] != MAGIC_HI || payload[1] != MAGIC_LO {
            defmt::error!("IR magic mismatch: {:02x} {:02x}", payload[0], payload[1]);
            return SvmResult::ValidationError(0x02);
        }

        if payload[2] != IR_VERSION {
            defmt::error!(
                "IR version mismatch: expected {} got {}",
                IR_VERSION, payload[2]
            );
            return SvmResult::ValidationError(0x03);
        }

        if payload[3] & FLAG_NO_STD == 0 {
            defmt::warn!("IR flags: no_std profile bit not set ({})", payload[3]);
            // Warn only — continue execution
        }

        let num_instr = u16::from_be_bytes([payload[4], payload[5]]) as usize;
        defmt::debug!("IR header ok: {} instructions", num_instr);

        let expected_len = HEADER_LEN + num_instr * INSTR_LEN;
        if payload.len() < expected_len {
            defmt::error!(
                "IR truncated: expected {} bytes, got {}",
                expected_len, payload.len()
            );
            return SvmResult::ValidationError(0x04);
        }

        // ── Execute instructions ──────────────────────────────────────────
        let mut pc: usize = 0;
        let mut offline_count: usize = 0;

        while pc < num_instr {
            let offset = HEADER_LEN + pc * INSTR_LEN;
            let instr = &payload[offset..offset + INSTR_LEN];
            let opcode = instr[0];
            let ops    = &instr[1..]; // 7 operand bytes

            defmt::trace!("PC={} opcode=0x{:02x}", pc, opcode);

            match opcode {
                // ── CALL_SERVICE (0x01) ────────────────────────────────────
                // ops[0]: service_id (0..MAX_SERVICE_ID)
                // ops[1]: input_reg  (0..7) — register with input value
                // ops[2]: output_reg (0..7) — register to store result
                0x01 => {
                    let svc_id   = ops[0];
                    let in_reg   = (ops[1] & 0x07) as usize;
                    let out_reg  = (ops[2] & 0x07) as usize;

                    if svc_id >= MAX_SERVICE_ID {
                        defmt::error!("CALL_SERVICE: invalid service_id {}", svc_id);
                        self.regs.set_error(true);
                        pc += 1;
                        continue;
                    }

                    let input_val = self.regs.r[in_reg];
                    match dispatch_service(svc_id, input_val, offline).await {
                        Ok(result) => {
                            self.regs.r[out_reg] = result;
                            self.regs.set_zero(result == 0);
                            self.regs.set_error(false);
                            defmt::debug!("CALL_SERVICE svc={} → r[{}]={}", svc_id, out_reg, result);
                        }
                        Err(e) => {
                            defmt::error!("CALL_SERVICE svc={} error: {}", svc_id, e);
                            self.regs.set_error(true);
                            offline_count += 1;
                        }
                    }
                }

                // ── CALL_ACTION (0x02) ────────────────────────────────────
                // ops[0]: action_id (any u8, interpreted by dispatch_action)
                // ops[1]: value_reg (0..7) — register with action payload
                // ops[2..6]: extra args (e.g., GPIO port/pin)
                0x02 => {
                    let action_id = ops[0];
                    let val_reg   = (ops[1] & 0x07) as usize;
                    let value     = self.regs.r[val_reg];
                    let args      = &ops[2..]; // 5 extra bytes

                    match dispatch_action(action_id, value, args, offline).await {
                        Ok(_) => {
                            self.regs.set_error(false);
                            defmt::debug!("CALL_ACTION action={} value={}", action_id, value);
                        }
                        Err(e) => {
                            defmt::error!("CALL_ACTION action={} error: {}", action_id, e);
                            self.regs.set_error(true);
                            offline_count += 1;
                        }
                    }
                }

                // ── BRANCH (0x03) ─────────────────────────────────────────
                // ops[0]: condition (0=Zero, 1=NonZero, 2=Error, 3=NoError)
                // ops[1..2]: target_pc (u16 BE — absolute instruction index)
                0x03 => {
                    let condition = ops[0];
                    let target_pc = u16::from_be_bytes([ops[1], ops[2]]) as usize;

                    let take = match condition {
                        0 => self.regs.zero_flag(),         // BEQ
                        1 => !self.regs.zero_flag(),        // BNE
                        2 => self.regs.error_flag(),        // BERR
                        3 => !self.regs.error_flag(),       // BNOERR
                        _ => {
                            defmt::warn!("BRANCH: unknown condition {}", condition);
                            false
                        }
                    };

                    if take {
                        if target_pc >= num_instr {
                            defmt::error!("BRANCH: target_pc {} out of range", target_pc);
                            return SvmResult::RuntimeError(0x10);
                        }
                        defmt::debug!("BRANCH taken: PC={} → {}", pc, target_pc);
                        pc = target_pc;
                        continue; // skip pc += 1 at bottom
                    }
                }

                // ── RETURN (0x04) ─────────────────────────────────────────
                // ops[0]: output_reg (0..7) — register value to emit
                // Halts execution and writes output register to output buffer.
                0x04 => {
                    let out_reg = (ops[0] & 0x07) as usize;
                    let result  = self.regs.r[out_reg];

                    // Write u16 output to output buffer (big-endian)
                    if self.output.push((result >> 8) as u8).is_err()
                        || self.output.push((result & 0xFF) as u8).is_err()
                    {
                        defmt::warn!("RETURN: output buffer full");
                    }

                    defmt::debug!("RETURN r[{}]={}", out_reg, result);

                    if offline_count > 0 {
                        return SvmResult::OfflineQueued(offline_count);
                    }
                    return SvmResult::Ok(self.output.len());
                }

                // ── Unknown opcode ────────────────────────────────────────
                op => {
                    defmt::error!("Unknown opcode 0x{:02x} at PC={}", op, pc);
                    return SvmResult::RuntimeError(0x20);
                }
            }

            pc += 1;
        }

        // Implicit RETURN at end of instructions
        if offline_count > 0 {
            return SvmResult::OfflineQueued(offline_count);
        }
        SvmResult::Ok(self.output.len())
    }
}

// ── Service dispatch table ─────────────────────────────────────────────────────
//
// Maps service_id → hardware read/write.
// This is the MCU-local service registry — equivalent to the edge node's
// service catalogue but resolved at compile time to function pointers.
//
// Service IDs (lower 6 bits, 0..63):
//   0x00  READ_GPIO       — read digital input (value = pin id in ops)
//   0x01  READ_ADC        — read ADC channel (12-bit → u16)
//   0x02  READ_TEMP       — internal temperature sensor
//   0x03  READ_TIMESTAMP  — 16-bit millisecond timestamp (wraps at 65,535 ms)
//   0x10..0x1F  RESERVED (future: I2C, SPI peripherals)

async fn dispatch_service(
    svc_id: u8,
    input: u16,
    _offline: &mut OfflineBuffer,
) -> Result<u16, u8> {
    match svc_id {
        0x00 => {
            // READ_GPIO — returns 0 or 1
            // In production: use embassy-stm32 GPIO input read
            defmt::trace!("READ_GPIO pin={}", input);
            Ok(0u16) // Stub: always reads LOW
        }
        0x01 => {
            // READ_ADC — returns 12-bit value
            defmt::trace!("READ_ADC ch={}", input);
            Ok(2048u16) // Stub: midpoint
        }
        0x02 => {
            // READ_TEMP — internal temperature (raw ADC units for now)
            defmt::trace!("READ_TEMP");
            Ok(1500u16) // Stub: ~25°C in raw ADC
        }
        0x03 => {
            // READ_TIMESTAMP — wrapping millisecond counter
            defmt::trace!("READ_TIMESTAMP");
            Ok(embassy_time::Instant::now().as_millis() as u16)
        }
        id => {
            defmt::error!("dispatch_service: unknown id {}", id);
            Err(0xFF)
        }
    }
}

// ── Action dispatch table ──────────────────────────────────────────────────────
//
// Maps action_id → hardware write / side-effect.
//
// Action IDs:
//   0x00  WRITE_GPIO  — set digital output; value = 0/1; args[0] = pin
//   0x01  WRITE_PWM   — set PWM duty cycle (0..65535); args[0] = channel
//   0x02  REPORT      — queue a telemetry report to the offline buffer
//   0x03  ALERT_LED   — blink the alert LED n times; value = count

async fn dispatch_action(
    action_id: u8,
    value: u16,
    args: &[u8],
    offline: &mut OfflineBuffer,
) -> Result<(), u8> {
    match action_id {
        0x00 => {
            let _pin  = args.first().copied().unwrap_or(0);
            defmt::info!("WRITE_GPIO pin={} level={}", _pin, value);
            // In production: use embassy-stm32 GPIO output write
            Ok(())
        }
        0x01 => {
            let _ch = args.first().copied().unwrap_or(0);
            defmt::info!("WRITE_PWM ch={} duty={}", _ch, value);
            // In production: use embassy-stm32 PWM driver
            Ok(())
        }
        0x02 => {
            defmt::info!("REPORT value={}", value);
            offline.enqueue_report(value).await;
            Ok(())
        }
        0x03 => {
            defmt::info!("ALERT_LED blink_count={}", value);
            // In production: signal the led_task via a channel
            Ok(())
        }
        id => {
            defmt::error!("dispatch_action: unknown id {}", id);
            Err(0xFF)
        }
    }
}
