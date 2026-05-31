import {
  bequestSdkMock,
  formatDuration,
  ratioLabel,
  sdkContract,
} from "../lib/bequest-sdk";
import { AuthButton } from "../components/auth-button";
import type { EstateView } from "../lib/bequest-sdk";
import { getPublicConfig, type PublicBequestConfig } from "../lib/config";
import { findLatestEstate, readEstateOnChain } from "../lib/estate-onchain";
import { FlowSimulator } from "../components/flow-simulator";
import { currentPackage, openGates, proofCards } from "../lib/live-proof";

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

const flowSteps = [
  {
    eyebrow: "Owner setup",
    title: "Sarah locks assets while she is still in control.",
    body: "Google sign-in through zkLogin, heir bindings, split ratios, inactivity window, SUI/NFT deposits, and an encrypted letter stored behind a Seal policy.",
    checks: ["Google identity", "Heir ratios", "Estate escrow", "Seal letter"],
  },
  {
    eyebrow: "Heir claim",
    title: "Maya never touches a seed phrase.",
    body: "After the trigger, Maya sees an inheritance banner, signs in with Google, clicks Claim, receives assets gaslessly, then decrypts the letter.",
    checks: [
      "Inheritance banner",
      "Sponsored claim",
      "Asset arrival",
      "Letter decrypt",
    ],
  },
  {
    eyebrow: "Executor dashboard",
    title: "A trusted party can pause a false alarm.",
    body: "During the grace period, the executor sees the pending trigger and can pause or cancel before the estate becomes claimable.",
    checks: ["Pending estate", "Grace timer", "Pause/cancel", "Audit trail"],
  },
];

const spikeRows = [
  {
    id: "#1",
    name: "zkLogin heir binding",
    status: "Lane B spike",
    detail: "Can the owner pre-name a Google heir before they onboard?",
  },
  {
    id: "#6",
    name: "Enoki sponsored claim",
    status: "Lane B spike",
    detail: "Can Maya complete the claim with no SUI and no wallet funding?",
  },
  {
    id: "#7",
    name: "Competition + legal scan",
    status: "Lane B spike",
    detail: "Position as probate augmentation, not a legal replacement.",
  },
];

