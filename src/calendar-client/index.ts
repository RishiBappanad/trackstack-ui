/**
 * Shared calendar-push client for TrackStack tracker backends (Node).
 * Import from "trackstack-ui/calendar-client" -- this subpath has no
 * dependency on React, matching the /auth-client subpath's own
 * zero-React footprint.
 *
 * Lets a tracker push a calendar-worthy entry to trackstack-gateway's
 * POST /api/calendar/entries at the moment it decides something is
 * calendar-worthy, right next to its own log_domain_event() call --
 * see workspace-notes/CALENDAR_INTEGRATION_SPEC.md. The returned
 * pusher NEVER throws and NEVER blocks its caller past a short
 * timeout: a calendar push is fire-and-forget by design (see that
 * spec's "Failure Handling" section) -- losing one push means one
 * stale/missing calendar entry, an acceptable, self-correcting cost
 * next time the same entity is pushed again, not something worth
 * retry-queue complexity or risking the caller's own request over.
 *
 * Behavior here must match the Python equivalent
 * (trackstack-calendar-client) exactly -- see
 * CALENDAR_CONTRACT_FIXTURE.json at this repo's root, which both
 * implementations' test suites are run against.
 */

export type CalendarEntryAction = "created" | "updated" | "deleted";
export type CalendarEntryKind = "occurred" | "forecast" | "goal";

export interface CalendarPusherOptions {
  /** trackstack-gateway's own backend URL (not a browser-relative path). */
  calendarBaseUrl: string;
  /** Bound once at construction -- every push from this pusher is tagged with this tracker name. */
  tracker: string;
  /** Milliseconds before giving up on the push. Default 3000. */
  timeoutMs?: number;
}

export interface CalendarEntryInput {
  owner_type: string;
  owner_id: string;
  event_type: string;
  action: CalendarEntryAction;
  occurred_at: string;
  /** Omit to let the gateway default to 'occurred'. */
  kind?: CalendarEntryKind;
  category?: string | null;
  amount?: number | null;
  label?: string | null;
  /** Free-form, interpreted only by whatever renders the calendar (e.g.
   * "orange" while pending, "green" once matched/completed) -- the gateway
   * just stores and returns it. Omit/null clears it. */
  color?: string | null;
  /** A deep link into the OWNING tracker's own frontend for this exact
   * entity (e.g. "/recurring?item=7") -- how "editing" a calendar entry
   * works: click through to the tracker that actually owns the data,
   * rather than the calendar exposing any edit surface of its own. */
  link?: string | null;
  metadata?: Record<string, unknown>;
}

/** Resolves true/false -- never rejects -- so a caller that wants to log locally can, but nothing requires it to. */
export type PushCalendarEntry = (authHeader: string, entry: CalendarEntryInput) => Promise<boolean>;

function buildRequestBody(tracker: string, entry: CalendarEntryInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    tracker,
    owner_type: entry.owner_type,
    owner_id: entry.owner_id,
    event_type: entry.event_type,
    action: entry.action,
    occurred_at: entry.occurred_at,
    category: entry.category ?? null,
    amount: entry.amount ?? null,
    label: entry.label ?? null,
    color: entry.color ?? null,
    link: entry.link ?? null,
    metadata: entry.metadata ?? {},
  };
  // Omitted entirely (not sent as null) when the caller doesn't pass one,
  // so the gateway's own "kind defaults to 'occurred'" behavior applies.
  if (entry.kind !== undefined) body.kind = entry.kind;
  return body;
}

async function postCalendarEntry(
  calendarBaseUrl: string,
  authHeader: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: globalThis.Response;
    try {
      res = await fetch(`${calendarBaseUrl}/api/calendar/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    return res.ok;
  } catch (err) {
    console.warn("[calendar-client] push failed, continuing without it:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Factory -- binds `tracker` once so call sites never repeat it, the
 * same ergonomic shape as auth-client's `createRequireAuth`.
 */
export function createCalendarPusher(opts: CalendarPusherOptions): PushCalendarEntry {
  const timeoutMs = opts.timeoutMs ?? 3000;
  return function pushCalendarEntry(authHeader: string, entry: CalendarEntryInput): Promise<boolean> {
    const body = buildRequestBody(opts.tracker, entry);
    return postCalendarEntry(opts.calendarBaseUrl, authHeader, body, timeoutMs);
  };
}
