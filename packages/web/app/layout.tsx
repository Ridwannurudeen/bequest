import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Bequest | Programmable conditional transfers on Sui",
  description:
    "Sui-native conditional transfers with Google-ready recipient claims and encrypted letters that unlock only after the trigger.",
  metadataBase: new URL("https://bequest.gudman.xyz"),
  openGraph: {
    title: "Bequest | Conditional asset handoffs for non-crypto recipients",
    description:
      "A Sui estate flow for owners, recipients, and executors: zkLogin-ready onboarding, sponsored-claim proof surface, and Seal-gated encrypted letters.",
    images: ["/bequest-og.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bequest | Programmable conditional transfers on Sui",
    description:
      "Google-ready recipient claims, Sui estate custody, and encrypted letters on Sui.",
    images: ["/bequest-og.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <footer
          style={{
            textAlign: "center",
            padding: "2rem 1rem",
            fontSize: "0.8rem",
            color: "var(--muted)",
          }}
        >
          Sui testnet demo · no real funds · not legal, tax, or financial advice.
        </footer>
      </body>
    </html>
  );
}
