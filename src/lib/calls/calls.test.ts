import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { qualityFromStats, lossBetween, isPolite, turnCredentials, callMode, MAX_MESH_PARTICIPANTS } from "./logic";

describe("call quality", () => {
  it("grades by RTT and loss", () => {
    expect(qualityFromStats({ rttMs: 40, lossPct: 0 })).toBe("good");
    expect(qualityFromStats({ rttMs: 200, lossPct: 1 })).toBe("fair");
    expect(qualityFromStats({ rttMs: 80, lossPct: 8 })).toBe("poor");
    expect(qualityFromStats({ rttMs: 500, lossPct: 0 })).toBe("poor");
    expect(qualityFromStats({ rttMs: null, lossPct: null })).toBe("good");
  });
  it("computes interval loss", () => {
    expect(lossBetween(null, { lost: 5, received: 95 })).toBeNull();
    expect(lossBetween({ lost: 0, received: 100 }, { lost: 10, received: 190 })).toBeCloseTo(10);
    expect(lossBetween({ lost: 3, received: 10 }, { lost: 3, received: 10 })).toBeNull();
  });
});
describe("negotiation roles", () => {
  it("exactly one side of a pair is polite", () => { expect(isPolite("b", "a")).toBe(true); expect(isPolite("a", "b")).toBe(false); });
});
describe("turn credentials", () => {
  it("follows the coturn REST scheme", () => {
    const c = turnCredentials("s3cret", "user-1", 1_000_000, 600);
    expect(c.username).toBe("1000600:user-1");
    expect(c.credential).toBe(createHmac("sha1", "s3cret").update("1000600:user-1").digest("base64"));
    expect(turnCredentials("other", "user-1", 1_000_000, 600).credential).not.toBe(c.credential);
  });
});
describe("rooms", () => {
  it("maps types to default call mode and caps the mesh", () => { expect(callMode("video")).toBe("video"); expect(callMode("study")).toBe("audio"); expect(MAX_MESH_PARTICIPANTS).toBeLessThanOrEqual(8); });
});
