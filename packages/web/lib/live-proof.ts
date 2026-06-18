export const currentPackage = {
  label: "Current testnet package",
  packageId:
    "0x5224dd7dad3ae82c3d31f9c1569f5e1f4328a5bb6acd0b5b07228ef4b35c49d1",
  publishDigest: "47o4DCh8Dun4iYCkHajf849eH9yVmWQMsJfES6qNwEeB",
  explorerUrl:
    "https://suiscan.xyz/testnet/object/0x5224dd7dad3ae82c3d31f9c1569f5e1f4328a5bb6acd0b5b07228ef4b35c49d1",
} as const;

export const proofCards = [
  {
    label: "Sponsored claim",
    status: "Ready to pin",
    title: "Recipient claim bytes are ready for sponsor-paid execution.",
    detail:
      "The verifier builds transaction-kind bytes for estate::distribute_coin<SUI>; pin a fresh Enoki-sponsored digest after a browser claim succeeds.",
    evidence: "npm run verify:claim-kind",
  },
  {
    label: "Full-portfolio estate",
    status: "Move-tested",
    title: "SUI plus key+store objects fit the same estate.",
    detail:
      "The deployed estate module exposes deposit_object<T> and distribute_objects<T>; the keeper can distribute every escrowed object type after Triggered.",
    evidence: "deposit_object<T> + distribute_objects<T>",
  },
  {
    label: "Estate custody",
    status: "Proven live",
    title: "Assets escrow into a shared Estate.",
    detail:
      "Owner can withdraw while Active. After Triggered, recipients claim from on-chain state without the owner key.",
    evidence: "estate.move + testnet package",
  },
  {
    label: "Dead-man switch",
    status: "Proven live",
    title: "Clock-gated Active -> Pending -> Triggered.",
    detail:
      "Keeper arms after inactivity, grace protects false alarms, executor can pause Pending before assets move.",
    evidence: "keeper seed -> arm -> finalize",
  },
  {
    label: "Private wishes",
    status: "Proven live",
    title: "Walrus letter decrypts only after trigger.",
    detail:
      "Seal denies access while Active, then releases after the Estate status flips to Triggered.",
    evidence: "LAST-WISHES PASSED",
  },
  {
    label: "Atomic distribution",
    status: "Proven live",
    title: "70/30 split delivered in one PTB.",
    detail:
      "A keeper created, funded, triggered, and distributed a two-recipient SUI estate on testnet.",
    evidence: "DISTRIBUTION PASSED",
  },
] as const;

// The differentiating features, each proven by a real testnet transaction (base58 digests; open on
// SuiScan to verify). Seeded 2026-06-11 from the funded ops key; each tx's effects/events confirm it.
export const featureProofs = [
  {
    label: "Vesting",
    title: "Inheritance unlocks over time, not all at once.",
    detail:
      "On a vesting estate, distribute_coin_vested<SUI> released the currently-unlocked linear slice and emitted Claimed — the rest stays escrowed until it vests.",
    digest: "4a3nGHLjhV97msM23H4PqzXorPtvWDgBKaW3SwhBFM9i",
  },
  {
    label: "Guardian recovery",
    title: "A 2-of-2 guardian quorum rotated the owner.",
    detail:
      "Two guardians proposed and approved a recovery; on reaching the threshold the estate owner rotated on-chain (events RecoveryApproved, Recovered) — self-recovery while alive, no seed phrase exposed.",
    digest: "8De34eYoQjncdcspmi6tx7JsBaBgLwzEnecccM65Pf56",
  },
  {
    label: "Verifiable trigger",
    title: "An Ed25519-attested trigger fired on-chain.",
    detail:
      "A designated attester key signed AttestMessage{intent, estate_id, timestamp}; attest_trigger verified the signature with native ed25519 and flipped the estate to Triggered. The key is swappable for a Nautilus enclave key with no change to this path.",
    digest: "FZuDmTuWxx3afpyRmuBw5AB7M5Gan3jEjpzM8KySxb3R",
  },
] as const;

// zkLogin recipient binding and Enoki sponsored execution are wired in the app. The public proof
// gate stays on verify:claim-kind until BEQUEST_SPONSORED_CLAIM_DIGEST is set from a fresh
// successful browser claim against the current package.
