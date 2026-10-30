"use client";

import { useState } from "react";
import {
  formatPercent,
  formatPrice,
  historyRange,
  intervalWord,
  parseHistory,
  parseIndicators,
  parseNews,
} from "@/lib/format";
import type { Facts, StepState } from "@/lib/run";
import { STEP_LABEL } from "@/lib/steps";
import { ReportBody } from "./report";

type CardProps = {
  step: StepState;
  facts: Facts;
  index: string;
  open: boolean;
  onToggle: () => void;
};

export function AgentCard({ step, facts, index, open, onToggle }: CardProps) {
  const working = step.status === "working";
  const failed = step.status === "failed";
  const gap = !failed && hasDataGap(step, facts);
  const ok = isGoodOutput(step, facts);
  return (
    <article
      className={`card${working ? " is-working" : ""}${failed ? " is-failed" : ""}${gap ? " has-gap" : ""}${ok ? " is-ok" : ""}`}
    >
      <header className="card-head">
        <span className="idx">{index}</span>
        <h2>{step.id === "analyasis_agent" ? "Analysis" : STEP_LABEL[step.id]}</h2>
        {step.id === "historic_data_agent" && facts.symbol ? <span className="ticker">{facts.symbol}</span> : null}
        {step.id === "market_sentiment_agent" ? (
          <span className="muted small">Broad stock market, not this company</span>
        ) : null}
        {step.id === "analyasis_agent" && step.status === "done" ? <span className="tag">Draft</span> : null}
        {gap ? <span className="tag bad-tag">Missing data</span> : null}
        <Status step={step} gap={gap} />
      </header>
      {open ? <div className="card-body">{bodyFor(step, facts)}</div> : null}
      {step.status === "done" || step.status === "failed" ? (
        <button type="button" className="text-btn" onClick={onToggle}>
          {open ? "Hide" : "Show"}
        </button>
      ) : null}
    </article>
  );
}

export function MiniRow({ step, facts, index, onToggle }: CardProps) {
  return (
    <div className={`mini${hasDataGap(step, facts) ? " has-gap" : ""}${isGoodOutput(step, facts) ? " is-ok" : ""}`}>
      <span className="idx">{index}</span>
      <span className="mini-name">{STEP_LABEL[step.id]}</span>
      <span className="mini-sum">{summaryFor(step, facts)}</span>
      <button type="button" className="text-btn" onClick={onToggle}>
        Show
      </button>
    </div>
  );
}

function Status({ step, gap }: { step: StepState; gap: boolean }) {
  if (step.status === "working") {
    return (
      <span className="status run">
        <i className="spin" /> Working
      </span>
    );
  }
  if (step.status === "failed") return <span className="status fail">Failed</span>;
  if (step.status === "done" && gap) return <span className="status fail">Incomplete</span>;
  if (step.status === "done") return <span className="status ok">Done</span>;
  return null;
}

function bodyFor(step: StepState, facts: Facts) {
  if (step.status === "failed") {
    return (
      <div className="stack">
        <p>
          <strong>This agent returned an error.</strong>
        </p>
        <pre className="err">{step.error}</pre>
        <p className="muted">The run continues with the other agents.</p>
      </div>
    );
  }
  if (step.status === "working") {
    return (
      <div className="stack">
        <p className="muted">{workingCopy(step.id, facts)}</p>
        <div className="skeleton" />
        <div className="skeleton short" />
      </div>
    );
  }
  switch (step.id) {
    case "supervisor":
      return <Supervisor facts={facts} />;
    case "company_name_agent":
      return (
        <p>
          <span className="kicker">Extracted name</span>
          <span className="lead">{facts.company_name || "—"}</span>
        </p>
      );
    case "historic_data_agent":
      return <History facts={facts} />;
    case "company_news_agent":
      return <SearchResults raw={facts.company_news} empty="No company news was returned." />;
    case "market_sentiment_agent":
      return <SearchResults raw={facts.market_sentiment} empty="No market sentiment was returned." />;
    case "technical_indicator_agent":
      return <Indicators facts={facts} />;
    case "analyasis_agent":
      return (
        <ReportBody
          raw={String(facts.analysis_results || "")}
          plainNote="Shown as plain text because this draft was not JSON."
        />
      );
    default:
      return null;
  }
}

