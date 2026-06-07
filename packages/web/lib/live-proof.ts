export const currentPackage = {
  label: "Current testnet package",
  packageId: "0x696ea071464b9836ea018c12fea0b4475099fa269a94b8c92d7672887dcfb885",
  publishDigest: "9RMMNHL1CejdpeBA68mReopQu9nRBRKo2R3bBmTuP9Zw",
  explorerUrl:
    "https://suiscan.xyz/testnet/object/0x696ea071464b9836ea018c12fea0b4475099fa269a94b8c92d7672887dcfb885"
} as const;

export const proofCards = [
  {
    label: "Estate custody",
    status: "Proven live",
    title: "Assets escrow into a shared Estate.",
    detail:
      "Owner can withdraw while Active. After Triggered, heirs claim from on-chain state without the owner key.",
    evidence: "estate.move + testnet package"
  },
  {
    label: "Dead-man switch",
    status: "Proven live",
    title: "Clock-gated Active -> Pending -> Triggered.",
    detail:
      "Keeper arms after inactivity, grace protects false alarms, executor can pause Pending before assets move.",
    evidence: "keeper seed -> arm -> finalize"
  },
  {
    label: "Private wishes",
    status: "Proven live",
    title: "Walrus letter decrypts only after trigger.",
    detail:
      "Seal denies access while Active, then releases after the Estate status flips to Triggered.",
    evidence: "LAST-WISHES PASSED"
  },
  {
    label: "Atomic distribution",
    status: "Proven live",
    title: "70/30 split delivered in one PTB.",
    detail:
      "A keeper created, funded, triggered, and distributed a two-heir SUI estate on testnet.",
    evidence: "DISTRIBUTION PASSED"
  }
] as const;

// zkLogin heir binding and Enoki sponsored distribution are proven live: sponsored claim digest
// DV7eZduJmAzsW9vHzRSjXt8GgDWaQifp1vbXV1MBf7t5, verified on testnet (sponsor pays gas, heir signs
// with their zkLogin keypair). The public claim receipt is live at /claim/<estateId>. No open
// gates remain for the gasless inheritance flow.
