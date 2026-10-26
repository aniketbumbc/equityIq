export const RESEARCH_STEPS = [
  { id: "supervisor", label: "Supervisor" },
  { id: "company_name_agent", label: "Company name" },
  { id: "historic_data_agent", label: "Historic data" },
  { id: "company_news_agent", label: "Company news" },
  { id: "market_sentiment_agent", label: "Market sentiment" },
  { id: "technical_indicator_agent", label: "Technical indicators" },
  { id: "analyasis_agent", label: "Analysis" },
] as const;

export const LATER_STEPS = [
  { id: "review", label: "Your review" },
  { id: "final_response_agent", label: "Final report" },
] as const;

export const STEPS = [...RESEARCH_STEPS, ...LATER_STEPS] as const;

export type StepId = (typeof STEPS)[number]["id"];

export const STEP_LABEL: Record<string, string> = Object.fromEntries(
  STEPS.map((step) => [step.id, step.label]),
);

const OPTIONAL = new Set<StepId>([
  "company_name_agent",
  "historic_data_agent",
  "company_news_agent",
  "market_sentiment_agent",
  "technical_indicator_agent",
]);

export function isOptionalStep(id: StepId): boolean {
  return OPTIONAL.has(id);
}
