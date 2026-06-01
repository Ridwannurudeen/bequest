"use client";

import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";
import { getPublicConfig, type SuiNetwork } from "../lib/config";
import {
  explorerTxUrl,
  resolvedPackageId,
  suiCoinType,
} from "../lib/claim-receipt";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";

// Owner-funded deposit: the owner escrows their own SUI, so this is self-paid (not sponsored) —
// the deposited coin is split from the owner's gas coin and the owner pays the gas.
function DepositActionInner({
  estateId,
  owner,
  status,
}: {
  estateId: string;
  owner: string;
  status: string;
}) {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();
  const [amount, setAmount] = useState("0.05");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  // Only the owner can deposit, and only before the estate is Triggered.
  const isOwner = !!address && address.toLowerCase() === owner.toLowerCase();
  if (status === "Triggered" || !isOwner) return null;

  async function deposit() {
    if (!address) return;
    setState("working");
    setMessage("");
    try {
      const mist = Math.round(Number(amount) * 1e9);
      if (!(mist > 0)) throw new Error("Enter an amount greater than 0");

      const config = getPublicConfig();
      const tx = new Transaction();
      tx.setSender(address);
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(mist)]);
      tx.moveCall({
        target: `${resolvedPackageId(config)}::${config.estateModule}::deposit_coin`,
        typeArguments: [suiCoinType],
        arguments: [tx.object(estateId), coin, tx.object.clock()],
      });

      const keypair = await flow.getKeypair({ network: NETWORK });
      const client = new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(NETWORK),
        network: NETWORK,
      });
      const res = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
      });

      setState("done");
      setMessage(res.digest);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Deposit failed");
    }
  }

  if (state === "done") {
    return (
      <p className="lede">
        ✓ Deposited {amount} SUI. Tx{" "}
        <a href={explorerTxUrl(message)} target="_blank" rel="noreferrer">
          {message.slice(0, 16)}…
        </a>
      </p>
    );
  }

  return (
    <div className="nav-links">
      <input
        type="number"
        aria-label="deposit SUI amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: "6rem" }}
      />
      <span>SUI</span>
      <button
        type="button"
        className="button primary"
        onClick={deposit}
        disabled={state === "working"}
      >
        {state === "working" ? "Depositing…" : "Deposit (you pay)"}
      </button>
      {state === "error" && <p className="lede">Deposit failed: {message}</p>}
    </div>
  );
}

// Gated so the page builds/renders without Enoki credentials (e.g. CI).
export function DepositAction({
  estateId,
  owner,
  status,
}: {
  estateId: string;
  owner: string;
  status: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) return null;
  return (
    <DepositActionInner estateId={estateId} owner={owner} status={status} />
  );
}
