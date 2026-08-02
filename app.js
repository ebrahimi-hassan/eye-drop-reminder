/* یادآور قطره چشم — منطق اصلی برنامه */
"use strict";

const VAPID_PUBLIC_KEY =
  "BEMjM0sNxh41x0a6Lz3YaqkJ7AUhZefxsOQgw-at69i0fM1CybVBcj7-QQXf4N_tPCgFnOXdRbQ5jrSrr9Yg9Lc";
const APP_VERSION = "5";
const SCHEDULE_URL = "schedule.json";
const doneKey = (dateStr, time) => "done:" + dateStr + ":" + time;

let schedule = null;
let today = new Date();

/* ---------- تقویم جلالی ---------- */
const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function dateToStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function persianDate(d) {
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return WEEKDAYS[d.getDay()] + " " + jd + " " + JALALI_MONTHS[jm - 1] + " " + jy;
}

function toPersianDigits(str) {
  return String(str).replace(/\d/g, (x) => "۰۱۲۳۴۵۶۷۸۹"[x]);
}

/* ---------- منطق زمانبندی ---------- */
function currentWeek(d, weeks) {
  const ds = dateToStr(d);
  for (const w of weeks) {
    if (ds >= w.start && ds <= w.end) return w;
  }
  if (ds < weeks[0].start) return { before: true, first: weeks[0] };
  return { after: true, last: weeks[weeks.length - 1] };
}

function slotAt(week, timeStr) {
  if (!week || !week.slots) return null;
  return week.slots.find((s) => s.time === timeStr) || null;
}

function nowHHMM() {
  const h = String(today.getHours()).padStart(2, "0");
  const m = String(today.getMinutes()).padStart(2, "0");
  return h + ":" + m;
}

function minutesOf(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function drugClass(name) {
  if (!name) return "drug-0";
  if (name.includes("بتامتازون") && name.includes("کلوبیوتیک")) return "drug-bc";
  if (name.includes("بتامتازون")) return "drug-b";
  return "drug-c";
}

function buildNotificationText(week, slot) {
  const lines = [];
  if (slot.right) lines.push("چشم راست: " + slot.right);
  if (slot.left) lines.push("چشم چپ: " + slot.left);
  return lines.join("\n");
}

/* ---------- رندر رابط کاربری ---------- */
const $ = (id) => document.getElementById(id);

function render() {
  $("todayLabel").textContent = "امروز: " + persianDate(today);

  const wk = currentWeek(today, schedule.weeks);
  const banner = $("weekBanner");

  if (wk.before) {
    $("weekLabel").textContent = "نسخه هنوز شروع نشده است";
    $("weekSub").textContent = "شروع از " + wk.first.label;
    $("weekProgress").style.width = "0%";
    $("nextDesc").textContent = "اولین نوبت در " + wk.first.start;
    $("nextTime").textContent = "--:--";
    renderEmptyTable();
    return;
  }
  if (wk.after) {
    $("weekLabel").textContent = "نسخه به پایان رسیده است ✅";
    $("weekSub").textContent = "پایان " + wk.last.label;
    $("weekProgress").style.width = "100%";
    $("nextDesc").textContent = "دیگر نوبتی وجود ندارد";
    $("nextTime").textContent = "--:--";
    renderEmptyTable();
    return;
  }

  // روز جاری از هفته
  const start = new Date(wk.start + "T00:00:00");
  const totalDays = Math.round((new Date(wk.end + "T00:00:00") - start) / 86400000) + 1;
  const dayIndex = Math.round((today - start) / 86400000) + 1;
  const dayOfWeek = WEEKDAYS[today.getDay()];

  $("weekLabel").textContent = wk.label;
  $("weekSub").textContent = dayOfWeek + " — روز " + toPersianDigits(dayIndex) + " از " + toPersianDigits(totalDays);
  $("weekProgress").style.width = Math.round((dayIndex / totalDays) * 100) + "%";

  // نوبت بعدی
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const upcoming = (wk.slots || []).filter((s) => minutesOf(s.time) > nowMin);
  if (upcoming.length > 0) {
    const next = upcoming[0];
    $("nextTime").textContent = toPersianDigits(next.time);
    $("nextDesc").textContent = buildNotificationText(wk, next) || "—";
    $("nextSmall").textContent = "نوبت بعدی";
  } else {
    $("nextTime").textContent = "✔";
    $("nextDesc").textContent = "نوبت‌های امروز تمام شد";
    $("nextSmall").textContent = "فردا ادامه دارد";
  }

  renderTable(wk);
}

function renderEmptyTable() {
  $("todayTable").innerHTML = '<div class="empty">—</div>';
}

function renderTable(wk) {
  const ds = dateToStr(today);
  const slots = wk.slots || [];
  if (slots.length === 0) {
    $("todayTable").innerHTML = '<div class="empty">امروز نوبتی نیست</div>';
    return;
  }
  let html = "<table><thead><tr><th>ساعت</th><th>چشم راست</th><th>چشم چپ</th><th>وضعیت</th></tr></thead><tbody>";
  for (const s of slots) {
    const r = s.right ? `<span class="drug ${drugClass(s.right)}">${s.right}</span>` : '<span class="drug drug-0">—</span>';
    const l = s.left ? `<span class="drug ${drugClass(s.left)}">${s.left}</span>` : '<span class="drug drug-0">—</span>';
    const isDone = !!localStorage.getItem(doneKey(ds, s.time));
    const doneBtn = `<button class="done-btn ${isDone ? "done" : ""}" data-time="${s.time}" data-done="${isDone ? 1 : 0}">${isDone ? "✓ انجام شد" : "انجام شد؟"}</button>`;
    html += `<tr><td class="time">${toPersianDigits(s.time)}</td><td>${r}</td><td>${l}</td><td>${doneBtn}</td></tr>`;
  }
  html += "</tbody></table>";
  $("todayTable").innerHTML = html;

  document.querySelectorAll(".done-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const time = btn.dataset.time;
      const key = doneKey(ds, time);
      const now = !localStorage.getItem(key);
      if (now) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
      renderTable(wk);
    });
  });
}

