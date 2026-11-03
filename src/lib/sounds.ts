/** Tiny synthesized sound effects (WebAudio) — no audio files to ship. All optional; callers check the user's preference. */
let ctx: AudioContext | null = null;
export type Sfx = "pop" | "ding" | "whoosh" | "giggle";
const NOTES: Record<Sfx, { f: number; t: number; d: number; type: OscillatorType }[]> = {
  pop: [{ f: 520, t: 0, d: 0.08, type: "sine" }, { f: 880, t: 0.05, d: 0.08, type: "sine" }],
  ding: [{ f: 988, t: 0, d: 0.25, type: "triangle" }, { f: 1319, t: 0.12, d: 0.3, type: "triangle" }],
  whoosh: [{ f: 300, t: 0, d: 0.18, type: "sawtooth" }, { f: 180, t: 0.1, d: 0.2, type: "sawtooth" }],
  giggle: [660, 740, 660, 784, 698].map((f, i) => ({ f, t: i * 0.07, d: 0.06, type: "square" as OscillatorType })),
};
export function playSfx(name: Sfx, volume = 0.12) {
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    for (const n of NOTES[name]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = n.type; o.frequency.value = n.f;
      g.gain.setValueAtTime(0.0001, now + n.t); g.gain.exponentialRampToValueAtTime(volume, now + n.t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      o.connect(g).connect(ctx.destination); o.start(now + n.t); o.stop(now + n.t + n.d + 0.02);
    }
  } catch { /* audio unavailable: silently skip */ }
}