function shortObjectId(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export default async function Home() {
  const config = getPublicConfig();
  const estate = await loadEstate(config);
  const visiblePackageId = config.packageId ?? currentPackage.packageId;

  return (
    <main>
      <nav className="nav-shell" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Bequest home">
          <span className="brand-mark">Bq</span>
          <span>Bequest</span>
        </a>
        <div className="nav-links">
          <a href="#flows">Flows</a>
          <a href="#proof">Proof</a>
          <a href="/estates">Estates</a>
          <a href="#spikes">Spikes</a>
          <AuthButton />
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker">Sui-native inheritance · Lane B frontend</p>
          <h1>
            <span>Inheritance</span>
            <span>that works</span>
            <span>when the owner</span>
            <span>cannot sign.</span>
          </h1>
          <p className="lede">
            Bequest turns crypto succession into three humane flows: an owner
            creates a protected estate, an heir claims with Google, and an
            executor can stop false triggers before assets move.
          </p>
          <div className="hero-actions">
            <a href="/create" className="button primary">
              Create an estate
            </a>
            <a href="/claim/demo" className="button secondary">
              Open claim receipt
            </a>
            <a href="#spikes" className="button secondary">
              Phase 0 gates
            </a>
          </div>
        </div>

        <div className="claim-card" aria-label="Heir claim preview">
          <div className="claim-card-top">
            <span>Heir notification</span>
            <span className="status-pill">Trigger pending</span>
          </div>
          <h2>You have inherited assets from {estate.ownerLabel}.</h2>
          <p>
            Sign in with Google to claim your share. Gas is sponsored. The
            letter unlocks only after the on-chain trigger.
          </p>
          <div className="claim-assets">
            {estate.assets.map((asset) => (
              <div className="asset-row" key={asset.label}>
                <span>{asset.label}</span>
                <strong>{asset.value}</strong>
              </div>
            ))}
          </div>
          <button className="claim-button" type="button">
            Claim with Google
          </button>
        </div>
      </section>

      <section className="proof-strip" aria-label="Product proof points">
        <div>
          <strong>zkLogin</strong>
          <span>Google heir binding</span>
        </div>
        <div>
          <strong>Gasless</strong>
          <span>Enoki sponsored claim</span>
        </div>
        <div>
          <strong>Seal + Walrus</strong>
          <span>Letter unlock policy</span>
        </div>
        <div>
          <strong>Shared Estate</strong>
          <span>Assets escrowed on Sui</span>
        </div>
      </section>

      <section className="proof-section" id="proof">
        <div className="proof-header">
          <div>
            <p className="kicker">Already live on Sui testnet</p>
            <h2>
              Not just a mock: the hard inheritance primitives are proven.
            </h2>
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

        <div className="next-proof-panel">
          <div>
            <p className="kicker">What Lane B proves next</p>
            <h3>Turn the family story into a gasless heir receipt.</h3>
            <a className="text-link" href="/claim/demo">
              Open the receipt surface
            </a>
          </div>
          <div className="gate-list">
            {openGates.map((gate) => (
              <article key={gate.label}>
                <span>{gate.state}</span>
                <strong>{gate.label}</strong>
                <p>{gate.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <FlowSimulator />

      <section className="section" id="flows">
        <div className="section-heading">
          <p className="kicker">The three flows Lane B owns</p>
          <h2>
            Make inheritance understandable before making it programmable.
          </h2>
        </div>
        <div className="flow-grid">
          {flowSteps.map((flow) => (
            <article className="flow-card" key={flow.eyebrow}>
              <p className="card-eyebrow">{flow.eyebrow}</p>
              <h3>{flow.title}</h3>
              <p>{flow.body}</p>
              <ul>
                {flow.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="estate-section" id="estate">
        <div className="estate-copy">
          <p className="kicker">Live, against the frozen SDK</p>
          <h2>Frontend work moved before protocol wiring was final.</h2>
          <p>
            This card reads a real Estate from the testnet package through the
            frozen SDK contract, falling back to the demo when no estate exists
            yet — the product flows never had to be redesigned.
          </p>
          <div className="sdk-list" aria-label="Frozen SDK signatures">
            {sdkContract.map((signature) => (
              <code key={signature}>{signature}</code>
            ))}
          </div>
        </div>

        <aside className="estate-card" aria-label="Demo estate state">
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
            <div>
              <dt>Executor</dt>
              <dd>{estate.executor}</dd>
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

      <section className="section" id="spikes">
        <div className="section-heading narrow">
          <p className="kicker">Next integration gates</p>
          <h2>What remains is explicit, scoped, and testable.</h2>
        </div>
        <div
          className="readiness-grid"
          aria-label="Lane B integration readiness"
        >
          <div>
            <span>Sui network</span>
            <strong>{config.network}</strong>
          </div>
          <div>
            <span>Testnet package</span>
            <strong>{shortObjectId(visiblePackageId)}</strong>
          </div>
          <div>
            <span>Enoki sponsor key</span>
            <strong>
              {config.enokiPublicApiKey ? "Configured" : "Pending"}
            </strong>
          </div>
          <div>
            <span>Backend routes</span>
            <strong>Ready</strong>
          </div>
        </div>
        <div className="spike-board">
          {spikeRows.map((spike) => (
            <article className="spike-row" key={spike.id}>
              <span>{spike.id}</span>
              <div>
                <h3>{spike.name}</h3>
                <p>{spike.detail}</p>
              </div>
              <strong>{spike.status}</strong>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <span>Bequest · Sui Overflow 2026</span>
        <span>Owner setup · Heir claim · Executor dashboard</span>
      </footer>
    </main>
  );
}
