import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
const supa = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
const supaHttp = supa ? supa.origin : "";
const supaWs = supa ? `${supa.protocol === "https:" ? "wss" : "ws"}://${supa.host}` : "";

/**
 * Content-Security-Policy. Next.js needs inline scripts for hydration (a nonce-based policy would require dynamic rendering
 * everywhere), so script-src allows 'unsafe-inline'; everything else is locked down. 'wasm-unsafe-eval' is for MediaPipe.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supaHttp} https://media.tenor.com https://c.tenor.com https://i.giphy.com https://*.giphy.com`.trim(),
  `media-src 'self' blob: ${supaHttp}`.trim(),
  `connect-src 'self' blob: ${supaHttp} ${supaWs}${dev ? " ws://localhost:* http://localhost:*" : ""}`.replace(/\s+/g, " ").trim(),
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), display-capture=(self), payment=()" },
        ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
      ],
    }, {
      // The service worker must be served fresh and may not be cached by intermediaries.
      source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }],
    }];
  },
};
export default config;
