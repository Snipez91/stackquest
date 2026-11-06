import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiContext, type Context } from "./auth/current";
import { AppError } from "./errors";

/** Wraps a JSON route handler: auth, same-origin check for writes, error mapping. */
export function route<T, P extends Record<string, string> = Record<string, string>>(
  handler: (ctx: Context, req: Request, params: P) => Promise<T>,
) {
  return async (req: Request, info?: { params?: Promise<P> }) => {
    try {
      if (req.method !== "GET" && !sameOrigin(req)) {
        return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
      }
      const ctx = await apiContext();
      if (!ctx) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
      const data = await handler(ctx, req, ((await info?.params) ?? {}) as P);
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  console.error("[api]", e);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
}

/** CSRF defence for JSON APIs: require Origin (or Referer) to match Host. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === host;
  } catch {
    return false;
  }
}

export async function readJson(req: Request, maxBytes = 300_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("bad_request", "Request is too large.");
  return text ? JSON.parse(text) : {};
}
