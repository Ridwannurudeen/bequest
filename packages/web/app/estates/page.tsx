import type { Metadata } from "next";
import Link from "next/link";
import type { EstateView } from "../../lib/bequest-sdk";
import { ratioLabel } from "../../lib/bequest-sdk";
import { getPublicConfig } from "../../lib/config";
import { explorerObjectUrl, resolvedPackageId } from "../../lib/claim-receipt";
import { listEstates, readEstateOnChain } from "../../lib/estate-onchain";
import { ExecutorAction } from "../../components/executor-action";
import { DepositAction } from "../../components/deposit-action";
import { DepositObjectAction } from "../../components/deposit-object-action";
import { OwnerManage } from "../../components/owner-manage";
import { SetWishes } from "../../components/set-wishes";
import { RecoveryPanel } from "../../components/recovery-panel";
import { AuthButton } from "../../components/auth-button";

// Read every estate live per request; the executor view must reflect current on-chain state.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bequest · estates",
  description:
    "Executor dashboard: every Bequest estate with its status, heirs, escrowed assets, and trigger timing.",
};

function fmtDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// Human timing for the dead-man's switch, computed from the estate's clock fields.
function timing(estate: EstateView, now: number): string {
  if (estate.status === "Triggered") return "claimable by heirs";
  if (estate.triggerKind === "scheduled") {
    if (!estate.releaseAtMs) return "scheduled";
    const ms = estate.releaseAtMs - now;
    return ms > 0 ? `releases in ${fmtDuration(ms)}` : "release due";
  }
  if (estate.status === "Active") {
    const armsAt = Date.parse(estate.lastActive) + estate.inactivityMs;
    const ms = armsAt - now;
    return ms > 0 ? `arms in ${fmtDuration(ms)}` : "arming due";
  }
  if (estate.status === "Pending" && estate.pendingSince) {
    const triggersAt = Date.parse(estate.pendingSince) + estate.gracePeriodMs;
    const ms = triggersAt - now;
    return ms > 0 ? `triggers in ${fmtDuration(ms)}` : "trigger due";
  }
  return "";
}

export default async function EstatesPage() {
  const config = getPublicConfig();
  const pkg = resolvedPackageId(config);
  let estates: { id: string; view: EstateView }[] = [];
  try {
    const ids = await listEstates(config);
    const views = await Promise.all(
      ids.map((id) =>
        readEstateOnChain(id, config)
          .then((view) => ({ id, view }))
          .catch(() => null),
      ),
    );
    estates = views.filter(
      (e): e is { id: string; view: EstateView } => e !== null,
    );
  } catch (error) {
    console.warn("Estates dashboard live read failed:", error);
  }

  const now = Date.now();

  return (
    <main>
      <nav className="nav-shell" aria-label="Estates navigation">
        <Link className="brand" href="/" aria-label="Back to Bequest home">
          <span className="brand-mark">Bq</span>
          <span>Bequest</span>
        </Link>
        <div className="nav-links">
          <Link href="/#proof">Proof</Link>
          <Link href="/#estate">Estate</Link>
          <AuthButton />
        </div>
      </nav>

      <section className="receipt-hero">
        <div>
          <p className="kicker">Executor dashboard · {config.network}</p>
          <h1>
            <span>Every estate,</span>
            <span>its trigger state,</span>
            <span>and who inherits.</span>
          </h1>
          <p className="lede">
            A live view of every Bequest estate on-chain — status, named heirs,
            escrowed assets, and how close each one is to triggering. The
            executor watches a pending trigger here before assets move.
          </p>
        </div>
      </section>

      <section className="receipt-section" aria-label="Estates">
        <div className="section-heading">
          <p className="kicker">{estates.length} estate(s)</p>
          <h2>On-chain estates</h2>
        </div>

        {estates.length === 0 ? (
          <p className="lede">No estates found on {config.network} yet.</p>
        ) : (
          <div className="receipt-grid">
            {estates.map(({ id, view }) => (
              <aside className="receipt-card" key={id} aria-label="Estate">
                <div className="receipt-card-top">
                  <span>Estate</span>
                  <strong>{id.slice(0, 10)}…</strong>
                </div>
                <h2>
                  <span className="status-pill">{view.status}</span> ·{" "}
                  {timing(view, now)}
                </h2>
                <dl>
                  <div>
                    <dt>Owner</dt>
                    <dd>{view.ownerLabel}</dd>
                  </div>
                  <div>
                    <dt>Heirs</dt>
                    <dd>
                      {view.heirs.length > 0
                        ? view.heirs
                            .map(
                              (h) => `${h.label} · ${ratioLabel(h.ratioBps)}`,
                            )
                            .join(", ")
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Assets</dt>
                    <dd>
                      {view.assets.length > 0
                        ? view.assets
                            .map((a) =>
                              a.note
                                ? `${a.label} (${a.value} · ${a.note})`
                                : `${a.label} (${a.value})`,
                            )
                            .join(", ")
                        : "None escrowed"}
                    </dd>
                  </div>
                  <div>
                    <dt>Recovery</dt>
                    <dd>
                      {view.guardians.length > 0
                        ? `${view.recoveryThreshold}-of-${view.guardians.length} guardians${view.recovery ? ` · pending → ${view.recovery.newOwner.slice(0, 6)}… (${view.recovery.approvals.length}/${view.recoveryThreshold})` : ""}`
                        : "No guardians set"}
                    </dd>
                  </div>
                </dl>
                <div className="nav-links">
                  <Link href={`/claim/${id}`}>Claim receipt</Link>
                  <a href={explorerObjectUrl(id)}>SuiScan</a>
                </div>
                <ExecutorAction
                  estateId={id}
                  status={view.status}
                  executorAddress={view.executorAddress}
                />
                <DepositAction
                  estateId={id}
                  owner={view.owner}
                  status={view.status}
                />
                <DepositObjectAction
                  estateId={id}
                  owner={view.owner}
                  status={view.status}
                  heirs={view.heirs}
                />
                <OwnerManage estate={view} />
                <SetWishes estate={view} packageId={pkg} />
                <RecoveryPanel estate={view} />
              </aside>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
