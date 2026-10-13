import html
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

MSK = timezone(timedelta(hours=3))

COMPETITIONS = {
    "CL": "🏆 Лига чемпионов",
    "PL": "🏴 АПЛ",
    "PD": "🇪🇸 Ла Лига",
    "SA": "🇮🇹 Серия А",
    "BL1": "🇩🇪 Бундеслига",
    "FL1": "🇫🇷 Лига 1",
}


def get_json(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def team(t):
    return html.escape(t.get("shortName") or t.get("name") or "?")


def send(text):
    url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}/sendMessage"
    body = urllib.parse.urlencode({
        "chat_id": os.environ["TELEGRAM_CHAT_ID"],
        "text": text,
        "parse_mode": "HTML",
    }).encode()
    urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=30)


def main():
    now = datetime.now(MSK)
    # матч ~115 минут: всё, что началось раньше этой границы, уже было во вчерашней сводке
    since = now - timedelta(hours=24, minutes=115)
    params = urllib.parse.urlencode({
        "competitions": ",".join(COMPETITIONS),
        "dateFrom": (since.date() - timedelta(days=1)).isoformat(),
        "dateTo": (now.date() + timedelta(days=1)).isoformat(),
    })
    data = get_json(
        "https://api.football-data.org/v4/matches?" + params,
        {"X-Auth-Token": os.environ["FOOTBALL_API_KEY"]},
    )

    groups = {}
    for m in data.get("matches", []):
        if m.get("status") != "FINISHED":
            continue
        kickoff = datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00")).astimezone(MSK)
        if not (since <= kickoff <= now):
            continue
        # Челси присылается отдельно, во время матча (chelsea.py)
        if "Chelsea" in (m["homeTeam"].get("name") or "") + (m["awayTeam"].get("name") or ""):
            continue
        s = m["score"]["fullTime"]
        line = f"{team(m['homeTeam'])} <b>{s['home']}:{s['away']}</b> {team(m['awayTeam'])}"
        groups.setdefault(m["competition"]["code"], []).append(line)

    title = f"⚽ Результаты за сутки · {now.strftime('%d.%m')}"
    if not groups:
        text = title + "\n\nЗа последние сутки матчей не было."
    else:
        parts = [title]
        for code, name in COMPETITIONS.items():
            if code in groups:
                parts.append(f"\n<b>{name}</b>\n" + "\n".join(groups[code]))
        text = "\n".join(parts)

    send(text)


if __name__ == "__main__":
    main()
