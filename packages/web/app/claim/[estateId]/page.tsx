import type { Metadata } from "next";
import Link from "next/link";
import {
  ConsoleShell,
  WorkspaceHeader,
  estate,
} from "../../../components/benchmark-ui";
import { ClaimAction } from "../../../components/claim-action";
import { HeirGuide } from "../../../components/heir-guide";
import { VestingProgress } from "../../../components/vesting-progress";
import { WishesLetter } from "../../../components/wishes-letter";
import { ratioLabel } from "../../../lib/bequest-sdk";
import { resolvedPackageId } from "../../../lib/claim-receipt";
import { getPublicConfig } from "../../../lib/config";
import { readEstateOnChain } from "../../../lib/estate-onchain";

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
    title: `Bequest claim | ${estateId}`,
    description:
      "Recipient claim room with Google identity, sponsored gas, fixed payout, and proof-first flow.",
  };
}

export default async function ClaimReceiptPage({ params }: ClaimPageProps) {
  const { estateId } = await params;
  const config = getPublicConfig();
  const packageId = resolvedPackageId(config);

  const live = OBJECT_ID.test(estateId)
    ? await readEstateOnChain(estateId, config).catch((error) => {
        console.warn("Claim receipt live read failed; showing demo:", error);
        return null;
      })
    : null;

  if (live) {
    const claimable = live.status === "Triggered";
    return (
      <ConsoleShell active="claim">
        <WorkspaceHeader
          eyebrow={`Estate ${estateId.slice(0, 8)}…${estateId.slice(-6)}`}
          title={
            claimable ? "You can claim this estate." : "Recipient claim room"
          }
          body="The trigger is verified on-chain. Sign in with Google to claim your share gaslessly and read the private letter."
          pill={live.status}
        />

        <section
          className="panel-card claim-summary"
          aria-label="Claim summary"
        >
          <div className="claim-total">
            <small className="eyebrow">Estate status</small>
            <strong>{live.status}</strong>
            <p>Owner {live.ownerLabel || live.owner}</p>
          </div>
          {live.heirs.map((heir) => (
            <div className="proof-chip" key={heir.binding}>
              <small>{heir.label || "Recipient"}</small>
              <strong>{ratioLabel(heir.ratioBps)}</strong>
            </div>
          ))}
        </section>

        <div className="workspace-grid" style={{ marginTop: 28 }}>
          <section className="panel-card">
            <h2>Claim your share</h2>
            <VestingProgress vesting={live.vesting} />
            <ClaimAction
              estateId={estateId}
              claimable={claimable}
              vesting={Boolean(live.vesting)}
            />
            <WishesLetter
              estateId={estateId}
              packageId={packageId}
              blobId={live.wishesBlobId || config.wishesBlobId}
              innerIdHex={live.wishesInnerId || config.wishesInnerId}
              triggered={claimable}
            />
          </section>

          <aside className="soft-card">
            <HeirGuide estate={live} />
          </aside>
        </div>
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell active="claim">
      <WorkspaceHeader
        title="Adam, you can claim this estate."
        body="The trigger is proven onchain. Your share is fixed and the transaction fee is sponsored."
        pill="Eligible"
      />

      <section className="panel-card claim-summary" aria-label="Claim summary">
        <div className="claim-total">
          <small className="eyebrow">Your share</small>
          <strong>{estate.adam}</strong>
          <p>70% of estate {estate.id}</p>
        </div>
        <div className="proof-chip">
          <small>Google sign-in</small>
          <strong>No seed phrase required.</strong>
        </div>
        <div className="proof-chip">
          <small>Gas sponsored</small>
          <strong>You do not need SUI for fees.</strong>
        </div>
        <div className="proof-chip">
          <small>Payout fixed</small>
          <strong>Funds route only to recorded address.</strong>
        </div>
      </section>

      <div
        className="hero-actions"
        style={{ maxWidth: 1250, margin: "0 auto 34px" }}
      >
        <Link className="button dark" href="/proof">
          Continue with Google
        </Link>
        <Link className="button ghost" href="/proof">
          View proof first
        </Link>
      </div>

      <section className="section-block">
        <h2>What happens next</h2>
        <div className="next-grid">
          {[
            [
              "1",
              "Verify your identity",
              "Sign in with the Google account linked to this claim.",
            ],
            [
              "2",
              "Review the distribution",
              "Confirm your 70% share and recipient address.",
            ],
            [
              "3",
              "Claim with sponsored gas",
              "Enoki sponsors the Sui transaction fee.",
            ],
            [
              "4",
              "Read the private letter",
              "Seal releases the encrypted Walrus letter after claim.",
            ],
          ].map(([n, title, body]) => (
            <article className="how-card" key={title}>
              <small>{n}</small>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="workspace-grid" style={{ marginTop: 34 }}>
        <section className="soft-card">
          <h2>No crypto experience required.</h2>
          <p>
            This claim does not ask for the owner&apos;s key. The contract
            checks the estate state, verifies that the trigger fired, and routes
            funds to recipients in one Sui transaction.
          </p>
          <p
            style={{
              marginTop: 28,
              fontSize: ".78rem",
              color: "var(--ink-faint)",
            }}
          >
            Not legal, probate, tax, or financial advice.
          </p>
        </section>

        <aside className="phone-card" aria-label="Mobile claim preview">
          <div className="phone-screen">
            <h3>Bequest claim</h3>
            <span className="status-pill">Triggered</span>
            <strong>{estate.adam}</strong>
            <small>Gas sponsored</small>
            <div className="split-row" style={{ marginTop: 18 }}>
              <span className="avatar-dot" />
              <span />
              <b />
            </div>
          </div>
        </aside>
      </div>
    </ConsoleShell>
  );
}
