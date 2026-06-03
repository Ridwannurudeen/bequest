import type { EstateStatus } from "./types.js";

/**
 * Canonical numeric status from the Sui Succession Standard (SSS v0).
 * A compliant on-chain policy exposes `status: u8` using these values.
 */
export const SuccessionStatus = {
  ACTIVE: 0,
  PENDING: 1,
  TRIGGERED: 2,
} as const;

export type SuccessionStatusCode =
  (typeof SuccessionStatus)[keyof typeof SuccessionStatus];

const CODE_TO_NAME: Record<SuccessionStatusCode, EstateStatus> = {
  0: "Active",
  1: "Pending",
  2: "Triggered",
};

/** Map an on-chain `u8` status to a product-facing name. Unknown codes read as Active. */
export function statusName(code: number): EstateStatus {
  return CODE_TO_NAME[code as SuccessionStatusCode] ?? "Active";
}

/** Map a product-facing name to the on-chain `u8` (Claimed collapses to TRIGGERED). */
export function statusCode(name: EstateStatus): SuccessionStatusCode {
  switch (name) {
    case "Active":
      return SuccessionStatus.ACTIVE;
    case "Pending":
      return SuccessionStatus.PENDING;
    case "Triggered":
    case "Claimed":
      return SuccessionStatus.TRIGGERED;
  }
}

/** Heirs may claim, and Seal decryption is unlocked, only after TRIGGERED. */
export function isClaimable(code: number): boolean {
  return code === SuccessionStatus.TRIGGERED;
}
