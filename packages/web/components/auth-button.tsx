"use client";

import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import type { SuiNetwork } from "../lib/config";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Uses Enoki hooks — only mounted when the provider is present (i.e. the public key is configured).
function AuthButtonInner({ clientId }: { clientId: string }) {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();

  async function signIn() {
    const url = await flow.createAuthorizationURL({
      provider: "google",
      clientId,
      redirectUrl: `${window.location.origin}/auth`,
      network: NETWORK,
    });
    window.location.href = url;
  }

  if (address) {
    return (
      <span className="nav-links">
        <span className="status-pill" title={address}>
          {shortAddress(address)}
        </span>
        <button
          type="button"
          className="button secondary"
          onClick={() => flow.logout()}
        >
          Sign out
        </button>
      </span>
    );
  }

  return (
    <button type="button" className="button secondary" onClick={signIn}>
      Sign in with Google
    </button>
  );
}

// Gate: render the hook-driven button only when Enoki + Google are configured, so the app builds
// and renders without credentials (e.g. CI) instead of calling hooks with no provider.
export function AuthButton() {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) {
    return <span className="status-pill">Sign-in: configure Enoki</span>;
  }
  return <AuthButtonInner clientId={clientId} />;
}
