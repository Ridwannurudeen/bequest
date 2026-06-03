import type { BequestSdk, EstateView } from "./types.js";

/** The Grandma Sarah -> Maya demo estate used across the product surface. */
export const demoEstate: EstateView = {
  estateId: "0xbeq_7f43_maya",
  owner: "0xSARAH...1941",
  ownerLabel: "Grandma Sarah",
  status: "Pending",
  inactivityMs: 1000 * 60 * 60 * 24 * 180,
  gracePeriodMs: 1000 * 60 * 60 * 24 * 14,
  executor: "0xEXEC...A11Y",
  heirs: [
    { label: "Maya", binding: "google:maya@example.com", ratioBps: 7000 },
    { label: "Noah", binding: "google:noah@example.com", ratioBps: 3000 },
  ],
  assets: [
    { type: "SUI", label: "SUI balance", value: "5,000 SUI", state: "escrowed" },
    { type: "NFT", label: "Family archive NFT", value: "1 object", state: "escrowed" },
    {
      type: "LETTER",
      label: "Last-wishes letter",
      value: "Walrus blob + Seal policy",
      state: "encrypted",
    },
  ],
  lastActive: "2026-02-24T09:30:00.000Z",
  pendingSince: "2026-05-24T09:30:00.000Z",
  wishesBlobId: "walrus://grandma-sarah-letter",
};

/**
 * A stateful in-memory `BequestSdk` for frontend development and tests. Status
 * transitions follow the standard (heartbeat/executor reset to Active, arm to
 * Pending) so UI flows behave like the live client before the signing layer lands.
 */
export function createMockClient(seed: EstateView = demoEstate): BequestSdk {
  let estate: EstateView = { ...seed };
  return {
    async createEstate() {
      return estate.estateId;
    },
    async deposit() {
      return "0xtx_deposit_assets";
    },
    async setHeirs(_estateId, heirs) {
      estate = { ...estate, heirs };
      return "0xtx_set_heirs";
    },
    async heartbeat() {
      estate = { ...estate, status: "Active" };
      return "0xtx_heartbeat";
    },
    async armTrigger() {
      estate = { ...estate, status: "Pending" };
      return "0xtx_arm_trigger";
    },
    async claim() {
      return "0xtx_gasless_claim";
    },
    async executorOverride(_estateId, action) {
      estate = { ...estate, status: "Active" };
      return `0xtx_executor_${action}`;
    },
    async readEstate() {
      return estate;
    },
    async uploadWishes() {
      return estate.wishesBlobId;
    },
    async decryptWishes() {
      return "My dearest Maya, if you are reading this, the house keys are in the blue tin.";
    },
  };
}

/** A shared default mock instance. */
export const bequestSdkMock: BequestSdk = createMockClient();
