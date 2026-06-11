import type { Metadata } from "next";
import Link from "next/link";
import { ClaimAction } from "../../components/claim-action";
import { DemoSandbox } from "../../components/demo-sandbox";
import { HeirGuide } from "../../components/heir-guide";
import { VestingProgress } from "../../components/vesting-progress";
import { WishesLetter } from "../../components/wishes-letter";
import { ratioLabel } from "../../lib/bequest-sdk";
import { explorerObjectUrl, resolvedPackageId } from "../../lib/claim-receipt";
import { getPublicConfig } from "../../lib/config";
import { readEstateOnChain } from "../../lib/estate-onchain";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bequest demo | Become the recipient in 60 seconds",
  description:
    "A self-serve Bequest demo where a signed-in visitor gets a fresh Sui estate, claims it gaslessly, and reveals the sealed letter.",
};

const OBJECT_ID = /^0x[0-9a-fA-F]{64}$/;

type DemoPageProps = {
  searchParams: Promise<{
    estateId?: string;
    wishesBlobId?: string;
    wishesInnerId?: string;
  }>;
};

export default async function DemoPage({ searchParams }: DemoPageProps) {
  const params = await searchParams;
  const config = getPublicConfig();
  const packageId = resolvedPackageId(config);
  const estateId = params.estateId;
  const live =
    estateId && OBJECT_ID.test(estateId)
      ? await readEstateOnChain(estateId, config).catch((error) => {
          console.warn("Demo estate read failed:", error);
          return null;
        })
      : null;
  const wishesBlobId = params.wishesBlobId ?? config.wishesBlobId;
  const wishesInnerId = params.wishesInnerId ?? config.wishesInnerId;

  return (
    <main>
      <nav className="nav-shell" aria-label="Demo navigation">
        <Link className="brand" href="/" aria-label="Back to Bequest home">
          <span className="brand-mark">Bq</span>
          <span>Bequest</span>
        </Link>
        <div className="nav-links">
          <Link href="/#proof">Proof</Link>
          <Link href="/estates">Estates</Link>
          <Link href="/create" className="button secondary">
            Create manually
          </Link>
        </div>
      </nav>

      <section className="receipt-hero">
        <div>
          <p className="kicker">Self-serve demo</p>
          <h1>
            <span>Become the recipient.</span>
            <span>Claim the assets.</span>
            <span>Read the sealed letter.</span>
          </h1>
          <p className="lede">
            The old shared judge receipt can be drained once. This page is built
            for one estate per visitor: sign in with Google, ask the funded demo
            seeder for a fresh triggered estate, then complete the claim and
            letter reveal without leaving this route.
          </p>
        </div>

        <aside className="receipt-card" aria-label="Demo setup">
          <div className="receipt-card-top">
            <span>Demo status</span>
            <strong>{live ? live.status : "ready"}</strong>
          </div>
          {live ? (
            <>
              <h2>Your demo estate is live.</h2>
              <p className="lede">
                Estate {live.estateId.slice(0, 10)}... is loaded from Sui.
                Continue below to claim and reveal the letter.
              </p>
              <div className="nav-links">
                <a href={explorerObjectUrl(live.estateId)}>Open on SuiScan</a>
                <Link href="/demo">Create another demo</Link>
              </div>
            </>
          ) : (
            <DemoSandbox />
          )}
        </aside>
      </section>

      {live ? (
        <section className="receipt-section" aria-label="Demo claim">
          <div className="section-heading">
            <p className="kicker">Your conditional transfer</p>
            <h2>Claim and letter reveal stay on the demo page.</h2>
          </div>

          <div className="receipt-grid">
            <aside className="receipt-card" aria-label="Demo estate summary">
              <div className="receipt-card-top">
                <span>Estate</span>
                <strong>{live.status}</strong>
              </div>
              <dl>
                <div>
                  <dt>Owner</dt>
                  <dd>{live.ownerLabel}</dd>
                </div>
                <div>
                  <dt>Recipients</dt>
                  <dd>
                    {live.heirs.length > 0
                      ? live.heirs
                          .map((h) => `${h.label} - ${ratioLabel(h.ratioBps)}`)
                          .join(", ")
                      : "None recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Assets</dt>
                  <dd>
                    {live.assets.length > 0
                      ? live.assets
                          .map((a) =>
                            a.note
                              ? `${a.label} (${a.value}; ${a.note})`
                              : `${a.label} (${a.value})`,
                          )
                          .join(", ")
                      : "No assets escrowed"}
                  </dd>
                </div>
              </dl>
              <VestingProgress vesting={live.vesting} />
              <ClaimAction
                estateId={live.estateId}
                claimable={live.status === "Triggered"}
                vesting={Boolean(live.vesting)}
              />
            </aside>

            <aside className="receipt-card" aria-label="Demo letter reveal">
              <div className="receipt-card-top">
                <span>Private letter</span>
                <strong>{wishesBlobId && wishesInnerId ? "ready" : "pending"}</strong>
              </div>
              <p className="lede">
                The letter stays encrypted on Walrus until Seal sees the estate
                status is Triggered and the signed-in account is a named
                recipient.
              </p>
              <WishesLetter
                estateId={live.estateId}
                packageId={packageId}
                blobId={wishesBlobId}
                innerIdHex={wishesInnerId}
                triggered={live.status === "Triggered"}
              />
              <HeirGuide estate={live} />
            </aside>
          </div>
        </section>
      ) : null}
    </main>
  );
}
