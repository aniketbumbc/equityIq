"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type FlowStep = {
  agent: string;
  title: string;
  calls: string;
  output: string;
  optional?: boolean;
};

const STEP_MS = 1100;

// Sample outputs show the shape of each agent's result. They are illustrative, not live data.
const FLOW: FlowStep[] = [
  { agent: "supervisor", title: "Supervisor", calls: "GPT-4o mini", output: "Stock question ✓ · 5 agents chosen" },
  { agent: "company_name_agent", title: "Company name", calls: "GPT-4o mini", output: "“Apple”" },
  { agent: "historic_data_agent", title: "Historic data", calls: "Twelve Data", output: "AAPL · ~250 daily bars" },
  { agent: "company_news_agent", title: "Company news", calls: "Tavily search", output: "3 recent articles" },
  { agent: "market_sentiment_agent", title: "Market sentiment", calls: "Tavily search", output: "Broad market mood" },
  { agent: "technical_indicator_agent", title: "Technical indicators", calls: "Alpha Vantage · Twelve Data", output: "RSI · MACD · ATR" },
  { agent: "analyasis_agent", title: "Analysis", calls: "GPT-4o mini", output: "Draft: direction, confidence, risks" },
  { agent: "human_in_the_loop", title: "Your review", calls: "You", output: "Approve · Revise · Reject" },
  {
    agent: "revision_planner",
    title: "Revision planner",
    calls: "GPT-4o mini",
    output: "Re-runs only the agents it needs → new draft",
    optional: true,
  },
  { agent: "final_response_agent", title: "Final report", calls: "GPT-4o mini", output: "Reviewed report ready" },
];

export function HowItWorks({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    // Reduced motion shows the finished flow at once; otherwise each step lights up in turn, once.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setInterval(
      () =>
        setActive((value) => {
          const next = reduced ? FLOW.length : value + 1;
          if (next >= FLOW.length) window.clearInterval(timer);
          return Math.min(next, FLOW.length);
        }),
      reduced ? 0 : STEP_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // Keep the running step visible when the list scrolls on short screens.
    document.querySelector(".hw-run")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const finished = active >= FLOW.length;

  // Portal to <body>: the sticky header's backdrop-filter would otherwise clip a fixed overlay.
  return createPortal(
    <div className="hw-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="hw-dialog" role="dialog" aria-modal="true" aria-labelledby="hw-title">
        <header className="hw-head">
          <div>
            <p className="kicker accent">How it works</p>
            <h2 id="hw-title">From your question to a reviewed report</h2>
          </div>
          <button ref={closeRef} type="button" className="hw-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="hw-progress" aria-hidden="true">
          <span style={{ width: `${(active / FLOW.length) * 100}%` }} />
        </div>

        <ol className="hw-flow">
          {FLOW.map((step, index) => {
            const state = index < active ? "done" : index === active ? "run" : "wait";
            return (
              <li key={step.agent} className={`hw-${state}${step.optional ? " hw-optional" : ""}`}>
                <span className="hw-dot">{state === "done" ? "✓" : index + 1}</span>
                <div className="hw-main">
                  <div className="hw-line">
                    <strong>{step.title}</strong>
                    {step.optional ? <span className="hw-if">if you revise</span> : null}
                    <code>{step.agent}</code>
                  </div>
                  <div className="hw-sub">
                    <span className="hw-calls">{step.calls}</span>
                    <span className="hw-out">
                      {state === "done" ? step.output : state === "run" ? "Working…" : ""}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="hw-foot" aria-live="polite">
          {finished ? "Done: question in, reviewed report out." : "Running an example question…"}
          <span className="muted"> Sample outputs are illustrative.</span>
        </p>
      </div>
    </div>,
    document.body,
  );
}
