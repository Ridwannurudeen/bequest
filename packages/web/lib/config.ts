export type SuiNetwork = "testnet" | "mainnet" | "devnet";

export type PublicBequestConfig = {
  network: SuiNetwork;
  packageId?: string;
  estateModule: string;
  claimTarget?: string;
  enokiPublicApiKey?: string;
  enokiConnectAppSlug?: string;
};

export type ServerEnokiConfig = {
  privateApiKey?: string;
  allowedAddresses: string[];
  allowedMoveCallTargets: string[];
};

function optional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "0x" ? trimmed : undefined;
}

function csv(value: string | undefined) {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
}

function network(value: string | undefined): SuiNetwork {
  if (value === "mainnet" || value === "devnet") return value;
  return "testnet";
}

export function getPublicConfig(): PublicBequestConfig {
  return {
    network: network(process.env.NEXT_PUBLIC_SUI_NETWORK),
    packageId: optional(process.env.NEXT_PUBLIC_BEQUEST_PACKAGE_ID),
    estateModule: process.env.NEXT_PUBLIC_BEQUEST_ESTATE_MODULE?.trim() || "estate",
    claimTarget: optional(process.env.NEXT_PUBLIC_BEQUEST_CLAIM_TARGET),
    enokiPublicApiKey: optional(process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY),
    enokiConnectAppSlug: optional(process.env.NEXT_PUBLIC_ENOKI_CONNECT_APP_SLUG)
  };
}

export function getServerEnokiConfig(): ServerEnokiConfig {
  return {
    privateApiKey: optional(process.env.ENOKI_PRIVATE_API_KEY),
    allowedAddresses: csv(process.env.ENOKI_ALLOWED_ADDRESSES),
    allowedMoveCallTargets: csv(process.env.ENOKI_ALLOWED_MOVE_TARGETS)
  };
}

export function isConfigured(value: string | undefined) {
  return value ? "Configured" : "Missing";
}
