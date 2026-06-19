import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const nextDir = join(appDir, ".next");
const standaloneDir = join(nextDir, "standalone");

if (!existsSync(standaloneDir)) {
  console.warn("[prepare-standalone] .next/standalone not found; skipping.");
  process.exit(0);
}

const standaloneNextDir = join(standaloneDir, ".next");
mkdirSync(standaloneNextDir, { recursive: true });

const staticSrc = join(nextDir, "static");
const staticDest = join(standaloneNextDir, "static");
if (existsSync(staticSrc)) {
  rmSync(staticDest, { force: true, recursive: true });
  cpSync(staticSrc, staticDest, { recursive: true });
}

const publicSrc = join(appDir, "public");
const publicDest = join(standaloneDir, "public");
if (existsSync(publicSrc)) {
  rmSync(publicDest, { force: true, recursive: true });
  cpSync(publicSrc, publicDest, { recursive: true });
}

console.log("[prepare-standalone] copied public/ and .next/static into .next/standalone");
