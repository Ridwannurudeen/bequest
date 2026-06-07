import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Bequest | Crypto inheritance your family can claim",
  description:
    "Sui-native crypto inheritance with on-chain estate custody, sponsored heir claims, and encrypted last-wishes that unlock only after the trigger.",
  metadataBase: new URL("https://bequest.gudman.xyz"),
  openGraph: {
    title: "Bequest | Crypto inheritance your family can claim",
    description:
      "A live Sui estate flow for owners, heirs, and executors: sponsored claim proof, on-chain custody, and Seal-gated encrypted letters.",
    images: ["/bequest-og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bequest | Crypto inheritance your family can claim",
    description:
      "Sponsored heir claims, Sui estate custody, and encrypted last-wishes on Sui.",
    images: ["/bequest-og.png"],
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
