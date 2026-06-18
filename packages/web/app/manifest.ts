import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bequest",
    short_name: "Bequest",
    description:
      "Sui-native estate custody with Google-ready recipients, Seal-gated letters, and verifiable trigger conditions.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f2",
    theme_color: "#0d314d",
    icons: [
      {
        src: "/logo-1024.png",
        sizes: "1024x1024",
        type: "image/png",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
