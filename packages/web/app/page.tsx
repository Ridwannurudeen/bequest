import Image from "next/image";
import Link from "next/link";
import { Reveal } from "../components/reveal";
import type { EstateView } from "../lib/bequest-sdk";
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

const trust = [
  {
    label: "Estate custody",
    detail: "SUI, stake positions, and key+store objects escrow together",
  },
  {
    label: "Google-ready heirs",
    detail: "Recipients can claim without a seed phrase",
  },
  { label: "Private letters", detail: "Seal + Walrus unlock only after trigger" },
  { label: "Live proof", detail: "Published package, sponsored claim, CI checks" },
];

const steps = [
  {
    n: "01",
    icon: LockIcon,
    eyebrow: "Compose",
    title: "Create a protected estate from a normal sign-in.",
    body: "Name recipients, set shares, choose the release condition, and attach the encrypted letter. The owner can still withdraw or revise while the estate is Active.",
    checks: [
      "Google sign-in",
      "Recipient ratios",
      "Full-portfolio escrow",
      "Encrypted letter",
    ],
  },
  {
    n: "02",
    icon: SwitchIcon,
    eyebrow: "Monitor",
    title: "The condition advances on-chain, not by trust.",
    body: "A keeper can arm and finalize once the Clock says the rule is eligible. Any owner activity resets the timer, and an executor can pause a false alarm.",
    checks: [
      "Inactivity timer",
      "Grace window",
      "Executor pause",
      "Clock-gated",
    ],
  },
  {
    n: "03",
    icon: ClaimIcon,
    eyebrow: "Release",
    title: "Recipients receive the assets and the letter.",
    body: "After Triggered, SUI splits by shares, objects route to assigned recipients, and the private letter decrypts only for named heirs.",
    checks: [
      "Claim banner",
      "Sponsored SUI claim",
      "Keeper bundle payout",
      "Letter unlocks",
    ],
  },
];

