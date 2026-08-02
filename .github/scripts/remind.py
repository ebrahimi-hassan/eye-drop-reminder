#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import datetime
import json
import os
import sys
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCHEDULE_PATH = os.path.join(REPO_ROOT, "schedule.json")
SLOT_WINDOW_MINUTES = 12


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


def publish(schedule, title, message, priority=5, tags=None, delay=None):
    payload = {
        "topic": schedule["topic"],
        "title": title,
        "message": message,
        "priority": priority,
    }
    if tags:
        payload["tags"] = tags
    if delay:
        payload["delay"] = delay
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
            "🚨 تست یادآور قطره چشم",
            "این یک پیام آزمایشی است.\nزمان حال تهران: {}:{}".format(str(now.hour).zfill(2), str(now.minute).zfill(2)),
            priority=5,
            tags=["rotating_light"],
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
        "🚨 {} — نوبت قطره چشم!".format(matched["time"]),
        message,
        priority=5,
        tags=["rotating_light"],
    )
    print("Sent reminder for {} -> HTTP {}".format(matched["time"], status))

    followup = schedule.get("followup_minutes", 20)
    if isinstance(followup, int) and followup > 0:
        fstatus = publish(
            schedule,
            "⏰ قطره چشم هنوز؟",
            "اگر هنوز قطره را نریخته‌اید، الان بریزید:\n" + message,
            priority=5,
            tags=["rotating_light"],
            delay="{}m".format(followup),
        )
        print("Scheduled follow-up in {}m -> HTTP {}".format(followup, fstatus))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
