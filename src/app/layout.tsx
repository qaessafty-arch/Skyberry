import "./globals.css";
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = { title: "OCEAN — a little world for the people who matter", description: "A private social universe for friends." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a84ff" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
