"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatClock, formatDuration } from "@/lib/format";
import type { RunState, StepState } from "@/lib/run";
import { RESEARCH_STEPS, STEP_LABEL, STEPS } from "@/lib/steps";
import { AUTO_APPROVE_MS, useResearch, type ResumeKind } from "@/lib/use-research";
import { AgentCard, hasDataGap, MiniRow } from "./agent-card";
import { Header } from "./header";
import { Landing } from "./landing";
import { reportPlainText, ReportBody } from "./report";

export function Desk() {
  const router = useRouter();
  const research = useResearch();
  const { run } = research;
  const [draft, setDraft] = useState("");
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  function reset() {
    research.reset();
    setDraft("");
    setOpenOverride({});
    setCopied(false);
  }

  function start(query: string) {
    if (!query.trim()) return;
    setDraft(query.trim());
    setOpenOverride({});
    research.start(query);
  }

  function resume(kind: ResumeKind) {
    setOpenOverride({});
    research.resume(kind);
  }

  return (
    <div className="desk">
      <Header run={run} onReset={reset} />
      {run ? (
        <Workspace
          run={run}
          now={research.now}
          feedback={research.feedback}
          confirmReject={research.confirmReject}
          copied={copied}
          openOverride={openOverride}
          autoStopped={research.autoStopped}
          onStopAuto={research.stopAuto}
          onFeedback={research.setFeedback}
          onConfirmReject={research.setConfirmReject}
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
        <Landing
          draft={draft}
          onDraft={setDraft}
          onStart={(query) => {
            // Next keeps this page mounted while hidden, so clear the box or the old question is still there on return.
            setDraft("");
            router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
          }}
        />
      )}
    </div>
  );
}

