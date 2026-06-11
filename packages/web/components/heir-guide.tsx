"use client";

import { useZkLogin } from "@mysten/enoki/react";
import { AuthButton } from "./auth-button";
import { ratioLabel, type EstateView } from "../lib/bequest-sdk";

// Plain-language, state-aware guidance derived from the live estate, so a non-crypto recipient
// understands what they can receive and exactly what to do. Deterministic by design (no LLM): the
// guidance is read straight from on-chain state, so it can never mislead.
function statusGuidance(status: EstateView["status"]): {
  headline: string;
  detail: string;
  canClaim: boolean;
} {
  switch (status) {
    case "Triggered":
      return {
        headline: "You can claim now.",
        detail:
          "The estate has triggered. Sign in and claim your share; the SUI leg is sponsored, so you pay no gas.",
        canClaim: true,
      };
    case "Pending":
      return {
        headline: "Almost there — the estate is in its grace window.",
        detail:
          "It has armed after inactivity. The owner or executor can still cancel a false alarm, so claiming opens once the grace period ends and it triggers.",
        canClaim: false,
      };
    default:
      return {
        headline: "Nothing to do yet.",
        detail:
          "The owner is still active, so the estate has not triggered. You are named as a recipient and can claim if it ever does.",
        canClaim: false,
      };
  }
}

function HeirGuideInner({ estate }: { estate: EstateView }) {
  const { address } = useZkLogin();
  const guide = statusGuidance(estate.status);
  const me = address
    ? estate.heirs.find((h) => h.binding.toLowerCase() === address.toLowerCase())
    : undefined;
  const hasLetter =
    estate.assets.some((a) => a.type === "LETTER") || Boolean(estate.wishesBlobId);

  return (
    <div className="owner-form" aria-label="Heir concierge">
      <p className="kicker">Heir concierge</p>
      {!address ? (
        <>
          <p className="lede">
            New to this? Sign in with Google to see whether you are a named recipient and
            what you can receive. No seed phrase, no gas, no crypto experience needed.
          </p>
          <AuthButton />
        </>
      ) : me ? (
        <>
          <p className="lede">
            You are a named recipient on this estate for{" "}
            <strong>{ratioLabel(me.ratioBps)}</strong> of the SUI it holds, from{" "}
            {estate.ownerLabel}.
          </p>
          <p className="lede">
            <strong>{guide.headline}</strong> {guide.detail}
          </p>
          <ol className="lede" style={{ paddingLeft: "1.2rem" }}>
            <li>Your share of SUI is paid to your wallet, sponsored, so you pay no gas.</li>
            <li>
              Any objects earmarked to you are pushed to you after the same on-chain trigger.
            </li>
            {hasLetter ? (
              <li>
                The owner&apos;s encrypted last-wishes letter unlocks for you once the
                estate triggers.
              </li>
            ) : null}
          </ol>
          {!guide.canClaim && (
            <p className="lede">
              There is nothing to sign yet. Check back after the trigger.
            </p>
          )}
        </>
      ) : (
        <p className="lede">
          This wallet is not a named recipient on this estate. If you expected to receive assets,
          confirm with the owner that they used this exact address, or sign in with the
          account they named.
        </p>
      )}
    </div>
  );
}

export function HeirGuide({ estate }: { estate: EstateView }) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) return null;
  return <HeirGuideInner estate={estate} />;
}
