import Link from "next/link";
import { AuthButton } from "../components/auth-button";
import { Reveal } from "../components/reveal";
import type { EstateView } from "../lib/bequest-sdk";
import { bequestSdkMock, formatDuration, ratioLabel } from "../lib/bequest-sdk";
import { getPublicConfig, type PublicBequestConfig } from "../lib/config";
import { findLatestEstate, readEstateOnChain } from "../lib/estate-onchain";
import { currentPackage, proofCards, sponsoredClaim } from "../lib/live-proof";

// Read a real estate per request (testnet RPC); fall back to the demo when none exists or the
// network is unreachable, so the page always renders.
export const dynamic = "force-dynamic";

async function loadEstate(config: PublicBequestConfig): Promise<EstateView> {
  try {
    const estateId = await findLatestEstate(config);
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
    detail: "SUI, stake positions, and objects fit the same Estate",
  },
  { label: "Private wishes", detail: "Seal unlocks the letter only after Triggered" },
  {
    label: "Sui custody",
    detail: "Assets sit inside a shared Estate object",
  },
  { label: "Atomic payout", detail: "Distribution runs in one PTB after trigger" },
];

const tech = ["Sui", "zkLogin", "Enoki sponsored tx", "Seal", "Walrus", "Move"];

const steps = [
  {
    n: "01",
    icon: LockIcon,
    eyebrow: "Owner",
    title: "Lock assets while you're in control.",
    body: "Sign in with Google, name your heirs and their shares, set an inactivity window, and deposit liquid SUI, transferable objects, or native stake positions into a shared estate. Withdraw or reset any time.",
    checks: [
      "Google sign-in",
      "Heir ratios",
      "Full-portfolio escrow",
      "Encrypted letter",
    ],
  },
  {
    n: "02",
    icon: SwitchIcon,
    eyebrow: "The switch",
    title: "A dead-man's switch that can't fire early.",
    body: "Go inactive past your window and the estate arms, starting a grace period. Any activity resets it; an executor can pause a false alarm. The trigger is permissionless but clock-gated — no one can rush it.",
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
    eyebrow: "Heir",
    title: "Inherit without a seed phrase.",
    body: "After the trigger, the estate can distribute the bundle to the named heirs: SUI splits by shares, key+store objects route to their assigned heir, and the encrypted letter decrypts only then.",
    checks: [
      "Inheritance banner",
      "Sponsored SUI claim",
      "Keeper bundle payout",
      "Assets arrive",
      "Letter unlocks",
    ],
  },
];

const products = [
  {
    label: "Inheritance",
    detail: "Inactivity trigger distributes to named heirs. Live today.",
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
    detail: "Age-gated, vesting, or oracle-triggered releases.",
  },
];

const stats = [
  { big: "1 live", small: "sponsored claim receipt" },
  { big: "key+store", small: "object inheritance path" },
  { big: "1 PTB", small: "atomic multi-heir distribution" },
  { big: "11/11", small: "Move tests passing" },
];

