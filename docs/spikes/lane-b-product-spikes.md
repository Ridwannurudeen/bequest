# Lane B product spikes

Owner: Lane B (Product & Frontend)

This file tracks the frontend/product de-risking gates from the Bequest brief. It is intentionally
separate from protocol spike verdicts so Lane A can continue contract work without waiting on UI
decisions.

## #1 zkLogin heir binding

Question: Can the owner pre-name a heir who has not onboarded yet by binding an identity that later
resolves through Google zkLogin / Enoki?

Frontend acceptance:

- Owner can enter an email-like heir label without requiring the heir to connect a wallet.
- UI clearly explains that the heir signs in later with Google.
- Large-estate copy leaves room for an executor co-sign mitigation if Google account takeover is a
  concern.

Status: not proven yet. Requires Enoki app registration and a real zkLogin derivation test.

## #6 Enoki sponsored claim

Question: Can a non-crypto heir complete the claim without having SUI for gas?

Frontend acceptance:

- Claim path presents one primary action: "Claim with Google".
- No seed phrase, wallet funding, gas token, or manual RPC language appears in the heir flow.
- When the real SDK lands, `claim(estateId)` must route through a sponsored transaction path.

Status: not proven yet. Requires Enoki sponsorship configuration and testnet claim wiring.

## #7 Competition + legal scan

Question: Is the product positioned as a practical estate-planning augmentation rather than a
legally over-claiming replacement for probate?

Frontend acceptance:

- Public copy says Bequest helps assets move under pre-set on-chain rules.
- Public copy does not say it replaces a will, court probate, tax advice, or legal counsel.
- Demo narrative focuses on crypto-loss prevention, humane onboarding, and executor safeguards.

Status: initial positioning applied in `packages/web`; external scan still pending.
