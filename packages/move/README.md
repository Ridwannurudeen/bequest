# bequest (Move package)

Sui Move contracts for Bequest.

- `sources/estate.move` — shared `Estate` custody, Clock-based dead-man switch, multi-heir coin
  distribution, per-object heir assignment, and estate-scoped Seal `seal_approve`.
- `sources/gate.move` — focused Seal policy spike: a minimal `Gate` object with status-gated
  `seal_approve` for conditional decryption testing.

## Build & test
```
sui move test
sui move build
```
Status: **12/12 tests passing** on Sui CLI 1.72.2 (testnet).

Current testnet package:
`0x696ea071464b9836ea018c12fea0b4475099fa269a94b8c92d7672887dcfb885`

## Move.toml — keep it clean
No dependencies are pinned. The Sui framework + MoveStdlib are **implicit system dependencies**
resolved to the rev baked into your Sui CLI. Do **not** add `Sui = { git = ... }` or a local path —
that breaks portability and forces a slow/flaky clone of the whole `MystenLabs/sui` monorepo.

## Offline / flaky-network bootstrap (one-time per machine)
On a flaky connection `sui move test` can fail while fetching the framework with
`curl 56 Recv failure / early EOF / invalid index-pack`. It's lazy-fetching the framework rev
pinned to your CLI. Pre-seed that one cache dir once; afterwards every build runs offline.

Get the pinned `<REV>` from the failing build's output (`git checkout --quiet <REV>`), then run
(PowerShell):
```powershell
$REV = "<REV>"   # sui 1.72.2 => 367fd808279bed26f7c64fc63160062a2ee29ab7
$DIR = "$env:USERPROFILE\.move\git\https___github_com_MystenLabs_sui_git_$REV"
Remove-Item -Recurse -Force $DIR -ErrorAction SilentlyContinue
git init -q $DIR
git -C $DIR remote add origin https://github.com/MystenLabs/sui.git
git -C $DIR fetch --depth 1 --filter=blob:none origin $REV
git -C $DIR sparse-checkout init --cone
git -C $DIR sparse-checkout set crates/sui-framework/packages/move-stdlib crates/sui-framework/packages/sui-framework
git -C $DIR checkout --quiet $REV
```
The `<REV>` changes when the Sui CLI is upgraded — pin the team to one version (via
[suiup](https://github.com/MystenLabs/suiup)) to keep it stable. If a fetch drops, re-run the
`fetch` line (it resumes a much smaller transfer than the full monorepo clone).
