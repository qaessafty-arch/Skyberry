"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function NavLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  const on = usePathname().startsWith(href);
  return <Link href={href} aria-current={on ? "page" : undefined} aria-label={label}><span aria-hidden>{icon}</span><span className="lbl">{label}</span></Link>;
}
