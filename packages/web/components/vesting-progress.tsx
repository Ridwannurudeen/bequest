import type { EstateVesting } from "../lib/bequest-sdk";

function pct(bps: number): string {
  return `${(bps / 100).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}%`;
}

function fmtDuration(ms: number): string {
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return `${Math.round(ms / (60 * 60 * 1000))}h`;
  if (days < 60) return `${days}d`;
  const months = Math.round(days / 30);
  return `${months}mo`;
}

export function VestingProgress({ vesting }: { vesting?: EstateVesting }) {
  if (!vesting) return null;
  const percent = vesting.vestedBps / 100;
  return (
    <div className="claim-target-card" aria-label="Vesting progress">
      <p className="kicker">Vesting release</p>
      <h3>{pct(vesting.vestedBps)} unlocked now</h3>
      <p>
        Cliff {fmtDuration(vesting.cliffMs)}; full unlock{" "}
        {fmtDuration(vesting.durationMs)} after the estate triggers. The claim
        button releases only the unlocked, unclaimed slice; an immediate second
        claim can execute as a no-op if nothing new has unlocked.
      </p>
      <div
        aria-label="Unlocked percent"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        role="progressbar"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 999,
          height: 12,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            background: "linear-gradient(90deg, #2fe0c4, #f7c873)",
            display: "block",
            height: "100%",
            width: `${Math.min(100, Math.max(0, percent))}%`,
          }}
        />
      </div>
    </div>
  );
}
