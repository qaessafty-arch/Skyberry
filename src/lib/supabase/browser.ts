import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
// Schema types aren't generated yet (`supabase gen types`), so rows are loosely typed here and narrowed at the call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = SupabaseClient<any, "public", any>;
let c: Loose | null = null;
export const supabase = (): Loose => (c ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!) as unknown as Loose);
