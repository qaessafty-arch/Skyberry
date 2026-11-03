import { NextResponse } from "next/server";
import { requireUser, adminClient } from "@/lib/supabase/server";

/**
 * Short-lived signed URL for a media object, minted only if the caller can already SEE a row that
 * references it. We query with the user's own client so RLS (membership, audience, double-reveal) decides.
 */
export async function GET(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!/^[0-9a-f-]{36}\/[\w./-]{1,200}$/.test(path) || path.includes("..")) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { sb, user } = ctx;
  let ok = path.startsWith(`${user.id}/`);
  if (!ok) {
    for (const t of ["messages", "moments", "double_reveals"] as const) {
      const { data } = await sb.from(t).select("media_path").eq("media_path", path).limit(1);
      if (data?.length) { ok = true; break; }
    }
  }
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data } = await adminClient().storage.from("media").createSignedUrl(path, 300);
  return NextResponse.json({ url: data?.signedUrl });
}
