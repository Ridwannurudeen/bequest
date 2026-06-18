import Link from "next/link";
import {
  EstateStage,
  FeatureProofGrid,
  JudgeProofStrip,
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
              Succession layer for <span>Sui portfolios.</span>
            </h1>
            <p>
              Bequest turns inheritance into a verifiable Sui workflow:
              escrowed assets, inactivity triggers, Google-ready recipient
              claims, and Seal-gated letters without handing over seed phrases.
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

        <JudgeProofStrip />

        <section className="section-block proof-section" id="proof">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Submission proof</p>
              <h2>Judge the proof, not a promise.</h2>
            </div>
            <Link className="button light" href="/proof">
              Open receipt
            </Link>
          </div>
          <FeatureProofGrid />
        </section>

        <section className="section-block" id="how">
          <h2>Designed for the failure modes that hurt real families.</h2>
          <p>
            The product removes the weakest handoff points while keeping the
            owner in control until the estate is actually triggered.
          </p>
          <div className="how-grid">
            {[
              ["01", "No seed phrase handoff", "Recipients claim with Google-backed identity after trigger."],
              ["02", "False-trigger protection", "Heartbeat, grace period, and executor pause guard the release."],
              ["03", "Private until eligible", "Walrus letters stay encrypted until Seal approves access."],
              ["04", "Auditable payout", "Distribution routes through one visible Sui proof packet."],
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
