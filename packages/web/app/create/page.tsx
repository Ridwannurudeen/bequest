import type { Metadata } from "next";
import Link from "next/link";
import {
  ConsoleShell,
  Stepper,
  WorkspaceHeader,
  recipients,
} from "../../components/benchmark-ui";

export const metadata: Metadata = {
  title: "Bequest · create estate",
  description:
    "Create a Sui estate, choose recipients, set a trigger, and keep an encrypted letter sealed until release.",
};

export default function CreateEstatePage() {
  return (
    <ConsoleShell active="recipients">
      <WorkspaceHeader
        title="Create your estate"
        body="A guided setup. You can change or cancel everything while the estate is Active."
      />
      <Stepper active={2} />

      <div className="workspace-grid">
        <section className="form-card" aria-labelledby="recipients-title">
          <h2 id="recipients-title">Name the people you trust</h2>
          <p>
            Recipients can claim with Google sign-in after the estate becomes
            Triggered.
          </p>

          {recipients.map((recipient) => (
            <article
              className={`recipient-card ${recipient.color === "gold" ? "gold" : ""}`}
              key={recipient.name}
            >
              <div className="avatar">{recipient.name.slice(0, 1)}</div>
              <div>
                <h3>{recipient.name}</h3>
                <p>{recipient.email}</p>
                <small>Claim path: Google zkLogin - sponsored gas</small>
              </div>
              <span className="share-chip">{recipient.share}%</span>
            </article>
          ))}

          <Link className="add-row" href="#">
            + Add another recipient
          </Link>

          <div className="total-line">
            <span>Distribution total</span>
            <strong>100%</strong>
          </div>

          <div className="hero-actions">
            <Link className="button dark" href="/estates">
              Continue
            </Link>
            <Link className="button ghost" href="/">
              Save draft
            </Link>
          </div>
        </section>

        <aside className="soft-card preview-stack" aria-label="Estate preview">
          <div>
            <h2>Estate preview</h2>
            <p>Your plan, in plain language.</p>
          </div>

          <div className="preview-box">
            <small>If I am inactive for</small>
            <h3>180 days</h3>
          </div>

          <div className="preview-box">
            <small>Then distribute</small>
            <h3>70% to Amina</h3>
            <h3>30% to Yusuf</h3>
          </div>

          <div className="preview-box violet">
            <small>Private letter</small>
            <h3>Encrypted on Walrus.</h3>
            <p>Seal unlocks only after trigger.</p>
          </div>

          <div className="preview-box green">
            <small>You retain full control</small>
            <p>Until the estate is triggered.</p>
          </div>
        </aside>
      </div>
    </ConsoleShell>
  );
}
