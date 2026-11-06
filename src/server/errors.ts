/** Errors safe to show to the user. Anything else is logged and shown generically. */
export class AppError extends Error {
  constructor(
    public code: "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "rate_limited" | "gone",
    message: string,
  ) {
    super(message);
  }
  get status() {
    return { bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, rate_limited: 429, gone: 410 }[this.code];
  }
}

export const forbidden = (m = "You don't have access to that.") => new AppError("forbidden", m);
export const notFound = (m = "Not found.") => new AppError("not_found", m);
export const badRequest = (m: string) => new AppError("bad_request", m);

/** Normalises driver differences in raw `db.execute` results. */
export function rowsOf<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: T[] }).rows ?? []) as T[];
}
