import Link from "next/link";
import { AuthButton } from "../components/auth-button";
import type { EstateView } from "../lib/bequest-sdk";
import { bequestSdkMock, formatDuration, ratioLabel } from "../lib/bequest-sdk";
import { getPublicConfig, type PublicBequestConfig } from "../lib/config";
import { findLatestEstate, readEstateOnChain } from "../lib/estate-onchain";
import { currentPackage, proofCards } from "../lib/live-proof";

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

const trust = [
  { label: "Gasless", detail: "Heirs claim with Google — no wallet, no gas" },
  { label: "Encrypted", detail: "Last wishes unlock only after the trigger" },
  {
    label: "Non-custodial",
    detail: "No company can move or freeze your assets",
  },
  { label: "Live on Sui", detail: "Full lifecycle proven on testnet" },
];

const steps = [
  {
    eyebrow: "Step 1 · Owner",
    title: "Lock assets while you're in control.",
    body: "Sign in with Google, name your heirs and their shares, set an inactivity window, and deposit SUI or NFTs into a shared estate. Withdraw or reset any time.",
    checks: [
      "Google sign-in",
      "Heir ratios",
      "Escrow on-chain",
      "Encrypted letter",
    ],
  },
  {
    eyebrow: "Step 2 · The switch",
    title: "A dead-man's switch that can't fire early.",
    body: "If you go inactive past your window, the estate arms and a grace period begins. Any activity resets it; a trusted executor can pause a false alarm. The trigger is permissionless but time-gated — no one can rush it.",
    checks: [
      "Inactivity timer",
      "Grace window",
      "Executor pause",
      "Clock-gated",
    ],
  },
  {
    eyebrow: "Step 3 · Heir",
    title: "Inherit without a seed phrase.",
    body: "After the trigger, your heir sees an inheritance banner, signs in with Google, and claims their share gaslessly. Then the encrypted letter you left decrypts — for them, only now.",
    checks: [
      "Inheritance banner",
      "Gasless claim",
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

function shortObjectId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export default async function Home() {
  const config = getPublicConfig();
  const estate = await loadEstate(config);
  const claimHref =
    estate.estateId && estate.estateId !== "demo"
      ? `/claim/${estate.estateId}`
      : "/claim/demo";

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
          <p className="kicker">On-chain succession · Live on Sui</p>
          <h1>
            <span>Inheritance</span>
            <span>that works when</span>
            <span className="grad">you no longer can.</span>
          </h1>
          <p className="lede">
            Bequest is on-chain succession for crypto. Lock your assets behind a
            dead-man's switch, and your heirs inherit gaslessly with a Google
            sign-in — no seed phrase, no custodian, no lawyer.
          </p>
          <div className="hero-actions">
            <Link href="/create" className="button primary">
              Create an estate
            </Link>
            <a href="#how" className="button secondary">
              See how it works
            </a>
          </div>
        </div>

        <aside className="claim-card" aria-label="Heir claim preview">
          <div className="claim-card-top">
            <span>Heir notification</span>
            <span className="status-pill">Trigger pending</span>
          </div>
          <h2>You've inherited assets from {estate.ownerLabel}.</h2>
          <p>
            Sign in with Google to claim your share. Gas is sponsored, and the
            letter unlocks only after the on-chain trigger.
          </p>
          <div className="claim-assets">
            {estate.assets.length > 0 ? (
              estate.assets.map((asset) => (
                <div className="asset-row" key={asset.label}>
                  <span>{asset.label}</span>
                  <strong>{asset.value}</strong>
                </div>
              ))
            ) : (
              <div className="asset-row">
                <span>Escrowed assets</span>
                <strong>SUI + objects</strong>
              </div>
            )}
          </div>
          <Link className="claim-button" href={claimHref}>
            Claim with Google
          </Link>
        </aside>
      </section>

      <section className="proof-strip" aria-label="Trust points">
        {trust.map((t) => (
          <div key={t.label}>
            <strong>{t.label}</strong>
            <span>{t.detail}</span>
          </div>
        ))}
      </section>

      <section className="section" id="how">
        <div className="section-heading">
          <div>
            <p className="kicker">How it works</p>
            <h2>Three humane steps, from setup to inheritance.</h2>
          </div>
        </div>
        <div className="flow-grid">
          {steps.map((step) => (
            <article className="flow-card" key={step.eyebrow}>
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

      <section className="proof-section" id="proof">
        <div className="proof-header">
          <div>
            <p className="kicker">Already live on Sui testnet</p>
            <h2>Not a mock — the hard primitives are proven on-chain.</h2>
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

      <section className="estate-section" id="estate">
        <div className="estate-copy">
          <p className="kicker">Live on testnet right now</p>
          <h2>A real estate, read straight from Sui.</h2>
          <p>
            This card reads the latest on-chain estate per request through the
            same SDK the product uses — falling back to a demo when none exists
            yet. Owner, heirs, timers, and escrowed assets are all real.
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

      <section className="cta-band">
        <p className="kicker">Your keys shouldn't die with you</p>
        <h2>Set up your estate in minutes.</h2>
        <p>
          Create a protected estate, deposit assets, and name the people who
          inherit. Free on testnet today.
        </p>
        <Link href="/create" className="button primary">
          Create an estate
        </Link>
      </section>

      <footer>
        <span>Bequest · On-chain succession on Sui</span>
        <span>Owner setup · Heir claim · Executor control</span>
      </footer>
    </main>
  );
}
