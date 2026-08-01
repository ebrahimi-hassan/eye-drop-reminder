/* سرویس ورکر — کش آفلاین و دریافت اعلان وب پوش */
"use strict";

const CACHE_NAME = "eyedrops-v1";
const CORE_ASSETS = ["./", "index.html", "app.js", "manifest.json", "schedule.json", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // schedule.json و index.html: اول اینترنت (تا به‌روزرسانی‌ها دیده شود)، سپس کش
  if (url.pathname.includes("schedule.json") || url.pathname.endsWith("index.html") || url.pathname.endsWith("/")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // بقیه: اول کش، سپس شبکه
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

/* اعلان وب پوش دریافتی از ntfy.sh */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    const raw = event.data.json();
    if (raw && typeof raw === "object") payload = raw;
  } catch (e) {
    payload = { message: event.data.text() };
  }

  const title = payload.title || "💧 قطره چشم";
  const body = payload.message || "";
  const tag = payload.id || Date.now().toString();
  const options = {
    body: body,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: tag,
    renotify: true,
    data: { url: self.location.origin + "/" },
    actions: [{ action: "open", title: "باز کردن برنامه" }]
  };
  if (payload.priority >= 4) options.requireInteraction = true;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.location.origin + "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
