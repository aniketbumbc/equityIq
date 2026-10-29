"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatDuration } from "@/lib/format";
import type { RunState, StepState } from "@/lib/run";
import { RESEARCH_STEPS, STEP_LABEL } from "@/lib/steps";
import { useResearch } from "@/lib/use-research";
import { AgentCard, MiniRow } from "./agent-card";
import { AutoApprove, Dot, FinalWorking, indexOf, railStatus, ReportCard } from "./desk";
import { Header } from "./header";
import { reportPlainText } from "./report";

type Tool = { id: string; label: string; detail: string; icon: ReactNode };

const TOOLS: Tool[] = [
  {
    id: "historic_data_agent",
    label: "Price history",
    detail: "Daily prices for the past year · Twelve Data",
    icon: <path d="M3 17l5-5 4 4 8-9M15 7h5v5" />,
  },
  {
    id: "company_news_agent",
    label: "Company news",
    detail: "Recent articles about the company · Tavily",
    icon: <path d="M5 5h11v14H6a1 1 0 0 1-1-1V5Zm11 4h3v9a1 1 0 0 1-1 1h-2M8 9h5M8 12h5M8 15h3" />,
  },
  {
    id: "market_sentiment_agent",
    label: "Market sentiment",
    detail: "Mood of the broad stock market · Tavily",
    icon: <path d="M4 15a8 8 0 0 1 16 0M12 15l3.5-4M4 19h16" />,
  },
  {
    id: "technical_indicator_agent",
    label: "Technical indicators",
    detail: "Latest RSI, MACD, and ATR",
    icon: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  },
];

const SUGGESTIONS = [
  { text: "Should I buy Apple stock?", tools: [] as string[] },
  { text: "What is the latest news on Nvidia?", tools: ["company_news_agent"] },
  { text: "How has Tesla's price moved this year?", tools: ["historic_data_agent", "technical_indicator_agent"] },
];

type Turn = { id: number; tools: string[]; run: RunState };

