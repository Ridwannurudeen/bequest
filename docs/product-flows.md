# Bequest product flows

Owner: Lane B (Product & Frontend)

This is the product contract for the first demo-quality frontend. It defines what the user sees and
what SDK calls each step eventually maps to. Until Lane A's real SDK lands, the web app mocks these
states against `packages/web/lib/bequest-sdk.ts`.

## Flow 1: owner setup

Goal: Sarah creates a crypto estate without learning protocol language.

Steps:

1. Sign in with Google through Enoki / zkLogin.
2. Name heirs with human labels and Google bindings.
3. Set split ratios in basis points, but display percentages.
4. Set inactivity window and grace period.
5. Optional: name executor.
6. Deposit SUI and supported objects into the shared estate.
7. Upload encrypted last-wishes letter.
8. See estate dashboard with status `Active`.

SDK mapping:

```
createEstate(config) -> estateId
setHeirs(estateId, heirs[])
deposit(estateId, assets[])
uploadWishes(estateId, blob)
readEstate(estateId) -> EstateView
```

Acceptance:

- No copy implies Bequest replaces a will, trust, attorney, tax advice, or probate.
- Owner always sees that assets are escrowed into a shared Sui `Estate`.
- Owner understands that heartbeat/deposit/withdraw activity keeps the estate active.

## Flow 2: heir claim

Goal: Maya claims without seed phrase or crypto jargon; the zero-SUI gas experience is only marked
live after a sponsored Sui digest is pinned.

Steps:

1. Heir opens a link or app state showing: "You've inherited assets from Grandma Sarah."
2. Heir signs in with Google.
3. App resolves zkLogin address and checks claim eligibility.
4. Heir clicks one primary action: `Claim with Google`.
5. Backend sponsors the transaction through Enoki.
6. Assets arrive.
7. Last-wishes letter decrypts after the estate status is `Triggered`.

SDK mapping:

```
readEstate(estateId) -> EstateView
claim(estateId)
decryptWishes(estateId)
```

Acceptance:

- The submitted "gasless" claim requires a pinned sponsored transaction digest.
- The heir flow never asks for seed phrase, wallet import, or private-key export.
- The letter remains encrypted until the on-chain trigger allows Seal decryption.

## Flow 3: executor dashboard

Goal: a trusted party can stop a false trigger during grace.

Steps:

1. Executor signs in.
2. App shows pending estates where the executor is authorized.
3. Executor sees owner inactivity, pending timestamp, grace deadline, and heirs.
4. Executor can `Pause` or `Cancel` during pending state.
5. App records the action in the estate timeline.

SDK mapping:

```
readEstate(estateId) -> EstateView
executorOverride(estateId, "pause" | "cancel")
```

Acceptance:

- Executor cannot move assets.
- Executor action is framed as false-trigger prevention, not discretionary inheritance control.
- UI makes it obvious that executor power exists only during `Pending`.

## Demo narrative

The demo should follow one family:

- Owner: Grandma Sarah
- Heir: Maya
- Executor: Aunt Lina

The emotional peak is not contract deployment. It is Maya triggering the sponsored claim path with
Google, seeing the distribution digest, and reading the letter after assets arrive.

## Copy rules

Use:

- "helps assets move under pre-set on-chain rules"
- "augments traditional estate planning"
- "gasless claim" only after a sponsored digest is pinned
- "Google sign-in for heirs"
- "executor can pause false alarms"

Avoid:

- "replaces probate"
- "legally binding will"
- "no lawyer needed"
- "guaranteed inheritance"
- "death verification"
- "tax/legal compliance"
