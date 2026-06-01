"use client";

import {
  useEnokiFlow,
  useZkLogin,
  useZkLoginSession,
} from "@mysten/enoki/react";
import { fromBase64 } from "@mysten/sui/utils";
import { useState } from "react";
import type { SuiNetwork } from "../lib/config";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

// Enoki routes wrap their result as { data: {...} }; surface a thrown error message if present.
function unwrap<T>(res: Record<string, unknown>): T {
  if (typeof res.error === "string") throw new Error(res.error);
  return res.data as T;
}

function ExecutorActionInner({
  estateId,
  status,
  executorAddress,
}: {
  estateId: string;
  status: string;
  executorAddress?: string;
}) {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();
  const session = useZkLoginSession();
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  // Only the named executor can pause, and only while the estate is in its grace window.
  const isExecutor =
    !!address &&
    !!executorAddress &&
    address.toLowerCase() === executorAddress.toLowerCase();
  if (status !== "Pending" || !isExecutor) return null;

  async function pause() {
    if (!address) return;
    setState("working");
    setMessage("");
    try {
      // 1. build the executor_pause transaction kind for this estate (flat response)
      const kind = await postJson("/api/executor/transaction-kind", {
        estateId,
        sender: address,
      });
      if (typeof kind.error === "string") throw new Error(kind.error);
      const transactionBlockKindBytes =
        kind.transactionBlockKindBytes as string;

      // 2. ask Enoki to sponsor it (gas paid by the app) — response is { data: { bytes, digest } }
      const sponsored = unwrap<{ bytes: string; digest: string }>(
        await postJson("/api/enoki/sponsor", {
          sender: address,
          zkLoginJwt: session?.jwt,
          transactionBlockKindBytes,
        }),
      );
      if (!sponsored?.bytes || !sponsored?.digest) {
        throw new Error("Sponsor failed");
      }

      // 3. sign the sponsored bytes with the executor's zkLogin keypair
      const keypair = await flow.getKeypair({ network: NETWORK });
      const { signature } = await keypair.signTransaction(
        fromBase64(sponsored.bytes),
      );

      // 4. execute — response is { data: { digest } }
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
      setMessage(error instanceof Error ? error.message : "Pause failed");
    }
  }

  if (state === "done") {
    return (
      <p className="lede">
        ✓ Trigger paused — estate reset to active. Tx{" "}
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
        onClick={pause}
        disabled={state === "working"}
      >
        {state === "working" ? "Pausing…" : "Pause trigger (gasless)"}
      </button>
      {state === "error" && <p className="lede">Pause failed: {message}</p>}
    </div>
  );
}

// Gated so the page builds/renders without Enoki credentials (e.g. CI).
export function ExecutorAction({
  estateId,
  status,
  executorAddress,
}: {
  estateId: string;
  status: string;
  executorAddress?: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) return null;
  return (
    <ExecutorActionInner
      estateId={estateId}
      status={status}
      executorAddress={executorAddress}
    />
  );
}
