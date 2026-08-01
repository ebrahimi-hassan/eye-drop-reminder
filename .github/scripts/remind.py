#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
زمان‌بند یادآور قطره چشم
هر بار که GitHub Actions این اسکریپت را اجرا می‌کند:
1) زمان فعلی تهران (UTC+3:30) محاسبه می‌شود
2) هفته‌ی جاری از schedule.json پیدا می‌شود
3) اگر ساعت فعلی با یک نوبت نسخه هم‌خوانی داشت، اعلان به ntfy.sh ارسال می‌شود
"""
import datetime
import json
import os
import sys
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCHEDULE_PATH = os.path.join(REPO_ROOT, "schedule.json")
SLOT_WINDOW_MINUTES = 12  # اگر اجرا تا ۱۲ دقیقه تأخیر داشت، باز ارسال می‌کند


def load_schedule():
    with open(SCHEDULE_PATH, encoding="utf-8") as f:
        return json.load(f)


def now_tehran(offset_minutes):
    return datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=offset_minutes)


def current_week(dt, weeks):
    ds = dt.date().isoformat()
    for w in weeks:
        if w["start"] <= ds <= w["end"]:
            return w
    return None


def minutes_of(time_str):
    h, m = map(int, time_str.split(":"))
    return h * 60 + m


def build_message(slot):
    lines = []
    if slot.get("right"):
        lines.append("چشم راست: " + slot["right"])
    if slot.get("left"):
        lines.append("چشم چپ: " + slot["left"])
    return "\n".join(lines)


def pages_url():
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" in repo:
        owner, name = repo.split("/", 1)
        return "https://{}.github.io/{}/".format(owner, name)
    return ""


def publish(schedule, title, message, priority=4):
    payload = {
        "topic": schedule["topic"],
        "title": title,
        "message": message,
        "priority": priority,
    }
    url = pages_url()
    if url:
        payload["click"] = url
        payload["actions"] = [
            {"action": "view", "label": "باز کردن برنامه", "url": url}
        ]
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        schedule["server"] + "/",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status


def main():
    send_test = os.environ.get("SEND_TEST") == "1"
    schedule = load_schedule()
    now = now_tehran(schedule.get("timezone_offset_minutes", 210))
    now_min = now.hour * 60 + now.minute

    if send_test:
        status = publish(
            schedule,
            "💧 تست یادآور قطره چشم",
            "این یک پیام آزمایشی است.\nزمان حال تهران: {}:{}".format(str(now.hour).zfill(2), str(now.minute).zfill(2)),
            priority=3,
        )
        print("TEST message sent, HTTP", status)
        return

    week = current_week(now, schedule["weeks"])
    if week is None:
        print("No active week for today ({}) — nothing to send".format(now.date().isoformat()))
        return

    matched = None
    for slot in week["slots"]:
        sm = minutes_of(slot["time"])
        if sm <= now_min <= sm + SLOT_WINDOW_MINUTES:
            matched = slot
            break

    if matched is None:
        print("No matching slot at {}:{} today".format(str(now.hour).zfill(2), str(now.minute).zfill(2)))
        return

    message = build_message(matched)
    status = publish(
        schedule,
        "💧 {} — قطره چشم".format(matched["time"]),
        message,
        priority=4,
    )
    print("Sent reminder for {} -> HTTP {}".format(matched["time"], status))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
