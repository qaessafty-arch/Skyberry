import { redirect } from "next/navigation";
import Link from "next/link";
import { userClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import { Presence } from "./Presence";
import { NavLink } from "./NavLink";

const NAV = [["/chats", "💬", "Chats"], ["/moments", "✨", "Moments"], ["/camera", "📷", "Camera"], ["/universe", "🪐", "Ocean Universe"], ["/pets", "🐙", "Pets"], ["/friends", "🫧", "Friends"], ["/rooms", "🏝️", "Rooms"], ["/saved", "💾", "Saved"], ["/notifications", "🔔", "Notifications"], ["/settings", "⚙️", "Settings"]] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { data } = await (await userClient()).auth.getUser();
  if (!data.user) redirect("/login");
  return (
    <div className="shell">
      <nav className="nav glass" aria-label="Main" style={{ borderRadius: 0 }}>
        <Link href="/chats" className="brand">{BRAND.name}</Link>
        {NAV.map(([href, icon, label]) => <NavLink key={href} href={href} icon={icon} label={label} />)}
      </nav>
      <main className="main">{children}</main>
      <Presence />
    </div>
  );
}
