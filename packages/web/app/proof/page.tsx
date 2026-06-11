import type { Metadata } from "next";
import Link from "next/link";
import { getPublicConfig } from "../../lib/config";
import {
  explorerObjectUrl,
  explorerTxUrl,
  resolvedPackageId,
} from "../../lib/claim-receipt";
import {
  currentPackage,
  proofCards,
  featureProofs,
} from "../../lib/live-proof";
import { readEstateOnChain } from "../../lib/estate-onchain";
import { ratioLabel, type EstateView } from "../../lib/bequest-sdk";

// One canonical, judge-facing proof surface. Reads the live package, the curated estate, and the
// pinned sponsored-claim digest — all verifiable on SuiScan — so the proof never depends on a
// re-claimable estate. Everything is data-driven (config + live chain), so a later republish or
// re-seed flows through automatically.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bequest · proof board",
  description:
    "Every Bequest proof in one place: the testnet package, the curated estate, the sponsored heir claim, and how to verify each on SuiScan.",
};

async function loadEstate(
  estateId: string | undefined,
): Promise<{ id: string; view: EstateView } | null> {
  if (!estateId) return null;
  try {
    return { id: estateId, view: await readEstateOnChain(estateId) };
  } catch (error) {
    console.warn("Proof board live estate read failed:", error);
    return null;
  }
}

export default async function ProofBoardPage() {
  const config = getPublicConfig();
  const packageId = resolvedPackageId(config);
  const estate = await loadEstate(config.demoEstateId);
  const claimDigest = config.sponsoredClaimDigest;
  const escrowed =
    estate?.view.assets.filter((a) => a.state === "escrowed") ?? [];

  return (
    <main>
      <nav className="nav-shell" aria-label="Proof board navigation">
        <Link className="brand" href="/" aria-label="Back to Bequest home">
          <span className="brand-mark">Bq</span>
          <span>Bequest</span>
        </Link>
        <div className="nav-links">
          <Link href="/estates">Estates</Link>
          {estate && <Link href={`/claim/${estate.id}`}>Claim</Link>}
          <a href={currentPackage.explorerUrl}>SuiScan</a>
        </div>
      </nav>

      <section className="receipt-hero">
        <div>
          <p className="kicker">Proof board · {config.network}</p>
          <h1>
            <span>Every claim,</span>
            <span>every estate,</span>
            <span>verifiable on-chain.</span>
          </h1>
          <p className="lede">
            One canonical surface pinning the package, the curated estate, and a
            real sponsored heir claim. Each row links to SuiScan — verify it
            independently, no trust in this UI required.
          </p>
        </div>
      </section>

      <section className="proof-section" aria-label="Canonical references">
        <div className="section-heading">
          <p className="kicker">Canonical references</p>
          <h2>The live deployment</h2>
        </div>
        <div className="proof-card-grid">
          <article className="proof-card">
            <p className="kicker">Package</p>
            <h3>Deployed Move package</h3>
            <p className="lede">
              The <code>estate</code> module on Sui {config.network}, holding
              custody, the dead-man switch, Seal-gated wishes, and sponsored
              distribution.
            </p>
            <div className="nav-links">
              <a href={explorerObjectUrl(packageId)}>Package on SuiScan</a>
              <a href={explorerTxUrl(currentPackage.publishDigest)}>
                Publish tx
              </a>
            </div>
          </article>

          <article className="proof-card">
            <p className="kicker">Estate</p>
            <h3>Curated demo estate</h3>
            {estate ? (
              <>
                <p className="lede">
                  <span className="status-pill">{estate.view.status}</span> ·
                  owner {estate.view.ownerLabel} · heirs{" "}
                  {estate.view.heirs
                    .map((h) => `${h.label} ${ratioLabel(h.ratioBps)}`)
                    .join(", ")}
                </p>
                <p className="lede">
                  Escrowed:{" "}
                  {escrowed.length > 0
                    ? escrowed.map((a) => `${a.label} (${a.value})`).join(", ")
                    : "fully distributed — see the claim tx below"}
                </p>
                <div className="nav-links">
                  <Link href={`/claim/${estate.id}`}>Claim receipt</Link>
                  <a href={explorerObjectUrl(estate.id)}>Estate on SuiScan</a>
                </div>
              </>
            ) : (
              <p className="lede">
                Live estate read is momentarily unavailable (testnet RPC). The
                package and claim proofs below remain verifiable.
              </p>
            )}
          </article>

          <article className="proof-card">
            <p className="kicker">Sponsored claim</p>
            <h3>A gasless heir claim, executed</h3>
            {claimDigest ? (
              <>
                <p className="lede">
                  A heir claimed via zkLogin with sponsor-paid gas: sender and
                  gas sponsor differ, and the SUI routed to the named heirs in
                  one PTB.
                </p>
                <div className="nav-links">
                  <a href={explorerTxUrl(claimDigest)}>
                    Sponsored claim tx on SuiScan
                  </a>
                </div>
              </>
            ) : (
              <p className="lede">
                No sponsored-claim digest pinned yet. Until one is, no claim
                proof is shown — the board stays honest.
              </p>
            )}
          </article>
        </div>
      </section>

      <section className="proof-section" aria-label="What is proven">
        <div className="section-heading">
          <p className="kicker">What is proven</p>
          <h2>Each pillar, on testnet</h2>
        </div>
        <div className="proof-card-grid">
          {proofCards.map((card) => (
            <article className="proof-card" key={card.label}>
              <p className="kicker">
                {card.label} · {card.status}
              </p>
              <h3>{card.title}</h3>
              <p className="lede">{card.detail}</p>
              <p className="lede">
                <code>{card.evidence}</code>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="proof-section"
        aria-label="Differentiators proven live"
      >
        <div className="section-heading">
          <p className="kicker">Differentiators · proven live</p>
          <h2>The features that set Bequest apart, each a real tx</h2>
        </div>
        <div className="proof-card-grid">
          {featureProofs.map((card) => (
            <article className="proof-card" key={card.label}>
              <p className="kicker">{card.label} · Proven live</p>
              <h3>{card.title}</h3>
              <p className="lede">{card.detail}</p>
              <div className="nav-links">
                <a href={explorerTxUrl(card.digest)}>Transaction on SuiScan</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="proof-section" aria-label="Verify it yourself">
        <div className="section-heading">
          <p className="kicker">Verify it yourself</p>
          <h2>No trust in this page required</h2>
        </div>
        <p className="lede">
          Open any SuiScan link above. The package shows the deployed{" "}
          <code>estate</code> module; the estate object shows live status,
          heirs, and escrowed balance; the sponsored-claim tx shows a different
          sender and gas sponsor with payout to the recorded heirs. The
          read-only verifier{" "}
          <code>packages/web/scripts/verify-claim-kind.mjs</code> rebuilds the
          claim transaction kind against the same package with no secrets.
        </p>
      </section>
    </main>
  );
}