function Supervisor({ facts }: { facts: Facts }) {
  const names = (facts.selected_agents || []).map((id) => STEP_LABEL[id] || id);
  return (
    <div className="stack">
      <p>
        <span className="kicker">Decision</span>
        <span className="lead">{facts.guardrails_allowed === false ? "Blocked" : "Allowed"}</span>
      </p>
      {names.length ? (
        <p>
          <span className="kicker">Agents chosen</span>
          <span>{names.join(", ")}</span>
        </p>
      ) : null}
      {facts.supervisor_reasoning ? <p className="prose">{facts.supervisor_reasoning}</p> : null}
      {facts.guardrails_reason && facts.guardrails_allowed === false ? (
        <p className="prose">{facts.guardrails_reason}</p>
      ) : null}
    </div>
  );
}

function History({ facts }: { facts: Facts }) {
  const history = parseHistory(facts.historical_data);
  if (!history) {
    return (
      <p className="missing">
        {typeof facts.historical_data === "string" ? facts.historical_data : "No price history was returned."}
      </p>
    );
  }
  const changeClass = history.change == null ? "" : history.change >= 0 ? "up" : "down";
  return (
    <div className="stack">
      <div className="stats">
        <div>
          <div className="kicker">Latest close</div>
          <div className="stat">{formatPrice(history.latestClose)}</div>
          <div className="mono muted small">{history.latestDate}</div>
        </div>
        <div>
          <div className="kicker">Period change</div>
          <div className={`stat ${changeClass}`}>{formatPercent(history.change)}</div>
          <div className="mono muted small">
            {history.firstDate} → {history.latestDate}
          </div>
        </div>
        <div>
          <div className="kicker">Period high / low</div>
          <div className="stat">
            {formatPrice(history.high)} <span className="muted">/</span> {formatPrice(history.low)}
          </div>
        </div>
        <div>
          <div className="kicker">Bars</div>
          <div className="stat">{history.count}</div>
          <div className="muted small">{intervalWord(history.interval)}</div>
        </div>
      </div>
      <CloseChart bars={history.bars} />
    </div>
  );
}

