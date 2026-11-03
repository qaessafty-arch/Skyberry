import { describe, it, expect } from "vitest";
import { buildPushPayload, isGoneStatus, validSubscription } from "./payload";

describe("push payloads", () => {
  it("never includes message content, only sender and event", () => {
    const p = buildPushPayload("message", { from: "Ann", conversationId: "c1", body: "my secret plan", text: "nope" });
    expect(JSON.stringify(p)).not.toMatch(/secret|nope/); expect(p).toMatchObject({ title: "Ann", url: "/chats?c=c1" });
  });
  it("routes calls to the call page with the right mode", () => {
    expect(buildPushPayload("call", { from: "Bo", conversationId: "c2", mode: "audio" }).url).toBe("/rooms/c2/call?mode=audio");
    expect(buildPushPayload("call", { conversationId: "c2" }).url).toBe("/rooms/c2/call?mode=video");
  });
  it("covers every kind with a same-origin path", () => {
    for (const k of ["message", "mention", "call", "missed_call", "friend_request", "group_invite", "room_invite", "reaction", "moment", "sticker_request"] as const) expect(buildPushPayload(k, {}).url.startsWith("/")).toBe(true);
  });
});
describe("subscriptions", () => {
  it("gone statuses", () => { expect(isGoneStatus(410)).toBe(true); expect(isGoneStatus(404)).toBe(true); expect(isGoneStatus(500)).toBe(false); expect(isGoneStatus(undefined)).toBe(false); });
  it("validates shape and https", () => {
    const ok = { endpoint: "https://push.example/abc", keys: { p256dh: "BNc-abc_123", auth: "xyz-123_" } };
    expect(validSubscription(ok)).toBe(true);
    expect(validSubscription({ ...ok, endpoint: "http://push.example/abc" })).toBe(false);
    expect(validSubscription({ ...ok, endpoint: "javascript:alert(1)" })).toBe(false);
    expect(validSubscription({ ...ok, keys: { p256dh: "bad key!", auth: "x" } })).toBe(false);
    expect(validSubscription(null)).toBe(false);
  });
});

import { urlBase64ToUint8Array } from "../../modules/notify/PushSetup";
describe("vapid key decoding", () => {
  it("decodes url-safe base64 with and without padding", () => { expect(Array.from(urlBase64ToUint8Array("aGk"))).toEqual([104, 105]); expect(Array.from(urlBase64ToUint8Array("_-8"))).toEqual([255, 239]); });
});
