import { isOptionalStep, STEPS, type StepId } from "./steps";
import type { StreamEvent } from "./stream";

export type Phase =
  | "running"
  | "review"
  | "revising"
  | "finishing"
  | "report"
  | "stopped"
  | "blocked"
  | "failed";

export type StepStatus = "waiting" | "working" | "done" | "failed" | "skipped";

export type StepState = {
  id: StepId;
  status: StepStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
};

export type Facts = {
  user_query?: string;
  company_name?: string;
  symbol?: string;
  company_news?: string;
  market_sentiment?: string;
  historical_data?: unknown;
  technical_indicator?: unknown;
  analysis_results?: string;
  final_response?: string;
  guardrails_allowed?: boolean;
  guardrails_reason?: string;
  selected_agents?: string[];
  supervisor_reasoning?: string;
  approved?: boolean;
  human_feedback?: string;
  rerun_agents?: string[];
  data_settings?: DataSettings;
  revision_reasoning?: string;
  stop_reason?: string;
};

export type DataSettings = {
  history_years?: number;
  history_interval?: string;
  news_focus?: string;
  sentiment_focus?: string;
};

export type ReviewPayload = {
  question?: string;
  draft_analysis?: string;
  approval_request?: string;
  selected_agents?: string[];
  supervisor_reasoning?: string;
};

export type RunState = {
  phase: Phase;
  query: string;
  threadId: string;
  startedAt: number;
  steps: StepState[];
  facts: Facts;
  review: ReviewPayload | null;
  error: string;
  reviewNote: string;
  revision: number;
  rerun: StepId[];
};

const FACT_KEYS: (keyof Facts)[] = [
  "user_query",
  "company_name",
  "symbol",
  "company_news",
  "market_sentiment",
  "historical_data",
  "technical_indicator",
  "analysis_results",
  "final_response",
  "guardrails_allowed",
  "guardrails_reason",
  "selected_agents",
  "supervisor_reasoning",
  "approved",
  "human_feedback",
  "rerun_agents",
  "data_settings",
  "revision_reasoning",
  "stop_reason",
];

export function createRun(query: string, now = Date.now()): RunState {
  return {
    phase: "running",
    query,
    threadId: "",
    startedAt: now,
    steps: STEPS.map((step, index) => ({
      id: step.id,
      status: index === 0 ? "working" : "waiting",
      startedAt: index === 0 ? now : undefined,
    })),
    facts: { user_query: query },
    review: null,
    error: "",
    reviewNote: "",
    revision: 0,
    rerun: [],
  };
}

export function applyEvent(state: RunState, event: StreamEvent, now = Date.now()): RunState {
  if (event.status === "error") {
    return failRun(state, String(event.detail || "The run failed."), now);
  }
  if (event.status === "needs_review") {
    return pauseForReview(state, event, now);
  }
  if (event.status === "complete") {
    return finishRun(state, event, now);
  }
  if (event.node) return applyNode(state, event, now);
  return state;
}

export function beginResume(
  state: RunState,
  kind: "approve" | "revise" | "reject",
  now = Date.now(),
): RunState {
  if (kind === "revise") {
    // The planner picks agents to re-run, then the analysis agent writes a new draft and the run pauses again.
    const steps = state.steps.map((step) => {
      if (step.id === "analyasis_agent") return { id: step.id, status: "working" as const, startedAt: now };
      if (step.id === "review") return { id: step.id, status: "waiting" as const };
      return step;
    });
    return { ...state, phase: "revising", reviewNote: "Revised", revision: state.revision + 1, rerun: [], steps };
  }
  const steps = state.steps.map((step) => {
    if (step.id === "review") {
      return { ...step, status: "done" as const, finishedAt: now, startedAt: step.startedAt ?? now };
    }
    if (step.id === "final_response_agent" && kind === "approve") {
      return { id: step.id, status: "working" as const, startedAt: now };
    }
    return step;
  });
  return {
    ...state,
    phase: "finishing",
    reviewNote: kind === "approve" ? "Approved" : "Rejected",
    steps,
  };
}

