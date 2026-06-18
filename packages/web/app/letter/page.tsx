import type { Metadata } from "next";
import Link from "next/link";
import {
  ConsoleShell,
  WorkspaceHeader,
  estate,
} from "../../components/benchmark-ui";

export const metadata: Metadata = {
  title: "Bequest · private letter",
  description:
    "A Seal-gated private letter stored on Walrus and released only after the estate trigger.",
};

export default function PrivateLetterPage() {
  return (
    <ConsoleShell active="letter">
      <div className="letter-page">
        <WorkspaceHeader
          title="A private letter, released at the right time."
          body="Stored on Walrus. Encrypted with Seal. Available only after the estate trigger."
        />

        <div className="workspace-grid">
          <section className="letter-card" aria-label="Private letter">
            <p className="eyebrow">Private letter</p>
            <h2>For Adam and Eve</h2>
            <small>Released from estate {estate.id}</small>
            <div className="rule" />
            <p>
              I created this estate so you would not need to search for keys or
              guess what I intended. The assets listed here are yours according
              to the shares recorded onchain. Please use them carefully, and
              keep looking after one another.
            </p>
            <p style={{ marginTop: 28 }}>- Your family</p>
            <div className="preview-box violet" style={{ marginTop: 42 }}>
              <small>Seal access approved</small>
              <p>Estate status: Triggered - namespace matches estate object</p>
            </div>
            <div className="hero-actions">
              <Link className="button dark" href="/proof">
                Open proof receipt
              </Link>
              <Link className="button ghost" href="/proof">
                View Walrus proof
              </Link>
            </div>
          </section>

          <aside className="soft-card proof-stack" aria-label="Privacy proof">
            <div>
              <h2>Privacy proof</h2>
              <p>Why the letter unlocked</p>
            </div>
            {[
              ["Estate object found", estate.id],
              ["State is Triggered", "Onchain"],
              ["Seal policy approved", "estate::seal_approve"],
              ["Walrus blob verified", "LAST-WISHES PASSED"],
            ].map(([title, detail]) => (
              <div className="proof-row" key={title}>
                <span className="check-dot">ok</span>
                <div>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              </div>
            ))}
            <div className="proof-row warning">
              <span className="avatar-dot gold" />
              <div>
                <strong>Privacy boundary</strong>
                <p>
                  The interface never exposes the letter while the estate is
                  Active or Pending.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </ConsoleShell>
  );
}
