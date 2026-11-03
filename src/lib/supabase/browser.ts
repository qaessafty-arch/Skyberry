import { createBrowserClient } from "@supabase/ssr";
let c: ReturnType<typeof createBrowserClient> | null = null;
export const supabase = () => (c ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!));