function applyNode(state: RunState, event: StreamEvent, now: number): RunState {
  const facts = mergeFacts(state.facts, event);
  if (event.node === "guardrail_blocked" || facts.guardrails_allowed === false) {
    return blockRun({ ...state, facts }, now);
  }
  let steps = state.steps.map((step) => ({ ...step }));
  if (event.node === "human_in_the_loop") {
    if (state.phase === "revising") return { ...state, facts };
    return { ...state, facts, steps: markReview(steps, now) };
  }
  if (event.node === "revision_planner") return planRevision(state, facts, now);
  const id = event.node as StepId;
  if (!steps.some((step) => step.id === id)) return { ...state, facts };

  const failure = failureMessage(id, event);
  steps = steps.map((step) => {
    if (step.id !== id) return step;
    return {
      ...step,
      status: failure ? "failed" : "done",
      error: failure || undefined,
      startedAt: step.startedAt ?? now,
      finishedAt: now,
    };
  });
  steps = settleEarlier(steps, id);
  // No company in the question: the server ran nothing after this step.
  if (facts.stop_reason) return blockRun({ ...state, facts, steps }, now);
  if (id === "supervisor") steps = skipUnselected(steps, facts.selected_agents);
  return { ...state, facts, steps: promoteWorking(steps, now) };
}

function planRevision(state: RunState, facts: Facts, now: number): RunState {
  const rerun = (facts.rerun_agents || []).filter((id): id is StepId => state.steps.some((step) => step.id === id));
  if (!rerun.length) return { ...state, facts, rerun };
  // Chosen agents run again in order, then the analysis agent; the rest keep their results.
  const steps = state.steps.map((step) =>
    rerun.includes(step.id) || step.id === "analyasis_agent" ? { id: step.id, status: "waiting" as const } : step,
  );
  return { ...state, facts, rerun, steps: promoteWorking(steps, now) };
}

function pauseForReview(state: RunState, event: StreamEvent, now: number): RunState {
  const review = normalizeReview(event.review);
  const facts = mergeFacts(state.facts, event);
  if (review.draft_analysis && !facts.analysis_results) {
    facts.analysis_results = review.draft_analysis;
  }
  const steps = state.steps.map((step) => {
    if (step.id === "analyasis_agent" && step.status !== "failed" && step.status !== "done") {
      return { ...step, status: "done" as const, finishedAt: now, startedAt: step.startedAt ?? now };
    }
    if (step.id === "review") return { ...step, status: "working" as const, startedAt: now };
    if (step.status === "waiting" || step.status === "working") return { ...step, status: "skipped" as const };
    return step;
  });
  return {
    ...state,
    phase: "review",
    threadId: String(event.thread_id || state.threadId),
    facts,
    review,
    steps,
  };
}

function finishRun(state: RunState, event: StreamEvent, now: number): RunState {
  const facts = mergeFacts(state.facts, event);
  const threadId = String(event.thread_id || state.threadId);
  if (facts.guardrails_allowed === false || facts.stop_reason) return { ...blockRun({ ...state, facts }, now), threadId };
  const finalText = String(facts.final_response || "");
  if (finalText && /could not be generated/i.test(finalText)) {
    return { ...failRun({ ...state, facts, threadId }, finalText, now), threadId };
  }
  if (finalText) {
    const steps = state.steps.map((step) => {
      if (step.id === "final_response_agent") {
        return { ...step, status: "done" as const, finishedAt: now, startedAt: step.startedAt ?? now };
      }
      if (step.id === "review" && step.status !== "done") {
        return { ...step, status: "done" as const, finishedAt: now };
      }
      if (step.status === "waiting" || step.status === "working") return { ...step, status: "skipped" as const };
      return step;
    });
    return { ...state, phase: "report", threadId, facts, steps };
  }
  const steps = state.steps.map((step) => {
    if (step.id === "review" && step.status !== "done") {
      return { ...step, status: "done" as const, finishedAt: now };
    }
    if (step.status === "waiting" || step.status === "working") return { ...step, status: "skipped" as const };
    return step;
  });
  return { ...state, phase: "stopped", threadId, facts, steps, reviewNote: state.reviewNote || "Rejected" };
}

function failRun(state: RunState, detail: string, now: number): RunState {
  const steps = state.steps.map((step) => {
    if (step.status === "working") {
      return { ...step, status: "failed" as const, error: detail, finishedAt: now };
    }
    if (step.status === "waiting") return { ...step, status: "skipped" as const };
    return step;
  });
  return { ...state, phase: "failed", error: detail, steps };
}

