/** Sliding-window limiter. In-memory = per server instance; swap `store` for Redis/Upstash in multi-instance production. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  check(key: string, now = Date.now()): { ok: boolean; retryAfterMs: number } {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) { this.hits.set(key, recent); return { ok: false, retryAfterMs: this.windowMs - (now - recent[0]) }; }
    recent.push(now); this.hits.set(key, recent);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    return { ok: true, retryAfterMs: 0 };
  }
}
