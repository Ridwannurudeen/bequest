/**
 * Canonical product-facing types for a Bequest succession policy.
 *
 * These mirror the frozen `bequest-sdk` interface (the contract between Lane A
 * and Lane B) and are the typed seed of the Sui Succession Standard. See
 * `docs/sss-v0.md` for the on-chain standard these types map onto.
 */

/**
 * Product-facing status. Maps to the SSS numeric `status: u8` via `./status`.
 * "Claimed" is derived (TRIGGERED with the escrow fully distributed); it is not
 * a distinct on-chain status.
 */
export type EstateStatus = "Active" | "Pending" | "Triggered" | "Claimed";

export type HeirBinding = {
  /** Human label shown in UI, e.g. "Maya". */
  label: string;
  /** Claim binding: a zkLogin identity ("google:maya@example.com") or an address. */
  binding: string;
  /** Share in basis points. All heirs MUST sum to 10000; the last takes the remainder. */
  ratioBps: number;
};

export type AssetKind =
  | "SUI"
  | "COIN"
  | "NFT"
  | "POSITION"
  | "OBJECT"
  | "LETTER";

export type Asset = {
  type: AssetKind;
  label: string;
  value: string;
  state: "escrowed" | "encrypted" | "claimable";
  /** On-chain object id, for object/position assets. */
  objectId?: string;
  /** Fully-qualified Move type, for object/position assets. */
  objectType?: string;
  /** Optional human note (e.g. "native Sui stake object"). */
  note?: string;
};

export type EstateView = {
  estateId: string;
  owner: string;
  ownerLabel: string;
  status: EstateStatus;
  inactivityMs: number;
  gracePeriodMs: number;
  executor: string;
  executorAddress?: string;
  heirs: HeirBinding[];
  assets: Asset[];
  lastActive: string;
  pendingSince?: string;
  wishesBlobId: string;
};

export type CreateEstateConfig = {
  ownerLabel: string;
  heirs: HeirBinding[];
  inactivityMs: number;
  gracePeriodMs: number;
  executor?: string;
};

export type TriggerParams = {
  inactivityMs: number;
  gracePeriodMs: number;
  executor?: string;
};

export type ExecutorAction = "pause" | "cancel";

/**
 * The frozen Bequest SDK surface. Lane B builds the entire frontend against
 * this interface; both the live on-chain client and the in-memory mock
 * (`./mock`) implement it, so flows can progress before the signing layer lands.
 */
export type BequestSdk = {
  createEstate(config: CreateEstateConfig): Promise<string>;
  deposit(estateId: string, assets: Asset[]): Promise<string>;
  setHeirs(estateId: string, heirs: HeirBinding[]): Promise<string>;
  heartbeat(estateId: string): Promise<string>;
  armTrigger(estateId: string, params: TriggerParams): Promise<string>;
  claim(estateId: string): Promise<string>;
  executorOverride(estateId: string, action: ExecutorAction): Promise<string>;
  readEstate(estateId: string): Promise<EstateView>;
  uploadWishes(estateId: string, blob: Blob): Promise<string>;
  decryptWishes(estateId: string): Promise<string>;
};

/** The frozen method contract, for documentation and runtime introspection. */
export const SDK_CONTRACT = [
  "createEstate(config) -> estateId",
  "deposit(estateId, assets[])",
  "setHeirs(estateId, heirs[])",
  "heartbeat(estateId)",
  "armTrigger(estateId, params)",
  "claim(estateId)",
  "executorOverride(estateId, action)",
  "readEstate(estateId) -> EstateView",
  "uploadWishes(estateId, blob)",
  "decryptWishes(estateId)",
] as const;

/** True when heir shares form a well-formed split (sum to exactly 10000 bps). */
export function heirsSumValid(heirs: HeirBinding[]): boolean {
  return heirs.reduce((acc, h) => acc + h.ratioBps, 0) === 10_000;
}

export function formatDuration(ms: number): string {
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return `${days} days`;
}

export function ratioLabel(ratioBps: number): string {
  return `${ratioBps / 100}%`;
}
