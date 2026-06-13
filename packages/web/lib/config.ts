export type SuiNetwork = "testnet" | "mainnet" | "devnet";

export type PublicBequestConfig = {
  network: SuiNetwork;
  packageId?: string;
  estateModule: string;
  claimTarget?: string;
  sponsoredClaimDigest?: string;
  // Pinned last-wishes pointer for the judge estate (the package stores no wishes
  // metadata on-chain yet). wishesInnerId = hex of [estate id bytes][nonce] used at
  // Seal-encryption time; wishesBlobId = the Walrus blob holding the ciphertext.
  wishesBlobId?: string;
  wishesInnerId?: string;
  // Curated estate the homepage pins for the live demo (Triggered, with the Seal letter).
  // When set, the homepage reads it instead of the newest EstateCreated event.
  demoEstateId?: string;
  enokiPublicApiKey?: string;
  enokiConnectAppSlug?: string;
  // Optional external links surfaced in the footer; each renders only when set,
  // so no dead link appears before it exists (repo is private until judging).
  githubUrl?: string;
  xUrl?: string;
  docsUrl?: string;
  demoVideoUrl?: string;
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
  return (
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? []
  );
}

function network(value: string | undefined): SuiNetwork {
  if (value === "mainnet" || value === "devnet") return value;
  return "testnet";
}

export function getPublicConfig(): PublicBequestConfig {
  return {
    network: network(process.env.NEXT_PUBLIC_SUI_NETWORK),
    packageId: optional(process.env.NEXT_PUBLIC_BEQUEST_PACKAGE_ID),
    estateModule:
      process.env.NEXT_PUBLIC_BEQUEST_ESTATE_MODULE?.trim() || "estate",
    claimTarget: optional(process.env.NEXT_PUBLIC_BEQUEST_CLAIM_TARGET),
    sponsoredClaimDigest: optional(
      process.env.NEXT_PUBLIC_BEQUEST_SPONSORED_CLAIM_DIGEST,
    ),
    wishesBlobId: optional(process.env.NEXT_PUBLIC_BEQUEST_WISHES_BLOB_ID),
    wishesInnerId: optional(process.env.NEXT_PUBLIC_BEQUEST_WISHES_INNER_ID),
    demoEstateId: optional(process.env.NEXT_PUBLIC_BEQUEST_DEMO_ESTATE_ID),
    enokiPublicApiKey: optional(process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY),
    enokiConnectAppSlug: optional(
      process.env.NEXT_PUBLIC_ENOKI_CONNECT_APP_SLUG,
    ),
    githubUrl: optional(process.env.NEXT_PUBLIC_GITHUB_URL),
    xUrl: optional(process.env.NEXT_PUBLIC_X_URL),
    docsUrl: optional(process.env.NEXT_PUBLIC_DOCS_URL),
    demoVideoUrl: optional(process.env.NEXT_PUBLIC_DEMO_VIDEO_URL),
  };
}

export function getServerEnokiConfig(): ServerEnokiConfig {
  return {
    privateApiKey: optional(process.env.ENOKI_PRIVATE_API_KEY),
    allowedAddresses: csv(process.env.ENOKI_ALLOWED_ADDRESSES),
    allowedMoveCallTargets: csv(process.env.ENOKI_ALLOWED_MOVE_TARGETS),
  };
}

export function isConfigured(value: string | undefined) {
  return value ? "Configured" : "Missing";
}