/* ---------- اعلان وب پوش ---------- */
function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

async function getPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

const VALID_SUB = (s) => !!s && !!s.endpoint && !!s.keys && !!s.keys.auth && !!s.keys.p256dh;

async function getOrCreatePushSubscription() {
  const reg = await navigator.serviceWorker.ready;
  const pm = reg.pushManager;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ۱) اشتراک موجود و سالم؟
  let existing = await pm.getSubscription();
  if (VALID_SUB(existing)) return existing;

  // ۲) اشتراک خراب/قدیمی را کاملاً حذف کن (گاهی یک بار کافی نیست)
  if (existing) {
    try { await existing.unsubscribe(); } catch (e) { /* ignore */ }
    await sleep(800);
  }
  let remaining = await pm.getSubscription();
  if (remaining) {
    try { await remaining.unsubscribe(); } catch (e) { /* ignore */ }
    await sleep(800);
  }

  // ۳) اشتراک تازه بساز (تا ۳ بار تلاش — گاهی تلاش اول ناقص برمی‌گردد)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const fresh = await pm.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      if (VALID_SUB(fresh)) return fresh;
      console.log("[eyedrops] subscribe returned keyless subscription, attempt", attempt, fresh.endpoint);
      try { await fresh.unsubscribe(); } catch (e) { /* ignore */ }
      await sleep(800);
    } catch (e) {
      console.log("[eyedrops] subscribe attempt", attempt, "failed:", e.message);
      if (attempt === 3) throw e;
      await sleep(800);
    }
  }
  const last = await pm.getSubscription();
  if (last) return last;
  throw new Error("مرورگر نتوانست اشتراک اعلان بسازد");
}

function endpointHost(sub) {
  try {
    return new URL(sub.endpoint).host;
  } catch (e) {
    return "?";
  }
}

/* ریست کامل: حذف همه سرویس‌ورکرها، اشتراک‌ها و کش — برای رفع وضعیت خراب */
async function fullReset() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      try {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      } catch (e) { /* ignore */ }
      await reg.unregister();
    }
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* ignore */ }
    localStorage.clear();
    $("notifStatus").textContent = "✅ ریست کامل انجام شد. حالا برنامه را کاملاً ببندید و دوباره باز کنید، سپس «فعال کردن اعلان» را بزنید.";
    $("resetBtn").style.display = "none";
  } catch (e) {
    $("notifStatus").textContent = "خطا در ریست: " + e.message;
  }
}

function showNtfyFallback() {
  const card = $("fallbackCard");
  if (!card) return;
  const linkEl = $("topicLink");
  const copyBtn = $("copyTopicBtn");
  if (schedule && schedule.topic) {
    const link = schedule.server + "/" + schedule.topic;
    linkEl.textContent = link;
    copyBtn.onclick = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(link);
      copyBtn.textContent = "✅ کپی شد";
      setTimeout(() => { copyBtn.textContent = "کپی کردن لینک"; }, 2000);
    };
  }
  card.style.display = "block";
}

