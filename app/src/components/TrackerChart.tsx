import { useId, useState } from "react";
import { ACCENT_HEX, type Entry, type TrackerDefinition } from "../lib/customTrackers.js";

/** Tier B's "chart" view: entries grouped by category, summed on the
 * amount field -- a single-series magnitude-by-category comparison, so a
 * column chart with one accent hue (no legend needed: with only one
 * series, the title already says what's plotted -- dataviz skill,
 * marks-and-anatomy.md). Built in plain HTML/CSS rather than a charting
 * library: one bar chart, no second consumer yet to justify the
 * dependency (CLAUDE.md Tenet #2).
 *
 * `ui_config.view: "chart"` is only reachable when amount_field is set
 * and summable (trackstack-custom's own validateUiConfig enforces this
 * server-side), so both are guaranteed non-null by the time this renders
 * -- the fallbacks here are defensive, not an expected path. */
function groupByCategory(entries: Entry[], categoryField: string | null, amountField: string): { category: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const raw = categoryField ? entry.values[categoryField] : undefined;
    const category = typeof raw === "string" && raw ? raw : "Uncategorized";
    const amount = entry.values[amountField];
    if (typeof amount !== "number") continue;
    totals.set(category, (totals.get(category) ?? 0) + amount);
  }
  return [...totals.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

/** Rounds a max value up to a "nice" number (1/2/5 × 10^n) and splits it
 * into 4 even gridline steps, e.g. 237 -> steps of 50,100,150,200,250 up
 * to 250 -- dataviz skill: "round to clean numbers," never the raw max. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const niceMax = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const step = niceMax / 4;
  return [0, step, step * 2, step * 3, niceMax];
}

function formatTick(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K` : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

const CHART_HEIGHT = 200;
const MAX_BAR_WIDTH = 24;

export function TrackerChart({ def, entries }: { def: TrackerDefinition; entries: Entry[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const tooltipId = useId();
  const amountField = def.amount_field;
  const unit = def.fields.find((f) => f.key === amountField)?.unit ?? "";
  const accent = def.ui_config?.accent ?? null;
  const color = accent ? ACCENT_HEX[accent] : "hsl(var(--primary))";

  if (!amountField) return <p className="text-sm text-muted-foreground">This tracker has no amount field to chart.</p>;

  const bars = groupByCategory(entries, def.category_field, amountField);
  if (bars.length === 0) {
    return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground text-center">No entries yet.</div>;
  }

  const ticks = niceTicks(Math.max(...bars.map((b) => b.total)));
  const axisMax = ticks[ticks.length - 1]!;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground mb-4">
        {def.amount_meaning ?? "Total"}{unit ? ` (${unit})` : ""} by {def.category_field ? def.fields.find((f) => f.key === def.category_field)?.label ?? "category" : "category"}
      </p>
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        {/* Gridlines -- hairline, recessive, one-step-off-surface (dataviz skill). */}
        {ticks.map((t) => (
          <div key={t} className="absolute left-0 right-0 border-t border-border/60 flex items-center" style={{ bottom: (t / axisMax) * CHART_HEIGHT }}>
            <span className="absolute -translate-y-1/2 -left-1 -translate-x-full text-[10px] text-muted-foreground font-mono pr-1">{formatTick(t)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-1 pl-8">
          {bars.map((bar, i) => {
            const pct = axisMax > 0 ? (bar.total / axisMax) * 100 : 0;
            const isHovered = hovered === i;
            return (
              <div key={bar.category} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end relative">
                {isHovered && (
                  <div
                    id={`${tooltipId}-${i}`}
                    role="tooltip"
                    className="absolute bottom-full mb-1 z-10 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm"
                  >
                    <span className="font-mono font-medium text-foreground">{formatTick(bar.total)}{unit ? ` ${unit}` : ""}</span>
                    <span className="text-muted-foreground"> · {bar.category}</span>
                  </div>
                )}
                <button
                  type="button"
                  aria-describedby={`${tooltipId}-${i}`}
                  onPointerEnter={() => setHovered(i)}
                  onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered((h) => (h === i ? null : h))}
                  className="w-full flex flex-col items-center justify-end h-full focus:outline-none"
                  style={{ maxWidth: MAX_BAR_WIDTH + 8 }}
                >
                  <div
                    className="w-full rounded-t-[4px] transition-[filter]"
                    style={{
                      height: `${pct}%`,
                      maxWidth: MAX_BAR_WIDTH,
                      backgroundColor: color,
                      filter: isHovered ? "brightness(1.2)" : undefined,
                    }}
                  />
                </button>
                <span className="mt-1.5 text-[10px] text-muted-foreground truncate max-w-full" title={bar.category}>{bar.category}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
