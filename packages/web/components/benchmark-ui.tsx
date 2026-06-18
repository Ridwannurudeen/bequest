import Link from "next/link";
import { explorerObjectUrl, explorerTxUrl } from "../lib/claim-receipt";
import { getPublicConfig } from "../lib/config";
import { currentPackage, proofCards } from "../lib/live-proof";

export const estate = {
  id: "0x99c44f...3a723d",
  fullId: "0x99c44f3a723d",
  balance: "0.02 SUI",
  amina: "0.014 SUI",
  yusuf: "0.006 SUI",
  network: "Sui testnet",
};

export const recipients = [
  {
    name: "Amina",
    email: "amina@example.com",
    address: "0xd78d...1f89",
    share: 70,
    amount: estate.amina,
    color: "blue",
  },
  {
    name: "Yusuf",
    email: "yusuf@example.com",
    address: "0xd45d...7571",
    share: 30,
    amount: estate.yusuf,
    color: "gold",
  },
] as const;

const navItems = [
  { label: "Estate overview", href: "/estates", key: "estate" },
  { label: "Recipients", href: "/create", key: "recipients" },
  { label: "Trigger & heartbeat", href: "/estates#trigger", key: "trigger" },
  { label: "Private letter", href: "/letter", key: "letter" },
  { label: "Proof & receipt", href: "/proof", key: "proof" },
] as const;

export type ConsoleKey = (typeof navItems)[number]["key"] | "claim";

export function BrandMark() {
  return (
    <span className="bq-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2.5 4.75 5.45v5.9c0 4.25 3.05 7.35 7.25 8.65 4.2-1.3 7.25-4.4 7.25-8.65v-5.9L12 2.5Z"
          fill="currentColor"
        />
        <path
          d="m8.9 12.1 2.05 2.05 4.25-4.55"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.9"
        />
      </svg>
    </span>
  );
}

export function TopNav() {
  return (
    <header className="topbar">
      <Link className="brand-lockup" href="/" aria-label="Bequest home">
        <BrandMark />
        <span>Bequest</span>
      </Link>
      <nav className="toplinks" aria-label="Primary">
        <Link className="active" href="/">
          Home
        </Link>
        <Link href="/#how">How it works</Link>
        <Link href="/estates">Estates</Link>
        <Link href="/proof">Proof</Link>
      </nav>
      <div className="top-actions">
        <span className="network-chip">Sui testnet</span>
        <Link className="button dark" href="/create">
          Open app
        </Link>
      </div>
    </header>
  );
}

