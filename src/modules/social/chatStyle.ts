export interface ChatStyle { bubble: string; bg: "none" | "ocean" | "deep" | "sunset" | "mint" | "custom" | "image"; bgColor: string; /** Own-folder storage path for an uploaded or generated background. */ bgPath: string | null; /** 0 (crisp) … 20 px of blur over the background image. */ bgBlur: number; /** Dims the background so text stays readable (0–0.8). */ bgDim: number; font: number; radius: number; gap: number; opacity: number; blur: number; family: "system" | "rounded" | "serif" | "mono" }
export const DEFAULT_STYLE: ChatStyle = { bubble: "#0a84ff", bg: "none", bgColor: "#bfe6ff", bgPath: null, bgBlur: 0, bgDim: 0.15, font: 16, radius: 18, gap: 8, opacity: 0.8, blur: 0, family: "system" };
const FAMILIES = { system: "inherit", rounded: "ui-rounded, 'SF Pro Rounded', system-ui", serif: "Georgia, serif", mono: "ui-monospace, monospace" } as const;
const BGS: Record<string, string> = { ocean: "linear-gradient(160deg,#0a84ff,#19e3ff 60%,#bfeaff)", deep: "linear-gradient(160deg,#06223f,#0a4d8f)", sunset: "linear-gradient(160deg,#ff9a8b,#ffd6a5)", mint: "linear-gradient(160deg,#7cf2d4,#d4fff3)" };

/** Clamp untrusted/persisted values so a corrupt row can never produce broken or unsafe CSS. */
export function sanitizeStyle(raw: Partial<ChatStyle> | null | undefined): ChatStyle {
  const r = raw ?? {}; const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d); const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return { bubble: hex(r.bubble, DEFAULT_STYLE.bubble), bg: (["none", "ocean", "deep", "sunset", "mint", "custom", "image"] as const).includes(r.bg as never) ? (r.bg as ChatStyle["bg"]) : "none", bgColor: hex(r.bgColor, DEFAULT_STYLE.bgColor),
    bgPath: typeof r.bgPath === "string" && /^[0-9a-f-]{36}\/[\w./-]{1,200}$/.test(r.bgPath) && !r.bgPath.includes("..") ? r.bgPath : null, bgBlur: n(r.bgBlur, 0, 20, 0), bgDim: n(r.bgDim, 0, 0.8, 0.15),
    font: n(r.font, 12, 22, 16), radius: n(r.radius, 4, 28, 18), gap: n(r.gap, 2, 20, 8), opacity: n(r.opacity, 0.2, 1, 0.8), blur: n(r.blur, 0, 20, 0), family: (Object.keys(FAMILIES) as ChatStyle["family"][]).includes(r.family as never) ? (r.family as ChatStyle["family"]) : "system" };
}
export function styleVars(s: ChatStyle, bgUrl?: string | null): Record<string, string | number> {
  const img = s.bg === "image" && bgUrl ? `linear-gradient(rgba(0,0,0,${s.bgDim}),rgba(0,0,0,${s.bgDim})), url("${bgUrl}") center/cover` : undefined;
  return { "--bubble": s.bubble, "--bubble-radius": `${s.radius}px`, "--msg-gap": `${s.gap}px`, fontSize: s.font, fontFamily: FAMILIES[s.family], background: s.bg === "none" || (s.bg === "image" && !img) ? undefined as never : img ?? (s.bg === "custom" ? s.bgColor : BGS[s.bg]) };
}
