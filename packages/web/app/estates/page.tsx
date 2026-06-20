import type { Metadata } from "next";
import Link from "next/link";
import {
  ConsoleShell,
  StatusPill,
  WorkspaceHeader,
} from "../../components/benchmark-ui";
import { DepositAction } from "../../components/deposit-action";
import { DepositObjectAction } from "../../components/deposit-object-action";
import { ExecutorAction } from "../../components/executor-action";
import { OwnerManage } from "../../components/owner-manage";
import { RecoveryPanel } from "../../components/recovery-panel";
import { SetWishes } from "../../components/set-wishes";
import { StakeAction } from "../../components/stake-action";
import { type EstateView, ratioLabel } from "../../lib/bequest-sdk";
import { resolvedPackageId } from "../../lib/claim-receipt";
import { getPublicConfig } from "../../lib/config";
import { listEstates, readEstateOnChain } from "../../lib/estate-onchain";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bequest · estate dashboard",
  description:
    "Estate overview showing the trigger state, recipient split, encrypted letter, and verifiable proof packet.",
};

function toneFor(status: EstateView["status"]): "green" | "blue" | "violet" {
  if (status === "Triggered") return "green";
  if (status === "Pending") return "violet";
  return "blue";
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

  return (
    <ConsoleShell active="estate">
      <WorkspaceHeader
        title="Estate overview"
        body={`Live estates on ${config.network}. Sign in with Google to manage an estate you own, or to act as a guardian or executor.`}
        pill={estates.length ? `${estates.length} live` : "None yet"}
      />

      {estates.length === 0 ? (
        <section className="panel-card" aria-label="No estates">
          <h2>No estates found on {config.network} yet.</h2>
          <p>
            Create the first estate to see it appear here with live status,
            recipients, escrowed assets, and owner actions.
          </p>
          <div className="hero-actions">
            <Link className="button dark" href="/create">
              Create an estate
            </Link>
          </div>
        </section>
      ) : (
        estates.map(({ id, view }) => (
          <section className="panel-card" key={id} aria-label={`Estate ${id}`}>
            <header className="estate-card-head">
              <div>
                <small className="eyebrow">
                  Estate {id.slice(0, 8)}…{id.slice(-6)}
                </small>
                <h2>{view.ownerLabel || view.owner}</h2>
                <p>
                  {view.heirs
                    .map(
                      (heir) =>
                        `${heir.label || "Recipient"} ${ratioLabel(heir.ratioBps)}`,
                    )
                    .join(" · ") || "No recipients recorded"}
                </p>
              </div>
              <StatusPill tone={toneFor(view.status)}>{view.status}</StatusPill>
            </header>

            <div className="estate-actions">
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
              <StakeAction
                estateId={id}
                owner={view.owner}
                status={view.status}
                heirs={view.heirs}
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
            </div>
          </section>
        ))
      )}
    </ConsoleShell>
  );
}
