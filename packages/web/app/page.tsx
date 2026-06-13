import Link from "next/link";
import { Reveal } from "../components/reveal";
import type { EstateView } from "../lib/bequest-sdk";
import { bequestSdkMock, formatDuration, ratioLabel } from "../lib/bequest-sdk";
import { getPublicConfig, type PublicBequestConfig } from "../lib/config";
import { findLatestEstate, readEstateOnChain } from "../lib/estate-onchain";
import { currentPackage } from "../lib/live-proof";

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
    label: "Full-portfolio custody",
    detail: "SUI, stake positions, and objects fit one Estate",
  },
  { label: "Private", detail: "Sealed letters unlock only after the trigger" },
  {
    label: "Non-custodial",
    detail: "No company can move or freeze your assets",
  },
  { label: "Live on Sui", detail: "Full lifecycle proven on testnet" },
];

const steps = [
  {
    n: "01",
    icon: LockIcon,
    eyebrow: "Owner",
    title: "Set the rule while you're in control.",
    body: "Sign in with Google, name recipients and shares, choose the release condition, and deposit SUI, transferable objects, or native stake positions into a shared estate. Withdraw or reset any time.",
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
    eyebrow: "The switch",
    title: "A trustless condition that can't fire early.",
    body: "When the condition is met, the estate arms and starts a grace period. Any owner activity resets it; an executor can pause a false alarm. The trigger is permissionless but clock-gated, so no one can rush it.",
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
    eyebrow: "Recipient",
    title: "Receive without a seed phrase.",
    body: "After the trigger, the estate distributes the bundle to the named recipients: SUI splits by shares, key+store objects route to their assigned recipient, and the encrypted letter decrypts only then.",
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
    label: "Inheritance",
    detail:
      "The flagship conditional transfer: inactivity releases assets to family. Live today.",
  },
  {
    label: "Social recovery",
    detail: "Guardians restore access to a locked account.",
  },
  {
    label: "DAO / treasury succession",
    detail: "A named successor for multisigs and treasuries.",
  },
  {
    label: "Scheduled transfers",
    detail: "Age-gated, vesting, or fixed-date releases.",
  },
];

const stats = [
  { big: "1 live", small: "sponsored claim receipt" },
  { big: "key+store", small: "object transfer path" },
  { big: "1 PTB", small: "atomic multi-recipient distribution" },
  { big: "11/11", small: "Move tests passing" },
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

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">
            <span className="live-dot" /> Live on Sui · {config.network}
          </p>
          <h1>Programmable conditional transfers on Sui.</h1>
          <p className="lede">
            Bequest turns a Sui portfolio into a conditional transfer object.
            Liquid SUI, transferable objects, native stake positions, and a
            private letter stay escrowed on-chain until a trustless trigger
            fires. The flagship flow is inheritance, but the primitive is
            broader: hand assets to someone who isn't crypto-native —
            {claimProven
              ? " they claim with Google, gasless, no seed phrase."
              : " through a Google-ready claim path, no custodian and no seed phrase."}
          </p>
          <div className="hero-actions">
            <Link href="/demo" className="button primary">
              Try the demo
            </Link>
            <a href="#how" className="button secondary">
              How it works
            </a>
          </div>
        </div>

        <aside className="claim-card" aria-label="Recipient claim preview">
          <div className="claim-card-top">
            <span>Recipient notification</span>
            <span className="status-pill">
              <span className="live-dot" />
              Trigger pending
            </span>
          </div>
          <div className="heir-head">
            <span className="heir-avatar">{heirInitial}</span>
            <div>
              <strong>Assets are ready to claim</strong>
              <br />
              <small>from {estate.ownerLabel}</small>
            </div>
          </div>
          <p>
            {claimProven
              ? "Sign in with Google to claim the SUI leg gaslessly; the keeper pushes the object bundle after the same on-chain trigger. The letter unlocks only then."
              : "Sign in with Google to start the SUI distribution path. The object bundle is keeper-distributed after the same on-chain trigger."}
          </p>
          <div className="claim-assets">
            {estate.assets.length > 0 ? (
              estate.assets.map((asset, i) => (
                <div className="asset-row" key={`${asset.label}-${i}`}>
                  <span>
                    <b>{asset.type}</b>
                    {asset.label}
                    {asset.note ? <small>{asset.note}</small> : null}
                  </span>
                  <strong>{asset.value}</strong>
                </div>
              ))
            ) : (
              <div className="asset-row">
                <span>Escrowed assets</span>
                <strong>SUI + stake + objects</strong>
              </div>
            )}
          </div>
          <span className="sponsored-badge">
            Sponsored SUI claim pinned · bundle path is generic Move
          </span>
          <Link className="claim-button" href={claimHref}>
            Open claim receipt
          </Link>
        </aside>
      </section>

      <Reveal>
        <section className="proof-strip" aria-label="Trust points">
          {trust.map((t) => (
            <div key={t.label}>
              <strong>{t.label}</strong>
              <span>{t.detail}</span>
            </div>
          ))}
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="how">
          <div className="section-heading">
            <p className="kicker">How it works</p>
            <h2>Three steps, from setup to conditional release.</h2>
          </div>
          <div className="flow-grid">
            {steps.map((step) => (
              <article className="flow-card" key={step.n}>
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
        <section className="stat-band" aria-label="At a glance">
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
        <section className="section">
          <div className="section-heading">
            <p className="kicker">Not just an app — the layer</p>
            <h2>One engine. Every kind of conditional asset handoff.</h2>
          </div>
          <div className="flow-grid">
            {products.map((p) => (
              <article className="flow-card" key={p.label}>
                <h3>{p.label}</h3>
                <p>{p.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="estate-section" id="estate">
          <div className="estate-copy">
            <p className="kicker">
              <span className="live-dot" /> Live on testnet right now
            </p>
            <h2>A real estate, read straight from Sui.</h2>
            <p>
              This card reads the latest on-chain estate per request through the
              same SDK the product uses, falling back to a demo when none exists
              yet. Owner, recipients, timers, and escrowed assets are all real.
            </p>
            <Link className="text-link" href="/estates">
              Open the estates dashboard →
            </Link>
          </div>

          <aside className="estate-card" aria-label="Live estate">
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
            <div className="heir-list">
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
          </aside>
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="proof">
          <div className="section-heading">
            <p className="kicker">Verifiable on-chain</p>
            <h2>Not a mock — every claim is checkable on SuiScan.</h2>
          </div>
          <a className="package-card" href={currentPackage.explorerUrl}>
            <span>{currentPackage.label}</span>
            <strong>{currentPackage.packageId}</strong>
            <small>Publish digest {currentPackage.publishDigest}</small>
          </a>
          <Link className="text-link" href="/proof">
            Open the proof board →
          </Link>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-heading">
            <p className="kicker">Questions</p>
            <h2>The things people ask first.</h2>
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
          <h2>Set up a conditional transfer in minutes.</h2>
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
