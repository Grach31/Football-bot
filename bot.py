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


STATE_FILE = "state/football.json"


def load_sent():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def save_sent(ids):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(ids[-1000:], f)


def main():
    """Присылает результаты сразу после окончания матчей.
    Запускается каждые полчаса, отправляет только матчи, которые ещё не присылали."""
    now = datetime.now(MSK)
    params = urllib.parse.urlencode({
        "competitions": ",".join(COMPETITIONS),
        "dateFrom": (now.date() - timedelta(days=1)).isoformat(),
        "dateTo": (now.date() + timedelta(days=1)).isoformat(),
    })
    data = get_json(
        "https://api.football-data.org/v4/matches?" + params,
        {"X-Auth-Token": os.environ["FOOTBALL_API_KEY"]},
    )

    sent = load_sent()
    first_run = sent is None
    sent = sent or []
    seen = set(sent)

    groups, new_ids = {}, []
    for m in sorted(data.get("matches", []), key=lambda m: m["utcDate"]):
        if m.get("status") != "FINISHED" or m["id"] in seen:
            continue
        new_ids.append(m["id"])
        # Челси присылается отдельно, во время матча (chelsea.py)
        names = " ".join(str(t.get(k) or "") for t in (m["homeTeam"], m["awayTeam"]) for k in ("name", "shortName"))
        if "Chelsea" in names:
            continue
        s = m["score"]["fullTime"]
        line = f"{team(m['homeTeam'])} <b>{s['home']}:{s['away']}</b> {team(m['awayTeam'])}"
        groups.setdefault(m["competition"]["code"], []).append(line)

    # первый запуск: просто запоминаем уже сыгранные матчи, чтобы не прислать старое
    if groups and not first_run:
        parts = ["⚽ Завершились матчи"]
        for code, name in COMPETITIONS.items():
            if code in groups:
                parts.append(f"\n<b>{name}</b>\n" + "\n".join(groups[code]))
        send("\n".join(parts))

    if new_ids or first_run:
        save_sent(sent + new_ids)


if __name__ == "__main__":
    main()
