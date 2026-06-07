import { getPublicConfig, type PublicBequestConfig } from "./config";
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
  assetSummary: "SUI + StakedSui position + family archive object",
  letterPolicy: "Seal key releases only after Estate status is Triggered",
  status: "ready-to-wire",
};

export function explorerObjectUrl(objectId: string) {
  return `https://suiscan.xyz/${getPublicConfig().network}/object/${objectId}`;
}

export function explorerTxUrl(digest: string) {
  return `https://suiscan.xyz/${getPublicConfig().network}/tx/${digest}`;
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

export function claimTypeArguments(config: PublicBequestConfig) {
  return config.claimTarget ? [] : [suiCoinType];
}

export function claimProofUrl(config: PublicBequestConfig) {
  return config.sponsoredClaimDigest
    ? explorerTxUrl(config.sponsoredClaimDigest)
    : undefined;
}

export function claimReadiness(
  config: PublicBequestConfig,
): ClaimReceiptStep[] {
  const target = claimTarget(config);
  const typeArguments = claimTypeArguments(config);
  const typeArgumentLabel =
    typeArguments.length > 0 ? `<${typeArguments.join(", ")}>` : "";
  return [
    {
      label: "Sui package",
      state: "done",
      detail: `Published at ${resolvedPackageId(config)}`,
    },
    {
      label: "Estate primitives",
      state: "done",
      detail:
        "Custody, trigger, distribution, and Seal/Walrus policy are proven on testnet.",
    },
    {
      label: "Heir claim target",
      state: "done",
      detail: `${target}${typeArgumentLabel} is the first sponsored claim path. It distributes the triggered estate's SUI balance to all named heirs; object and stake bundles are pushed through the keeper's distribute_objects path.`,
    },
    {
      label: "Enoki sponsor",
      state: config.enokiPublicApiKey ? "done" : "waiting",
      detail: config.enokiPublicApiKey
        ? "Public Enoki key configured; server sponsor key remains private."
        : "Waiting for Enoki portal keys and sponsorship allowlist.",
    },
    {
      label: "Sponsored claim digest",
      state: config.sponsoredClaimDigest ? "done" : "next",
      detail: config.sponsoredClaimDigest
        ? `Pinned Sui transaction ${config.sponsoredClaimDigest}; use SuiScan to verify the sponsored distribution.`
        : "Not proven yet. Do not claim a gasless Google heir flow until a sponsored Sui tx digest is pinned here.",
    },
  ];
}
