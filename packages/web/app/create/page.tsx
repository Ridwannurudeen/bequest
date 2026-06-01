import type { Metadata } from "next";
import Link from "next/link";
import { OwnerSetup } from "../../components/owner-setup";

export const metadata: Metadata = {
  title: "Bequest · create estate",
  description:
    "Owner setup: sign in with Google, name your heirs and shares, set the inactivity window, and create your estate gaslessly.",
};

export default function CreateEstatePage() {
  return (
    <main>
      <nav className="nav-shell" aria-label="Create estate navigation">
        <Link className="brand" href="/" aria-label="Back to Bequest home">
          <span className="brand-mark">Bq</span>
          <span>Bequest</span>
        </Link>
        <div className="nav-links">
          <Link href="/estates">Estates</Link>
          <Link href="/#proof">Proof</Link>
        </div>
      </nav>

      <section className="receipt-hero">
        <div>
          <p className="kicker">Owner setup</p>
          <h1>
            <span>Name your heirs.</span>
            <span>Set the timer.</span>
            <span>Create your estate.</span>
          </h1>
          <p className="lede">
            Sign in with Google, name the heirs who inherit and their shares,
            and choose how long of inactivity triggers the hand-off. Creating
            the estate is gasless — Enoki sponsors it. Depositing assets into it
            is the next step once your account holds them.
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
    </main>
  );
}
