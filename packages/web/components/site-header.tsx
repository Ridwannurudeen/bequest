import Link from "next/link";
import { AuthButton } from "./auth-button";

// Bequest mark: a shield (protection / custody) with a check (verifiable on-chain),
// drawn in the single accent. The official Sui droplet lives in the footer's
// "Built on Sui" badge so we never present Sui's mark as our own.
const BrandMark = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 2.5 4.5 5.5v6c0 4.4 3.2 7.6 7.5 9 4.3-1.4 7.5-4.6 7.5-9v-6z" />
    <path d="M9 12l2.2 2.2L15.2 10" />
  </svg>
);

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="Primary">
        <Link className="brand" href="/" aria-label="Bequest home">
          <span className="brand-mark">{BrandMark}</span>
          <span>Bequest</span>
        </Link>
        <div className="site-links">
          <Link href="/#how">How it works</Link>
          <Link href="/demo">Demo</Link>
          <Link href="/estates">Estates</Link>
          <Link href="/proof">Proof</Link>
          <span className="divider" aria-hidden="true" />
          <AuthButton />
          <Link href="/create" className="button primary">
            Launch app
          </Link>
        </div>
      </nav>
    </header>
  );
}
