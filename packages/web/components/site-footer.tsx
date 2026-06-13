import Link from "next/link";
import { getPublicConfig } from "../lib/config";
import { currentPackage } from "../lib/live-proof";

// Official Sui droplet (simple-icons), used only for the "Built on Sui" badge.
const SuiMark = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.636 10.009a7.16 7.16 0 0 1 1.565 4.474 7.2 7.2 0 0 1-1.608 4.53l-.087.106-.023-.135a7 7 0 0 0-.07-.349c-.502-2.21-2.142-4.106-4.84-5.642-1.823-1.034-2.866-2.278-3.14-3.693-.177-.915-.046-1.834.209-2.62.254-.787.631-1.446.953-1.843l1.05-1.284a.46.46 0 0 1 .713 0l5.28 6.456zm1.66-1.283L12.26.123a.336.336 0 0 0-.52 0L4.704 8.726l-.023.029a9.33 9.33 0 0 0-2.07 5.872C2.612 19.803 6.816 24 12 24s9.388-4.197 9.388-9.373a9.32 9.32 0 0 0-2.07-5.871zM6.389 9.981l.63-.77.018.142q.023.17.055.34c.408 2.136 1.862 3.917 4.294 5.297 2.114 1.203 3.345 2.586 3.7 4.103a5.3 5.3 0 0 1 .109 1.801l-.004.034-.03.014A7.2 7.2 0 0 1 12 21.67c-3.976 0-7.2-3.218-7.2-7.188 0-1.705.594-3.27 1.587-4.503z" />
  </svg>
);

export function SiteFooter() {
  const config = getPublicConfig();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link className="brand" href="/" aria-label="Bequest home">
            <span>Bequest</span>
          </Link>
          <p>
            Programmable conditional transfers on Sui. Hand assets to anyone —
            released only when an on-chain condition is proven.
          </p>
          <span className="built-on-sui">
            {SuiMark}
            Built on Sui
          </span>
        </div>

        <div className="footer-col">
          <h4>Product</h4>
          <Link href="/demo">Try the demo</Link>
          <Link href="/create">Create a transfer</Link>
          <Link href="/estates">Estates dashboard</Link>
        </div>

        <div className="footer-col">
          <h4>Learn</h4>
          <Link href="/#how">How it works</Link>
          <Link href="/proof">Proof board</Link>
          {config.demoVideoUrl ? (
            <a href={config.demoVideoUrl} target="_blank" rel="noreferrer">
              Demo video
            </a>
          ) : null}
        </div>

        <div className="footer-col">
          <h4>Resources</h4>
          <a href={currentPackage.explorerUrl} target="_blank" rel="noreferrer">
            Package on SuiScan
          </a>
          {config.githubUrl ? (
            <a href={config.githubUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
          ) : null}
          {config.docsUrl ? (
            <a href={config.docsUrl} target="_blank" rel="noreferrer">
              Docs
            </a>
          ) : null}
          {config.xUrl ? (
            <a href={config.xUrl} target="_blank" rel="noreferrer">
              X / Twitter
            </a>
          ) : null}
        </div>
      </div>
      <div className="site-footer-base">
        Sui testnet demo · no real funds · not legal, tax, or financial advice.
      </div>
    </footer>
  );
}
