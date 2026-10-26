import { asTextList, parseJson, titleCase } from "@/lib/format";

type ReportProps = {
  raw: string;
  plainNote?: string;
};

export function ReportBody({ raw, plainNote }: ReportProps) {
  const data = parseJson(raw);
  if (!data) {
    return (
      <div className="stack">
        {plainNote ? <p className="note">{plainNote}</p> : null}
        <p className="prose">{raw || "No analysis was returned."}</p>
      </div>
    );
  }

  const stock = objectOf(data.stock);
  const forecast = objectOf(data.forecast);
  const scenarios = objectOf(data.scenarios);
  const levels = objectOf(data.key_levels);
  const quality = objectOf(data.data_quality);
  const recommendation = objectOf(data.recommendation);
  const humanReview = objectOf(data.human_review);
  const findings = asTextList(data.key_findings);
  const risks = asTextList(data.risks);
  const range = objectOf(forecast.forecast_range);

  return (
    <div className="stack">
      {recommendation.summary ? (
        <div className="callout">
          <div className="kicker">Recommendation</div>
          <p className="callout-title">{String(recommendation.summary)}</p>
          {recommendation.reasoning ? <p>{String(recommendation.reasoning)}</p> : null}
          {recommendation.stance ? <p className="muted">Stance: {titleCase(recommendation.stance)}</p> : null}
        </div>
      ) : null}

      {findings.length ? (
        <section>
          <h3>Key findings</h3>
          <ul>
            {findings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="stats">
        <Stat k="Stock" v={text(stock.symbol || stock.company_name)} d={text(stock.company_name)} />
        <Stat k="Forecast" v={titleCase(forecast.direction)} d={text(stock.forecast_horizon)} />
        <Stat
          k="Target"
          v={text(forecast.target_price)}
          d={text(forecast.expected_return_pct) ? `${forecast.expected_return_pct}%` : ""}
        />
        <Stat k="Confidence" v={titleCase(forecast.confidence)} />
      </div>

      {forecast.summary ? <p className="prose">{String(forecast.summary)}</p> : null}
      {range.lower != null || range.upper != null ? (
        <p className="muted">
          Range {text(range.lower)} – {text(range.upper)}
        </p>
      ) : null}

      {scenarios ? (
        <section>
          <h3>Scenarios</h3>
          <div className="scenarios">
            {(["bullish", "base", "bearish"] as const).map((name) => {
              const lines = scenarioLines(scenarios[name]);
              if (!lines.length) return null;
              return (
                <article key={name}>
                  <h4>{titleCase(name)}</h4>
                  {lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {asTextList(levels.support).length || asTextList(levels.resistance).length ? (
        <section>
          <h3>Key levels</h3>
          <p>
            {asTextList(levels.support).length ? (
              <span>
                <span className="muted">Support </span>
                <span className="mono">{asTextList(levels.support).join(" · ")}</span>
              </span>
            ) : null}
            {asTextList(levels.resistance).length ? (
              <span>
                {"  "}
                <span className="muted">Resistance </span>
                <span className="mono">{asTextList(levels.resistance).join(" · ")}</span>
              </span>
            ) : null}
          </p>
        </section>
      ) : null}

      {risks.length ? (
        <section>
          <h3>Risks</h3>
          <ul>
            {risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3>Data quality</h3>
        <p>{qualityText(quality)}</p>
      </section>

      {data.final_conclusion ? (
        <section>
          <h3>Conclusion</h3>
          <p className="prose">{String(data.final_conclusion)}</p>
        </section>
      ) : null}

      {humanReview.feedback_applied || humanReview.approved != null ? (
        <p className="fine">
          <strong>Human review. </strong>
          {humanReview.approved ? "A person approved the draft" : "A person asked for a revision"}
          {humanReview.feedback_applied ? `: ${humanReview.feedback_applied}` : "."}
        </p>
      ) : null}

      {data.disclaimer ? <p className="fine muted">{String(data.disclaimer)}</p> : null}
    </div>
  );
}

export function reportPlainText(raw: string): string {
  const data = parseJson(raw);
  if (!data) return raw;
  return JSON.stringify(data, null, 2);
}

function Stat({ k, v, d }: { k: string; v: string; d?: string }) {
  return (
    <div>
      <div className="kicker">{k}</div>
      <div className="stat">{v || "—"}</div>
      {d ? <div className="muted small">{d}</div> : null}
    </div>
  );
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value);
}

function scenarioLines(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const scenario = value as Record<string, unknown>;
  const lines: string[] = [];
  if (scenario.outlook) lines.push(String(scenario.outlook));
  if (scenario.target != null) lines.push(`Target ${scenario.target}`);
  if (scenario.likelihood != null) lines.push(`Likelihood ${scenario.likelihood}`);
  for (const condition of asTextList(scenario.conditions)) lines.push(condition);
  if (scenario.invalidation) lines.push(`Invalidation: ${scenario.invalidation}`);
  return lines;
}

function qualityText(quality: Record<string, unknown>): string {
  const limitations = asTextList(quality.limitations);
  if (limitations.length) return limitations.join(" ");
  const gaps = [
    ["historical_data_available", "price history"],
    ["company_news_available", "company news"],
    ["market_sentiment_available", "market sentiment"],
    ["technical_indicators_available", "technical indicators"],
  ].filter(([key]) => quality[key] === false);
  if (!gaps.length && !Object.keys(quality).length) return "Not stated.";
  if (!gaps.length) return "The draft did not flag a missing input.";
  return `Missing: ${gaps.map(([, label]) => label).join(", ")}.`;
}
