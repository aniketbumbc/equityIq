export type Bar = {
  datetime: string;
  close: number;
  high: number;
  low: number;
};

export type HistoryView = {
  symbol: string;
  interval: string;
  firstDate: string;
  latestClose: number;
  latestDate: string;
  change: number | null;
  high: number | null;
  low: number | null;
  count: number;
  bars: Bar[];
};

export type NewsItem = {
  title: string;
  body: string;
  url: string;
};

export type IndicatorReading = {
  label: string;
  value: string;
  detail: string;
  missing: boolean;
};

export function parseJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseHistory(value: unknown): HistoryView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as { meta?: { symbol?: string; interval?: string }; values?: unknown };
  if (!Array.isArray(data.values)) return null;
  const bars = data.values
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const bar = item as Record<string, unknown>;
      const close = Number(bar.close);
      if (!bar.datetime || !Number.isFinite(close)) return null;
      return {
        datetime: String(bar.datetime),
        close,
        high: Number(bar.high),
        low: Number(bar.low),
      };
    })
    .filter((bar): bar is Bar => bar !== null)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  if (!bars.length) return null;
  const oldest = bars[0];
  const latest = bars[bars.length - 1];
  const highs = bars.map((bar) => bar.high).filter(Number.isFinite);
  const lows = bars.map((bar) => bar.low).filter(Number.isFinite);
  return {
    symbol: data.meta?.symbol || "",
    interval: data.meta?.interval || "1day",
    firstDate: oldest.datetime.slice(0, 10),
    latestClose: latest.close,
    latestDate: latest.datetime.slice(0, 10),
    change: oldest.close ? (latest.close - oldest.close) / oldest.close : null,
    high: highs.length ? Math.max(...highs) : null,
    low: lows.length ? Math.min(...lows) : null,
    count: bars.length,
    bars,
  };
}

export function parseNews(raw: unknown): NewsItem[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  // Messages like "No search results found" or "Search failed: …" are not results.
  if (!/^\s*\d+\.\s*\*\*/m.test(raw)) return [];
  // Results start with "N. **Title**"; snippets can contain blank lines of their own.
  return raw
    .split(/\n\s*\n(?=\d+\.\s*\*\*)/)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return null;
      const title = stripMarkdown(lines[0].replace(/^\d+\.\s*/, ""));
      const url = lines.find((line) => /^https?:\/\//.test(line)) || "";
      const body = lines
        .filter((line) => line !== lines[0] && line !== url && !line.startsWith("#"))
        .map(stripMarkdown)
        .filter(Boolean)
        .join(" ");
      return { title, body, url };
    })
    .filter((item): item is NewsItem => Boolean(item?.title));
}

function stripMarkdown(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .replace(/\*\*|__/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
}

function latestSeries(payload: unknown, pick: (row: Record<string, unknown>) => string): IndicatorReading | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (data.error) return null;
  const values = data.values;
  if (!Array.isArray(values) || !values.length || typeof values[0] !== "object") return null;
  const row = values[0] as Record<string, unknown>;
  return {
    label: "",
    value: pick(row),
    detail: row.datetime ? String(row.datetime).slice(0, 10) : "",
    missing: false,
  };
}

export function parseIndicators(value: unknown): IndicatorReading[] {
  const empty = (label: string, detail: string): IndicatorReading => ({
    label,
    value: "Missing",
    detail,
    missing: true,
  });
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [
      empty("RSI", typeof value === "string" ? value : "No reading"),
      empty("MACD", ""),
      empty("ATR", ""),
    ];
  }
  const data = value as Record<string, unknown>;
  const readings: IndicatorReading[] = [];

  const rsi = data.rsi;
  if (!rsi || typeof rsi !== "object" || (rsi as { error?: string }).error) {
    readings.push(empty("RSI", String((rsi as { error?: string } | undefined)?.error || "No reading")));
  } else {
    const series = (rsi as Record<string, unknown>)["Technical Analysis: RSI"];
    if (!series || typeof series !== "object") {
      readings.push(empty("RSI", "No readings"));
    } else {
      const dates = Object.keys(series as object).sort();
      const date = dates[dates.length - 1];
      const point = date ? (series as Record<string, { RSI?: string }>)[date] : undefined;
      readings.push({
        label: "RSI",
        value: point?.RSI || "Missing",
        detail: date ? `${date.slice(0, 10)} · monthly, period 10` : "monthly, period 10",
        missing: !point?.RSI,
      });
    }
  }

  const macd = latestSeries(data.macd, (row) => {
    const parts = [`${row.macd ?? "—"}`];
    if (row.macd_signal != null) parts.push(`signal ${row.macd_signal}`);
    if (row.macd_hist != null) parts.push(`hist ${row.macd_hist}`);
    return parts.join(" · ");
  });
  if (macd) {
    readings.push({ ...macd, label: "MACD", detail: `${macd.detail} · monthly` });
  } else {
    const error = (data.macd as { error?: string } | undefined)?.error;
    readings.push(empty("MACD", error ? String(error) : "No reading"));
  }

  const atr = latestSeries(data.atr, (row) => String(row.atr ?? "—"));
  if (atr) {
    readings.push({ ...atr, label: "ATR", detail: `${atr.detail} · daily, period 14` });
  } else {
    const error = (data.atr as { error?: string } | undefined)?.error;
    readings.push(empty("ATR", error ? String(error) : "No reading"));
  }

  return readings;
}

const INTERVAL_WORD: Record<string, string> = { "1day": "daily", "1week": "weekly", "1month": "monthly" };

export function intervalWord(interval: string | undefined): string {
  return INTERVAL_WORD[interval || "1day"] || interval || "daily";
}

export function historyRange(settings: { history_years?: number; history_interval?: string } | undefined): string {
  const years = settings?.history_years || 1;
  return `${years === 1 ? "one year" : `${years} years`} of ${intervalWord(settings?.history_interval)} prices`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatDuration(ms?: number): string {
  if (ms == null || ms < 0) return "";
  const seconds = ms / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

export function asTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function titleCase(value: unknown): string {
  const text = String(value ?? "").replaceAll("_", " ").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
