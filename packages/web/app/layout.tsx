import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bequest | Succession layer for Sui portfolios",
  description:
    "Sui-native estate custody with Google-ready recipients, Seal-gated letters, and verifiable trigger conditions.",
  metadataBase: new URL("https://bequest.gudman.xyz"),
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
          <SiteHeader />
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
