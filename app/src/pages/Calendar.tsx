import { useEffect, useMemo, useState } from "react";
import { useTrackStackAuth } from "trackstack-ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

interface CalendarEvent {
  id: string | number;
  event_type: string;
  category: string | null;
  occurred_at: string;
  amount: number;
  label: string | null;
  tracker: string;
}

interface CalendarResponse {
  events: CalendarEvent[];
  total: number;
  errors?: { tracker: string; error: string }[];
}

const TRACKER_STYLES: Record<string, { dot: string; text: string }> = {
  nutrition: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  finance: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  todo: { dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-400" },
};

function trackerStyle(tracker: string) {
  return TRACKER_STYLES[tracker] ?? { dot: "bg-muted-foreground", text: "text-muted-foreground" };
}

// occurred_at is a full ISO timestamp, but this page groups by calendar
// DAY -- always slice the YYYY-MM-DD prefix directly rather than routing
// through `new Date(...)`/`toLocaleDateString()`, which reinterprets in
// the browser's local timezone and can shift an event onto the wrong day.
// Exactly the bug already found once in Todos.tsx's due_at handling.
function dayKey(occurredAt: string): string {
  return occurredAt.slice(0, 10);
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Every cell in the rendered grid, including the leading/trailing days
 * borrowed from the adjacent months to fill out full weeks. */
function buildMonthGrid(year: number, month: number): { date: string; inMonth: boolean }[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < startWeekday; i++) {
    const d = new Date(Date.UTC(year, month, 1 - (startWeekday - i)));
    cells.push({ date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: `${year}-${pad2(month + 1)}-${pad2(day)}`, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!.date;
    const [y, m, d] = last.split("-").map(Number);
    const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
    cells.push({ date: `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`, inMonth: false });
  }
  return cells;
}

export function Calendar() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const today = new Date();
  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth()); // 0-indexed
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [trackerErrors, setTrackerErrors] = useState<{ tracker: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const todayKey = `${today.getUTCFullYear()}-${pad2(today.getUTCMonth() + 1)}-${pad2(today.getUTCDate())}`;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const start = grid[0]!.date;
    const end = grid[grid.length - 1]!.date;
    apiFetch("", `/api/calendar?start=${start}&end=${end}`, token)
      .then((data) => {
        if (cancelled) return;
        const res = data as CalendarResponse;
        setEvents(res.events);
        setTrackerErrors(res.errors ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load calendar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, grid]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = dayKey(e.occurred_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  function goToPrevMonth() {
    setSelectedDay(null);
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    setSelectedDay(null);
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl">Calendar</h1>
        <div className="flex items-center gap-1">
          <button onClick={goToPrevMonth} className="p-1.5 rounded-md hover:bg-secondary" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium w-36 text-center">{monthLabel(year, month)}</span>
          <button onClick={goToNextMonth} className="p-1.5 rounded-md hover:bg-secondary" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-muted-foreground mb-4 text-sm">Everything logged across your trackers, in one view.</p>

      {trackerErrors.length > 0 && (
        <div className="mb-4 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
          Couldn't load: {trackerErrors.map((e) => e.tracker).join(", ")} — showing the rest.
        </div>
      )}
      {error && <div className="mb-4 p-2 rounded-md bg-destructive/10 text-destructive text-xs">{error}</div>}

      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground text-center">
            {d}
          </div>
        ))}
        {grid.map(({ date, inMonth }) => {
          const dayEvents = eventsByDay.get(date) ?? [];
          const dayNum = Number(date.slice(8, 10));
          const isToday = date === todayKey;
          return (
            <button
              key={date}
              onClick={() => setSelectedDay(date)}
              className={
                "bg-card min-h-20 sm:min-h-24 p-1.5 text-left flex flex-col gap-1 hover:bg-secondary/50 transition-colors " +
                (inMonth ? "" : "opacity-40") +
                (selectedDay === date ? " ring-2 ring-primary ring-inset" : "")
              }
            >
              <span className={"text-xs " + (isToday ? "font-bold text-primary" : "text-muted-foreground")}>{dayNum}</span>
              <div className="flex flex-wrap gap-0.5">
                {dayEvents.slice(0, 4).map((e) => (
                  <span key={e.id + e.tracker} className={"h-1.5 w-1.5 rounded-full " + trackerStyle(e.tracker).dot} title={e.label ?? e.event_type} />
                ))}
                {dayEvents.length > 4 && <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 4}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {loading && <p className="text-sm text-muted-foreground mt-4">Loading…</p>}

      {selectedDay && (
        <div className="mt-4 bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-medium mb-3">
            {selectedDay} {selectedEvents.length === 0 && <span className="text-muted-foreground font-normal">— nothing logged</span>}
          </h2>
          <ul className="space-y-2">
            {selectedEvents.map((e) => (
              <li key={e.id + e.tracker} className="flex items-center gap-2 text-sm">
                <span className={"h-2 w-2 rounded-full flex-shrink-0 " + trackerStyle(e.tracker).dot} />
                <span className="flex-1 truncate">{e.label ?? e.event_type}</span>
                {e.category && <span className="text-xs text-muted-foreground">{e.category}</span>}
                <span className={"text-xs " + trackerStyle(e.tracker).text}>{e.tracker}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
