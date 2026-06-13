"use client";

import {
  useEnokiFlow,
  useZkLogin,
  useZkLoginSession,
} from "@mysten/enoki/react";
import { fromBase64 } from "@mysten/sui/utils";
import Link from "next/link";
import { useState } from "react";
import type { SuiNetwork } from "../lib/config";
import { AuthButton } from "./auth-button";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";
const DAY_MS = 24 * 60 * 60 * 1000;

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

type Heir = { addr: string; percent: string };

function OwnerSetupInner() {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();
  const session = useZkLoginSession();
  const [heirs, setHeirs] = useState<Heir[]>([
    { addr: "", percent: "70" },
    { addr: "", percent: "30" },
  ]);
  const [inactivityDays, setInactivityDays] = useState("180");
  const [graceDays, setGraceDays] = useState("14");
  const [releaseAt, setReleaseAt] = useState("");
  const [mode, setMode] = useState<"deadman" | "scheduled">("deadman");
  const [executor, setExecutor] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  function setHeir(i: number, patch: Partial<Heir>) {
    setHeirs((prev) => prev.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  }

  async function createEstate() {
    setState("working");
    setMessage("");
    try {
      const bps = heirs.map((h) => Math.round(Number(h.percent) * 100));
      if (bps.reduce((a, b) => a + b, 0) !== 10000) {
        throw new Error("Heir shares must add up to 100%.");
      }
      const common = {
        sender: address,
        heirs: heirs.map((h) => h.addr.trim()),
        bps,
        executor: executor.trim() || undefined,
      };
      let body: Record<string, unknown>;
      if (mode === "scheduled") {
        const releaseAtMs = releaseAt ? new Date(releaseAt).getTime() : 0;
        if (!Number.isFinite(releaseAtMs) || releaseAtMs <= Date.now()) {
          throw new Error("Pick a release date and time in the future.");
        }
        body = { ...common, action: "create_scheduled", releaseAtMs };
      } else {
        body = {
          ...common,
          action: "create",
          inactivityMs: Math.round(Number(inactivityDays) * DAY_MS),
          graceMs: Math.round(Number(graceDays) * DAY_MS),
        };
      }
      const kind = await postJson("/api/owner/transaction-kind", body);
      if (typeof kind.error === "string") throw new Error(kind.error);

      const sponsored = unwrap<{ bytes: string; digest: string }>(
        await postJson("/api/enoki/sponsor", {
          sender: address,
          zkLoginJwt: session?.jwt,
          transactionBlockKindBytes: kind.transactionBlockKindBytes,
        }),
      );
      if (!sponsored?.bytes || !sponsored?.digest) {
        throw new Error("Sponsor failed");
      }

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
      setMessage(error instanceof Error ? error.message : "Create failed");
    }
  }

  if (!address) {
    return (
      <div className="nav-links">
        <span>Sign in with Google to create an estate:</span>
        <AuthButton />
      </div>
    );
  }

  if (state === "done") {
    return (
      <p className="lede">
        ✓ Estate created through the sponsored path. Tx{" "}
        <a
          href={`https://suiscan.xyz/${NETWORK}/tx/${message}`}
          target="_blank"
          rel="noreferrer"
        >
          {message.slice(0, 16)}…
        </a>{" "}
        · <Link href="/estates">view on the estates dashboard</Link>
      </p>
    );
  }

  return (
    <div className="owner-form">
      {heirs.map((h, i) => (
        <div className="nav-links" key={i}>
          <input
            type="text"
            placeholder="Heir Sui address (0x…)"
            value={h.addr}
            onChange={(e) => setHeir(i, { addr: e.target.value })}
            style={{ flex: "1 1 16rem", minWidth: 0 }}
          />
          <input
            type="number"
            aria-label="share percent"
            value={h.percent}
            onChange={(e) => setHeir(i, { percent: e.target.value })}
            style={{ width: "5rem" }}
          />
          <span>%</span>
        </div>
      ))}
      <div className="nav-links" role="group" aria-label="Trigger type">
        <button
          type="button"
          className={`button ${mode === "deadman" ? "primary" : ""}`}
          onClick={() => setMode("deadman")}
        >
          Dead-man&apos;s switch
        </button>
        <button
          type="button"
          className={`button ${mode === "scheduled" ? "primary" : ""}`}
          onClick={() => setMode("scheduled")}
        >
          Scheduled release
        </button>
      </div>
      {mode === "deadman" ? (
        <div className="nav-links">
          <label>
            Inactivity (days){" "}
            <input
              type="number"
              value={inactivityDays}
              onChange={(e) => setInactivityDays(e.target.value)}
              style={{ width: "6rem" }}
            />
          </label>
          <label>
            Grace (days){" "}
            <input
              type="number"
              value={graceDays}
              onChange={(e) => setGraceDays(e.target.value)}
              style={{ width: "6rem" }}
            />
          </label>
        </div>
      ) : (
        <div className="nav-links">
          <label>
            Release on{" "}
            <input
              type="datetime-local"
              value={releaseAt}
              onChange={(e) => setReleaseAt(e.target.value)}
            />
          </label>
          <span>heirs can claim at this time; no check-ins needed</span>
        </div>
      )}
      <div className="nav-links">
        <input
          type="text"
          placeholder="Executor Sui address (optional, 0x…)"
          value={executor}
          onChange={(e) => setExecutor(e.target.value)}
          style={{ minWidth: "22rem" }}
        />
        <span>can pause a false trigger</span>
      </div>
      <button
        type="button"
        className="button primary"
        onClick={createEstate}
        disabled={state === "working"}
      >
        {state === "working" ? "Creating…" : "Create estate (sponsored)"}
      </button>
      {state === "error" && <p className="lede">Create failed: {message}</p>}
    </div>
  );
}

export function OwnerSetup() {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) return null;
  return <OwnerSetupInner />;
}
