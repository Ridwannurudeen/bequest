"use client";

import {
  useEnokiFlow,
  useZkLogin,
  useZkLoginSession,
} from "@mysten/enoki/react";
import { fromBase64 } from "@mysten/sui/utils";
import { useState } from "react";
import type { SuiNetwork } from "../lib/config";
import { AuthButton } from "./auth-button";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, string | undefined>;
}

function ClaimActionInner({
  estateId,
  claimable,
}: {
  estateId: string;
  claimable: boolean;
}) {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();
  const session = useZkLoginSession();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function claim() {
    if (!address) return;
    setState("working");
    setMessage("");
    try {
      // 1. build the distribute_coin transaction kind for this estate
      const kind = await postJson("/api/claim/transaction-kind", {
        estateId,
        sender: address,
      });
      if (kind.error) throw new Error(kind.error);

      // 2. ask Enoki to sponsor it (gas paid by the app)
      const sponsored = await postJson("/api/enoki/sponsor", {
        sender: address,
        zkLoginJwt: session?.jwt,
        transactionBlockKindBytes: kind.transactionBlockKindBytes,
      });
      if (sponsored.error || !sponsored.bytes || !sponsored.digest) {
        throw new Error(sponsored.error ?? "Sponsor failed");
      }

      // 3. sign the sponsored bytes with the heir's zkLogin keypair
      const keypair = await flow.getKeypair({ network: NETWORK });
      const { signature } = await keypair.signTransaction(
        fromBase64(sponsored.bytes),
      );

      // 4. execute
      const executed = await postJson("/api/enoki/execute", {
        digest: sponsored.digest,
        signature,
      });
      if (executed.error) throw new Error(executed.error);

      setState("done");
      setMessage(executed.digest ?? "");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Claim failed");
    }
  }

  if (!claimable) {
    return (
      <p className="lede">
        Not yet claimable — the estate must be <strong>Triggered</strong> before
        heirs can claim.
      </p>
    );
  }

  if (!address) {
    return (
      <div className="nav-links">
        <span>Sign in with Google to claim:</span>
        <AuthButton />
      </div>
    );
  }

  if (state === "done") {
    return (
      <p className="lede">
        ✓ Inheritance claimed — gaslessly. Tx{" "}
        <a
          href={`https://suiscan.xyz/${NETWORK}/tx/${message}`}
          target="_blank"
          rel="noreferrer"
        >
          {message.slice(0, 16)}…
        </a>
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="button primary"
        onClick={claim}
        disabled={state === "working"}
      >
        {state === "working" ? "Claiming…" : "Claim inheritance (gasless)"}
      </button>
      {state === "error" && <p className="lede">Claim failed: {message}</p>}
    </div>
  );
}

// Gated so the page builds/renders without Enoki credentials (e.g. CI).
export function ClaimAction({
  estateId,
  claimable,
}: {
  estateId: string;
  claimable: boolean;
}) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) return null;
  return <ClaimActionInner estateId={estateId} claimable={claimable} />;
}
