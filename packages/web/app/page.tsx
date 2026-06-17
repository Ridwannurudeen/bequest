import Image from "next/image";
import Link from "next/link";
import { Reveal } from "../components/reveal";
import type { EstateStatus, EstateView } from "../lib/bequest-sdk";
import { bequestSdkMock, formatDuration, ratioLabel } from "../lib/bequest-sdk";
import { getPublicConfig, type PublicBequestConfig } from "../lib/config";
import { findLatestEstate, readEstateOnChain } from "../lib/estate-onchain";
import { currentPackage, featureProofs, proofCards } from "../lib/live-proof";

// Read a real estate per request (testnet RPC); fall back to the demo when none exists or the
// network is unreachable, so the page always renders.
export const dynamic = "force-dynamic";

async function loadEstate(config: PublicBequestConfig): Promise<EstateView> {
  try {
    const estateId = config.demoEstateId ?? (await findLatestEstate(config));
    if (estateId) return await readEstateOnChain(estateId, config);
  } catch (error) {
    console.warn("Live estate read failed; using demo fallback:", error);
  }
  return bequestSdkMock.readEstate("demo");
}

const LockIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

const SwitchIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l7 3v6c0 4-3 6.7-7 8-4-1.3-7-4-7-8V6z" />
    <path d="M12 8.5V12l2.2 1.5" />
  </svg>
);

const ClaimIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 14v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    <path d="M12 3v11M8 10l4 4 4-4" />
  </svg>
);

const LetterIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 6.5h14v11H5z" />
    <path d="m5 8 7 5 7-5" />
  </svg>
);

const stages: Array<{ label: EstateStatus | "Claim"; note: string }> = [
  { label: "Active", note: "Owner can edit or withdraw" },
  { label: "Pending", note: "Grace window is running" },
  { label: "Triggered", note: "Recipients are unlocked" },
  { label: "Claim", note: "Gasless claim path" },
];

const workspaceNav = [
  { label: "Estate", href: "#estate" },
  { label: "Trigger", href: "#workflow" },
  { label: "Recipient", href: "#recipient" },
  { label: "Proof", href: "#proof" },
];

const quickActions = [
  {
    label: "Heartbeat",
    detail: "Reset inactivity before trigger",
    icon: SwitchIcon,
  },
  {
    label: "Deposit",
    detail: "Add SUI, stake, or objects",
    icon: LockIcon,
  },
  {
    label: "Letter",
    detail: "Seal-gated final message",
    icon: LetterIcon,
  },
];

const journeys = [
  {
    label: "Owner setup",
    title: "Compose a portfolio handoff without leaving the app.",
    body:
      "Name heirs, set shares, deposit assets, attach the private letter, and keep control while the estate is Active.",
    checks: ["zkLogin owner", "SUI + objects", "Editable while Active"],
  },
  {
    label: "Trigger monitor",
    title: "The release condition is visible and time-gated.",
    body:
      "The keeper can arm the estate only when the Clock says it is eligible. Grace and executor pause keep false alarms reversible.",
    checks: ["Clock-gated", "Grace window", "Executor pause"],
  },
  {
    label: "Recipient claim",
    title: "The heir receives assets without becoming a crypto operator.",
    body:
      "After Triggered, recipients open a claim receipt, sign with Google, and receive the SUI leg through the sponsored path.",
    checks: ["Google-ready", "Sponsored digest", "Receipt link"],
  },
  {
    label: "Private unlock",
    title: "The letter stays encrypted until the estate state changes.",
    body:
      "Walrus stores the encrypted letter and Seal releases access only after the on-chain estate is Triggered.",
    checks: ["Walrus", "Seal policy", "State-bound access"],
  },
];

const useCases = [
  {
    label: "Family inheritance",
    detail:
      "The flagship flow: inactivity releases assets and the private letter to named heirs.",
  },
  {
    label: "Founder continuity",
    detail:
      "Move treasury access or operational assets to successors if a keyholder disappears.",
  },
  {
    label: "Guardian recovery",
    detail: "Trusted guardians rotate ownership without exposing the original seed phrase.",
  },
  {
    label: "Scheduled releases",
    detail: "Age-gated, vesting, or fixed-date transfers for long-term asset plans.",
  },
];

