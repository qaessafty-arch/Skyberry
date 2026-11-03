import { authed } from "@/modules/progression/http";
import { adminClient } from "@/lib/supabase/server";
import { QUOTA_BYTES } from "@/lib/security/upload";

/** Storage-used indicator for the caller. */
export const GET = () => authed(async ({ user }) => {
  const { data } = await adminClient().rpc("storage_used", { uid: user.id });
  return { usedBytes: Number(data) || 0, quotaBytes: QUOTA_BYTES };
});
