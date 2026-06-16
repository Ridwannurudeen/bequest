"use client";

import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { SealClient, SessionKey } from "@mysten/seal";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { useState } from "react";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as "testnet" | "mainnet") ?? "testnet";
const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  "https://aggregator.walrus-testnet.walrus.space";
// Mysten testnet Seal key servers; must match the encrypt-time config in packages/wishes.
const KEY_SERVER_IDS = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
];
const THRESHOLD = 2;

type InnerProps = {
  estateId: string;
  packageId: string;
  blobId: string;
  innerIdHex: string;
  triggered: boolean;
};

function WishesLetterInner({
  estateId,
  packageId,
  blobId,
  innerIdHex,
  triggered,
}: InnerProps) {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [letter, setLetter] = useState("");
  const [message, setMessage] = useState("");

  async function reveal() {
    if (!address) return;
    setState("working");
    setMessage("");
    try {
      const suiClient = new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(NETWORK),
        network: NETWORK,
      });

      // 1. Seal session key. Pass the heir's zkLogin keypair as the `signer` so the
      //    SDK does zkLogin-aware personal-message signing at decrypt time. The manual
      //    setPersonalMessageSignature path runs verifyPersonalMessageSignature, which
      //    mis-handles a zkLogin signature — passing the signer avoids it.
      const keypair = await flow.getKeypair({ network: NETWORK });
      const sessionKey = await SessionKey.create({
        address,
        packageId,
        ttlMin: 10,
        suiClient,
        signer: keypair,
      });

      // 2. Fetch the ciphertext back from Walrus.
      const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
      if (!res.ok) throw new Error(`Walrus aggregator HTTP ${res.status}`);
      const ciphertext = new Uint8Array(await res.arrayBuffer());

      // 3. Build the estate::seal_approve transaction kind. It aborts unless the
      //    estate is TRIGGERED, so the key servers only release the key after the trigger.
      const innerId = fromHex(innerIdHex);
      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::estate::seal_approve`,
        arguments: [
          tx.pure.vector("u8", Array.from(innerId)),
          tx.object(estateId),
        ],
      });
      const txBytes = await tx.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      // 4. Threshold-decrypt.
      const seal = new SealClient({
        suiClient,
        serverConfigs: KEY_SERVER_IDS.map((objectId) => ({
          objectId,
          weight: 1,
        })),
        verifyKeyServers: false,
      });
      const plaintext = await seal.decrypt({
        data: ciphertext,
        sessionKey,
        txBytes,
      });
      setLetter(new TextDecoder().decode(plaintext));
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Could not decrypt the letter",
      );
    }
  }

  if (!triggered) {
    return (
      <p className="lede">
        A last-wishes letter is sealed to this estate. It stays encrypted on
        Walrus and is unreadable until the estate is <strong>Triggered</strong>.
      </p>
    );
  }

  if (!address) {
    // The page already has a single Google sign-in (the claim action above); once the
    // heir signs in there, the shared Enoki session unlocks this too. No second button.
    return (
      <p className="lede">
        Sign in with Google above to reveal the last-wishes letter.
      </p>
    );
  }

  if (state === "done") {
    return (
      <div className="wishes-letter" aria-label="Decrypted last-wishes letter">
        {letter}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="button primary"
        onClick={reveal}
        disabled={state === "working"}
      >
        {state === "working" ? "Decrypting…" : "Reveal the last-wishes letter"}
      </button>
      {state === "error" && (
        <p className="lede">Could not decrypt yet: {message}</p>
      )}
    </div>
  );
}

/**
 * Heir-side last-wishes reveal. Renders nothing unless Enoki is configured and a
 * letter pointer exists for this estate. The pointer can come from the on-chain
 * `Estate.wishes` anchor, demo URL params, or an env-pinned judge estate.
 * The claim page keeps a static "Seal-gated" status line regardless.
 */
export function WishesLetter({
  estateId,
  packageId,
  blobId,
  innerIdHex,
  triggered,
}: {
  estateId: string;
  packageId?: string;
  blobId?: string;
  innerIdHex?: string;
  triggered: boolean;
}) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  if (!apiKey || !packageId || !blobId || !innerIdHex) return null;
  return (
    <WishesLetterInner
      estateId={estateId}
      packageId={packageId}
      blobId={blobId}
      innerIdHex={innerIdHex}
      triggered={triggered}
    />
  );
}

export const SEAL_THRESHOLD = THRESHOLD;
