"use client";

import {
  useEnokiFlow,
  useZkLogin,
  useZkLoginSession,
} from "@mysten/enoki/react";
import { SealClient } from "@mysten/seal";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { fromBase64, fromHex, toHex } from "@mysten/sui/utils";
import { useState } from "react";
import type { SuiNetwork } from "../lib/config";
import type { EstateView } from "../lib/bequest-sdk";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";
const WALRUS_PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER ??
  "https://publisher.walrus-testnet.walrus.space";
// Mysten testnet Seal key servers; must match the decrypt config in wishes-letter.tsx.
const KEY_SERVER_IDS = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
];
const THRESHOLD = 2;
const WALRUS_EPOCHS = 3;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

function unwrap<T>(res: Record<string, unknown>): T {
  if (typeof res.error === "string") throw new Error(res.error);
  return res.data as T;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as BufferSource,
  );
  return toHex(new Uint8Array(digest));
}

// Owner-only authoring of the encrypted last-wishes letter. Mirrors the encrypt side of
// packages/wishes and the decrypt side of wishes-letter.tsx: Seal-encrypt to the
// [estate id][nonce] namespace, PUT the ciphertext to Walrus (browser PUT, CORS open),
// then anchor blob_id + key_id + digest on-chain via the sponsored owner set_wishes.
// Gated to the owner of an ACTIVE estate (set_wishes aborts after TRIGGERED).
function SetWishesInner({
  estate,
  packageId,
}: {
  estate: EstateView;
  packageId: string;
}) {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();
  const session = useZkLoginSession();
  const [letter, setLetter] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  if (!address || address !== estate.owner || estate.status !== "Active")
    return null;

  async function anchor() {
    if (!address || !letter.trim()) return;
    setState("working");
    setMessage("Encrypting with Seal…");
    try {
      const suiClient = new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(NETWORK),
        network: NETWORK,
      });
      // 1. Seal-encrypt to the estate's [estate id][nonce] key-id namespace.
      const nonce = crypto.getRandomValues(new Uint8Array(8));
      const innerId = new Uint8Array([...fromHex(estate.estateId), ...nonce]);
      const seal = new SealClient({
        suiClient,
        serverConfigs: KEY_SERVER_IDS.map((objectId) => ({
          objectId,
          weight: 1,
        })),
        verifyKeyServers: false,
      });
      const { encryptedObject } = await seal.encrypt({
        threshold: THRESHOLD,
        packageId,
        id: toHex(innerId),
        data: new TextEncoder().encode(letter),
      });

      // 2. Store the ciphertext on Walrus (browser PUT; publisher CORS is open).
      setMessage("Storing the sealed letter on Walrus…");
      const put = await fetch(
        `${WALRUS_PUBLISHER}/v1/blobs?epochs=${WALRUS_EPOCHS}`,
        { method: "PUT", body: encryptedObject },
      );
      if (!put.ok) throw new Error(`Walrus publisher HTTP ${put.status}`);
      const j = (await put.json()) as {
        newlyCreated?: { blobObject: { blobId: string } };
        alreadyCertified?: { blobId: string };
      };
      const blobId =
        j.newlyCreated?.blobObject.blobId ?? j.alreadyCertified?.blobId;
      if (!blobId) throw new Error("No blobId in Walrus publisher response");

      // 3. Anchor blob_id + key_id + digest on-chain via the sponsored owner set_wishes.
      setMessage("Anchoring on-chain (sponsored)…");
      const digestHex = await sha256Hex(encryptedObject);
      const kind = await postJson("/api/owner/transaction-kind", {
        action: "set_wishes",
        estateId: estate.estateId,
        sender: address,
        blobId,
        keyIdHex: toHex(innerId),
        digestHex,
      });
      if (typeof kind.error === "string") throw new Error(kind.error);
      const sponsored = unwrap<{ bytes: string; digest: string }>(
        await postJson("/api/enoki/sponsor", {
          sender: address,
          zkLoginJwt: session?.jwt,
          transactionBlockKindBytes: kind.transactionBlockKindBytes,
        }),
      );
      if (!sponsored?.bytes || !sponsored?.digest)
        throw new Error("Sponsor failed");
      const keypair = await flow.getKeypair({ network: NETWORK });
      const { signature } = await keypair.signTransaction(
        fromBase64(sponsored.bytes),
      );
      const executed = unwrap<{ digest: string }>(
        await postJson("/api/enoki/execute", {
          digest: sponsored.digest,
          signature,
        }),
      );
      setState("done");
      setMessage(executed?.digest ?? sponsored.digest);
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Could not anchor the letter",
      );
    }
  }

  if (state === "done") {
    return (
      <p className="lede">
        ✓ Last-wishes letter sealed and anchored on-chain. Tx{" "}
        <a
          href={`https://suiscan.xyz/${NETWORK}/tx/${message}`}
          target="_blank"
          rel="noreferrer"
        >
          {message.slice(0, 16)}…
        </a>{" "}
        It stays encrypted until this estate triggers, then your heirs can read it.
      </p>
    );
  }

  return (
    <div className="owner-form" aria-label="Set last-wishes letter">
      <p className="kicker">Last-wishes letter</p>
      <p className="lede">
        Write an encrypted letter to your heirs. It is sealed with Seal, stored on
        Walrus, and unreadable until this estate triggers. Saving again replaces it.
      </p>
      <textarea
        value={letter}
        onChange={(e) => setLetter(e.target.value)}
        placeholder="My dearest…"
        rows={4}
        style={{ width: "100%", minWidth: "22rem" }}
      />
      <button
        type="button"
        className="button primary"
        onClick={anchor}
        disabled={state === "working" || !letter.trim()}
      >
        {state === "working" ? "Sealing…" : "Seal & anchor letter"}
      </button>
      {state === "working" && <p className="lede">{message}</p>}
      {state === "error" && <p className="lede">Failed: {message}</p>}
    </div>
  );
}

export function SetWishes({
  estate,
  packageId,
}: {
  estate: EstateView;
  packageId?: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId || !packageId) return null;
  return <SetWishesInner estate={estate} packageId={packageId} />;
}
