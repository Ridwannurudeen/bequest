import type { Metadata } from "next";
import {
  ConsoleShell,
  Stepper,
  WorkspaceHeader,
} from "../../components/benchmark-ui";
import { OwnerSetup } from "../../components/owner-setup";

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
        pill="Active"
      />
      <Stepper active={2} />

      <div className="workspace-grid">
        <section className="form-card" aria-labelledby="recipients-title">
          <h2 id="recipients-title">Name the people you trust</h2>
          <p>
            Recipients can claim with Google sign-in after the estate becomes
            Triggered. Sign in above, then set inactivity timers and the
            recipient split — Bequest creates the estate gaslessly.
          </p>
          <OwnerSetup />
        </section>

        <aside className="soft-card preview-stack" aria-label="Estate preview">
          <div>
            <h2>Estate preview</h2>
            <p>Your plan, in plain language.</p>
          </div>

          <div className="preview-box">
            <small>If I am inactive for</small>
            <h3>your chosen window</h3>
          </div>

          <div className="preview-box">
            <small>Then distribute</small>
            <h3>to your recipients</h3>
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
