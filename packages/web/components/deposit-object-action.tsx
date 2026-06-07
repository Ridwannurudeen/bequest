"use client";

import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";
import type { HeirBinding } from "../lib/bequest-sdk";
import { getPublicConfig, type SuiNetwork } from "../lib/config";
import { explorerTxUrl, resolvedPackageId } from "../lib/claim-receipt";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";
const OBJECT_ID = /^0x[0-9a-fA-F]{1,64}$/;

// Owner deposits a key+store object (NFT / position) earmarked to a specific heir.
// Self-paid like the coin deposit: the owner signs and pays the gas. The object's full
// type is read on-chain and used as the deposit_object type argument.
function DepositObjectActionInner({
  estateId,
  owner,
  status,
  heirs,
}: {
  estateId: string;
  owner: string;
  status: string;
  heirs: HeirBinding[];
}) {
  const flow = useEnokiFlow();
  const { address } = useZkLogin();
  const [objectId, setObjectId] = useState("");
  const [recipient, setRecipient] = useState(heirs[0]?.binding ?? "");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  // Only the owner can deposit, only before Triggered, and only if there are heirs to earmark to.
  const isOwner = !!address && address.toLowerCase() === owner.toLowerCase();
  if (status === "Triggered" || !isOwner || heirs.length === 0) return null;

  async function deposit() {
    if (!address) return;
    setState("working");
    setMessage("");
    try {
      const id = objectId.trim();
      if (!OBJECT_ID.test(id)) throw new Error("Enter a valid object id (0x…)");
      if (!recipient) throw new Error("Pick an heir to earmark this object for");

      const config = getPublicConfig();
      const client = new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(NETWORK),
        network: NETWORK,
      });

      // The object's full type is the deposit_object<T> type argument.
      const obj = await client.getObject({ id, options: { showType: true } });
      const objectType = obj.data?.type;
      if (!objectType) throw new Error("Could not read that object's type");

      const tx = new Transaction();
      tx.setSender(address);
      tx.moveCall({
        target: `${resolvedPackageId(config)}::${config.estateModule}::deposit_object`,
        typeArguments: [objectType],
        arguments: [
          tx.object(estateId),
          tx.object(id),
          tx.pure.address(recipient),
          tx.object.clock(),
        ],
      });

      const keypair = await flow.getKeypair({ network: NETWORK });
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
        ✓ Object escrowed and earmarked to its heir. Tx{" "}
        <a href={explorerTxUrl(message)} target="_blank" rel="noreferrer">
          {message.slice(0, 16)}…
        </a>
      </p>
    );
  }

  return (
    <div className="nav-links">
      <input
        type="text"
        aria-label="object id to deposit"
        placeholder="Object / StakedSui id (0x…)"
        value={objectId}
        onChange={(e) => setObjectId(e.target.value)}
        style={{ width: "12rem" }}
      />
      <select
        aria-label="earmark to heir"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
      >
        {heirs.map((heir) => (
          <option key={heir.binding} value={heir.binding}>
            {heir.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="button primary"
        onClick={deposit}
        disabled={state === "working"}
      >
        {state === "working" ? "Depositing…" : "Deposit object (you pay)"}
      </button>
      {state === "error" && <p className="lede">Deposit failed: {message}</p>}
    </div>
  );
}

// Gated so the page builds/renders without Enoki credentials (e.g. CI).
export function DepositObjectAction({
  estateId,
  owner,
  status,
  heirs,
}: {
  estateId: string;
  owner: string;
  status: string;
  heirs: HeirBinding[];
}) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) return null;
  return (
    <DepositObjectActionInner
      estateId={estateId}
      owner={owner}
      status={status}
      heirs={heirs}
    />
  );
}