function CloseChart({ bars }: { bars: { datetime: string; close: number }[] }) {
  const width = 640;
  const height = 148;
  const pad = 8;
  const sampled = bars.length > 240 ? bars.filter((_, index) => index % Math.ceil(bars.length / 240) === 0) : bars;
  const closes = sampled.map((bar) => bar.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const points = sampled
    .map((bar, index) => {
      const x = pad + (index / Math.max(sampled.length - 1, 1)) * (width - pad * 2);
      const y = pad + (1 - (bar.close - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = sampled[0]?.datetime.slice(0, 7) ?? "";
  const last = sampled[sampled.length - 1]?.datetime.slice(0, 7) ?? "";
  const area = `${pad},${height - pad} ${points} ${width - pad},${height - pad}`;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Close price over the period">
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon className="area" points={area} fill="url(#chart-fill)" />
        <polyline points={points} pathLength={1} />
      </svg>
      <figcaption>
        <span>{first}</span>
        <span>{last}</span>
      </figcaption>
    </figure>
  );
}

function SearchResults({ raw, empty }: { raw: unknown; empty: string }) {
  const items = parseNews(raw);
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return <p className="prose missing">{typeof raw === "string" && raw ? raw : empty}</p>;
  const visible = showAll ? items : items.slice(0, 3);
  return (
    <div className="stack">
      {visible.map((item) => (
        <article key={`${item.title}-${item.url}`} className="news">
          <h3>{item.url ? <a href={item.url}>{item.title}</a> : item.title}</h3>
          {item.body ? <p>{item.body}</p> : null}
        </article>
      ))}
      {items.length > 3 ? (
        <button type="button" className="btn" onClick={() => setShowAll((open) => !open)}>
          {showAll ? "Show less" : `Show ${items.length - 3} more`}
        </button>
      ) : null}
    </div>
  );
}

function Indicators({ facts }: { facts: Facts }) {
  const readings = parseIndicators(facts.technical_indicator);
  return (
    <div className="indicator-list">
      {readings.map((reading) => (
        <div key={reading.label}>
          <div className="kicker">{reading.label}</div>
          <div className={`stat${reading.missing ? " missing" : ""}`}>{reading.value}</div>
          {reading.detail ? <div className={`small ${reading.missing ? "missing" : "muted"}`}>{reading.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** True when an agent failed, or finished without the data it was meant to fetch. */
export function hasDataGap(step: StepState, facts: Facts): boolean {
  if (step.status === "failed") return true;
  if (step.status !== "done") return false;
  switch (step.id) {
    case "historic_data_agent":
      return !parseHistory(facts.historical_data);
    case "company_news_agent":
      return !parseNews(facts.company_news).length;
    case "market_sentiment_agent":
      return !parseNews(facts.market_sentiment).length;
    case "technical_indicator_agent":
      return parseIndicators(facts.technical_indicator).some((reading) => reading.missing);
    default:
      return false;
  }
}

/**
 * True when an agent finished with all of its data, so its output shows in green.
 * The analysis draft is left out: a green "bearish" forecast would read as good news.
 */
export function isGoodOutput(step: StepState, facts: Facts): boolean {
  return step.status === "done" && step.id !== "analyasis_agent" && !hasDataGap(step, facts);
}

export function summaryFor(step: StepState, facts: Facts): string {
  if (step.status === "failed") return "Failed";
  if (step.status === "working") return "Working";
  if (step.status === "skipped") return "Not run";
  if (step.status === "waiting") return "Waiting";
  switch (step.id) {
    case "supervisor": {
      const count = facts.selected_agents?.length ?? 0;
      return facts.guardrails_allowed === false ? "Blocked" : `Allowed · ${count} agents chosen`;
    }
    case "company_name_agent":
      return facts.company_name || "Done";
    case "historic_data_agent": {
      const history = parseHistory(facts.historical_data);
      if (!history) return facts.symbol || "Done";
      return `${facts.symbol || history.symbol} ${formatPrice(history.latestClose)} · ${formatPercent(history.change)} since ${history.firstDate.slice(0, 7)}`;
    }
    case "company_news_agent": {
      const count = parseNews(facts.company_news).length;
      return count ? `${count} ${count === 1 ? "article" : "articles"}` : "No articles found";
    }
    case "market_sentiment_agent":
      return parseNews(facts.market_sentiment).length ? "Broad market" : "No results found";
    case "technical_indicator_agent":
      return parseIndicators(facts.technical_indicator)
        .map((reading) => `${reading.label} ${reading.missing ? "missing" : reading.value}`)
        .join(" · ");
    case "analyasis_agent":
      return "Draft ready";
    case "review":
      return "Paused";
    default:
      return "Done";
  }
}

function workingCopy(id: StepState["id"], facts: Facts): string {
  switch (id) {
    case "supervisor":
      return "Checking that this is a stock question and choosing agents…";
    case "company_name_agent":
      return "Reading the company name from your question…";
    case "historic_data_agent":
      return `Looking up the ticker and ${historyRange(facts.data_settings)}…`;
    case "company_news_agent":
      return "Searching recent company news…";
    case "market_sentiment_agent":
      return "Searching the broad stock-market mood…";
    case "technical_indicator_agent":
      return "Loading monthly RSI, monthly MACD, and daily ATR…";
    case "analyasis_agent":
      return facts.human_feedback && !facts.approved
        ? "Revising the draft with your feedback…"
        : "Writing the forecast draft…";
    case "final_response_agent":
      return "Writing the final report from the draft and your decision…";
    default:
      return "Working…";
  }
}
