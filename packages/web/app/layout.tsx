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
  title: "Bequest | Programmable conditional transfers on Sui",
  description:
    "Sui-native conditional transfers with Google-ready recipient claims and encrypted letters that unlock only after the trigger.",
  metadataBase: new URL("https://bequest.gudman.xyz"),
  openGraph: {
    type: "website",
    url: "https://bequest.gudman.xyz",
    title: "Bequest | Conditional asset handoffs for non-crypto recipients",
    description:
      "A Sui estate flow for owners, recipients, and executors: zkLogin-ready onboarding, sponsored-claim proof surface, and Seal-gated encrypted letters.",
    images: [
      {
        url: "/bequest-og.png",
        width: 1200,
        height: 630,
        alt: "Bequest — programmable conditional transfers on Sui",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bequest | Programmable conditional transfers on Sui",
    description:
      "Google-ready recipient claims, Sui estate custody, and encrypted letters on Sui.",
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
