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

const MenuIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const links = [
  { href: "/#how", label: "How it works" },
  { href: "/demo", label: "Demo" },
  { href: "/estates", label: "Estates" },
  { href: "/proof", label: "Proof" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="Primary">
        <Link className="brand" href="/" aria-label="Bequest home">
          <span className="brand-mark">{BrandMark}</span>
          <span>Bequest</span>
        </Link>

        {/* Desktop */}
        <div className="site-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          <span className="divider" aria-hidden="true" />
          <AuthButton />
          <Link href="/create" className="button primary">
            Launch app
          </Link>
        </div>

        {/* Mobile */}
        <details className="nav-mobile">
          <summary aria-label="Toggle menu">{MenuIcon}</summary>
          <div className="nav-mobile-panel">
            {links.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
            <AuthButton />
            <Link href="/create" className="button primary">
              Launch app
            </Link>
          </div>
        </details>
      </nav>
    </header>
  );
}
