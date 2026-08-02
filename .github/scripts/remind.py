#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
زمان‌بند یادآور قطره چشم — نسخه‌ی «پیش‌برنامه‌ریزی»
هر اجرا، نوبت‌های ۲۴ ساعت آینده را روی خود ntfy زمان‌بندی می‌کند (با تأخیر دقیق).
بدین ترتیب دقت تحویل بر عهده‌ی سرور ntfy است و تأخیر اجرای GitHub Actions بی‌اثر است.
"""
import datetime
import json
import os
import sys
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCHEDULE_PATH = os.path.join(REPO_ROOT, "schedule.json")

HORIZON_HOURS = 24
MIN_DELAY_MIN = 2
MAX_DELAY_MIN = 70 * 60


def load_schedule():
    with open(SCHEDULE_PATH, encoding="utf-8") as f:
        return json.load(f)


def now_tehran(offset_minutes):
    return datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=offset_minutes)


def current_week_for_date(day, weeks):
    ds = day.isoformat()
    for w in weeks:
        if w["start"] <= ds <= w["end"]:
            return w
    return None


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


def http_request(schedule, url, method, payload=None):
    headers = {"Content-Type": "application/json"}
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def get_scheduled_sequence_ids(schedule):
    url = "{}/{}/json?poll=1&sched=1".format(schedule["server"], schedule["topic"])
    _, content = http_request(schedule, url, "GET")
    ids = set()
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            m = json.loads(line)
            if m.get("event") == "message" and m.get("sequence_id"):
                ids.add(m["sequence_id"])
        except Exception:
            continue
    return ids


def publish_scheduled(schedule, seq_id, title, message, delay_minutes, priority=4):
    payload = {
        "topic": schedule["topic"],
        "title": title,
        "message": message,
        "priority": priority,
        "delay": "{}m".format(int(delay_minutes)),
        "sequence_id": seq_id,
        "tags": ["rotating_light"],
    }
    url = pages_url()
    if url:
        payload["click"] = url
        payload["actions"] = [
            {"action": "view", "label": "باز کردن برنامه", "url": url}
        ]
    status, _ = http_request(schedule, schedule["server"] + "/", "POST", payload)
    return status


def main():
    send_test = os.environ.get("SEND_TEST") == "1"
    schedule = load_schedule()
    now = now_tehran(schedule.get("timezone_offset_minutes", 210))

    if send_test:
        status, _ = http_request(schedule, schedule["server"] + "/", "POST", {
            "topic": schedule["topic"],
            "title": "🚨 تست یادآور قطره چشم",
            "message": "این یک پیام آزمایشی است.\nزمان حال تهران: {}".format(now.strftime("%H:%M")),
            "priority": 4,
            "tags": ["rotating_light"],
        })
        print("TEST message sent, HTTP", status)
        return

    already = get_scheduled_sequence_ids(schedule)
    print("Already scheduled messages: {}".format(len(already)))

    followups = schedule.get("followup_minutes", 20)
    if isinstance(followups, int):
        followups = [followups] if followups > 0 else []
    elif isinstance(followups, list):
        followups = [int(x) for x in followups if int(x) > 0]
    else:
        followups = []

    horizon = now + datetime.timedelta(hours=HORIZON_HOURS)
    day = now.date()
    added = 0
    while day <= horizon.date():
        week = current_week_for_date(day, schedule["weeks"])
        if week:
            for slot in week["slots"]:
                hh, mm = map(int, slot["time"].split(":"))
                delivery = datetime.datetime(day.year, day.month, day.day, hh, mm, tzinfo=now.tzinfo)
                delay_min = (delivery - now).total_seconds() / 60.0
                if delay_min < MIN_DELAY_MIN or delay_min > MAX_DELAY_MIN:
                    continue
                sid = "dose-{}-{}".format(day.isoformat(), slot["time"].replace(":", ""))
                message = build_message(slot)
                if sid not in already:
                    publish_scheduled(
                        schedule, sid,
                        "🚨 {} — نوبت قطره چشم!".format(slot["time"]),
                        message, delay_min,
                    )
                    added += 1
                for fm in followups:
                    fsid = "{}f{}".format(sid, fm)
                    fdelay = delay_min + fm
                    if fsid in already or fdelay > MAX_DELAY_MIN:
                        continue
                    publish_scheduled(
                        schedule, fsid,
                        "⏰ قطره چشم هنوز؟",
                        "اگر هنوز قطره را نریخته‌اید، الان بریزید:\n" + message,
                        fdelay,
                    )
                    added += 1
        day += datetime.timedelta(days=1)

    print("Scheduled {} new messages. Horizon: next {}h".format(added, HORIZON_HOURS))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