function Workspace({
  run,
  now,
  feedback,
  confirmReject,
  copied,
  openOverride,
  autoStopped,
  onStopAuto,
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
  autoStopped: boolean;
  onStopAuto: () => void;
  onFeedback: (value: string) => void;
  onConfirmReject: (value: boolean) => void;
  onResume: (kind: ResumeKind) => void;
  onStart: (query: string) => void;
  onToggle: (id: string, open: boolean) => void;
  onExpand: () => void;
  onCopy: () => void;
}) {
  const research = run.steps.filter((step) => RESEARCH_STEPS.some((item) => item.id === step.id));
  const counted = research.filter((step) => step.status !== "skipped");
  const finished = counted.filter((step) => step.status === "done" || step.status === "failed").length;
  const busy = run.phase === "running" || run.phase === "revising" || run.phase === "finishing";

  function isOpen(step: StepState) {
    if (step.id in openOverride) return openOverride[step.id];
    if (run.phase === "running") return step.status === "done" || step.status === "failed" || step.status === "working";
    if (run.phase === "review" || run.phase === "revising" || run.phase === "finishing") {
      if (run.phase === "revising" && step.status === "working") return true;
      if (run.rerun.includes(step.id) && step.status === "done") return true;
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
            <div
              key={step.id}
              className={`step${step.status === "skipped" || step.status === "waiting" ? " muted" : ""}${hasDataGap(step, run.facts) ? " is-failed" : ""}${step.id === "review" ? " split" : ""}`}
            >
              <Dot status={hasDataGap(step, run.facts) ? "failed" : step.status} />
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
                now={now}
                autoStopped={autoStopped}
                onStopAuto={onStopAuto}
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
  if (
    !open &&
    (run.phase === "review" ||
      run.phase === "revising" ||
      run.phase === "finishing" ||
      run.phase === "stopped" ||
      run.phase === "report")
  ) {
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
  now,
  autoStopped,
  onStopAuto,
  feedback,
  confirmReject,
  onFeedback,
  onConfirmReject,
  onResume,
}: {
  run: RunState;
  now: number;
  autoStopped: boolean;
  onStopAuto: () => void;
  feedback: string;
  confirmReject: boolean;
  onFeedback: (value: string) => void;
  onConfirmReject: (value: boolean) => void;
  onResume: (kind: ResumeKind) => void;
}) {
  return (
    <section className="review" id="review">
      <p className="kicker accent">Your review{run.revision ? ` · Draft ${run.revision + 1}` : ""}</p>
      <h2>{run.review?.question || "Do you approve of the draft analysis?"}</h2>
      <p className="muted">The run is paused. The evidence above stays here while you decide.</p>
      <AutoApprove run={run} now={now} stopped={autoStopped} onStop={onStopAuto} />
      {run.revision > 0 && run.facts.human_feedback ? (
        <div className="note">
          <p>
            <strong>Revised for your feedback: </strong>
            {run.facts.human_feedback}
          </p>
          <p>
            <strong>{run.rerun.length ? "Ran again: " : "No agents ran again. "}</strong>
            {run.rerun.map((id) => STEP_LABEL[id]).join(", ")}
            {run.rerun.length ? ". " : ""}
            {run.facts.revision_reasoning}
          </p>
        </div>
      ) : null}
      {run.review?.approval_request ? <p>{run.review.approval_request}</p> : null}
      <label htmlFor="feedback">Feedback for a revision</label>
      <textarea
        id="feedback"
        value={feedback}
        placeholder="For example: make the forecast horizon 30 days and weigh the latest news more heavily."
        onChange={(event) => onFeedback(event.target.value)}
      />
      <p className="fine">
        Required only for Request a revision, which rewrites the draft and brings you back here. Approve and Reject ignore
        this box.
      </p>
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

export function AutoApprove({
  run,
  now,
  stopped,
  onStop,
}: {
  run: RunState;
  now: number;
  stopped: boolean;
  onStop: () => void;
}) {
  if (stopped) {
    return <p className="auto off">Auto-approve is off. Take your time.</p>;
  }
  const startedAt = run.steps.find((step) => step.id === "review")?.startedAt ?? now;
  const left = Math.max(0, startedAt + AUTO_APPROVE_MS - Math.max(now, startedAt));
  const seconds = Math.ceil(left / 1000);
  return (
    <div className={`auto${seconds <= 30 ? " soon" : ""}`} role="timer" aria-live="off">
      <div className="auto-row">
        <span>
          <i className="pulse" /> Auto-approving in <strong className="mono">{seconds}s</strong>
        </span>
        <button type="button" className="text-btn" onClick={onStop}>
          Stop timer
        </button>
      </div>
      <div className="auto-bar" aria-hidden="true">
        <span style={{ width: `${(left / AUTO_APPROVE_MS) * 100}%` }} />
      </div>
      <p className="fine">
        If you don&apos;t decide, the draft is approved and the final report is written. Typing feedback or choosing
        Reject stops the timer.
      </p>
    </div>
  );
}

export function ReportCard({ run, copied, onCopy }: { run: RunState; copied: boolean; onCopy: () => void }) {
  const approved = run.reviewNote === "Auto-approved" ? "Auto-approved" : "Approved";
  const note = run.revision
    ? `${approved} after ${run.revision} ${run.revision === 1 ? "revision" : "revisions"}`
    : approved;
  return (
    <article className="card report-card">
      <header className="card-head">
        <span className="idx">09</span>
        <h2>Final report</h2>
        {run.facts.symbol ? <span className="ticker">{run.facts.symbol}</span> : null}
        <span className="tag ok-tag">
          {run.reviewNote === "Auto-approved" ? `No response in ${AUTO_APPROVE_MS / 60000} min` : "Reviewed by a person"} · {note}
        </span>
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

export function FinalWorking({ run }: { run: RunState }) {
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
      <section className="banner bad">
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
    <section className="banner bad">
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

export function Dot({ status }: { status: StepState["status"] }) {
  if (status === "done") return <span className="dot ok">✓</span>;
  if (status === "failed") return <span className="dot fail">!</span>;
  if (status === "working") return <span className="dot run" />;
  if (status === "skipped") return <span className="dot skip" />;
  return <span className="dot wait" />;
}

export function railStatus(run: RunState, finished: number, total: number) {
  switch (run.phase) {
    case "review":
      return "Paused for your review";
    case "revising":
      return `Writing draft ${run.revision + 1} from your feedback`;
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

export function indexOf(id: string) {
  const index = STEPS.findIndex((step) => step.id === id);
  return String(index + 1).padStart(2, "0");
}
