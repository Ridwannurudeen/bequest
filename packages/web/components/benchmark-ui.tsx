import Link from "next/link";
import { AuthButton } from "./auth-button";
import { explorerObjectUrl, explorerTxUrl } from "../lib/claim-receipt";
import { getPublicConfig } from "../lib/config";
import { currentPackage, featureProofs, proofCards } from "../lib/live-proof";

export const estate = {
  id: "0x99c44f...3a723d",
  fullId: "0x99c44f3a723d",
  balance: "0.02 SUI",
  adam: "0.014 SUI",
  eve: "0.006 SUI",
  network: "Sui testnet",
};

export const recipients = [
  {
    name: "Adam",
    email: "adam@example.com",
    address: "0xd78d...1f89",
    share: 70,
    amount: estate.adam,
    color: "blue",
  },
  {
    name: "Eve",
    email: "eve@example.com",
    address: "0xd45d...7571",
    share: 30,
    amount: estate.eve,
    color: "gold",
  },
] as const;

function shortEvidence(value: string, front = 8, back = 6) {
  return value.length > front + back + 3
    ? `${value.slice(0, front)}...${value.slice(-back)}`
    : value;
}

const ownerNavItems = [
  { label: "Estate overview", href: "/estates", key: "estate" },
  { label: "Recipients", href: "/create", key: "recipients" },
  { label: "Trigger & heartbeat", href: "/estates#trigger", key: "trigger" },
  { label: "Private letter", href: "/letter", key: "letter" },
  { label: "Proof & receipt", href: "/proof", key: "proof" },
] as const;

const claimNavItems = [
  { label: "Claim overview", href: "/claim/demo", key: "claim" },
  { label: "Identity", href: "/claim/demo#identity", key: "identity" },
  {
    label: "Distribution",
    href: "/claim/demo#distribution",
    key: "distribution",
  },
  { label: "Private letter", href: "/letter", key: "letter" },
  { label: "Proof & receipt", href: "/proof", key: "proof" },
] as const;

export type ConsoleKey =
  | (typeof ownerNavItems)[number]["key"]
  | (typeof claimNavItems)[number]["key"];

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
        <Link href="/estates">Estates</Link>
        <Link href="/proof">Proof</Link>
      </nav>
      <div className="top-actions">
        <span className="network-chip">Sui testnet</span>
        <AuthButton />
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
  const navItems =
    active === "claim" || active === "identity" || active === "distribution"
      ? claimNavItems
      : active === "letter" || active === "proof"
        ? claimNavItems
        : ownerNavItems;

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
            const isActive = active === item.key;
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

        <div className="rail-auth">
          <AuthButton />
        </div>

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

const ESTATE_JOURNEY = [
  "Set up estate",
  "Add a private letter",
  "Live & claimable",
];

export function Stepper({
  active = 1,
  steps = ESTATE_JOURNEY,
}: {
  active?: number;
  steps?: string[];
}) {
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

export function JudgeProofStrip() {
  const config = getPublicConfig();
  const sponsoredDigest = config.sponsoredClaimDigest;
  const rows = [
    {
      label: "Package",
      value: shortEvidence(currentPackage.packageId),
      href: currentPackage.explorerUrl,
      external: true,
    },
    {
      label: sponsoredDigest ? "Sponsored claim" : "Claim bytes",
      value: sponsoredDigest
        ? shortEvidence(sponsoredDigest, 7, 5)
        : "verify:claim-kind",
      href: sponsoredDigest ? explorerTxUrl(sponsoredDigest) : "/proof",
      external: Boolean(sponsoredDigest),
    },
    {
      label: "Walrus + Seal",
      value: "Letter release proven",
      href: "/letter",
      external: false,
    },
    {
      label: "Receipt",
      value: "6 checks visible",
      href: "/proof",
      external: false,
    },
  ];

  return (
    <section className="judge-proof-strip" aria-label="Judge proof shortcuts">
      {rows.map((row) =>
        row.external ? (
          <a href={row.href} key={row.label} target="_blank" rel="noreferrer">
            <small>{row.label}</small>
            <strong>{row.value}</strong>
            <span>Open</span>
          </a>
        ) : (
          <Link href={row.href} key={row.label}>
            <small>{row.label}</small>
            <strong>{row.value}</strong>
            <span>Open</span>
          </Link>
        ),
      )}
    </section>
  );
}

export function FeatureProofGrid() {
  return (
    <div className="feature-proof-grid">
      {featureProofs.map((proof) => (
        <a
          className="feature-proof-card"
          href={explorerTxUrl(proof.digest)}
          key={proof.label}
          target="_blank"
          rel="noreferrer"
        >
          <span>{proof.label}</span>
          <h3>{proof.title}</h3>
          <p>{proof.detail}</p>
          <small>{shortEvidence(proof.digest, 7, 5)}</small>
        </a>
      ))}
    </div>
  );
}

export function ProofTimeline() {
  const rows = [
    ["Estate created", "Shared Estate object published", "Sui"],
    ["Assets escrowed", "0.02 SUI held by the estate", "Sui"],
    ["Trigger finalized", "Active -> Pending -> Triggered", "Keeper"],
    ["Claim bytes built", "Sponsor-ready transaction kind verified", "Enoki"],
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
      value: config.sponsoredClaimDigest
        ? `${config.sponsoredClaimDigest.slice(0, 7)}...${config.sponsoredClaimDigest.slice(-5)}`
        : "verify:claim-kind",
      href: config.sponsoredClaimDigest
        ? explorerTxUrl(config.sponsoredClaimDigest)
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
