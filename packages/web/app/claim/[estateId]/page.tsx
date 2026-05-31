import type { Metadata } from "next";
import Link from "next/link";
import {
  claimReadiness,
  claimTarget,
  claimTypeArguments,
  demoClaimReceipt,
  explorerObjectUrl,
  resolvedPackageId
} from "../../../lib/claim-receipt";
import { getPublicConfig } from "../../../lib/config";

type ClaimPageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export async function generateMetadata({ params }: ClaimPageProps): Promise<Metadata> {
  const { estateId } = await params;
  return {
    title: `Bequest claim receipt | ${estateId}`,
    description:
      "A Bequest heir receipt showing estate status, claim target readiness, and Enoki sponsorship boundary."
  };
}

export default async function ClaimReceiptPage({ params }: ClaimPageProps) {
  const { estateId } = await params;
  const config = getPublicConfig();
  const packageId = resolvedPackageId(config);
  const target = claimTarget(config);
  const typeArguments = claimTypeArguments(config);
  const steps = claimReadiness(config);

  return (
    <main>
      <nav className="nav-shell" aria-label="Claim receipt navigation">
        <Link className="brand" href="/" aria-label="Back to Bequest home">
          <span className="brand-mark">Bq</span>
          <span>Bequest</span>
        </Link>
        <div className="nav-links">
          <Link href="/#proof">Proof</Link>
          <Link href="/#spikes">Gates</Link>
          <a href={explorerObjectUrl(packageId)}>SuiScan</a>
        </div>
      </nav>

      <section className="receipt-hero">
        <div>
          <p className="kicker">Heir claim receipt</p>
          <h1>
            <span>Maya can inherit</span>
            <span>without holding</span>
            <span>the owner key.</span>
          </h1>
          <p className="lede">
            This page is the claim proof surface. Today it pins the estate, heir,
            package, and integration boundary. Once Enoki credentials and the Lane A
            claim target are confirmed, the same page pins the sponsored claim digest.
          </p>
        </div>

        <aside className="receipt-card" aria-label="Claim receipt summary">
          <div className="receipt-card-top">
            <span>Estate</span>
            <strong>{estateId}</strong>
          </div>
          <h2>{demoClaimReceipt.heirLabel}</h2>
          <dl>
            <div>
              <dt>Identity binding</dt>
              <dd>{demoClaimReceipt.heirBinding}</dd>
            </div>
            <div>
              <dt>Share</dt>
              <dd>{demoClaimReceipt.heirShare}</dd>
            </div>
            <div>
              <dt>Assets</dt>
              <dd>{demoClaimReceipt.assetSummary}</dd>
            </div>
            <div>
              <dt>Letter policy</dt>
              <dd>{demoClaimReceipt.letterPolicy}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="receipt-section" aria-label="Claim proof readiness">
        <div className="section-heading">
          <p className="kicker">Gasless claim boundary</p>
          <h2>What is live, and what still needs credentials.</h2>
        </div>

        <div className="receipt-grid">
          {steps.map((step) => (
            <article className={`receipt-step ${step.state}`} key={step.label}>
              <span>{step.state}</span>
              <h3>{step.label}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>

        <div className="claim-target-card">
          <p className="kicker">Target contract call</p>
          <h3>{target}</h3>
          <p className="mono-line">
            typeArguments: {typeArguments.length > 0 ? typeArguments.join(", ") : "none"}
          </p>
          <p>
            The first gasless claim proof should sponsor this existing deployed Sui
            distribution call. It does not need a new contract: after the estate is
            Triggered, the heir can trigger the SUI split for every named heir. Until
            sponsorship lands, the UI stays honest: no fake claim transaction, no fake
            sponsor digest.
          </p>
          <a href={explorerObjectUrl(packageId)}>Open current package on SuiScan</a>
        </div>
      </section>
    </main>
  );
}
