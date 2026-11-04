import "@fontsource-variable/geist";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import { Background } from "@/modules/ocean/Background";
export const metadata: Metadata = { title: `${BRAND.name} — ${BRAND.tagline}`, description: "A private social space for friends.", manifest: "/manifest.webmanifest", icons: { icon: "/icon-192.png", apple: "/icon-192.png" }, appleWebApp: { capable: true, title: "OCEAN", statusBarStyle: "default" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a84ff" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Background />{children}</body></html>;
}
