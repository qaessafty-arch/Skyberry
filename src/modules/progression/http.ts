import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";

export async function authed<T>(fn: (ctx: NonNullable<Awaited<ReturnType<typeof requireUser>>>) => Promise<T>) {
  const ctx = await requireUser();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await fn(ctx));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg === "forbidden" || msg === "not_a_member" ? 403 : msg === "bad_request" ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
