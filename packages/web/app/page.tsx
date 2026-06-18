import Link from "next/link";
import {
  EstateStage,
  MiniProof,
  RecipientSplit,
  StatusPill,
  TopNav,
  estate,
} from "../components/benchmark-ui";

export default function Home() {
  return (
    <main>
      <TopNav />
      <div className="home-page">
        <section className="hero-grid" aria-labelledby="home-title">
          <div className="hero-copy">
            <span className="live-badge">Live on Sui testnet</span>
            <h1 id="home-title">
              A trusted path for <span>what comes next.</span>
            </h1>
            <p>
              Create a Sui estate, name the people you trust, set an inactivity
              trigger, and leave an encrypted letter without giving up control
              while you are active.
            </p>
            <div className="hero-actions">
              <Link className="button dark" href="/create">
                Create an estate
              </Link>
              <Link className="button light" href="/claim/demo">
                See a live claim
              </Link>
            </div>

            <div className="proof-mini-row" aria-label="Bequest guarantees">
              <MiniProof
                title="You stay in control"
                body="Withdraw or update while Active."
              />
              <MiniProof
                tone="green"
                title="Recipients use Google"
                body="No seed phrase required to claim."
              />
              <MiniProof
                tone="violet"
                title="Private letters stay sealed"
                body="Walrus + Seal unlock after trigger."
              />
            </div>
          </div>

          <article className="hero-card" aria-label="Live estate preview">
            <div className="card-head">
              <div>
                <p className="eyebrow">Live estate</p>
                <h2>A clear handoff, already proven onchain.</h2>
              </div>
              <StatusPill>Triggered</StatusPill>
            </div>

            <div className="summary-strip">
              <div>
                <small>Estate</small>
                <strong>{estate.id}</strong>
              </div>
              <div>
                <small>Escrowed</small>
                <strong>{estate.balance}</strong>
              </div>
              <div>
                <small>Recipients</small>
                <strong>2 people</strong>
              </div>
            </div>

            <EstateStage />

            <p className="eyebrow">Recipient distribution</p>
            <RecipientSplit />
          </article>
        </section>

        <section className="section-block" id="how">
          <h2>Built around the people who will need it.</h2>
          <p>The interface leads with continuity, not cryptography.</p>
          <div className="how-grid">
            {[
              ["01", "Set the estate", "Choose assets, recipients, and the inactivity rule."],
              ["02", "Stay in control", "Heartbeat, update, or cancel while Active."],
              ["03", "Trigger safely", "Grace period and executor pause reduce false alarms."],
              ["04", "Claim simply", "Recipients sign in with Google and receive their share."],
            ].map(([n, title, body]) => (
              <article className="how-card" key={title}>
                <small>{n}</small>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
