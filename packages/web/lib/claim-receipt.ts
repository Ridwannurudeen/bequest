import type { PublicBequestConfig } from "./config";
import { currentPackage } from "./live-proof";

export type ClaimReceiptStatus = "ready-to-wire" | "sponsored-proof-live";

export type ClaimReceipt = {
  estateId: string;
  heirLabel: string;
  heirBinding: string;
  heirShare: string;
  assetSummary: string;
  letterPolicy: string;
  status: ClaimReceiptStatus;
};

export type ClaimReceiptStep = {
  label: string;
  state: "done" | "waiting" | "next";
  detail: string;
};

export const suiCoinType = "0x2::sui::SUI";

export const demoClaimReceipt: ClaimReceipt = {
  estateId: "demo",
  heirLabel: "Maya",
  heirBinding: "google:maya@example.com",
  heirShare: "70%",
  assetSummary: "SUI + family archive object",
  letterPolicy: "Seal key releases only after Estate status is Triggered",
  status: "ready-to-wire"
};

export function explorerObjectUrl(objectId: string) {
  return `https://suiscan.xyz/testnet/object/${objectId}`;
}

export function explorerTxUrl(digest: string) {
  return `https://suiscan.xyz/testnet/tx/${digest}`;
}

export function resolvedPackageId(config: PublicBequestConfig) {
  return config.packageId ?? currentPackage.packageId;
}

export function claimTarget(config: PublicBequestConfig) {
  return (
    config.claimTarget ??
    `${resolvedPackageId(config)}::${config.estateModule}::distribute_coin`
  );
}

export function claimTypeArguments() {
  return [suiCoinType];
}

export function claimReadiness(config: PublicBequestConfig): ClaimReceiptStep[] {
  const target = claimTarget(config);
  return [
    {
      label: "Sui package",
      state: "done",
      detail: `Published at ${resolvedPackageId(config)}`
    },
    {
      label: "Estate primitives",
      state: "done",
      detail: "Custody, trigger, distribution, and Seal/Walrus policy are proven on testnet."
    },
    {
      label: "Heir claim target",
      state: "done",
      detail: `${target}<${suiCoinType}> is the first sponsored claim path. It distributes the triggered estate's SUI balance to all named heirs.`
    },
    {
      label: "Enoki sponsor",
      state: config.enokiPublicApiKey ? "done" : "waiting",
      detail: config.enokiPublicApiKey
        ? "Public Enoki key configured; server sponsor key remains private."
        : "Waiting for Enoki portal keys and sponsorship allowlist."
    },
    {
      label: "Claim digest",
      state: "next",
      detail:
        "When sponsored execution lands, this receipt page will pin the Sui tx digest and gas sponsor proof."
    }
  ];
}
