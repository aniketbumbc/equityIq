"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

const EXAMPLES = [
  { ticker: "MSFT", text: "Is Microsoft overvalued right now?" },
  { ticker: "NVDA", text: "What is the outlook for Nvidia this year?" },
  { ticker: "TSLA", text: "Should I sell Tesla stock?" },
];

// An illustrative run for the preview card, not live data.
const PREVIEW = [
  { name: "Supervisor", meta: "Agents chosen" },
  { name: "Historic data", meta: "Price history" },
  { name: "Company news", meta: "Recent articles" },
  { name: "Market sentiment", meta: "Broad mood" },
  { name: "Technical indicators", meta: "RSI · MACD · ATR" },
  { name: "Analysis", meta: "Draft ready" },
  { name: "Your review", meta: "Approve or revise" },
];

const FEATURES: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Seven agents, one question",
    body: "A supervisor picks the agents your question needs: price history, company news, market mood, and indicators.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="12" cy="18" r="2.5" />
        <path d="M8 7.5 10.8 16M16 7.5 13.2 16M8.5 6h7" />
      </svg>
    ),
  },
  {
    title: "You approve the draft",
    body: "The run pauses before the final report. Nothing is finalised until you approve it or ask for changes.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </svg>
    ),
  },
  {
    title: "Revise with plain feedback",
    body: "Ask for five years of weekly prices or a news focus. Only the agents that need new data run again.",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 5v6h-6" />
      </svg>
    ),
  },
];

type LandingProps = {
  draft: string;
  onDraft: (value: string) => void;
  onStart: (query: string) => void;
};

export function Landing({ draft, onDraft, onStart }: LandingProps) {
  return (
    <main className="landing">
      <div className="glow" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="grid-bg" aria-hidden="true" />

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <i className="pulse" /> Multi-agent stock research
          </p>
          <h1>
            Research any stock, <span className="grad">reviewed by you.</span>
          </h1>
          <p className="lede">
            Ask one question. Agents gather prices, news, market mood, and indicators, draft a forecast, and wait for
            your approval before the final report.
          </p>

          <form
            className="search"
            onSubmit={(event) => {
              event.preventDefault();
              onStart(draft.trim() || "Should I buy Apple stock");
            }}
          >
            <label htmlFor="question" className="sr-only">
              Your question
            </label>
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="question"
              value={draft}
              placeholder="Should I buy Apple stock?"
              autoComplete="off"
              onChange={(event) => onDraft(event.target.value)}
            />
            <button type="submit" className="btn primary go">
              Research <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="fine">Research, not financial advice. A run takes about a minute.</p>

          <div className="examples">
            <span className="kicker">Try a question</span>
            <div>
              {EXAMPLES.map((example, index) => (
                <button
                  key={example.text}
                  type="button"
                  className="example"
                  style={{ "--i": index } as CSSProperties}
                  onClick={() => onDraft(example.text)}
                >
                  <span className="mono">{example.ticker}</span>
                  {example.text}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Preview />
      </section>

      <section className="features" id="features" aria-label="How EquityIQ works">
        {FEATURES.map((feature, index) => (
          <article key={feature.title} style={{ "--i": index } as CSSProperties}>
            <span className="feature-icon">{feature.icon}</span>
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function Preview() {
  const [tick, setTick] = useState(0);
  const total = PREVIEW.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Show the finished run once instead of looping.
      const timer = window.setTimeout(() => setTick(total), 0);
      return () => window.clearTimeout(timer);
    }
    // Two extra ticks hold the finished state before the loop restarts.
    const timer = window.setInterval(() => setTick((value) => (value + 1) % (total + 3)), 900);
    return () => window.clearInterval(timer);
  }, [total]);

  const finished = Math.min(tick, total);
  return (
    <aside className="preview" aria-label="Example of a research run">
      <header>
        <span className="preview-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="kicker">Example run</span>
      </header>
      <p className="preview-q">“Should I buy Apple stock?”</p>
      <div className="preview-bar" aria-hidden="true">
        <span style={{ width: `${(finished / total) * 100}%` }} />
      </div>
      <ul>
        {PREVIEW.map((row, index) => {
          const status = index < tick ? "done" : index === tick ? "run" : "wait";
          const review = index === total - 1;
          return (
            <li key={row.name} className={`pv-${status}${review ? " pv-review" : ""}`}>
              <span className={`dot ${status === "done" ? "ok" : status}`}>{status === "done" ? "✓" : null}</span>
              <span className="pv-name">{row.name}</span>
              <em>{status === "done" ? row.meta : status === "run" ? "Working" : ""}</em>
            </li>
          );
        })}
      </ul>
      <svg className="preview-spark" viewBox="0 0 300 60" aria-hidden="true" key={tick >= total ? "on" : "off"}>
        <polyline
          pathLength={1}
          className={tick >= total ? "draw" : ""}
          points="0,48 30,44 60,46 90,36 120,38 150,28 180,32 210,20 240,24 270,12 300,14"
        />
      </svg>
    </aside>
  );
}
