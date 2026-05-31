"use client";

import { EnokiFlowProvider } from "@mysten/enoki/react";

// Enoki zkLogin context. When the public API key is absent (e.g. CI builds with no .env.local),
// we render children without the provider — auth UI is gated on the same key, so no hook runs
// without a provider.
export function Providers({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY;
  if (!apiKey) return <>{children}</>;
  return <EnokiFlowProvider apiKey={apiKey}>{children}</EnokiFlowProvider>;
}
