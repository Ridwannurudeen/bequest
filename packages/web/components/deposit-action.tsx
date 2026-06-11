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

const USDC_BY_NETWORK: Partial<Record<SuiNetwork, string>> = {
  testnet:
    "0xa1ec7fc00a6f7b80b7a7d0a4f0f064a16061e38c1e6a9c90293580d63f0e3495::usdc::USDC",
  mainnet:
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
};

const depositOptions = [
  { symbol: "SUI", coinType: suiCoinType, defaultAmount: "0.05" },
  ...(USDC_BY_NETWORK[NETWORK]
    ? [
        {
          symbol: "USDC",
          coinType: USDC_BY_NETWORK[NETWORK],
          defaultAmount: "1.00",
        },
      ]
    : []),
] as const;

function parseDecimalAmount(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a positive decimal amount.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Too many decimal places for this coin (${decimals}).`);
  }
  const scale = BigInt(10) ** BigInt(decimals);
  const wholeUnits = BigInt(whole || "0") * scale;
  const fractionUnits = BigInt(fraction.padEnd(decimals, "0") || "0");
  const amount = wholeUnits + fractionUnits;
  if (amount <= BigInt(0)) throw new Error("Enter an amount greater than 0.");
  return amount;
}

// Owner-funded deposit: the owner escrows their own SUI, so this is self-paid (not sponsored) —
// SUI is split from the owner's gas coin; other supported coins use an owned Coin<T> object.
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
  const [coinType, setCoinType] = useState<string>(depositOptions[0].coinType);
  const selected =
    depositOptions.find((option) => option.coinType === coinType) ??
    depositOptions[0];
  const [amount, setAmount] = useState(selected.defaultAmount);
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [lastDeposit, setLastDeposit] = useState("");

  // Only the owner can deposit, and only before the estate is Triggered.
  const isOwner = !!address && address.toLowerCase() === owner.toLowerCase();
  if (status === "Triggered" || !isOwner) return null;

  async function deposit() {
    if (!address) return;
    setState("working");
    setMessage("");
    try {
      const config = getPublicConfig();
      const client = new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(NETWORK),
        network: NETWORK,
      });
      const metadata = await client.getCoinMetadata({ coinType });
      if (!metadata) throw new Error("Coin metadata not found on Sui.");
      const baseUnits = parseDecimalAmount(amount, metadata.decimals);
      const tx = new Transaction();
      tx.setSender(address);
      let coin;
      if (coinType === suiCoinType) {
        [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(baseUnits.toString())]);
      } else {
        const coins = await client.getCoins({ owner: address, coinType });
        const source = coins.data.find(
          (c) => BigInt(c.balance) >= baseUnits,
        );
        if (!source) {
          throw new Error(`No ${metadata.symbol} coin with enough balance.`);
        }
        if (BigInt(source.balance) === baseUnits) {
          coin = tx.object(source.coinObjectId);
        } else {
          [coin] = tx.splitCoins(tx.object(source.coinObjectId), [
            tx.pure.u64(baseUnits.toString()),
          ]);
        }
      }
      tx.moveCall({
        target: `${resolvedPackageId(config)}::${config.estateModule}::deposit_coin`,
        typeArguments: [coinType],
        arguments: [tx.object(estateId), coin, tx.object.clock()],
      });

      const keypair = await flow.getKeypair({ network: NETWORK });
      const res = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
      });

      setState("done");
      setMessage(res.digest);
      setLastDeposit(`${amount} ${metadata.symbol}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Deposit failed");
    }
  }

  if (state === "done") {
    return (
      <p className="lede">
        ✓ Deposited {lastDeposit}. Tx{" "}
        <a href={explorerTxUrl(message)} target="_blank" rel="noreferrer">
          {message.slice(0, 16)}…
        </a>
      </p>
    );
  }

  return (
    <div className="nav-links">
      <select
        aria-label="deposit coin"
        value={coinType}
        onChange={(e) => {
          const next = depositOptions.find(
            (option) => option.coinType === e.target.value,
          );
          setCoinType(e.target.value);
          if (next) setAmount(next.defaultAmount);
        }}
      >
        {depositOptions.map((option) => (
          <option key={option.coinType} value={option.coinType}>
            {option.symbol}
          </option>
        ))}
      </select>
      <input
        type="number"
        aria-label={`deposit ${selected.symbol} amount`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: "6rem" }}
      />
      <span>{selected.symbol}</span>
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