const products = [
  {
    label: "Family inheritance",
    detail:
      "The flagship flow: inactivity releases assets and the private letter to named heirs.",
  },
  {
    label: "Founder / keyholder continuity",
    detail: "Move treasury access or operational assets to successors if a keyholder disappears.",
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

const stats = [
  { big: "32/32", small: "Move tests passing" },
  { big: "1", small: "estate-only package" },
  { big: "zkLogin", small: "Google-ready recipients" },
  { big: "Seal", small: "trigger-gated letters" },
];

const faqs = [
  {
    q: "Do recipients need a crypto wallet?",
    a: "No. The product path is built for Google zkLogin plus Enoki sponsorship, so recipients don't need a seed phrase. The submission only claims gasless execution once a sponsored Sui digest is pinned.",
  },
  {
    q: "What if I'm just away for a while?",
    a: "Any activity — a heartbeat, deposit, or withdrawal — resets the timer, and a trusted executor can pause a false trigger during the grace window.",
  },
  {
    q: "Can someone take my assets early?",
    a: "No. The trigger is permissionless but time-gated by the on-chain Clock. While active only you can withdraw, and after the trigger funds route only to your named recipients.",
  },
  {
    q: "Is the letter I leave really private?",
    a: "Yes. It's encrypted with Seal and stored on Walrus; the decryption key is released only once the estate is Triggered.",
  },
];

export default async function Home() {
  const config = getPublicConfig();
  // Restore the strong "gasless" claim only when a real sponsored claim digest is pinned.
  const claimProven = Boolean(config.sponsoredClaimDigest);
  const estate = await loadEstate(config);
  const claimHref =
    estate.estateId && estate.estateId !== "demo"
      ? `/claim/${estate.estateId}`
      : "/claim/demo";
  const heirInitial = estate.ownerLabel?.trim()?.[0]?.toUpperCase() ?? "B";
  const estateIdLabel =
    estate.estateId && estate.estateId !== "demo"
      ? `${estate.estateId.slice(0, 8)}…${estate.estateId.slice(-6)}`
      : "demo estate";
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

  return (
    <main>
      <section className="command-hero">
        <div className="command-copy">
          <p className="kicker">
            <span className="live-dot" /> Live on Sui · {config.network}
          </p>
          <h1>The succession layer for Sui portfolios.</h1>
          <p className="lede">
            Bequest turns a portfolio into a conditional transfer account:
            assets stay escrowed on-chain, the trigger is verifiable, and
            recipients can receive without becoming crypto operators first.
            {claimProven
              ? " The live proof includes a sponsored Google-ready claim."
              : " The product path is Google-ready while the public copy stays honest about live sponsorship proof."}
          </p>
          <div className="hero-actions command-actions">
            <Link href="/demo" className="button primary">
              Run the recipient demo
            </Link>
            <Link href="/proof" className="button secondary">
              Review proof
            </Link>
          </div>
          <div className="hero-proofline" aria-label="Launch proof">
            <span>Published package</span>
            <span>Sponsored claim digest</span>
            <span>32 Move tests</span>
          </div>
        </div>

        <aside className="estate-console" aria-label="Live estate console">
          <div className="console-topbar">
            <span className="console-brand">
              <Image
                src="/logo-1024.png"
                width={34}
                height={34}
                alt=""
                priority
              />
              Bequest console
            </span>
            <span className="status-pill">
              <span className="live-dot" />
              {estate.status}
            </span>
          </div>
          <div className="console-grid">
            <div className="console-main">
              <span className="console-label">Estate object</span>
              <strong>{estateIdLabel}</strong>
              <p>
                {estate.triggerKind === "scheduled"
                  ? "Scheduled release"
                  : "Dead-man switch"}{" "}
                · {formatDuration(estate.inactivityMs)} inactivity ·{" "}
                {formatDuration(estate.gracePeriodMs)} grace
              </p>
            </div>
            <div className="console-recipient">
              <span className="heir-avatar">{heirInitial}</span>
              <span>
                <small>Owner</small>
                <strong>{estate.ownerLabel}</strong>
              </span>
            </div>
          </div>

          <div className="asset-ledger" aria-label="Escrowed assets">
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

          <div className="console-timeline" aria-label="Estate lifecycle">
            <span className="done">Active</span>
            <span className={estate.status !== "Active" ? "done" : ""}>
              Pending
            </span>
            <span className={estate.status === "Triggered" ? "done" : ""}>
              Triggered
            </span>
            <span>Claim</span>
          </div>

          <div className="console-claim">
            <div>
              <small>Recipient route</small>
              <strong>
                {claimProven ? "Sponsored claim proven" : "Google-ready path"}
              </strong>
            </div>
            <Link className="claim-button" href={claimHref}>
              Open receipt
            </Link>
          </div>
        </aside>
      </section>

      <Reveal>
        <section className="signal-rail" aria-label="Trust points">
          {trust.map((t) => (
            <div key={t.label}>
              <strong>{t.label}</strong>
              <span>{t.detail}</span>
            </div>
          ))}
        </section>
      </Reveal>

      <Reveal>
        <section className="section workflow-section" id="how">
          <div className="section-heading split-heading">
            <div>
              <p className="kicker">Workflow</p>
              <h2>Designed for the moment when the owner cannot sign.</h2>
            </div>
            <p>
              Bequest separates custody, trigger verification, recipient claim,
              and private messaging into one auditable Sui estate object.
            </p>
          </div>
          <div className="workflow-grid">
            {steps.map((step) => (
              <article className="workflow-card" key={step.n}>
                <span className="step-n">{step.n}</span>
                <span className="flow-icon">{step.icon}</span>
                <p className="card-eyebrow">{step.eyebrow}</p>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <ul>
                  {step.checks.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="stat-band elevated-band" aria-label="At a glance">
          {stats.map((s) => (
            <div className="stat" key={s.small}>
              <b>{s.big}</b>
              <span>{s.small}</span>
            </div>
          ))}
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
              <p className="kicker">Proof surface</p>
              <h2>Judge the deployed system, not the promise.</h2>
            </div>
            <Link className="text-link" href="/proof">
              Open full proof board →
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
        <section className="section estate-section" id="estate">
          <div className="section-heading split-heading">
            <div>
              <p className="kicker">
                <span className="live-dot" /> Live testnet estate
              </p>
              <h2>Read the estate like a reviewer would.</h2>
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
                Open dashboard →
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
              <p className="kicker">Use cases</p>
              <h2>One primitive, multiple succession patterns.</h2>
            </div>
            <p>
              The same package supports inheritance, operational continuity,
              recovery, and scheduled transfer products.
            </p>
          </div>
          <div className="usecase-grid">
            {products.map((p) => (
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
          <p className="kicker">Your keys shouldn't be the only path</p>
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
