export type EstateStatus = "Active" | "Pending" | "Triggered" | "Claimed";

export type HeirBinding = {
  label: string;
  binding: string;
  ratioBps: number;
};

export type Asset = {
  type: "SUI" | "COIN" | "POSITION" | "OBJECT" | "NFT" | "LETTER";
  label: string;
  value: string;
  state: "escrowed" | "encrypted" | "claimable";
  objectId?: string;
  objectType?: string;
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

const demoEstate: EstateView = {
  estateId: "0xbeq_7f43_maya",
  owner: "0xSARAH...1941",
  ownerLabel: "Grandma Sarah",
  status: "Pending",
  inactivityMs: 1000 * 60 * 60 * 24 * 180,
  gracePeriodMs: 1000 * 60 * 60 * 24 * 14,
  executor: "0xEXEC...A11Y",
  heirs: [
    {
      label: "Maya",
      binding: "google:maya@example.com",
      ratioBps: 7000,
    },
    {
      label: "Noah",
      binding: "google:noah@example.com",
      ratioBps: 3000,
    },
  ],
  assets: [
    {
      type: "SUI",
      label: "SUI balance",
      value: "5,000 SUI",
      state: "escrowed",
    },
    {
      type: "NFT",
      label: "Family archive NFT",
      value: "1 object",
      state: "escrowed",
    },
    {
      type: "POSITION",
      label: "Staked SUI position",
      value: "native stake object",
      state: "escrowed",
      note: "native StakedSui object",
    },
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

export const bequestSdkMock: BequestSdk = {
  async createEstate() {
    return demoEstate.estateId;
  },
  async deposit() {
    return "0xtx_deposit_assets";
  },
  async setHeirs() {
    return "0xtx_set_heirs";
  },
  async heartbeat() {
    return "0xtx_heartbeat";
  },
  async armTrigger() {
    return "0xtx_arm_trigger";
  },
  async claim() {
    return "0xtx_sponsored_claim";
  },
  async executorOverride(_estateId, action) {
    return `0xtx_executor_${action}`;
  },
  async readEstate() {
    return demoEstate;
  },
  async uploadWishes() {
    return demoEstate.wishesBlobId;
  },
  async decryptWishes() {
    return "My dearest Maya — if you are reading this, the house keys are in the blue tin.";
  },
};

export function formatDuration(ms: number) {
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  return `${days} days`;
}

export function ratioLabel(ratioBps: number) {
  return `${ratioBps / 100}%`;
}

export const sdkContract = [
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
