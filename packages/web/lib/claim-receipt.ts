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
  return config.claimTarget;
}

export function claimReadiness(config: PublicBequestConfig): ClaimReceiptStep[] {
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
      state: config.claimTarget ? "done" : "waiting",
      detail:
        config.claimTarget ??
        "Waiting for Lane A to confirm the exact heir claim Move entrypoint."
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
