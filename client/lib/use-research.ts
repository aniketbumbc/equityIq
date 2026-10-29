"use client";

import { useEffect, useRef, useState } from "react";
import { applyEvent, beginResume, createRun, type RunState } from "./run";
import { streamEvents } from "./stream";

// With no decision within this time, the draft is approved automatically.
export const AUTO_APPROVE_MS = 2 * 60 * 1000;

export type ResumeKind = "approve" | "revise" | "reject";

/**
 * One research run at a time: streams the graph, pauses for review, and resumes it.
 * Shared by the desk page and the chat page.
 */
export function useResearch() {
  const [run, setRun] = useState<RunState | null>(null);
  const [feedback, setFeedbackState] = useState("");
  const [confirmReject, setConfirmRejectState] = useState(false);
  const [autoStopped, setAutoStopped] = useState(false);
  const [now, setNow] = useState(0);
  const runRef = useRef<RunState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resumeRef = useRef(resume);

  useEffect(() => {
    resumeRef.current = resume;
  });

  const reviewStartedAt =
    run?.phase === "review" ? run.steps.find((step) => step.id === "review")?.startedAt : undefined;
  useEffect(() => {
    if (!reviewStartedAt || autoStopped) return;
    const wait = Math.max(0, reviewStartedAt + AUTO_APPROVE_MS - Date.now());
    const timer = window.setTimeout(() => resumeRef.current("approve", undefined, true), wait);
    return () => window.clearTimeout(timer);
  }, [reviewStartedAt, autoStopped]);

  useEffect(() => {
    const live =
      run && (run.phase === "running" || run.phase === "revising" || run.phase === "finishing" || run.phase === "review");
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
    setFeedbackState("");
    setConfirmRejectState(false);
    setAutoStopped(false);
  }

  async function start(query: string, tools: string[] = []) {
    const question = query.trim();
    if (!question) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFeedbackState("");
    setConfirmRejectState(false);
    setAutoStopped(false);
    commit(createRun(question));
    try {
      await streamEvents("/api/analyze", { query: question, tools }, (event) => {
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

  /** `text` overrides the feedback box, for callers like the chat composer that keep their own input. */
  async function resume(kind: ResumeKind, text?: string, auto = false) {
    const current = runRef.current;
    if (!current?.threadId) return;
    const note = (text ?? feedback).trim();
    if (kind === "revise" && !note) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setConfirmRejectState(false);
    setAutoStopped(false);
    if (kind === "revise") setFeedbackState("");
    const next = beginResume(current, kind);
    commit(auto ? { ...next, reviewNote: "Auto-approved" } : next);
    try {
      await streamEvents(
        "/api/analyze/resume",
        {
          thread_id: current.threadId,
          approved: kind === "approve",
          feedback: kind === "revise" ? note : "",
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

  return {
    run,
    now,
    feedback,
    confirmReject,
    autoStopped,
    start,
    resume,
    reset,
    stopAuto: () => setAutoStopped(true),
    // Writing feedback or opening Reject means a person is deciding, so the auto-approve timer stops.
    setFeedback: (value: string) => {
      setFeedbackState(value);
      if (value.trim()) setAutoStopped(true);
    },
    setConfirmReject: (value: boolean) => {
      setConfirmRejectState(value);
      if (value) setAutoStopped(true);
    },
  };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The request failed.";
}
