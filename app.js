/* یادآور قطره چشم — منطق اصلی برنامه */
"use strict";

const VAPID_PUBLIC_KEY =
  "BEMjM0sNxh41x0a6Lz3YaqkJ7AUhZefxsOQgw-at69i0fM1CybVBcj7-QQXf4N_tPCgFnOXdRbQ5jrSrr9Yg9Lc";
const APP_VERSION = "2";
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

async function getOrCreatePushSubscription() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // اشتراک سالم: باید endpoint و کلیدهای auth/p256dh داشته باشد
  if (sub && sub.endpoint && sub.keys && sub.keys.auth && sub.keys.p256dh) {
    return sub;
  }
  // اشتراک موجود خراب/قدیمی است — حذفش می‌کنیم و یک اشتراک نو می‌سازیم
  if (sub) {
    try { await sub.unsubscribe(); } catch (e) { /* ignore */ }
    sub = null;
  }
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

async function subscribePush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      $("notifStatus").textContent = "مرورگر این گوشی از اعلان وب پشتیبانی نمی‌کند";
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      $("notifStatus").textContent = "اجازه اعلان داده نشد. از تنظیمات مرورگر اجازه دهید.";
      return;
    }
    const sub = await getOrCreatePushSubscription();
    const keys = sub.keys || {};
    const body = JSON.stringify({
      endpoint: sub.endpoint,
      auth: keys.auth,
      p256dh: keys.p256dh,
      topics: [schedule.topic],
    });
    const res = await fetch(schedule.server + "/v1/webpush", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (!res.ok) throw new Error("WebPush register HTTP " + res.status);
    localStorage.setItem("pushEnabled", "1");
    $("notifStatus").textContent = "✅ اعلان فعال شد — حتی با قفل بودن گوشی هم یادآوری می‌آید";
    updateNotifButtons(true);
  } catch (e) {
    $("notifStatus").textContent = "خطا در فعال‌سازی اعلان: " + (e && e.message ? e.message : e);
    console.error(e);
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

  $("enableBtn").addEventListener("click", () => subscribePush().catch((e) => { $("notifStatus").textContent = "خطا: " + e.message; }));
  $("disableBtn").addEventListener("click", () => unsubscribePush().catch((e) => { $("notifStatus").textContent = "خطا: " + e.message; }));

  // وضعیت فعلی اعلان
  try {
    const sub = await getPushSubscription();
    updateNotifButtons(!!sub);
    if (sub) $("notifStatus").textContent = "✅ اعلان فعال است";
    else $("notifStatus").textContent = "برای دریافت یادآوری در قفل گوشی، اعلان را فعال کنید";
  } catch (e) { /* ignore */ }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
