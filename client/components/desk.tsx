"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatClock, formatDuration } from "@/lib/format";
import { applyEvent, beginResume, createRun, type RunState, type StepState } from "@/lib/run";
import { RESEARCH_STEPS, STEP_LABEL, STEPS } from "@/lib/steps";
import { streamEvents } from "@/lib/stream";
import { AgentCard, MiniRow } from "./agent-card";
import { reportPlainText, ReportBody } from "./report";

const EXAMPLES = [
  "Is Microsoft overvalued right now?",
  "What is the outlook for Nvidia this year?",
  "Should I sell Tesla stock?",
];

const FLOW = ["Prices", "News", "Market mood", "Indicators", "Your review", "Report"];

export function Desk() {
  const [run, setRun] = useState<RunState | null>(null);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(0);
  const runRef = useRef<RunState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const live = run && (run.phase === "running" || run.phase === "finishing" || run.phase === "review");
    if (!live) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [run]);

  function commit(next: RunState | null) {
    runRef.current = next;
    setRun(next);
  }

  function reset() {
    abortRef.current?.abort();
    commit(null);
    setFeedback("");
    setConfirmReject(false);
    setOpenOverride({});
    setCopied(false);
  }

  async function start(query: string) {
    const question = query.trim();
    if (!question) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft(question);
    setFeedback("");
    setConfirmReject(false);
    setOpenOverride({});
    commit(createRun(question));
    try {
      await streamEvents("/api/analyze", { query: question }, (event) => {
        const current = runRef.current;
        if (!current) return;
        commit(applyEvent(current, event));
      }, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      const current = runRef.current;
      if (!current) return;
      commit(applyEvent(current, { status: "error", detail: errorText(error) }));
    }
  }

  async function resume(kind: "approve" | "revise" | "reject") {
    const current = runRef.current;
    if (!current?.threadId) return;
    if (kind === "revise" && !feedback.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setConfirmReject(false);
    setOpenOverride({});
    commit(beginResume(current, kind));
    try {
      await streamEvents(
        "/api/analyze/resume",
        {
          thread_id: current.threadId,
          approved: kind === "approve",
          feedback: kind === "revise" ? feedback.trim() : "",
        },
        (event) => {
          const latest = runRef.current;
          if (!latest) return;
          commit(applyEvent(latest, event));
        },
        controller.signal,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      const latest = runRef.current;
      if (!latest) return;
      commit(applyEvent(latest, { status: "error", detail: errorText(error) }));
    }
  }

  return (
    <div className="desk">
      <header className="top">
        <div className="top-inner">
          <div className="brand">
            <img className="mark" src="/logo.png" alt="" width={28} height={28} />
            <span>EquityIQ</span>
          </div>
          <p className="sub">Stock research desk</p>
          {run ? (
            <button type="button" className="btn ghost" onClick={reset}>
              New question
            </button>
          ) : null}
        </div>
      </header>
      {run ? (
        <Workspace
          run={run}
          now={now}
          feedback={feedback}
          confirmReject={confirmReject}
          copied={copied}
          openOverride={openOverride}
          onFeedback={setFeedback}
          onConfirmReject={setConfirmReject}
          onResume={resume}
          onStart={start}
          onToggle={(id, open) => setOpenOverride((prev) => ({ ...prev, [id]: open }))}
          onExpand={() => {
            const next: Record<string, boolean> = {};
            for (const step of run.steps) {
              if (step.status === "done" || step.status === "failed") next[step.id] = true;
            }
            setOpenOverride(next);
          }}
          onCopy={async () => {
            await navigator.clipboard.writeText(reportPlainText(String(run.facts.final_response || "")));
            setCopied(true);
          }}
        />
      ) : (
        <Ask draft={draft} onDraft={setDraft} onStart={start} />
      )}
    </div>
  );
}

function Ask({ draft, onDraft, onStart }: { draft: string; onDraft: (value: string) => void; onStart: (query: string) => void }) {
  return (
    <main className="ask">
      <div className="glow" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="ask-inner">
        <p className="eyebrow">
          <i className="pulse" /> Multi-agent stock research
        </p>
        <h1>
          What stock do you want <span className="grad">researched?</span>
        </h1>
        <p className="lede">
          Ask one question. Research agents gather prices, news, market mood, and indicators, then you review the draft before the final report.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onStart(draft.trim() || "Should I buy Apple stock");
          }}
        >
          <label htmlFor="question">Your question</label>
          <div className="ask-row">
            <input
              id="question"
              value={draft}
              placeholder="Should I buy Apple stock"
              onChange={(event) => onDraft(event.target.value)}
            />
            <button type="submit" className="btn primary go">
              Research <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className="fine">EquityIQ gives research, not financial advice. A run takes about a minute.</p>
        </form>
        <ol className="flow" aria-label="How a run works">
          {FLOW.map((item, index) => (
            <li key={item} style={{ "--i": index } as CSSProperties}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item}
            </li>
          ))}
        </ol>
        <div className="try">
          <span>Try</span>
          <div>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="chip" onClick={() => onDraft(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function Workspace({
  run,
  now,
  feedback,
  confirmReject,
  copied,
  openOverride,
  onFeedback,
  onConfirmReject,
  onResume,
  onStart,
  onToggle,
  onExpand,
  onCopy,
}: {
  run: RunState;
  now: number;
  feedback: string;
  confirmReject: boolean;
  copied: boolean;
  openOverride: Record<string, boolean>;
  onFeedback: (value: string) => void;
  onConfirmReject: (value: boolean) => void;
  onResume: (kind: "approve" | "revise" | "reject") => void;
  onStart: (query: string) => void;
  onToggle: (id: string, open: boolean) => void;
  onExpand: () => void;
  onCopy: () => void;
}) {
  const research = run.steps.filter((step) => RESEARCH_STEPS.some((item) => item.id === step.id));
  const counted = research.filter((step) => step.status !== "skipped");
  const finished = counted.filter((step) => step.status === "done" || step.status === "failed").length;
  const busy = run.phase === "running" || run.phase === "finishing";

  function isOpen(step: StepState) {
    if (step.id in openOverride) return openOverride[step.id];
    if (run.phase === "running") return step.status === "done" || step.status === "failed" || step.status === "working";
    if (run.phase === "review" || run.phase === "finishing") {
      return step.status === "failed" || (step.id === "analyasis_agent" && step.status !== "skipped");
    }
    if (run.phase === "failed") return step.status === "failed";
    return false;
  }

  const evidence = research.filter((step) => step.status === "done" || step.status === "failed" || step.status === "working");
  const nextWaiting = research.find((step) => step.status === "waiting");

  return (
    <div className="workspace">
      <aside className="rail" aria-label="Pipeline progress">
        <p className="kicker">Pipeline</p>
        <p className={`rail-status${run.phase === "review" ? " accent" : ""}`}>{railStatus(run, finished, counted.length)}</p>
        <div className="meters" aria-hidden="true">
          {research.map((step) => (
            <span key={step.id} className={meterClass(step.status)} />
          ))}
        </div>
        <nav>
          {run.steps.map((step) => (
            <div key={step.id} className={`step${step.status === "skipped" || step.status === "waiting" ? " muted" : ""}${step.id === "review" ? " split" : ""}`}>
              <Dot status={step.status} />
              <span>{STEP_LABEL[step.id]}</span>
              <em>{stepMeta(step, run, now)}</em>
            </div>
          ))}
        </nav>
        {run.phase === "review" ? (
          <a className="btn primary block" href="#review">
            Go to review
          </a>
        ) : null}
        {run.phase === "running" ? <p className="fine">Results appear as each agent finishes.</p> : null}
      </aside>
      <main className="main">
        <section className="question" aria-label="Your question">
          <p className="kicker">Question</p>
          <p className="question-text">{run.query}</p>
          <p className="fine">
            <span className="mono">
              Started {formatClock(run.startedAt)}
              {busy || run.phase === "review" ? ` · ${formatDuration(now - run.startedAt)} elapsed` : ""}
            </span>
            {" · "}Research, not financial advice
          </p>
        </section>

        {run.phase === "blocked" ? <Blocked run={run} onStart={onStart} /> : null}
        {run.phase === "failed" ? <Failed run={run} onStart={onStart} /> : null}
        {run.phase === "stopped" ? <Stopped run={run} onStart={onStart} /> : null}
        {run.phase === "report" ? (
          <ReportCard run={run} copied={copied} onCopy={onCopy} />
        ) : null}

        {run.phase === "report" ? (
          <details className="evidence">
            <summary>
              Evidence and draft
              <span className="muted"> · {finished} agent results and your decision</span>
            </summary>
            <div className="stack">
              {evidence.map((step) => (
                <Evidence key={step.id} step={step} run={run} open={isOpen(step)} onToggle={onToggle} />
              ))}
            </div>
          </details>
        ) : run.phase === "blocked" ? null : (
          <div className="stack">
            {run.phase !== "running" && evidence.length ? (
              <div className="evidence-bar">
                <span className="kicker">Evidence · {finished} agents done</span>
                <button type="button" className="text-btn" onClick={onExpand}>
                  Expand all
                </button>
              </div>
            ) : null}
            {evidence.map((step) => (
              <Evidence key={step.id} step={step} run={run} open={isOpen(step)} onToggle={onToggle} />
            ))}
            {run.phase === "running" && nextWaiting ? (
              <div className="mini dashed">
                <span className="idx">{indexOf(nextWaiting.id)}</span>
                <span className="mini-name muted">{STEP_LABEL[nextWaiting.id]}</span>
                <span className="mini-sum muted">Starts when the agents above finish</span>
              </div>
            ) : null}
            {run.phase === "finishing" ? <FinalWorking run={run} /> : null}
            {run.phase === "review" ? (
              <ReviewPanel
                run={run}
                feedback={feedback}
                confirmReject={confirmReject}
                onFeedback={onFeedback}
                onConfirmReject={onConfirmReject}
                onResume={onResume}
              />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

function Evidence({
  step,
  run,
  open,
  onToggle,
}: {
  step: StepState;
  run: RunState;
  open: boolean;
  onToggle: (id: string, open: boolean) => void;
}) {
  if (!open && (run.phase === "review" || run.phase === "finishing" || run.phase === "stopped" || run.phase === "report")) {
    return (
      <MiniRow
        step={step}
        facts={run.facts}
        index={indexOf(step.id)}
        open={false}
        onToggle={() => onToggle(step.id, true)}
      />
    );
  }
  return (
    <AgentCard
      step={step}
      facts={run.facts}
      index={indexOf(step.id)}
      open={open || step.status === "working"}
      onToggle={() => onToggle(step.id, !open)}
    />
  );
}

function ReviewPanel({
  run,
  feedback,
  confirmReject,
  onFeedback,
  onConfirmReject,
  onResume,
}: {
  run: RunState;
  feedback: string;
  confirmReject: boolean;
  onFeedback: (value: string) => void;
  onConfirmReject: (value: boolean) => void;
  onResume: (kind: "approve" | "revise" | "reject") => void;
}) {
  return (
    <section className="review" id="review">
      <p className="kicker accent">Your review</p>
      <h2>{run.review?.question || "Do you approve of the draft analysis?"}</h2>
      <p className="muted">The run is paused. The evidence above stays here while you decide.</p>
      {run.review?.approval_request ? <p>{run.review.approval_request}</p> : null}
      <label htmlFor="feedback">Feedback for a revision</label>
      <textarea
        id="feedback"
        value={feedback}
        placeholder="For example: make the forecast horizon 30 days and weigh the latest news more heavily."
        onChange={(event) => onFeedback(event.target.value)}
      />
      <p className="fine">Required only for Request a revision. Approve and Reject ignore this box.</p>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => onResume("approve")}>
          Approve
        </button>
        <button type="button" className="btn" disabled={!feedback.trim()} onClick={() => onResume("revise")}>
          Request a revision
        </button>
        <button type="button" className="btn" onClick={() => onConfirmReject(true)}>
          Reject
        </button>
      </div>
      {confirmReject ? (
        <div className="confirm">
          <div>
            <strong>Reject the draft and stop this run?</strong>
            <p>No final report will be produced. Feedback in the box is not sent.</p>
          </div>
          <div className="actions">
            <button type="button" className="btn ink" onClick={() => onResume("reject")}>
              Reject and stop
            </button>
            <button type="button" className="btn" onClick={() => onConfirmReject(false)}>
              Keep reviewing
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReportCard({ run, copied, onCopy }: { run: RunState; copied: boolean; onCopy: () => void }) {
  const note = run.reviewNote || (run.facts.approved ? "Approved" : "Revised");
  return (
    <article className="card report-card">
      <header className="card-head">
        <span className="idx">09</span>
        <h2>Final report</h2>
        {run.facts.symbol ? <span className="ticker">{run.facts.symbol}</span> : null}
        <span className="tag ok-tag">Reviewed by a person · {note}</span>
      </header>
      <div className="card-body">
        <ReportBody raw={String(run.facts.final_response || "")} plainNote="Shown as plain text because the report was not JSON." />
        <div className="actions">
          <button type="button" className="btn" onClick={onCopy}>
            {copied ? "Copied" : "Copy report"}
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Download PDF
          </button>
        </div>
      </div>
    </article>
  );
}

function FinalWorking({ run }: { run: RunState }) {
  const step = run.steps.find((item) => item.id === "final_response_agent");
  if (!step || run.reviewNote === "Rejected") {
    return <p className="note">Stopping this run…</p>;
  }
  return <AgentCard step={step} facts={run.facts} index="09" open onToggle={() => undefined} />;
}

function Blocked({ run, onStart }: { run: RunState; onStart: (query: string) => void }) {
  const [value, setValue] = useState("");
  const reason = run.facts.guardrails_reason || run.facts.final_response || "This question is not about a stock.";
  return (
    <div className="stack">
      <section className="banner">
        <h2>This question was blocked</h2>
        <p>{reason}</p>
      </section>
      <section className="banner flat">
        <h2>Ask a stock question instead</h2>
        <form
          className="ask-row"
          onSubmit={(event) => {
            event.preventDefault();
            onStart(value);
          }}
        >
          <input value={value} placeholder="Should I buy Apple stock" onChange={(event) => setValue(event.target.value)} aria-label="Your question" />
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            Research
          </button>
        </form>
      </section>
    </div>
  );
}

function Failed({ run, onStart }: { run: RunState; onStart: (query: string) => void }) {
  return (
    <section className="banner">
      <h2>The run could not finish</h2>
      <p>Something went wrong before the research was complete, so there is no draft to review.</p>
      <pre className="err">{run.error}</pre>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => onStart(run.query)}>
          Try again
        </button>
      </div>
    </section>
  );
}

function Stopped({ run, onStart }: { run: RunState; onStart: (query: string) => void }) {
  return (
    <section className="banner">
      <h2>Run stopped</h2>
      <p>You rejected the draft, so no final report was produced. The evidence below is still here to read.</p>
      <div className="actions">
        <button type="button" className="btn primary" onClick={() => onStart(run.query)}>
          Run this question again
        </button>
      </div>
    </section>
  );
}

function Dot({ status }: { status: StepState["status"] }) {
  if (status === "done") return <span className="dot ok">✓</span>;
  if (status === "failed") return <span className="dot fail">!</span>;
  if (status === "working") return <span className="dot run" />;
  if (status === "skipped") return <span className="dot skip" />;
  return <span className="dot wait" />;
}

function railStatus(run: RunState, finished: number, total: number) {
  switch (run.phase) {
    case "review":
      return "Paused for your review";
    case "finishing":
      return run.reviewNote === "Rejected" ? "Stopping the run" : "Writing the final report";
    case "report":
      return "Report ready";
    case "stopped":
      return "Run stopped";
    case "blocked":
      return "Question blocked";
    case "failed":
      return "Run failed";
    default:
      return `${finished} of ${total} agents done`;
  }
}

function stepMeta(step: StepState, run: RunState, now: number) {
  if (step.id === "review" && step.status === "working") return "Now";
  if (step.id === "review" && step.status === "done") return run.reviewNote || "Done";
  if (step.status === "working") return "Working";
  if (step.status === "failed") return "Stopped";
  if (step.status === "skipped") return "Not run";
  if (step.status === "waiting") return "";
  if (step.startedAt && step.finishedAt) return formatDuration(step.finishedAt - step.startedAt);
  if (step.startedAt) return formatDuration(now - step.startedAt);
  return "";
}

function meterClass(status: StepState["status"]) {
  if (status === "done") return "meter done";
  if (status === "failed") return "meter fail";
  if (status === "working") return "meter run";
  return "meter";
}

function indexOf(id: string) {
  const index = STEPS.findIndex((step) => step.id === id);
  return String(index + 1).padStart(2, "0");
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The request failed.";
}