const faqs = [
  {
    q: "Do my heirs need a crypto wallet?",
    a: "The product path is built for Google zkLogin plus Enoki sponsorship, so heirs do not need a seed phrase. The V2 submission only claims gasless execution after a sponsored Sui digest is pinned.",
  },
  {
    q: "What if I'm just away for a while?",
    a: "Any activity — a heartbeat, deposit, or withdrawal — resets the timer, and a trusted executor can pause a false trigger during the grace window.",
  },
  {
    q: "Can someone take my assets early?",
    a: "No. The trigger is permissionless but time-gated by the on-chain Clock. While active only you can withdraw, and after the trigger, funds route only to your named heirs.",
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
      <nav className="nav-shell" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Bequest home">
          <span className="brand-mark">Bq</span>
          <span>Bequest</span>
        </a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#proof">Proof</a>
          <Link href="/estates">Estates</Link>
          <AuthButton />
          <Link href="/create" className="button primary">
            Launch app
          </Link>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker">
            <span className="live-dot" /> On-chain succession · Live on Sui
          </p>
          <h1>
            <span>Crypto inheritance</span>
            <span>your family can</span>
            <span className="grad">actually claim.</span>
          </h1>
          <p className="lede">
            Bequest turns a Sui portfolio into an estate your heirs can receive
            without your seed phrase: liquid SUI, transferable objects, native
            stake positions, and the final letter. Assets stay escrowed
            on-chain; the switch is Clock-gated; the letter stays encrypted
            until the trigger.
            {" "}
            {claimProven
              ? "The sponsored claim is already pinned and verifiable on Sui testnet."
              : "The claim path is Google-ready and proof-gated by a pinned sponsored digest."}
          </p>
          <div className="hero-actions">
            <Link href="/create" className="button primary">
              Create an estate
            </Link>
            <Link href={`/claim/${sponsoredClaim.estateId}`} className="button secondary">
              Inspect live claim
            </Link>
          </div>
          <div className="hero-proof-dock" aria-label="Live proof shortcuts">
            <a href={sponsoredClaim.explorerUrl}>
              <span>Sponsored claim</span>
              <strong>{sponsoredClaim.digest.slice(0, 12)}…</strong>
            </a>
            <a href={currentPackage.explorerUrl}>
              <span>Package</span>
              <strong>{currentPackage.packageId.slice(0, 10)}…b885</strong>
            </a>
          </div>
        </div>

        <aside className="claim-card" aria-label="Heir claim preview">
          <div className="claim-card-top">
            <span>Heir receipt</span>
            <span className="status-pill">
              <span className="live-dot" style={{ marginRight: 8 }} />
              Triggered
            </span>
          </div>
          <div className="heir-head">
            <span className="heir-avatar">{heirInitial}</span>
            <div>
              <strong>You've inherited assets</strong>
              <br />
              <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                from {estate.ownerLabel}
              </span>
            </div>
          </div>
          <p>
            {claimProven
              ? "Sign in with Google to claim the SUI leg gaslessly; the keeper can push the object bundle after the same on-chain trigger. The letter unlocks only then."
              : "Sign in with Google to trigger the SUI distribution path. The object bundle is keeper-distributed after the same on-chain trigger."}
          </p>
          <div className="claim-timeline" aria-label="Estate claim timeline">
            <span>Estate created</span>
            <span>Trigger fired</span>
            <span>Bundle distributed</span>
            <span>Letter unlocked</span>
          </div>
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
          <Link
            className="claim-button"
            href={claimHref}
            style={{ marginTop: 14 }}
          >
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

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...tech, ...tech].map((t, i) => (
            <span key={`${t}-${i}`}>{t}</span>
          ))}
        </div>
      </div>

      <Reveal>
        <section className="section" id="how">
          <div className="section-heading">
            <div>
              <p className="kicker">How it works</p>
              <h2>Three humane steps, from setup to inheritance.</h2>
            </div>
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

      <Reveal>
        <section className="proof-section" id="proof">
          <div className="proof-header">
            <div>
              <p className="kicker">Live proof + V2 package surface</p>
              <h2>Not a mock — the hard primitives are either proven or reproducible.</h2>
            </div>
            <a className="package-card" href={currentPackage.explorerUrl}>
              <span>{currentPackage.label}</span>
              <strong>{currentPackage.packageId}</strong>
              <small>Publish digest {currentPackage.publishDigest}</small>
            </a>
          </div>
          <div className="proof-card-grid">
            {proofCards.map((proof) => (
              <article className="proof-card" key={proof.label}>
                <div>
                  <span>{proof.label}</span>
                  <b>{proof.status}</b>
                </div>
                <h3>{proof.title}</h3>
                <p>{proof.detail}</p>
                <code>{proof.evidence}</code>
              </article>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-heading">
            <div>
              <p className="kicker">Not just an app — the layer</p>
              <h2>One engine. Every kind of asset continuity.</h2>
            </div>
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
              same SDK the product uses — falling back to a demo when none
              exists yet. Owner, heirs, timers, and escrowed assets are all
              real.
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
        <section className="section">
          <div className="section-heading">
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
          <p className="kicker">Your keys shouldn't die with you</p>
          <h2>Set up your estate in minutes.</h2>
          <p>
            Create a protected estate, deposit a Sui portfolio, and name the
            people who inherit. Free on testnet today.
          </p>
          <Link href="/create" className="button primary">
            Create an estate
          </Link>
        </section>
      </Reveal>

      <footer>
        <span>Bequest · On-chain succession on Sui</span>
        <span>Owner setup · Heir claim · Executor control</span>
      </footer>
    </main>
  );
}
