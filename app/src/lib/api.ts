export class ApiError extends Error {
  /** HTTP status, or 0 for a network failure (no response at all). */
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(base: string, path: string, token: string | null, options: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("Network error", 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // e.g. 204 No Content
  }
  if (!res.ok) {
    // Express trackers report `{error}`; FastAPI ones `{detail}` (a string, or
    // `{message}` for a structured one).
    let detail = `HTTP ${res.status}`;
    if (body && typeof body === "object") {
      const b = body as { error?: unknown; detail?: unknown };
      if (b.error !== undefined) detail = String(b.error);
      else if (typeof b.detail === "string") detail = b.detail;
      else if (b.detail && typeof b.detail === "object" && "message" in b.detail) detail = String((b.detail as { message: unknown }).message);
    }
    throw new ApiError(detail, res.status);
  }
  return body;
}
