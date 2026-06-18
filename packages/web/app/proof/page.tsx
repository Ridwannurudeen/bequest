import type { Metadata } from "next";
import {
  ConsoleShell,
  ProofTimeline,
  VerificationPacket,
  WorkspaceHeader,
  estate,
  recipients,
} from "../../components/benchmark-ui";

export const metadata: Metadata = {
  title: "Bequest · proof receipt",
  description:
    "A canonical receipt for the Sui estate, sponsored claim, 70/30 distribution, and private-letter release.",
};

export default function ProofBoardPage() {
  return (
    <ConsoleShell active="proof">
      <WorkspaceHeader
        title="Distribution receipt"
        body="One canonical record of the claim, the payout split, and the private-letter release."
        pill="Verified"
      />

      <section className="panel-card receipt-hero-card" aria-label="Distribution receipt">
        <div className="receipt-total">
          <small className="eyebrow">Claim complete</small>
          <strong>{estate.balance} distributed in one PTB.</strong>
          <p>
            A non-owner recipient claimed with sponsored gas. Funds routed to
            the two recorded recipients.
          </p>
        </div>
        {recipients.map((recipient) => (
          <article className="recipient-receipt" key={recipient.name}>
            <span className={`avatar-dot ${recipient.color}`} />
            <h3>{recipient.name}</h3>
            <strong>{recipient.amount}</strong>
            <small>{recipient.share}%</small>
          </article>
        ))}
      </section>

      <div className="workspace-grid equal" style={{ marginTop: 34 }}>
        <section className="panel-card">
          <h2>Proof timeline</h2>
          <ProofTimeline />
        </section>

        <section className="panel-card">
          <h2>Verification packet</h2>
          <VerificationPacket />
          <div className="hero-actions">
            <a className="button dark" href="#">
              Download proof packet
            </a>
          </div>
        </section>
      </div>
    </ConsoleShell>
  );
}
