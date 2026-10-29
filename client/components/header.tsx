"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RunState } from "@/lib/run";
import { RESEARCH_STEPS } from "@/lib/steps";
import { HowItWorks } from "./how-it-works";

type Tone = "live" | "wait" | "ok" | "stop";

export function Header({
  run,
  onReset,
  page = "desk",
}: {
  run: RunState | null;
  onReset: () => void;
  page?: "desk" | "chat";
}) {
  const [scrolled, setScrolled] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const closeHow = useCallback(() => setShowHow(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const status = run ? runStatus(run) : null;
  return (
    <header className={`top${scrolled ? " is-scrolled" : ""}`}>
      <div className="top-inner">
        <button type="button" className="brand" onClick={onReset} aria-label="EquityIQ home">
          <span className="mark-tile">
            <img className="mark" src="/logo.png" alt="" width={28} height={28} />
          </span>
          <span className="wordmark">
            Equity<span className="grad">IQ</span>
          </span>
        </button>
        <span className="sub">{page === "chat" ? "Research chat" : "Stock research desk"}</span>

        <div className="top-actions">
          {status ? (
            <>
              <span className={`run-pill ${status.tone}`} role="status">
                <i />
                {status.label}
              </span>
              <button type="button" className="btn ghost" onClick={onReset}>
                {page === "chat" ? "New chat" : "New question"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="top-link" onClick={() => setShowHow(true)}>
                How it works
              </button>
              <Link className="top-link nav" href={page === "chat" ? "/" : "/chat"}>
                {page === "chat" ? "Classic view" : "Chat"}
              </Link>
              <button
                type="button"
                className="btn primary small"
                onClick={() => {
                  const input = document.getElementById("question");
                  input?.scrollIntoView({ block: "center" });
                  input?.focus({ preventScroll: true });
                }}
              >
                Start research
              </button>
            </>
          )}
        </div>
      </div>
      {status ? (
        <div className={`top-progress ${status.tone}`} aria-hidden="true">
          <span style={{ width: `${status.progress * 100}%` }} />
        </div>
      ) : null}
      {showHow ? <HowItWorks onClose={closeHow} /> : null}
    </header>
  );
}

function runStatus(run: RunState): { label: string; tone: Tone; progress: number } {
  const research = run.steps.filter(
    (step) => RESEARCH_STEPS.some((item) => item.id === step.id) && step.status !== "skipped",
  );
  const finished = research.filter((step) => step.status === "done" || step.status === "failed").length;
  const progress = research.length ? finished / research.length : 0;
  switch (run.phase) {
    case "running":
      return { label: `Researching · ${finished}/${research.length}`, tone: "live", progress };
    case "revising":
      return { label: `Revising · draft ${run.revision + 1}`, tone: "live", progress };
    case "review":
      return { label: "Awaiting your review", tone: "wait", progress: 1 };
    case "finishing":
      return { label: run.reviewNote === "Rejected" ? "Stopping" : "Writing report", tone: "live", progress: 1 };
    case "report":
      return { label: "Report ready", tone: "ok", progress: 1 };
    case "stopped":
      return { label: "Run stopped", tone: "stop", progress: 1 };
    case "blocked":
      return { label: "Question blocked", tone: "stop", progress: 1 };
    default:
      return { label: "Run failed", tone: "stop", progress: 1 };
  }
}
