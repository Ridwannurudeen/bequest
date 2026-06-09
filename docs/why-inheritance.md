# Inheritance is Sui's killer use case

Every other chain treats death as out of scope. Bequest treats it as the design center.

## The problem nobody wants to name

Self-custody has a quiet failure mode: the keys die with the person. A large and growing
share of on-chain wealth is held by people who have no safe way to pass it on. The "solutions"
today are all bad. Write your seed phrase on paper and hide it, and you have created a single
point of theft. Hand it to a relative early, and you have given away your assets while alive.
Use a custodian, and you have left self-custody entirely. Do nothing, which is what most people
do, and the assets are simply gone when you are.

This is not an edge case. It is the largest unaddressed real-world need in crypto, and it grows
with every new holder. Traditional finance solved it centuries ago with wills, executors, and
probate. On-chain, there has been no primitive for it at all.

## Why Sui specifically

Inheritance is not a feature you can bolt onto any chain. It needs four things at once, and Sui
is the first chain where all four are native rather than bolted on:

1. **Real custody of arbitrary assets.** Sui's object model lets a shared `Estate` object hold
   not just a token balance but coins, NFTs, and any key-and-store object, each earmarked to a
   specific heir. Inheritance is about *things* (the family archive NFT, the game item, the
   specific vault), not just a number. An account-balance chain cannot express that cleanly.

2. **Heirs who are not crypto users.** Your grandchild does not have a wallet or a seed phrase.
   Sui's zkLogin and sponsored transactions make a Google-based, gas-sponsored heir path possible.
   The Bequest V2 submission treats the real sponsored claim digest as the proof gate before calling
   that path proven.

3. **Secrets that unlock only at the right moment.** A last-wishes letter, a password, a note
   to a child should be readable only after you are gone, never before. Seal gives conditional
   decryption bound to on-chain state, and Walrus stores the encrypted blob durably. The letter
   is encrypted from the day it is written and decryptable only after the estate triggers.

4. **A trigger with no trusted operator.** A dead-man's switch needs a clock and a place to
   hold assets that no one controls in the meantime. Sui's `Clock` and shared objects give a
   trustless inactivity trigger: the owner can withdraw or reset any time while active, and after
   the grace period anyone can finalize the distribution, but no one can redirect it. There is no
   company, no server, and no executor who can run off with the funds.

No other ecosystem has all four as first-class primitives. On Sui, inheritance is not a hack. It
is the natural thing to build.

## How Bequest works

Grandma Sarah escrows her assets into an `Estate` with a six-month inactivity trigger and a
two-week grace window, names her grandchildren Maya and Noah as heirs (70/30), and writes Maya a
letter. While she is active, nothing happens; a single heartbeat resets the clock, and she can
withdraw at any time. If she goes silent past the window, the estate moves Active to Pending to
Triggered. Maya signs in with Google and triggers the SUI distribution path; once an Enoki-sponsored
digest is pinned, this becomes the zero-SUI heir receipt. Only after the trigger can she decrypt the
letter. No custodian, no owner seed phrase.

The full lifecycle (create, deposit, the dead-man trigger, Seal-gated wishes, and atomic
multi-heir distribution) is proven today on Sui testnet at package
`0x1eb5d739100981217e4db2d5787d0f005f34efc31db8dc9369ea491fdb731272`. See
[`docs/architecture.md`](architecture.md).

## Why this is infrastructure, not an app

Succession, recovery, dead-man switches, and scheduled transfers are the same primitive with
different trigger conditions. If every team rebuilds the state machine, the events, and the read
shape, no shared tooling can exist. So alongside the product we are publishing the
[Sui Succession Standard (SSS v0)](sss-v0.md): canonical states, canonical events, a read shape,
and a pluggable trigger interface, so any wallet, custodian, or keeper can read and settle any
compliant policy. Bequest is the reference implementation. The category is bigger than one app,
and naming it is how Sui gets an inheritance layer rather than one inheritance dApp.

## The bet

The Sui Overflow rubric weights real-world application at half the score. Inheritance is as
real-world as it gets: it is the use case every holder eventually has and no chain has served.
The primitive is proven on testnet now; mainnet is next. Crypto promised that you could be your
own bank. A bank you cannot pass on is only half a bank. This is the other half.