async function subscribePush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      $("notifStatus").textContent = "مرورگر این گوشی از اعلان وب پشتیبانی نمی‌کند — از راه‌حل جایگزین (اپ ntfy) استفاده کنید.";
      showNtfyFallback();
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      $("notifStatus").textContent = "اجازه اعلان داده نشد. از تنظیمات مرورگر اجازه دهید.";
      return;
    }
    const sub = await getOrCreatePushSubscription();
    const keys = sub.keys || {};
    if (!keys.auth || !keys.p256dh) {
      $("notifStatus").textContent = "اشتراک اعلان بدون کلید امنیتی است (endpoint: " + endpointHost(sub) + "). در کروم: منوی ⋯ → Site settings → Clear & reset، بعد دوباره امتحان کنید. یا از راه‌حل جایگزین (اپ ntfy) استفاده کنید.";
      console.log("[eyedrops] Broken subscription, no keys:", sub.endpoint);
      showNtfyFallback();
      return;
    }
    const body = JSON.stringify({
      endpoint: sub.endpoint,
      auth: keys.auth,
      p256dh: keys.p256dh,
      topics: [schedule.topic],
    });
    const res = await fetch(schedule.server + "/v1/webpush", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (!res.ok) {
      $("notifStatus").textContent = "سرور اعلان مرورگر این گوشی را قبول نکرد (endpoint: " + endpointHost(sub) + ") — از راه‌حل جایگزین (اپ ntfy) استفاده کنید.";
      console.log("[eyedrops] Register rejected:", res.status, sub.endpoint);
      showNtfyFallback();
      return;
    }
    localStorage.setItem("pushEnabled", "1");
    $("notifStatus").textContent = "✅ اعلان فعال شد — حتی با قفل بودن گوشی هم یادآوری می‌آید";
    updateNotifButtons(true);
  } catch (e) {
    const name = e && e.name ? e.name : "";
    const msg = e && e.message ? e.message : String(e);
    $("notifStatus").textContent = "خطا در فعال‌سازی اعلان (" + name + "): " + msg + " — دکمه «ریست کامل» را بزنید و دوباره امتحان کنید.";
    console.error("[eyedrops] subscribe error:", e);
  }
}

async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try {
      await fetch(schedule.server + "/v1/webpush", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    } catch (e) { /* ignore */ }
    await sub.unsubscribe();
  }
  localStorage.removeItem("pushEnabled");
  $("notifStatus").textContent = "اعلان خاموش شد";
  updateNotifButtons(false);
}

function updateNotifButtons(enabled) {
  $("enableBtn").style.display = enabled ? "none" : "block";
  $("disableBtn").style.display = enabled ? "block" : "none";
}

/* ---------- یادآوری درون‌اپی (فقط وقتی اپ باز است و پوش فعال نیست) ---------- */
const notifiedKeys = new Set(JSON.parse(localStorage.getItem("notifiedKeys") || "[]"));

async function localScheduler() {
  if (!schedule) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;
  const sub = await getPushSubscription().catch(() => null);
  if (sub) return; // اگر پوش فعال است، اعلان از سمت سرور می‌آید — اینجا اعلان تکراری نمی‌سازیم
  const wk = currentWeek(today, schedule.weeks);
  if (!wk || wk.before || wk.after) return;
  const now = nowHHMM();
  const slot = slotAt(wk, now);
  if (!slot) return;
  const key = dateToStr(today) + ":" + slot.time;
  if (notifiedKeys.has(key)) return;
  const registration = await navigator.serviceWorker.ready;
  registration.showNotification("💧 " + toPersianDigits(slot.time) + " — قطره چشم", {
    body: buildNotificationText(wk, slot),
    icon: "icons/icon-192.png",
    tag: key,
  });
  notifiedKeys.add(key);
  localStorage.setItem("notifiedKeys", JSON.stringify([...notifiedKeys]));
}

/* ---------- راه‌اندازی ---------- */
function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch((e) => console.error("SW error", e));
  }
}

async function init() {
  registerSW();
  const verEl = document.getElementById("appVersion");
  if (verEl) verEl.textContent = "نسخه " + APP_VERSION;
  try {
    const res = await fetch(SCHEDULE_URL + "?v=" + Date.now());
    schedule = await res.json();
  } catch (e) {
    $("todayTable").innerHTML = '<div class="empty">خطا در بارگذاری برنامه. اینترنت یا فایل schedule.json را بررسی کنید.</div>';
    return;
  }
  render();
  setInterval(() => { today = new Date(); render(); }, 60000); // هر دقیقه به‌روزرسانی
  setInterval(localScheduler, 30000); // هر ۳۰ ثانیه بررسی نوبت درون‌اپی

  $("enableBtn").addEventListener("click", () => subscribePush().catch((e) => { $("notifStatus").textContent = "خطا: " + e.message; $("resetBtn").style.display = "block"; }));
  $("disableBtn").addEventListener("click", () => unsubscribePush().catch((e) => { $("notifStatus").textContent = "خطا: " + e.message; }));
  $("resetBtn").addEventListener("click", () => fullReset());

  // وضعیت فعلی اعلان
  try {
    const sub = await getPushSubscription();
    const validSub = sub && sub.keys && sub.keys.auth && sub.keys.p256dh;
    updateNotifButtons(!!validSub);
    if (validSub) $("notifStatus").textContent = "✅ اعلان فعال است";
    else if (sub) {
      $("notifStatus").textContent = "اشتراک اعلان این مرورگر ناقص است. دکمه «ریست کامل» را بزنید و دوباره امتحان کنید — یا از راه‌حل جایگزین (اپ ntfy) استفاده کنید.";
      showNtfyFallback();
      $("resetBtn").style.display = "block";
    } else $("notifStatus").textContent = "برای دریافت یادآوری در قفل گوشی، اعلان را فعال کنید";
  } catch (e) { /* ignore */ }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
