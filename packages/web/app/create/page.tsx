import type { Metadata } from "next";
import { OwnerSetup } from "../../components/owner-setup";

export const metadata: Metadata = {
  title: "Bequest · create transfer",
  description:
    "Owner setup: sign in with Google, name recipients and shares, choose the release condition, and create a Sui estate through the Enoki-sponsored path when configured.",
};

export default function CreateEstatePage() {
  return (
    <main>
      <section className="receipt-hero">
        <div>
          <p className="kicker">Owner setup</p>
          <h1>Name recipients. Set the condition. Create the estate.</h1>
          <p className="lede">
            Sign in with Google, name the recipients and their shares, and
            choose what on-chain condition releases the hand-off. Creating the
            estate uses the Enoki-sponsored path when credentials are
            configured. Depositing assets into it is the next step once your
            account holds them.
          </p>
        </div>

        <aside className="receipt-card" aria-label="Create estate form">
          <div className="receipt-card-top">
            <span>New estate</span>
            <strong>draft</strong>
          </div>
          <OwnerSetup />
        </aside>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <p className="kicker">What happens after you create</p>
            <h2>Your estate, working in the background.</h2>
          </div>
        </div>
        <div className="flow-grid">
          <article className="flow-card">
            <h3>Deposit &amp; stay in control</h3>
            <p>
              Fund the estate with SUI, transferable objects, or a native
              StakedSui position. While you&apos;re active you can withdraw or
              reset the timer anytime — a single heartbeat keeps it dormant.
            </p>
          </article>
          <article className="flow-card">
            <h3>The switch arms itself</h3>
            <p>
              If you go inactive past your window, the estate arms and a grace
              period starts. An executor can pause a false alarm; no one can
              trigger it early.
            </p>
          </article>
          <article className="flow-card">
            <h3>Recipients claim gaslessly</h3>
            <p>
              After the trigger, recipients claim their shares with a Google
              sign-in: no seed phrase, no gas, and the encrypted letter unlocks
              for them.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