export function Chat() {
  const research = useResearch();
  const { run } = research;
  const [history, setHistory] = useState<Turn[]>([]);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const turnId = useRef(0);
  const sendRef = useRef(send);
  const askedFromUrl = useRef(false);

  const busy = run?.phase === "running" || run?.phase === "revising" || run?.phase === "finishing";
  const reviewing = run?.phase === "review";
  const finishedSteps = run?.steps.filter((step) => step.status === "done" || step.status === "failed").length ?? 0;

  useEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    // A question from the landing page arrives as ?q=; ask it once, then drop it so a refresh doesn't re-run it.
    if (askedFromUrl.current) return;
    askedFromUrl.current = true;
    const query = new URLSearchParams(window.location.search).get("q")?.trim();
    if (!query) return;
    window.history.replaceState(null, "", "/chat");
    sendRef.current(query, []);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [history.length, run?.phase, finishedSteps]);

  function send(question = text, picked = tools) {
    const value = question.trim();
    if (!value || busy) return;
    setText("");
    if (reviewing) {
      // While a draft waits for review, a reply is revision feedback.
      research.resume("revise", value);
      return;
    }
    if (run) {
      const finished = run;
      setHistory((prev) => [...prev, { id: ++turnId.current, tools: activeTools, run: finished }]);
    }
    setActiveTools(picked);
    research.start(value, picked);
  }

  function newChat() {
    research.reset();
    setHistory([]);
    setActiveTools([]);
    setText("");
  }

  const empty = !run && !history.length;
  return (
    <div className="chat-page">
      <Header run={run} onReset={newChat} page="chat" />
      <main className="chat-scroll">
        <div className="chat-thread">
          {empty ? (
            <section className="chat-empty">
              <img src="/logo.png" alt="" width={48} height={48} />
              <h1>
                What should we <span className="grad">research</span> today?
              </h1>
              <p className="muted">
                Ask about any stock. Pick the tools below, or leave it on Auto and the supervisor chooses.
              </p>
              <div className="chat-suggest">
                {SUGGESTIONS.map((item) => (
                  <button key={item.text} type="button" onClick={() => send(item.text, item.tools)}>
                    <strong>{item.text}</strong>
                    <span className="muted small">
                      {item.tools.length ? item.tools.map(toolLabel).join(" · ") : "Auto tools"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {history.map((turn) => (
            <Exchange key={turn.id} run={turn.run} tools={turn.tools} now={research.now} live={false} />
          ))}
          {run ? (
            <Exchange
              run={run}
              tools={activeTools}
              now={research.now}
              live
              autoStopped={research.autoStopped}
              onStopAuto={research.stopAuto}
              onApprove={() => research.resume("approve")}
              onReject={() => research.resume("reject")}
              onRetry={() => send(run.query, activeTools)}
            />
          ) : null}
          <div ref={endRef} className="chat-end" />
        </div>
      </main>

      <Composer
        text={text}
        tools={tools}
        busy={busy}
        reviewing={reviewing}
        onText={(value) => {
          setText(value);
          if (reviewing && value.trim()) research.stopAuto();
        }}
        onTools={setTools}
        onSend={() => send()}
      />
    </div>
  );
}

function Exchange({
  run,
  tools,
  now,
  live,
  autoStopped = false,
  onStopAuto,
  onApprove,
  onReject,
  onRetry,
}: {
  run: RunState;
  tools: string[];
  now: number;
  live: boolean;
  autoStopped?: boolean;
  onStopAuto?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const research = run.steps.filter(
    (step) => RESEARCH_STEPS.some((item) => item.id === step.id) && step.status !== "skipped",
  );
  const finished = research.filter((step) => step.status === "done" || step.status === "failed").length;
  const working = run.phase === "running" || run.phase === "revising" || run.phase === "finishing";

  return (
    <article className="exchange">
      <div className="msg-user">
        <p>{run.query}</p>
        <div className="msg-tools">
          {tools.length ? (
            tools.map((id) => <span key={id}>{toolLabel(id)}</span>)
          ) : (
            <span className="auto-tag">Auto tools</span>
          )}
        </div>
      </div>

      <div className="msg-bot">
        <span className="bot-avatar" aria-hidden="true">
          <img src="/logo.png" alt="" width={22} height={22} />
        </span>
        <div className="bot-body">
          <p className={`bot-status${working ? " is-working" : ""}`}>
            {working ? <i className="spin" /> : null}
            {railStatus(run, finished, research.length)}
            {working ? <span className="mono muted"> · {formatDuration(now - run.startedAt)}</span> : null}
          </p>

          {research.length ? (
            <div className="bot-agents">
              {research.map((step) => (
                <span key={step.id} className={`agent-chip ${step.status}`}>
                  <Dot status={step.status} />
                  {STEP_LABEL[step.id]}
                </span>
              ))}
            </div>
          ) : null}

          <Evidence run={run} />

          {run.phase === "review" && live ? (
            <section className="bot-review">
              <p className="kicker accent">Your review{run.revision ? ` · Draft ${run.revision + 1}` : ""}</p>
              <p>
                <strong>The draft is ready.</strong> Approve it for the final report, reject it, or reply below to ask
                for changes.
              </p>
              <AutoApprove run={run} now={now} stopped={autoStopped} onStop={onStopAuto ?? (() => undefined)} />
              {confirmReject ? (
                <div className="confirm">
                  <strong>Reject the draft and stop this run?</strong>
                  <div className="actions">
                    <button type="button" className="btn ink" onClick={onReject}>
                      Reject and stop
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirmReject(false)}>
                      Keep reviewing
                    </button>
                  </div>
                </div>
              ) : (
                <div className="actions">
                  <button type="button" className="btn primary" onClick={onApprove}>
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setConfirmReject(true);
                      onStopAuto?.();
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}
            </section>
          ) : null}
          {run.phase === "review" && !live ? <p className="note">Left without a review decision.</p> : null}

          {run.phase === "finishing" ? <FinalWorking run={run} /> : null}
          {run.phase === "report" ? (
            <ReportCard
              run={run}
              copied={copied}
              onCopy={async () => {
                await navigator.clipboard.writeText(reportPlainText(String(run.facts.final_response || "")));
                setCopied(true);
              }}
            />
          ) : null}
          {run.phase === "blocked" ? (
            <p className="note">{run.facts.guardrails_reason || "This question is not about a stock. Try asking about a company."}</p>
          ) : null}
          {run.phase === "stopped" ? <p className="note">You rejected the draft, so no final report was written.</p> : null}
          {run.phase === "failed" ? (
            <div className="stack">
              <pre className="err">{run.error}</pre>
              {live ? (
                <div className="actions">
                  <button type="button" className="btn primary" onClick={onRetry}>
                    Try again
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Evidence({ run }: { run: RunState }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const steps = run.steps.filter(
    (step) =>
      RESEARCH_STEPS.some((item) => item.id === step.id) &&
      step.id !== "supervisor" &&
      (step.status === "done" || step.status === "failed"),
  );
  if (!steps.length) return null;
  // The draft stays open while it waits for review; everything else is one click away.
  const isOpen = (step: StepState) =>
    open[step.id] ?? (run.phase === "review" && step.id === "analyasis_agent");
  return (
    <div className="stack bot-evidence">
      {steps.map((step) =>
        isOpen(step) ? (
          <AgentCard
            key={step.id}
            step={step}
            facts={run.facts}
            index={indexOf(step.id)}
            open
            onToggle={() => setOpen((prev) => ({ ...prev, [step.id]: false }))}
          />
        ) : (
          <MiniRow
            key={step.id}
            step={step}
            facts={run.facts}
            index={indexOf(step.id)}
            open={false}
            onToggle={() => setOpen((prev) => ({ ...prev, [step.id]: true }))}
          />
        ),
      )}
    </div>
  );
}

function Composer({
  text,
  tools,
  busy,
  reviewing,
  onText,
  onTools,
  onSend,
}: {
  text: string;
  tools: string[];
  busy: boolean;
  reviewing: boolean;
  onText: (value: string) => void;
  onTools: (value: string[]) => void;
  onSend: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setMenu(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
  }, [text]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSend();
    }
  }

  function toggle(id: string) {
    onTools(tools.includes(id) ? tools.filter((item) => item !== id) : TOOLS.filter((tool) => tool.id === id || tools.includes(tool.id)).map((tool) => tool.id));
  }

  const placeholder = reviewing
    ? "Reply with changes to revise the draft…"
    : busy
      ? "Researching… you can type your next question"
      : "Ask about a stock…";

  return (
    <div className="composer-dock">
      <div className={`composer${reviewing ? " is-review" : ""}`} ref={boxRef}>
        {menu ? (
          <div className="tool-menu" role="menu" aria-label="Research tools">
            <p className="kicker">Research tools</p>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!tools.length}
              className={!tools.length ? "on" : ""}
              onClick={() => onTools([])}
            >
              <span className="tool-icon auto">A</span>
              <span>
                <strong>Auto</strong>
                <span className="muted small">The supervisor picks the tools for your question</span>
              </span>
              <span className="tool-check">{!tools.length ? "✓" : ""}</span>
            </button>
            {TOOLS.map((tool) => {
              const on = tools.includes(tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  className={on ? "on" : ""}
                  onClick={() => toggle(tool.id)}
                >
                  <span className="tool-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      {tool.icon}
                    </svg>
                  </span>
                  <span>
                    <strong>{tool.label}</strong>
                    <span className="muted small">{tool.detail}</span>
                  </span>
                  <span className="tool-check">{on ? "✓" : ""}</span>
                </button>
              );
            })}
            <p className="fine">Analysis and your review always run.</p>
          </div>
        ) : null}

        <label htmlFor="question" className="sr-only">
          {reviewing ? "Revision feedback" : "Your question"}
        </label>
        <textarea
          id="question"
          ref={inputRef}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="composer-bar">
          {reviewing ? (
            <span className="composer-hint">Sends as revision feedback</span>
          ) : (
            <>
              <button
                type="button"
                className={`tools-btn${menu ? " open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu((value) => !value)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                  <circle cx="16" cy="7" r="2" />
                  <circle cx="10" cy="17" r="2" />
                </svg>
                Tools
              </button>
              <div className="tool-chips">
                {tools.length ? (
                  tools.map((id) => (
                    <button key={id} type="button" onClick={() => toggle(id)} aria-label={`Remove ${toolLabel(id)}`}>
                      {toolLabel(id)} <span aria-hidden="true">×</span>
                    </button>
                  ))
                ) : (
                  <span className="auto-tag">Auto</span>
                )}
              </div>
            </>
          )}
          <button
            type="button"
            className="send-btn"
            onClick={onSend}
            disabled={!text.trim() || busy}
            aria-label={reviewing ? "Send revision feedback" : "Send question"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
      <p className="composer-fine">Research, not financial advice. Enter to send · Shift+Enter for a new line.</p>
    </div>
  );
}

function toolLabel(id: string) {
  return TOOLS.find((tool) => tool.id === id)?.label ?? STEP_LABEL[id] ?? id;
}
