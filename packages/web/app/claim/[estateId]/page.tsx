import type { Metadata } from "next";
import Link from "next/link";
import {
  claimReadiness,
  claimProofUrl,
  claimTarget,
  claimTypeArguments,
  demoClaimReceipt,
  explorerObjectUrl,
  resolvedPackageId,
} from "../../../lib/claim-receipt";
import { getPublicConfig } from "../../../lib/config";
import { readEstateOnChain } from "../../../lib/estate-onchain";
import { ratioLabel } from "../../../lib/bequest-sdk";
import { ClaimAction } from "../../../components/claim-action";
import { WishesLetter } from "../../../components/wishes-letter";

const OBJECT_ID = /^0x[0-9a-fA-F]{64}$/;

type ClaimPageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export async function generateMetadata({
  params,
}: ClaimPageProps): Promise<Metadata> {
  const { estateId } = await params;
  return {
    title: `Bequest claim receipt | ${estateId}`,
    description:
      "A Bequest heir receipt showing estate status, claim target readiness, and Enoki sponsorship boundary.",
  };
}

export default async function ClaimReceiptPage({ params }: ClaimPageProps) {
  const { estateId } = await params;
  const config = getPublicConfig();
  const packageId = resolvedPackageId(config);
  const target = claimTarget(config);
  const typeArguments = claimTypeArguments(config);
  const steps = claimReadiness(config);
  const sponsoredClaimUrl = claimProofUrl(config);

  // A real object id reads the live estate; anything else (e.g. /claim/demo) shows the demo card.
  const live = OBJECT_ID.test(estateId)
    ? await readEstateOnChain(estateId, config).catch((error) => {
        console.warn("Claim receipt live read failed; showing demo:", error);
        return null;
      })
    : null;

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
          <p className="kicker">
            Heir claim receipt · {live ? "live testnet" : "demo preview"}
          </p>
          <h1>
            <span>Maya can inherit</span>
            <span>without holding</span>
            <span>the owner key.</span>
          </h1>
          <p className="lede">
            This page is the claim proof surface. It pins the estate, package,
            distribution target, and sponsorship boundary. If a sponsored claim
            lands, the Sui transaction digest appears here; until then, no fake
            gasless heir claim is presented.
          </p>
        </div>

        {live ? (
          <aside className="receipt-card" aria-label="Live estate summary">
            <div className="receipt-card-top">
              <span>Estate</span>
              <strong>{estateId.slice(0, 10)}…</strong>
            </div>
            <h2>{live.status}</h2>
            <dl>
              <div>
                <dt>Owner</dt>
                <dd>{live.ownerLabel}</dd>
              </div>
              <div>
                <dt>Heirs</dt>
                <dd>
                  {live.heirs.length > 0
                    ? live.heirs
                        .map((h) => `${h.label} · ${ratioLabel(h.ratioBps)}`)
                        .join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Assets</dt>
                <dd>
                  {live.assets.length > 0
                    ? live.assets
                        .map((a) =>
                          a.note
                            ? `${a.label} (${a.value} · ${a.note})`
                            : `${a.label} (${a.value})`,
                        )
                        .join(", ")
                    : "None escrowed"}
                </dd>
              </div>
              <div>
                <dt>Letter</dt>
                <dd>Seal-gated; unlocks after Triggered</dd>
              </div>
            </dl>
            <ClaimAction
              estateId={estateId}
              claimable={live.status === "Triggered"}
            />
            <WishesLetter
              estateId={estateId}
              packageId={config.packageId}
              blobId={config.wishesBlobId}
              innerIdHex={config.wishesInnerId}
              triggered={live.status === "Triggered"}
            />
          </aside>
        ) : (
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
        )}
      </section>

      <section className="receipt-section" aria-label="Claim proof readiness">
        <div className="section-heading">
          <p className="kicker">Sponsored claim boundary</p>
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
            typeArguments:{" "}
            {typeArguments.length > 0 ? typeArguments.join(", ") : "none"}
          </p>
          <p>
            The first sponsored heir proof should sponsor this existing deployed
            Sui distribution call. It does not need a new contract: after the
            estate is Triggered, the heir action triggers the SUI split for
            every named heir in one PTB. Until sponsorship lands, the UI stays
            honest: no fake claim transaction, no fake sponsor digest.
          </p>
          <a href={explorerObjectUrl(packageId)}>
            Open current package on SuiScan
          </a>
        </div>

        <div className="claim-target-card">
          <p className="kicker">Sponsored claim proof</p>
          {sponsoredClaimUrl ? (
            <>
              <h3>{config.sponsoredClaimDigest}</h3>
              <p>
                This digest is the V2 proof gate: a sponsored heir-side
                execution of the deployed distribution path, verifiable on
                SuiScan.
              </p>
              <a href={sponsoredClaimUrl}>Open sponsored claim transaction</a>
            </>
          ) : (
            <>
              <h3>Not pinned yet</h3>
              <p>
                Enoki-sponsored execution is the remaining proof gate. If the
                digest is not configured, submission copy must say the live
                proof is permissionless distribution, not gasless Google claim.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