const faqs = [
  {
    q: "Do recipients need a crypto wallet?",
    a: "No. The product path is built for Google zkLogin plus Enoki sponsorship, so recipients do not need a seed phrase. The public copy claims gasless execution only when the sponsored digest is pinned.",
  },
  {
    q: "What if I am just away for a while?",
    a: "Any activity, including heartbeat, deposit, or withdrawal, resets the timer. A trusted executor can pause a false trigger during the grace window.",
  },
  {
    q: "Can someone take assets early?",
    a: "No. The trigger is permissionless but time-gated by the on-chain Clock. While Active only the owner can withdraw; after Triggered assets route only to named recipients.",
  },
  {
    q: "Is the letter private?",
    a: "Yes. It is encrypted with Seal and stored on Walrus. The decryption path opens only after the estate is Triggered.",
  },
];

function shortId(value: string, fallback = "demo estate") {
  if (!value || value === "demo") return fallback;
  if (!value.startsWith("0x") || value.length < 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function statusIndex(status: EstateStatus) {
  if (status === "Claimed") return 3;
  return Math.max(
    0,
    stages.findIndex((stage) => stage.label === status),
  );
}

export default async function Home() {
  const config = getPublicConfig();
  const claimProven = Boolean(config.sponsoredClaimDigest);
  const estate = await loadEstate(config);
  const activeStage = statusIndex(estate.status);
  const claimHref =
    estate.estateId && estate.estateId !== "demo"
      ? `/claim/${estate.estateId}`
      : "/claim/demo";
  const estateIdLabel = shortId(estate.estateId);
  const ownerInitial = estate.ownerLabel?.trim()?.[0]?.toUpperCase() ?? "B";
  const consoleAssets: EstateView["assets"] =
    estate.assets.length > 0
      ? estate.assets.slice(0, 4)
      : [
          {
            type: "SUI",
            label: "Escrowed portfolio",
            value: "SUI + objects",
            state: "escrowed" as const,
          },
        ];
  const proofSample = proofCards.slice(0, 4);
  const liveSnapshot = [
    {
      label: "Estate state",
      value: estate.status,
      detail: estateIdLabel,
    },
    {
      label: "Recipients",
      value: `${estate.heirs.length} ${estate.heirs.length === 1 ? "heir" : "heirs"}`,
      detail: estate.heirs
        .map((heir) => `${heir.label} ${ratioLabel(heir.ratioBps)}`)
        .join(" / "),
    },
    {
      label: "Trigger window",
      value: formatDuration(estate.inactivityMs),
      detail: `${formatDuration(estate.gracePeriodMs)} grace period`,
    },
    {
      label: "Proof pack",
      value: `${proofCards.length} checks`,
      detail: claimProven ? "Sponsored claim digest pinned" : "Move + SuiScan evidence",
    },
  ];

  return (
    <main>
      <section className="ops-hero" aria-labelledby="product-console-title">
        <div className="ops-intro">
          <p className="kicker">
            <span className="live-dot" /> Live on Sui {config.network}
          </p>
          <h1 id="product-console-title">
            A live succession workspace for Sui assets.
          </h1>
          <p className="lede">
            Bequest gives a Sui portfolio a verified second path: assets stay in
            an estate object, the trigger is clock-gated, and heirs can claim
            without managing seed phrases.
          </p>
          <div className="ops-stat-grid" aria-label="Live Bequest snapshot">
            {liveSnapshot.map((item) => (
              <div className="ops-stat" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
          <div className="ops-reviewer-panel" aria-label="Reviewer path">
            <span>Reviewer path</span>
            <a href="#estate">Estate object</a>
            <a href={claimHref}>Claim receipt</a>
            <a href="#proof">Proof board</a>
          </div>
          <div className="hero-actions command-actions">
            <Link href="/demo" className="button primary">
              Run recipient demo
            </Link>
            <Link href="/create" className="button secondary">
              Open owner console
            </Link>
          </div>
        </div>

        <div className="ops-shell" aria-label="Bequest product workspace">
          <aside className="ops-rail" aria-label="Workspace navigation">
            <div className="ops-rail-brand">
              <Image src="/logo-1024.png" width={40} height={40} alt="" />
              <span>Bequest</span>
            </div>
            <nav>
              {workspaceNav.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="ops-rail-proof">
              <span>Package</span>
              <strong>{shortId(currentPackage.packageId, "package")}</strong>
              <small>32 Move checks</small>
            </div>
          </aside>

          <section className="estate-workspace" id="estate">
            <div className="workspace-topbar">
              <div>
                <span className="console-label">Estate object</span>
                <strong>{estateIdLabel}</strong>
              </div>
              <span className="status-pill">
                <span className="live-dot" />
                {estate.status}
              </span>
            </div>

            <div className="workspace-summary">
              <div>
                <span className="console-label">Owner</span>
                <div className="identity-line">
                  <span className="heir-avatar">{ownerInitial}</span>
                  <strong>{estate.ownerLabel}</strong>
                </div>
              </div>
              <div>
                <span className="console-label">Rule</span>
                <strong>
                  {estate.triggerKind === "scheduled"
                    ? "Scheduled release"
                    : "Dead-man switch"}
                </strong>
                <small>
                  {formatDuration(estate.inactivityMs)} inactivity,{" "}
                  {formatDuration(estate.gracePeriodMs)} grace
                </small>
              </div>
              <div>
                <span className="console-label">Recipient path</span>
                <strong>
                  {claimProven ? "Sponsored claim proven" : "Google-ready path"}
                </strong>
                <small>Receipt first, wallet second</small>
              </div>
            </div>

            <div className="stage-track" aria-label="Estate lifecycle">
              {stages.map((stage, index) => (
                <div
                  className={index <= activeStage ? "stage-item active" : "stage-item"}
                  key={stage.label}
                >
                  <span>{index + 1}</span>
                  <strong>{stage.label}</strong>
                  <small>{stage.note}</small>
                </div>
              ))}
            </div>

            <div className="workspace-lower">
              <div className="asset-ledger rich-ledger" aria-label="Escrowed assets">
                <div className="ledger-head">
                  <span className="console-label">Escrowed portfolio</span>
                  <strong>{consoleAssets.length} assets visible</strong>
                </div>
                {consoleAssets.map((asset, i) => (
                  <div className="asset-row" key={`${asset.label}-${i}`}>
                    <span>
                      <b>{asset.type}</b>
                      {asset.label}
                      {asset.note ? <small>{asset.note}</small> : null}
                    </span>
                    <strong>{asset.value}</strong>
                  </div>
                ))}
              </div>

              <div className="action-stack" aria-label="Owner actions">
                {quickActions.map((action) => (
                  <Link className="action-tile" href="/create" key={action.label}>
                    <span className="flow-icon">{action.icon}</span>
                    <span>
                      <strong>{action.label}</strong>
                      <small>{action.detail}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <aside className="recipient-panel" id="recipient">
            <div className="recipient-card">
              <span className="console-label">Recipient claim</span>
              <h2>Assets are ready when the estate turns Triggered.</h2>
              <p>
                Heirs open a receipt, sign with Google, and receive their share
                after the same on-chain trigger unlocks the encrypted letter.
              </p>
              <Link className="claim-button" href={claimHref}>
                Open claim receipt
              </Link>
            </div>

            <div className="recipient-list" aria-label="Named heirs">
              {estate.heirs.map((heir) => (
                <div className="heir-row" key={heir.binding}>
                  <span>
                    <strong>{heir.label}</strong>
                    <small>{shortId(heir.binding, heir.binding)}</small>
                  </span>
                  <b>{ratioLabel(heir.ratioBps)}</b>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <Reveal>
        <section className="signal-rail ops-signal" aria-label="Trust points">
          <div>
            <strong>Estate object first</strong>
            <span>SUI, stake positions, objects, and letters share one state.</span>
          </div>
          <div>
            <strong>Trigger is visible</strong>
            <span>Clock-gated Pending and Triggered states are user-facing.</span>
          </div>
          <div>
            <strong>Recipient UX is simple</strong>
            <span>Google-ready claim path for heirs who are not crypto-native.</span>
          </div>
          <div>
            <strong>Proof is one click away</strong>
            <span>Package, claim digest, Seal, and keeper proof stay accessible.</span>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section workflow-section" id="workflow">
          <div className="section-heading split-heading">
            <div>
              <p className="kicker">Product flow</p>
              <h2>The core action is visible before the proof packet.</h2>
            </div>
            <p>
              A judge should not infer the product from hashes. The interface
              shows the owner state, trigger state, recipient path, and privacy
              unlock as one flow.
            </p>
          </div>
          <div className="journey-board">
            {journeys.map((journey, index) => (
              <article className="journey-card" key={journey.label}>
                <span className="step-n">{String(index + 1).padStart(2, "0")}</span>
                <p className="card-eyebrow">{journey.label}</p>
                <h3>{journey.title}</h3>
                <p>{journey.body}</p>
                <ul>
                  {journey.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </Reveal>

      {config.demoVideoUrl ? (
        <Reveal>
          <section className="section" aria-label="Demo video">
            <div className="section-heading">
              <p className="kicker">See it in action</p>
              <h2>Watch a conditional transfer, end to end.</h2>
            </div>
            <div className="video-embed">
              <iframe
                src={config.demoVideoUrl}
                title="Bequest demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </section>
        </Reveal>
      ) : null}

      <Reveal>
        <section className="section proof-ledger" id="proof">
          <div className="section-heading split-heading">
            <div>
              <p className="kicker">Verification layer</p>
              <h2>Proof supports the product instead of replacing it.</h2>
            </div>
            <Link className="text-link" href="/proof">
              Open full proof board
            </Link>
          </div>
          <div className="proof-ledger-grid">
            {proofSample.map((proof) => (
              <article className="proof-line-card" key={proof.label}>
                <span>{proof.label}</span>
                <h3>{proof.title}</h3>
                <p>{proof.detail}</p>
                <code>{proof.evidence}</code>
              </article>
            ))}
          </div>
          <a className="package-card package-card-wide" href={currentPackage.explorerUrl}>
            <span>{currentPackage.label}</span>
            <strong>{currentPackage.packageId}</strong>
            <small>Publish digest {currentPackage.publishDigest}</small>
          </a>
        </section>
      </Reveal>

      <Reveal>
        <section className="section estate-section">
          <div className="section-heading split-heading">
            <div>
              <p className="kicker">
                <span className="live-dot" /> Live testnet estate
              </p>
              <h2>Readable enough for a user, exact enough for a reviewer.</h2>
            </div>
            <p>
              The homepage reads a real Sui estate per request, then falls back
              to the demo estate only if RPC is unavailable.
            </p>
          </div>
          <div className="estate-review-grid">
            <aside className="estate-card review-card" aria-label="Live estate">
              <div className="estate-card-header">
                <span>Estate</span>
                <strong>{estate.status}</strong>
              </div>
              <h3>{estate.estateId}</h3>
              <dl>
                <div>
                  <dt>Owner</dt>
                  <dd>{estate.ownerLabel}</dd>
                </div>
                <div>
                  <dt>Inactivity</dt>
                  <dd>{formatDuration(estate.inactivityMs)}</dd>
                </div>
                <div>
                  <dt>Grace</dt>
                  <dd>{formatDuration(estate.gracePeriodMs)}</dd>
                </div>
              </dl>
              <Link className="text-link" href="/estates">
                Open dashboard
              </Link>
            </aside>

            <div className="heir-table" aria-label="Recipients">
              {estate.heirs.map((heir) => (
                <div className="heir-row" key={heir.binding}>
                  <span>
                    <strong>{heir.label}</strong>
                    <small>{heir.binding}</small>
                  </span>
                  <b>{ratioLabel(heir.ratioBps)}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-heading split-heading">
            <div>
              <p className="kicker">Product wedge</p>
              <h2>One primitive, multiple succession patterns.</h2>
            </div>
            <p>
              The same estate model supports inheritance, continuity, recovery,
              and scheduled transfer products.
            </p>
          </div>
          <div className="usecase-grid">
            {useCases.map((p) => (
              <article className="usecase-card" key={p.label}>
                <h3>{p.label}</h3>
                <p>{p.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section feature-strip">
          {featureProofs.map((feature) => (
            <a
              href={`https://suiscan.xyz/testnet/tx/${feature.digest}`}
              target="_blank"
              rel="noreferrer"
              key={feature.label}
            >
              <span>{feature.label}</span>
              <strong>{feature.title}</strong>
            </a>
          ))}
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-heading split-heading">
            <div>
              <p className="kicker">Questions</p>
              <h2>The things people ask first.</h2>
            </div>
          </div>
          <div className="faq">
            {faqs.map((f) => (
              <div className="faq-item" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="cta-band">
          <p className="kicker">Your keys should not be the only path</p>
          <h2>Give a Sui portfolio a verified second path.</h2>
          <p>
            Create a protected estate, deposit a Sui portfolio, and name the
            people who can receive it after the trigger. Free on testnet today.
          </p>
          <Link href="/create" className="button primary">
            Create a transfer
          </Link>
        </section>
      </Reveal>
    </main>
  );
}
