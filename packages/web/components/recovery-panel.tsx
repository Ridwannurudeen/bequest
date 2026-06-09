"use client";

import {
  useEnokiFlow,
  useZkLogin,
  useZkLoginSession,
} from "@mysten/enoki/react";
import { fromBase64 } from "@mysten/sui/utils";
import { useState } from "react";
import type { SuiNetwork } from "../lib/config";
import type { EstateView } from "../lib/bequest-sdk";

const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";

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

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// Guardian self-recovery controls for a live estate. Owners name an m-of-n guardian set and can
// veto a pending recovery; named guardians propose a new owner and approve, and on quorum the
// contract rotates the owner. Gated to the owner or a named guardian; locked after TRIGGERED.
function RecoveryInner({ estate }: { estate: EstateView }) {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();
  const session = useZkLoginSession();

  const [guardians, setGuardians] = useState("");
  const [threshold, setThreshold] = useState("2");
  const [newOwner, setNewOwner] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Build the owner/guardian transaction kind, sponsor it, sign with the zkLogin keypair, execute.
  async function run(label: string, body: Record<string, unknown>) {
    if (!address) return;
    setBusy(label);
    setResult(null);
    try {
      const kind = await postJson("/api/owner/transaction-kind", {
        ...body,
        estateId: estate.estateId,
        sender: address,
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
      setResult({ ok: true, text: executed?.digest ?? sponsored.digest });
    } catch (error) {
      setResult({
        ok: false,
        text: error instanceof Error ? error.message : "Action failed",
      });
    } finally {
      setBusy(null);
    }
  }

  if (!address || estate.status === "Triggered") return null;
  const isOwner = address === estate.owner;
  const isGuardian = estate.guardians.includes(address);
  if (!isOwner && !isGuardian) return null;

  const working = (label: string) => busy === label;
  const pending = estate.recovery;
  const alreadyApproved = pending?.approvals.includes(address) ?? false;

  return (
    <div className="owner-form" aria-label="Recovery controls">
      <p className="kicker">Guardian recovery</p>
      <p className="lede">
        {estate.guardians.length > 0
          ? `${estate.recoveryThreshold}-of-${estate.guardians.length} guardians: ${estate.guardians.map(shortAddr).join(", ")}`
          : "No guardians set yet."}
      </p>
      {pending && (
        <p className="lede">
          Pending recovery → rotate owner to {shortAddr(pending.newOwner)} ·{" "}
          {pending.approvals.length}/{estate.recoveryThreshold} approvals
        </p>
      )}

      {isOwner && (
        <>
          <div className="nav-links">
            <input
              type="text"
              placeholder="Guardian addresses (0x…, comma-separated)"
              value={guardians}
              onChange={(e) => setGuardians(e.target.value)}
              style={{ minWidth: "22rem" }}
            />
            <label>
              threshold{" "}
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                style={{ width: "5rem" }}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={busy !== null}
              onClick={() =>
                run("guardians", {
                  action: "set_guardians",
                  guardians: guardians
                    .split(",")
                    .map((g) => g.trim())
                    .filter(Boolean),
                  threshold: Math.round(Number(threshold)),
                })
              }
            >
              {working("guardians") ? "Saving…" : "Set guardians"}
            </button>
          </div>
          {pending && (
            <button
              type="button"
              className="button secondary"
              disabled={busy !== null}
              onClick={() => run("cancel", { action: "cancel_recovery" })}
            >
              {working("cancel") ? "Vetoing…" : "Veto pending recovery"}
            </button>
          )}
        </>
      )}

      {isGuardian &&
        (pending ? (
          <button
            type="button"
            className="button primary"
            disabled={busy !== null || alreadyApproved}
            onClick={() => run("approve", { action: "approve_recovery" })}
          >
            {alreadyApproved
              ? "You already approved"
              : working("approve")
                ? "Approving…"
                : "Approve recovery"}
          </button>
        ) : (
          <div className="nav-links">
            <input
              type="text"
              placeholder="New owner address (0x…)"
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              style={{ minWidth: "22rem" }}
            />
            <button
              type="button"
              className="button primary"
              disabled={busy !== null || !newOwner.trim()}
              onClick={() =>
                run("propose", {
                  action: "propose_recovery",
                  newOwner: newOwner.trim(),
                })
              }
            >
              {working("propose") ? "Proposing…" : "Propose recovery"}
            </button>
          </div>
        ))}

      {result && (
        <p className="lede">
          {result.ok ? (
            <>
              ✓ Done. Tx{" "}
              <a
                href={`https://suiscan.xyz/${NETWORK}/tx/${result.text}`}
                target="_blank"
                rel="noreferrer"
              >
                {result.text.slice(0, 16)}…
              </a>
            </>
          ) : (
            <>Action failed: {result.text}</>
          )}
        </p>
      )}
    </div>
  );
}

export function RecoveryPanel({ estate }: { estate: EstateView }) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) return null;
  return <RecoveryInner estate={estate} />;
}