/** Heading for a run that ended early: a blocked question, or one that names no company. */
export function blockedLabel(run: RunState): string {
  return run.facts.stop_reason ? "No company found" : "Question blocked";
}

function blockRun(state: RunState, now: number): RunState {
  const steps = state.steps.map((step) => {
    if (step.id === "supervisor" && step.status !== "failed") {
      return { ...step, status: "done" as const, finishedAt: step.finishedAt ?? now, startedAt: step.startedAt ?? now };
    }
    if (step.status === "done" || step.status === "failed") return step;
    return { ...step, status: "skipped" as const };
  });
  return { ...state, phase: "blocked", steps };
}

function settleEarlier(steps: StepState[], currentId: StepId): StepState[] {
  const currentIndex = steps.findIndex((step) => step.id === currentId);
  if (currentIndex < 0) return steps;
  return steps.map((step, index) => {
    if (index >= currentIndex) return step;
    if (step.status !== "waiting" && step.status !== "working") return step;
    return { ...step, status: "skipped" };
  });
}

function skipUnselected(steps: StepState[], selected: string[] | undefined): StepState[] {
  if (!selected?.length) return steps;
  const chosen = new Set(selected);
  return steps.map((step) => {
    if (!isOptionalStep(step.id) || chosen.has(step.id)) return step;
    if (step.status === "done" || step.status === "failed") return step;
    return { ...step, status: "skipped" };
  });
}

function promoteWorking(steps: StepState[], now: number): StepState[] {
  const next = steps.find((step) => step.status === "waiting");
  if (!next) return steps;
  return steps.map((step) =>
    step.id === next.id ? { ...step, status: "working", startedAt: step.startedAt ?? now } : step,
  );
}

function markReview(steps: StepState[], now: number): StepState[] {
  return steps.map((step) =>
    step.id === "review"
      ? { ...step, status: "done" as const, finishedAt: now, startedAt: step.startedAt ?? now }
      : step,
  );
}

function mergeFacts(facts: Facts, event: StreamEvent): Facts {
  const next: Facts = { ...facts };
  for (const key of FACT_KEYS) {
    if (event[key] !== undefined && event[key] !== null && event[key] !== "") {
      (next as Record<string, unknown>)[key] = event[key];
    }
  }
  return next;
}

function normalizeReview(value: unknown): ReviewPayload {
  if (!value || typeof value !== "object") return { question: "Do you approve of the draft analysis?" };
  const review = value as Record<string, unknown>;
  const draft = review.draft_analysis;
  return {
    question: typeof review.question === "string" ? review.question : "Do you approve of the draft analysis?",
    draft_analysis: typeof draft === "string" ? draft : draft ? JSON.stringify(draft) : "",
    approval_request: typeof review.approval_request === "string" ? review.approval_request : "",
    selected_agents: Array.isArray(review.selected_agents) ? review.selected_agents.map(String) : undefined,
    supervisor_reasoning: typeof review.supervisor_reasoning === "string" ? review.supervisor_reasoning : "",
  };
}

function failureMessage(id: StepId, event: StreamEvent): string {
  if (id === "company_name_agent") {
    const name = String(event.company_name ?? "").trim();
    if (!name || name.toUpperCase() === "NONE") return "Company name not found.";
  }
  if (id === "historic_data_agent" && typeof event.historical_data === "string") {
    return event.historical_data;
  }
  if (id === "company_news_agent" && typeof event.company_news === "string" && /^search failed/i.test(event.company_news)) {
    return event.company_news;
  }
  if (
    id === "market_sentiment_agent" &&
    typeof event.market_sentiment === "string" &&
    /^search failed/i.test(event.market_sentiment)
  ) {
    return event.market_sentiment;
  }
  if (id === "technical_indicator_agent" && typeof event.technical_indicator === "string") {
    return event.technical_indicator;
  }
  if (
    id === "analyasis_agent" &&
    typeof event.analysis_results === "string" &&
    /could not be generated|analysis failed/i.test(event.analysis_results) &&
    !event.analysis_results.includes("{")
  ) {
    return event.analysis_results;
  }
  if (
    id === "final_response_agent" &&
    typeof event.final_response === "string" &&
    /could not be generated/i.test(event.final_response)
  ) {
    return event.final_response;
  }
  return "";
}
