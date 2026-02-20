/* STM32F407VG memory layout
 *
 * FLASH : 1 MiB — program code + read-only data
 * RAM   : 192 KiB — stack + .bss + .data
 * CCMRAM: 64 KiB  — zero-latency tightly coupled RAM (optional for hot paths)
 *
 * Adjust origin/length for other STM32F4 variants:
 *   STM32F401: FLASH 256K/512K, RAM 64K/96K, no CCMRAM
 *   STM32F429: FLASH 2M, RAM 256K, CCMRAM 64K
 */

MEMORY
{
  FLASH  (rx)  : ORIGIN = 0x08000000, LENGTH = 1024K
  RAM    (rwx) : ORIGIN = 0x20000000, LENGTH = 128K
  CCMRAM (rwx) : ORIGIN = 0x10000000, LENGTH = 64K
}

/* All stack in main RAM */
_stack_start = ORIGIN(RAM) + LENGTH(RAM);

/* Offline buffer region (last 32 KiB of RAM — shared with SVM scratch) */
_eyeflow_offline_buf_start = ORIGIN(RAM) + LENGTH(RAM) - 32K;
_eyeflow_offline_buf_len   = 32K;
