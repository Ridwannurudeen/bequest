"use client";

import {
  useEnokiFlow,
  useZkLogin,
  useZkLoginSession,
} from "@mysten/enoki/react";
import { fromBase64 } from "@mysten/sui/utils";
import { useEffect, useState } from "react";
import type { SuiNetwork } from "../lib/config";
import type { EstateView } from "../lib/bequest-sdk";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";
const DAY_MS = 24 * 60 * 60 * 1000;
const SUI_TYPE = "0x2::sui::SUI";
const SUI_DECIMALS = 9;

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

function OwnerManageInner({ estate }: { estate: EstateView }) {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();
  const session = useZkLoginSession();

  const [heirs, setHeirs] = useState<Heir[]>(
    estate.heirs.map((h) => ({
      addr: h.binding,
      percent: String(Math.round(h.ratioBps / 100)),
    })),
  );
  const [executor, setExecutor] = useState(estate.executorAddress ?? "");
  const [inactivityDays, setInactivityDays] = useState(
    String(Math.round(estate.inactivityMs / DAY_MS)),
  );
  const [graceDays, setGraceDays] = useState(
    String(Math.round(estate.gracePeriodMs / DAY_MS)),
  );
  const [withdrawSui, setWithdrawSui] = useState("");
  const objectAssets = estate.assets.filter((a) => a.objectId && a.objectType);

  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Off-chain reminder contact: an email the keeper uses to nudge the owner before the
  // inactivity switch arms. Stored off-chain (not on the estate) for privacy.
  const [reminderEmail, setReminderEmail] = useState("");
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Prefill any saved reminder email for this estate.
  useEffect(() => {
    let active = true;
    fetch(
      `/api/reminders?estateId=${encodeURIComponent(estate.estateId)}` +
        (address ? `&owner=${encodeURIComponent(address)}` : ""),
    )
      .then((r) => r.json())
      .then((res: { data?: { email?: string } | null }) => {
        if (active && res.data?.email) setReminderEmail(res.data.email);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [estate.estateId, address]);

  async function saveReminder() {
    setReminderBusy(true);
    setReminderMsg(null);
    try {
      const res = await postJson("/api/reminders", {
        estateId: estate.estateId,
        owner: address,
        email: reminderEmail.trim(),
      });
      if (typeof res.error === "string") throw new Error(res.error);
      setReminderMsg({
        ok: true,
        text: "Saved — we'll email you before your timer runs out.",
      });
    } catch (error) {
      setReminderMsg({
        ok: false,
        text: error instanceof Error ? error.message : "Could not save reminder.",
      });
    } finally {
      setReminderBusy(false);
    }
  }

  // Build the owner transaction kind, sponsor it, sign with the zkLogin keypair, execute.
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

  function setHeir(i: number, patch: Partial<Heir>) {
    setHeirs((prev) => prev.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  }

  // Owner-only, and only while the estate can still be amended (pre-Triggered).
  if (!address || address !== estate.owner) return null;
  if (estate.status === "Triggered") {
    return (
      <p className="lede">
        This estate is Triggered. Owner controls are locked; heirs can now
        claim.
      </p>
    );
  }

  const working = (label: string) => busy === label;
  const scheduled = estate.triggerKind === "scheduled";
  const releaseLabel = estate.releaseAtMs
    ? new Date(estate.releaseAtMs).toLocaleString()
    : null;

  return (
    <div className="owner-form" aria-label="Owner controls">
      {scheduled ? (
        <p className="lede">
          Scheduled estate{releaseLabel ? ` · releases ${releaseLabel}` : ""}.
          No check-ins needed; heirs can claim at the release time.
        </p>
      ) : (
        <button
          type="button"
          className="button primary"
          onClick={() => run("heartbeat", { action: "heartbeat" })}
          disabled={busy !== null}
        >
          {working("heartbeat") ? "Confirming…" : "I'm alive (reset the timer)"}
        </button>
      )}

      {!scheduled && (
        <div>
          <p className="kicker">Reminders</p>
          <p className="lede">
            Get an email before your timer runs out, so you never miss a check-in.
          </p>
          <div className="nav-links">
            <input
              type="email"
              placeholder="you@example.com"
              value={reminderEmail}
              onChange={(e) => setReminderEmail(e.target.value)}
              style={{ flex: "1 1 18rem", minWidth: 0 }}
            />
            <button
              type="button"
              className="button secondary"
              disabled={reminderBusy || reminderEmail.trim().length === 0}
              onClick={saveReminder}
            >
              {reminderBusy ? "Saving…" : "Save reminder"}
            </button>
          </div>
          {reminderMsg && (
            <p className="lede">
              {reminderMsg.ok ? `✓ ${reminderMsg.text}` : reminderMsg.text}
            </p>
          )}
        </div>
      )}

      <div>
        <p className="kicker">Heirs and shares</p>
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
        <button
          type="button"
          className="button secondary"
          disabled={busy !== null}
          onClick={() =>
            run("heirs", {
              action: "update_heirs",
              heirs: heirs.map((h) => h.addr.trim()),
              bps: heirs.map((h) => Math.round(Number(h.percent) * 100)),
            })
          }
        >
          {working("heirs") ? "Saving…" : "Update heirs"}
        </button>
      </div>

      <div className="nav-links">
        <input
          type="text"
          placeholder="Executor Sui address (optional, 0x…)"
          value={executor}
          onChange={(e) => setExecutor(e.target.value)}
          style={{ minWidth: "22rem" }}
        />
        <button
          type="button"
          className="button secondary"
          disabled={busy !== null}
          onClick={() =>
            run("executor", {
              action: "update_executor",
              executor: executor.trim() || undefined,
            })
          }
        >
          {working("executor") ? "Saving…" : "Update executor"}
        </button>
      </div>

      {!scheduled && (
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
          <button
            type="button"
            className="button secondary"
            disabled={busy !== null}
            onClick={() =>
              run("timers", {
                action: "update_timers",
                inactivityMs: Math.round(Number(inactivityDays) * DAY_MS),
                graceMs: Math.round(Number(graceDays) * DAY_MS),
              })
            }
          >
            {working("timers") ? "Saving…" : "Update timers"}
          </button>
        </div>
      )}

      <div className="nav-links">
        <label>
          Withdraw SUI{" "}
          <input
            type="number"
            placeholder="amount"
            value={withdrawSui}
            onChange={(e) => setWithdrawSui(e.target.value)}
            style={{ width: "8rem" }}
          />
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={busy !== null || !(Number(withdrawSui) > 0)}
          onClick={() =>
            run("withdraw-sui", {
              action: "withdraw_coin",
              coinType: SUI_TYPE,
              amount: Math.round(Number(withdrawSui) * 10 ** SUI_DECIMALS),
            })
          }
        >
          {working("withdraw-sui") ? "Withdrawing…" : "Withdraw SUI"}
        </button>
      </div>

      {objectAssets.length > 0 && (
        <div>
          <p className="kicker">Withdraw an object</p>
          {objectAssets.map((a) => (
            <div className="nav-links" key={a.objectId}>
              <span>
                {a.label} · {a.value}
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={busy !== null}
                onClick={() =>
                  run(`withdraw-${a.objectId}`, {
                    action: "withdraw_object",
                    objectType: a.objectType,
                    objectId: a.objectId,
                  })
                }
              >
                {working(`withdraw-${a.objectId}`)
                  ? "Withdrawing…"
                  : "Withdraw"}
              </button>
            </div>
          ))}
        </div>
      )}

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

// Owner self-service controls for a live estate: proof-of-life heartbeat, amend
// heirs/executor/timers, and withdraw coins or objects. Gated like owner-setup.
export function OwnerManage({ estate }: { estate: EstateView }) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) return null;
  return <OwnerManageInner estate={estate} />;
}
