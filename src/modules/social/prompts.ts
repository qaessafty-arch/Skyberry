export const PROMPTS = [
  "Show your current view.", "What made you laugh today?", "Your most chaotic moment.", "Show your lunch.",
  "Take a photo of something blue.", "Show your current mood.", "Send a photo without explaining it.",
  "Something small that made today better.", "Your desk, as it really is.", "A shadow you like.",
];
/** Same prompt for everyone on a given calendar day. */
export function promptForDay(day: string) { let h = 0; for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0; return { id: `p${h % PROMPTS.length}`, text: PROMPTS[h % PROMPTS.length] }; }
export const MOODS = ["😄 Happy", "😴 Sleepy", "🤪 Chaotic", "🥹 Soft", "🔥 Hyped", "🌧️ Meh"];