export function StatusPill({
  children = "Triggered",
  tone = "green",
}: {
  children?: React.ReactNode;
  tone?: "green" | "blue" | "violet";
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export function ConsoleShell({
  active,
  children,
}: {
  active: ConsoleKey;
  children: React.ReactNode;
}) {
  return (
    <main className="console-shell">
      <aside className="side-rail" aria-label="Estate workspace">
        <Link className="rail-brand" href="/">
          <BrandMark />
          <span>
            Bequest
            <small>{estate.network}</small>
          </span>
        </Link>

        <nav className="rail-nav">
          {navItems.map((item) => {
            const isActive =
              active === item.key || (active === "claim" && item.key === "estate");
            return (
              <Link
                className={isActive ? "rail-item active" : "rail-item"}
                href={item.href}
                key={item.key}
              >
                <span />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="rail-status">
          <small>Live estate</small>
          <strong>Triggered</strong>
          <span>0.02 SUI - 2 recipients</span>
        </div>
        <p className="rail-note">Package verified on Sui</p>
      </aside>
      <section className="workspace">{children}</section>
    </main>
  );
}

export function WorkspaceHeader({
  eyebrow,
  title,
  body,
  pill = "Triggered",
}: {
  eyebrow?: string;
  title: string;
  body: string;
  pill?: string;
}) {
  return (
    <header className="workspace-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      <StatusPill>{pill}</StatusPill>
    </header>
  );
}

export function Stepper({ active = 3 }: { active?: number }) {
  const steps = ["Assets", "Recipients", "Trigger", "Private letter", "Review"];
  return (
    <ol className="stepper" aria-label="Estate creation progress">
      {steps.map((step, index) => {
        const n = index + 1;
        return (
          <li
            className={
              n < active ? "done" : n === active ? "current" : "pending"
            }
            key={step}
          >
            <span>{n}</span>
            <small>{step}</small>
          </li>
        );
      })}
    </ol>
  );
}

export function EstateStage({ compact = false }: { compact?: boolean }) {
  const stages = ["Active", "Pending", "Triggered", "Claimed"];
  return (
    <ol className={compact ? "estate-stage compact" : "estate-stage"}>
      {stages.map((stage, index) => (
        <li
          className={index < 3 ? "done" : "pending"}
          key={stage}
          aria-current={stage === "Triggered" ? "step" : undefined}
        >
          <span>{index < 3 ? "ok" : ""}</span>
          <small>{stage}</small>
        </li>
      ))}
    </ol>
  );
}

export function RecipientSplit() {
  return (
    <div className="split-list">
      {recipients.map((recipient) => (
        <div className="split-row" key={recipient.name}>
          <span className={`avatar-dot ${recipient.color}`} />
          <span className="mono">{recipient.address}</span>
          <strong>{recipient.share}%</strong>
        </div>
      ))}
    </div>
  );
}

export function MiniProof({
  title,
  body,
  tone = "blue",
}: {
  title: string;
  body: string;
  tone?: "blue" | "green" | "gold" | "violet";
}) {
  return (
    <article className={`mini-proof ${tone}`}>
      <span />
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

export function ProofTimeline() {
  const rows = [
    ["Estate created", "Shared Estate object published", "Sui"],
    ["Assets escrowed", "0.02 SUI held by the estate", "Sui"],
    ["Trigger finalized", "Active -> Pending -> Triggered", "Keeper"],
    ["Sponsored claim", "Recipient authenticated with Google", "Enoki"],
    ["Atomic distribution", "70/30 split delivered in one PTB", "Sui"],
    ["Letter release", "Seal policy approved the Walrus blob", "Walrus + Seal"],
  ];
  return (
    <div className="proof-timeline">
      {rows.map(([title, detail, tag]) => (
        <div className="proof-event" key={title}>
          <span className="check-dot">ok</span>
          <div>
            <strong>{title}</strong>
            <p>{detail}</p>
          </div>
          <em>{tag}</em>
        </div>
      ))}
    </div>
  );
}

export function VerificationPacket() {
  const config = getPublicConfig();
  const sponsoredClaim = proofCards.find(
    (card) => card.label === "Sponsored claim",
  );
  const privateWishes = proofCards.find(
    (card) => card.label === "Private wishes",
  );
  const distribution = proofCards.find(
    (card) => card.label === "Atomic distribution",
  );
  const rows = [
    {
      label: "Move package",
      value: `${currentPackage.packageId.slice(0, 8)}...${currentPackage.packageId.slice(-6)}`,
      href: explorerObjectUrl(currentPackage.packageId),
    },
    {
      label: "Estate object",
      value: config.demoEstateId
        ? `${config.demoEstateId.slice(0, 8)}...${config.demoEstateId.slice(-6)}`
        : estate.id,
      href: explorerObjectUrl(config.demoEstateId ?? currentPackage.packageId),
    },
    {
      label: "Claim transaction",
      value: sponsoredClaim?.evidence
        ? `${sponsoredClaim.evidence.slice(0, 7)}...${sponsoredClaim.evidence.slice(-5)}`
        : "Sponsored proof",
      href: sponsoredClaim?.evidence
        ? explorerTxUrl(sponsoredClaim.evidence)
        : currentPackage.explorerUrl,
    },
    {
      label: "Walrus report",
      value: privateWishes?.evidence ?? "LAST-WISHES PASSED",
      href: currentPackage.explorerUrl,
    },
    {
      label: "Distribution",
      value: distribution?.evidence ?? "DISTRIBUTION PASSED",
      href: currentPackage.explorerUrl,
    },
  ];
  return (
    <div className="packet-list">
      {rows.map((row) => (
        <a href={row.href} key={row.label} target="_blank" rel="noreferrer">
          <span>
            <strong>{row.label}</strong>
            <small>{row.value}</small>
          </span>
          <b>Open</b>
        </a>
      ))}
    </div>
  );
}
