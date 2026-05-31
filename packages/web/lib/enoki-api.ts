import { getPublicConfig, getServerEnokiConfig } from "./config";

const ENOKI_API_BASE = "https://api.enoki.mystenlabs.com/v1";

export type EnokiEnvelope<T> = {
  data: T;
};

export type NonceResponse = {
  nonce: string;
  randomness: string;
  epoch: number;
  maxEpoch: number;
  estimatedExpiration: number;
};

export type ZkLoginProofResponse = {
  proofPoints: unknown;
  issBase64Details: unknown;
  headerBase64: string;
  addressSeed: string;
};

export type ZkLoginAddressResponse = {
  salt: string;
  address: string;
  publicKey: string;
};

export type SponsoredTransactionResponse = {
  digest: string;
  bytes: string;
};

type EnokiRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  zkLoginJwt?: string;
};

function requiredPrivateApiKey() {
  const { privateApiKey } = getServerEnokiConfig();
  if (!privateApiKey) {
    throw new Error("ENOKI_PRIVATE_API_KEY is not configured");
  }
  return privateApiKey;
}

function enokiHeaders(apiKey: string, zkLoginJwt?: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(zkLoginJwt ? { "zklogin-jwt": zkLoginJwt } : {}),
  };
}

export async function enokiRequest<T>(
  path: string,
  { method = "POST", body, zkLoginJwt }: EnokiRequestOptions = {},
) {
  const response = await fetch(`${ENOKI_API_BASE}${path}`, {
    method,
    headers: enokiHeaders(requiredPrivateApiKey(), zkLoginJwt),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload ? JSON.stringify(payload) : response.statusText;
    throw new Error(`Enoki request failed (${response.status}): ${detail}`);
  }

  return payload as EnokiEnvelope<T>;
}

export async function createNonce(input: {
  ephemeralPublicKey: string;
  additionalEpochs?: number;
}) {
  const { network } = getPublicConfig();
  return enokiRequest<NonceResponse>("/zklogin/nonce", {
    body: {
      network,
      ephemeralPublicKey: input.ephemeralPublicKey,
      additionalEpochs: input.additionalEpochs,
    },
  });
}

export async function createZkLoginProof(input: {
  zkLoginJwt: string;
  ephemeralPublicKey: string;
  maxEpoch: number;
  randomness: string;
}) {
  const { network } = getPublicConfig();
  return enokiRequest<ZkLoginProofResponse>("/zklogin/zkp", {
    zkLoginJwt: input.zkLoginJwt,
    body: {
      network,
      ephemeralPublicKey: input.ephemeralPublicKey,
      maxEpoch: input.maxEpoch,
      randomness: input.randomness,
    },
  });
}

export async function getZkLoginAddress(zkLoginJwt: string) {
  return enokiRequest<ZkLoginAddressResponse>("/zklogin", {
    method: "GET",
    zkLoginJwt,
  });
}

export async function createSponsoredTransaction(input: {
  zkLoginJwt?: string;
  sender?: string;
  transactionBlockKindBytes: string;
}) {
  const { network } = getPublicConfig();
  const { allowedAddresses, allowedMoveCallTargets } = getServerEnokiConfig();

  if (allowedMoveCallTargets.length === 0) {
    throw new Error(
      "Sponsorship refused: ENOKI_ALLOWED_MOVE_TARGETS is empty. Set a non-empty allow-list of Move targets (e.g. 0xPACKAGE::estate::distribute_coin) before sponsoring transactions.",
    );
  }

  return enokiRequest<SponsoredTransactionResponse>(
    "/transaction-blocks/sponsor",
    {
      zkLoginJwt: input.zkLoginJwt,
      body: {
        network,
        transactionBlockKindBytes: input.transactionBlockKindBytes,
        sender: input.sender,
        allowedAddresses: allowedAddresses.length
          ? allowedAddresses
          : undefined,
        allowedMoveCallTargets,
      },
    },
  );
}

export async function executeSponsoredTransaction(input: {
  digest: string;
  signature: string;
}) {
  return enokiRequest<SponsoredTransactionResponse>(
    `/transaction-blocks/sponsor/${input.digest}`,
    {
      body: {
        signature: input.signature,
      },
    },
  );
}
