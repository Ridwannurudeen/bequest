"use client";

import { useAuthCallback } from "@mysten/enoki/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Avoid static prerender; this page only does work client-side after Google redirects back.
export const dynamic = "force-dynamic";

function AuthCallbackInner() {
  const { handled } = useAuthCallback();
  const router = useRouter();

  useEffect(() => {
    if (handled) router.replace("/");
  }, [handled, router]);

  return (
    <main className="receipt-hero">
      <div>
        <p className="kicker">zkLogin</p>
        <h1>
          <span>Completing</span>
          <span>your sign-in…</span>
        </h1>
        <p className="lede">
          Finishing the Google zkLogin handshake and deriving your Sui address.
        </p>
      </div>
    </main>
  );
}

export default function AuthPage() {
  if (!process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY) {
    return (
      <main className="receipt-hero">
        <div>
          <p className="kicker">zkLogin</p>
          <h1>
            <span>Sign-in not</span>
            <span>configured.</span>
          </h1>
          <p className="lede">
            Set NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY to enable Google sign-in.
          </p>
        </div>
      </main>
    );
  }
  return <AuthCallbackInner />;
}
