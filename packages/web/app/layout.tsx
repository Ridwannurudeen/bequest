import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Bequest | Sui-native inheritance",
  description:
    "Sui-native on-chain inheritance with a Google-ready heir claim path and encrypted last-wishes that unlock only after the trigger.",
  metadataBase: new URL("https://bequest.gudman.xyz"),
  openGraph: {
    title: "Bequest | Inheritance that still works when the owner cannot sign",
    description:
      "A Sui estate flow for owners, heirs, and executors: zkLogin-ready onboarding, sponsored-claim proof surface, and Seal-gated encrypted letters.",
    images: ["/bequest-og.svg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bequest | Sui-native inheritance",
    description:
      "Google-ready heir claims, Sui estate custody, and encrypted last-wishes on Sui.",
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
      </body>
    </html>
  );
}
