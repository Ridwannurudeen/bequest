"use client";

import { useState } from "react";

const flows = [
  {
    id: "owner",
    label: "Owner setup",
    title: "Sarah creates an estate",
    action: "Create estate",
    result: "Estate active: heirs named, assets escrowed, letter encrypted.",
    calls: ["createEstate", "setHeirs", "deposit", "uploadWishes"],
    timeline: ["Google sign-in", "Maya 70% · Noah 30%", "5,000 SUI + NFT escrowed", "Letter sealed"]
  },
  {
    id: "heir",
    label: "Heir claim",
    title: "Maya claims with Google",
    action: "Claim assets",
    result: "Sponsored claim path ready: assets arrive, letter decrypts after trigger.",
    calls: ["readEstate", "claim", "decryptWishes"],
    timeline: ["Claim banner", "Google sign-in", "Sponsored claim", "Letter unlock"]
  },
  {
    id: "executor",
    label: "Executor",
    title: "Aunt Lina pauses a false trigger",
    action: "Pause pending estate",
    result: "Pending trigger paused. Executor did not move assets.",
    calls: ["readEstate", "executorOverride"],
    timeline: ["Pending trigger", "Grace window visible", "Pause action", "Estate returns active"]
  }
] as const;

export function FlowSimulator() {
  const [activeId, setActiveId] = useState<(typeof flows)[number]["id"]>("owner");
  const [result, setResult] = useState<string>(flows[0].result);
  const activeFlow = flows.find((flow) => flow.id === activeId) ?? flows[0];

  function chooseFlow(id: (typeof flows)[number]["id"]) {
    const next = flows.find((flow) => flow.id === id) ?? flows[0];
    setActiveId(next.id);
    setResult(next.result);
  }

  return (
    <section className="simulator" aria-label="Clickable Bequest flow simulator">
      <div className="simulator-copy">
        <p className="kicker">Clickable mocked flows</p>
        <h2>Prototype the family story before the SDK is live.</h2>
        <p>
          These interactions are intentionally mocked. They exercise the exact product states
          Lane B owns while Enoki credentials and the real testnet SDK are still being wired.
        </p>
      </div>

      <div className="simulator-panel">
        <div className="flow-tabs" role="tablist" aria-label="Bequest flow tabs">
          {flows.map((flow) => (
            <button
              aria-selected={flow.id === activeId}
              className={flow.id === activeId ? "active" : ""}
              key={flow.id}
              onClick={() => chooseFlow(flow.id)}
              role="tab"
              type="button"
            >
              {flow.label}
            </button>
          ))}
        </div>

        <article className="mock-screen">
          <span className="mock-label">Demo estate · Grandma Sarah</span>
          <h3>{activeFlow.title}</h3>
          <ol>
            {activeFlow.timeline.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <button className="claim-button" onClick={() => setResult(activeFlow.result)} type="button">
            {activeFlow.action}
          </button>
          <div className="mock-result" aria-live="polite">
            {result}
          </div>
        </article>

        <div className="call-stack" aria-label="SDK calls used by this flow">
          {activeFlow.calls.map((call) => (
            <code key={call}>{call}()</code>
          ))}
        </div>
      </div>
    </section>
  );
}
