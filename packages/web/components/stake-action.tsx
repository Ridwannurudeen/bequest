"use client";

import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";
import type { HeirBinding } from "../lib/bequest-sdk";
import { explorerTxUrl, resolvedPackageId } from "../lib/claim-receipt";
import { getPublicConfig, type SuiNetwork } from "../lib/config";

const NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";
const SYSTEM_STATE = "0x5";
const STAKED_SUI_TYPE = "0x3::staking_pool::StakedSui";

function parseSui(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) {
    throw new Error("Enter a SUI amount with up to 9 decimals.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const mist =
    BigInt(whole || "0") * BigInt(1_000_000_000) +
    BigInt(fraction.padEnd(9, "0") || "0");
  if (mist <= BigInt(0)) throw new Error("Enter an amount greater than 0.");
  return mist;
}

function StakeActionInner({
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
  const [amount, setAmount] = useState("1");
  const [recipient, setRecipient] = useState(heirs[0]?.binding ?? "");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const isOwner = !!address && address.toLowerCase() === owner.toLowerCase();
  if (status === "Triggered" || !isOwner || heirs.length === 0) return null;

  async function stake() {
    if (!address) return;
    setState("working");
    setMessage("");
    try {
      if (!recipient) throw new Error("Pick a recipient for the stake.");
      const stakeMist = parseSui(amount);
      const config = getPublicConfig();
      const client = new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(NETWORK),
        network: NETWORK,
      });
      const validator = (await client.getLatestSuiSystemState())
        .activeValidators[0]?.suiAddress;
      if (!validator) throw new Error("No active validator found.");

      const tx = new Transaction();
      tx.setSender(address);
      const [stakeCoin] = tx.splitCoins(tx.gas, [
        tx.pure.u64(stakeMist.toString()),
      ]);
      const [staked] = tx.moveCall({
        target: "0x3::sui_system::request_add_stake_non_entry",
        arguments: [
          tx.object(SYSTEM_STATE),
          stakeCoin,
          tx.pure.address(validator),
        ],
      });
      tx.moveCall({
        target: `${resolvedPackageId(config)}::${config.estateModule}::deposit_object`,
        typeArguments: [STAKED_SUI_TYPE],
        arguments: [
          tx.object(estateId),
          staked,
          tx.pure.address(recipient),
          tx.object.clock(),
        ],
      });

      const keypair = await flow.getKeypair({ network: NETWORK });
      const res = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
      });
      await client.waitForTransaction({ digest: res.digest });

      setState("done");
      setMessage(res.digest);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Stake failed");
    }
  }

  if (state === "done") {
    return (
      <p className="lede">
        StakedSui position escrowed into the estate. Tx{" "}
        <a href={explorerTxUrl(message)} target="_blank" rel="noreferrer">
          {message.slice(0, 16)}...
        </a>
      </p>
    );
  }

  return (
    <div className="owner-form" aria-label="Stake SUI into estate">
      <p className="kicker">Productive estate</p>
      <p className="lede">
        Put the estate to work by staking SUI and escrowing the returned
        StakedSui position in one self-paid transaction.
      </p>
      <div className="nav-links">
        <input
          type="number"
          aria-label="SUI amount to stake"
          min="1"
          step="0.1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: "6rem" }}
        />
        <span>SUI</span>
        <select
          aria-label="recipient for staked SUI"
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
          onClick={stake}
          disabled={state === "working"}
        >
          {state === "working" ? "Staking..." : "Put estate to work"}
        </button>
      </div>
      {state === "error" && <p className="lede">Stake failed: {message}</p>}
    </div>
  );
}

export function StakeAction({
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
    <StakeActionInner
      estateId={estateId}
      owner={owner}
      status={status}
      heirs={heirs}
    />
  );
}
