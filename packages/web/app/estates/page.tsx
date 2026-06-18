import type { Metadata } from "next";
import Link from "next/link";
import {
  ConsoleShell,
  EstateStage,
  MiniProof,
  RecipientSplit,
  WorkspaceHeader,
  estate,
} from "../../components/benchmark-ui";

export const metadata: Metadata = {
  title: "Bequest · estate dashboard",
  description:
    "Estate overview showing the trigger state, recipient split, encrypted letter, and verifiable proof packet.",
};

export default function EstatesPage() {
  return (
    <ConsoleShell active="estate">
      <WorkspaceHeader
        title="Estate overview"
        body="Demo estate - Sui testnet"
      />

      <section className="panel-card dashboard-hero" aria-label="Estate state">
        <div>
          <small className="eyebrow">Estate {estate.id}</small>
          <h2>The release condition is met.</h2>
          <p>
            Recipients can now claim. Payout routing is fixed to the recorded
            70/30 distribution.
          </p>
          <EstateStage compact />
        </div>
        <aside className="portfolio-box">
          <small>Escrowed portfolio</small>
          <strong>{estate.balance}</strong>
          <p>2 recipients</p>
          <p>70% / 30%</p>
        </aside>
      </section>

      <section className="metric-grid" aria-label="Estate proof states">
        <MiniProof
          title="Heartbeat"
          body="Reset the inactivity clock"
        />
        <MiniProof
          tone="green"
          title="Recipients"
          body="2 recipients recorded - 70% / 30% split"
        />
        <MiniProof
          tone="violet"
          title="Private letter"
          body="Encrypted on Walrus - ready after claim"
        />
        <MiniProof
          tone="gold"
          title="Proof packet"
          body="6 checks passed - open receipt"
        />
      </section>

      <div className="workspace-grid equal">
        <section className="panel-card">
          <h2>Recipient distribution</h2>
          <RecipientSplit />
          <div className="hero-actions">
            <Link className="button dark" href="/claim/demo">
              Open recipient claim room
            </Link>
          </div>
        </section>

        <section className="panel-card timeline-card" id="trigger">
          <h2>Trigger history</h2>
          {[
            ["Estate created", "Assets deposited and recipients recorded.", "May 24"],
            ["Heartbeat missed", "Inactivity window completed.", "Jun 16"],
            ["Grace period closed", "No executor pause was submitted.", "Jun 17"],
            ["Estate triggered", "Recipient claim path unlocked.", "Jun 17"],
          ].map(([title, detail, date]) => (
            <div className="timeline-row" key={title}>
              <span className="timeline-dot" />
              <div>
                <strong>{title}</strong>
                <p>{detail}</p>
              </div>
              <em>{date}</em>
            </div>
          ))}
        </section>
      </div>
    </ConsoleShell>
  );
}
