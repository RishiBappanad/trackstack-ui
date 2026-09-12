export class ApiError extends Error {}

export async function apiFetch(base: string, path: string, token: string | null, options: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // e.g. 204 No Content
  }
  if (!res.ok) {
    const detail = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new ApiError(detail);
  }
  return body;
}
