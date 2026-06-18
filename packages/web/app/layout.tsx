import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Bequest",
  title: "Bequest | Succession layer for Sui portfolios",
  description:
    "Sui-native estate custody with Google-ready recipients, Seal-gated letters, and verifiable trigger conditions.",
  metadataBase: new URL("https://bequest.gudman.xyz"),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "Bequest",
    "Sui",
    "Sui inheritance",
    "digital estate planning",
    "Walrus",
    "Seal",
    "zkLogin",
    "Enoki",
  ],
  creator: "Bequest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/logo-1024.png", sizes: "1024x1024", type: "image/png" },
    ],
    apple: [{ url: "/logo-1024.png", sizes: "1024x1024", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "https://bequest.gudman.xyz",
    title: "Bequest | Succession layer for Sui portfolios",
    description:
      "A Sui estate flow for owners, recipients, and executors: Google-ready heirs, verifiable triggers, and Seal-gated encrypted letters.",
    images: [
      {
        url: "/bequest-og.png",
        width: 1200,
        height: 630,
        alt: "Bequest — the succession layer for Sui portfolios",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bequest | Succession layer for Sui portfolios",
    description:
      "Google-ready heirs, Sui estate custody, and encrypted letters that unlock only after trigger.",
    images: ["/bequest-og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
