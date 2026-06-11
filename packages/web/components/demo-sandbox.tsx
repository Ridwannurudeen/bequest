"use client";

import { useZkLogin, useZkLoginSession } from "@mysten/enoki/react";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
} from "@mysten/sui/jsonRpc";
import { useState } from "react";
import type { SuiNetwork } from "../lib/config";
import { AuthButton } from "./auth-button";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";

type SeedResponse = {
  estateId?: string;
  wishesBlobId?: string;
  wishesInnerId?: string;
  wishesInnerIdHex?: string;
  error?: string;
};

async function waitForEstate(estateId: string): Promise<void> {
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  for (let i = 0; i < 8; i += 1) {
    const res = await client.getObject({
      id: estateId,
      options: { showType: true },
    });
    if (res.data) return;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

function DemoSandboxInner() {
  const { address } = useZkLogin();
  const session = useZkLoginSession();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function seed() {
    if (!address) return;
    setState("working");
    setMessage("Creating a private demo estate for this Google account...");
    try {
      const res = await fetch("/api/demo/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: address,
          zkLoginJwt: session?.jwt,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as SeedResponse;
      if (!res.ok) {
        throw new Error(
          body.error ??
            "Demo seeder route is not live yet. Lane A owns /api/demo/seed.",
        );
      }
      if (!body.estateId) throw new Error("Seeder response missed estateId.");

      setMessage("Estate created. Waiting for Sui indexing...");
      await waitForEstate(body.estateId);

      const params = new URLSearchParams({ estateId: body.estateId });
      if (body.wishesBlobId) params.set("wishesBlobId", body.wishesBlobId);
      const innerId = body.wishesInnerIdHex ?? body.wishesInnerId;
      if (innerId) params.set("wishesInnerId", innerId);
      window.location.href = `/demo?${params.toString()}`;
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the demo estate.",
      );
    }
  }

  if (!address) {
    return (
      <div className="owner-form" aria-label="Demo sign-in gate">
        <p className="kicker">Step 1</p>
        <h3>Sign in with Google.</h3>
        <p className="lede">
          The demo names your zkLogin address as the recipient, so the claim
          proves the non-crypto handoff instead of showing a shared receipt that
          every judge drains.
        </p>
        <AuthButton />
      </div>
    );
  }

  return (
    <div className="owner-form" aria-label="Create demo estate">
      <p className="kicker">Step 2</p>
      <h3>Create your demo transfer.</h3>
      <p className="lede">
        Bequest asks the funded demo seeder to create a fresh triggered estate
        for {address.slice(0, 6)}...{address.slice(-4)}, then brings the claim
        and letter reveal back into this page.
      </p>
      <button
        type="button"
        className="button primary"
        onClick={seed}
        disabled={state === "working"}
      >
        {state === "working" ? "Creating..." : "Create my demo transfer"}
      </button>
      {message ? <p className="lede">{message}</p> : null}
      {state === "error" ? (
        <p className="lede">
          This is blocked on Lane A until <code>/api/demo/seed</code> is live.
        </p>
      ) : null}
    </div>
  );
}

export function DemoSandbox() {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) {
    return (
      <div className="owner-form" aria-label="Demo config missing">
        <p className="kicker">Configuration needed</p>
        <p className="lede">
          Set the public Enoki key and Google client id to run the self-serve
          demo.
        </p>
      </div>
    );
  }
  return <DemoSandboxInner />;
}
