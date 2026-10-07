/**
 * Pull a human-readable message out of an axios/API error.
 * Replaces the ~10 copy-pasted `extractApiError` helpers across screens.
 */
export function extractApiError(err: unknown, fallback = "Something went wrong"): string {
  const anyErr = err as {
    response?: {
      data?: {
        message?: unknown;
        error?: unknown;
        errors?: Array<{ message?: unknown; path?: unknown } | string>;
      };
    };
    message?: unknown;
  };
  const data = anyErr?.response?.data;
  const details = data?.errors;
  if (Array.isArray(details) && details.length > 0) {
    const parts = details
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const msg = typeof item.message === "string" ? item.message.trim() : "";
          const path = typeof item.path === "string" ? item.path.replace(/^body\./, "") : "";
          if (msg && path) return `${path}: ${msg}`;
          return msg;
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }

  const fromResponse = data?.message ?? data?.error;
  if (typeof fromResponse === "string" && fromResponse.trim()) return fromResponse;
  if (Array.isArray(fromResponse) && typeof fromResponse[0] === "string") {
    return fromResponse[0];
  }
  if (typeof anyErr?.message === "string" && anyErr.message.trim()) {
    const msg = anyErr.message.trim();
    if (/network error|failed to fetch|load failed/i.test(msg)) {
      return "Cannot reach the API server. Start the backend (port 5000) and check your database connection.";
    }
    return msg;
  }
  return fallback;
}

/** Map API validation `errors[].path` (e.g. body.email) onto form field keys. */
export function extractApiFieldErrors(
  err: unknown,
): Record<string, string> {
  const details = (err as { response?: { data?: { errors?: unknown } } })?.response
    ?.data?.errors;
  if (!Array.isArray(details)) return {};
  const map: Record<string, string> = {};
  for (const item of details) {
    if (!item || typeof item !== "object") continue;
    const path = typeof (item as { path?: unknown }).path === "string"
      ? String((item as { path: string }).path)
      : "";
    const message =
      typeof (item as { message?: unknown }).message === "string"
        ? String((item as { message: string }).message)
        : "";
    if (!path || !message) continue;
    const key = path.replace(/^body\./, "").replace(/^query\./, "").split(".")[0];
    if (key && !map[key]) map[key] = message;
  }
  return map;
}
