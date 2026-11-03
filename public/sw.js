/* OCEAN service worker: web push + offline fallback for navigations. No user data is cached. */
const OFFLINE = "/offline.html";
self.addEventListener("install", (e) => { e.waitUntil(caches.open("ocean-shell-v1").then((c) => c.add(OFFLINE))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});

self.addEventListener("push", (e) => {
  let d = { title: "OCEAN", body: "You have a new notification", url: "/chats", tag: "ocean" };
  try { d = { ...d, ...e.data.json() }; } catch (_) { /* keep defaults */ }
  // Foreground tabs also hear about it (used for an in-app toast and for testing the parser).
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ type: "push-received", payload: d }))));
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, data: { url: d.url }, icon: "/icon-192.png", badge: "/icon-192.png", renotify: true }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const raw = (e.notification.data && e.notification.data.url) || "/chats";
  const url = new URL(raw, self.location.origin); if (url.origin !== self.location.origin) return; // same-origin only
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if (new URL(c.url).origin === url.origin) { await c.focus(); if ("navigate" in c) await c.navigate(url.href); return; }
    await self.clients.openWindow(url.href);
  })());
});
