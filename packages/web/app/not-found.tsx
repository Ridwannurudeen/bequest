import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bequest · page not found",
};

export default function NotFound() {
  return (
    <main>
      <section className="receipt-hero">
        <div>
          <p className="kicker">404</p>
          <h1>This page doesn&apos;t exist.</h1>
          <p className="lede">
            The link may be broken, or the estate id is incomplete — a claim
            link needs the full <code>0x…</code> object id. Head back and pick
            up from a known page.
          </p>
          <div className="hero-actions">
            <Link href="/" className="button primary">
              Back to home
            </Link>
            <Link href="/estates" className="button secondary">
              Browse estates
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
