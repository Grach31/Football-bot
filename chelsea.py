"""Матчи Челси: составы до матча, голы и удаления по ходу игры,
статистика в перерыве и после финального свистка.
Данные: открытый (неофициальный) API ESPN, ключ не нужен."""
import html
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"
CHELSEA_ID = "363"
MSK = timezone(timedelta(hours=3))

# Турниры, где может играть Челси (коды ESPN)
LEAGUES = ["eng.1", "uefa.champions", "uefa.europa", "uefa.europa.conf",
           "eng.fa", "eng.league_cup", "club.friendly"]

LOOKAHEAD_MIN = 75      # начинаем следить, если до матча меньше стольких минут
PREMATCH_MIN = 50       # за сколько минут до начала ждём составы
POLL_SECONDS = 180      # как часто проверяем матч (в секундах)
MAX_RUNTIME = 4.5 * 3600

DEAD = {"STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_ABANDONED", "STATUS_SUSPENDED",
        "STATUS_FORFEIT"}

STATS = [
    ("possessionPct", "Владение"),
    ("totalShots", "Удары"),
    ("shotsOnTarget", "В створ"),
    ("wonCorners", "Угловые"),
    ("offsides", "Офсайды"),
    ("foulsCommitted", "Фолы"),
    ("yellowCards", "Жёлтые"),
    ("redCards", "Красные"),
    ("saves", "Сейвы"),
    ("totalPasses", "Передачи"),
    ("accuratePasses", "Точные передачи"),
    ("passPct", "Точность передач"),
]

def esc(text):
    return html.escape(str(text), quote=False)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def send(text):
    url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}/sendMessage"
    body = urllib.parse.urlencode({
        "chat_id": os.environ["TELEGRAM_CHAT_ID"],
        "text": text[:4000],
        "parse_mode": "HTML",
    }).encode()
    urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=30)


def ts(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def chelsea_events(league, date_from, date_to):
    """Матчи Челси в турнире за период (по таблице результатов ESPN)."""
    dates = f"{date_from:%Y%m%d}-{date_to:%Y%m%d}"
    try:
        data = get(f"{ESPN}/{league}/scoreboard?dates={dates}&limit=200")
    except urllib.error.HTTPError:
        return []
    found = []
    for ev in data.get("events", []):
        comp = (ev.get("competitions") or [{}])[0]
        ids = {c.get("team", {}).get("id") for c in comp.get("competitors", [])}
        if CHELSEA_ID in ids:
            found.append((league, ev))
    return found


def summary(league, event_id):
    return get(f"{ESPN}/{league}/summary?event={event_id}")


# ---------- разбор сводки матча ----------

def comp(s):
    return s["header"]["competitions"][0]


def status(s):
    return comp(s)["status"]


def league_name(s):
    return esc(s["header"].get("league", {}).get("name") or "")


def side(s, home_away):
    for c in comp(s)["competitors"]:
        if c.get("homeAway") == home_away:
            return c
    return comp(s)["competitors"][0 if home_away == "home" else 1]


def score(s):
    h, a = side(s, "home"), side(s, "away")
    hn, an = esc(h["team"]["displayName"]), esc(a["team"]["displayName"])
    if status(s)["type"]["state"] == "pre" or h.get("score") in (None, ""):
        return f"{hn} — {an}"
    return f"{hn} <b>{h['score']}:{a['score']}</b> {an}"


def event_text(e):
    clock = esc((e.get("clock") or {}).get("displayValue") or "")
    team = esc((e.get("team") or {}).get("displayName") or "")
    people = [esc(p["athlete"]["displayName"]) for p in e.get("participants") or [] if p.get("athlete")]
    who = people[0] if people else "?"
    kind = ((e.get("type") or {}).get("text") or "").lower()
    if e.get("scoringPlay"):
        label = " (автогол)" if "own" in kind else " (пенальти)" if "penalty" in kind else ""
        assist = f", пас: {people[1]}" if len(people) > 1 and not label else ""
        return f"⚽ {clock} ГОЛ{label}! {who} ({team}){assist}"
    if "red card" in kind:
        return f"🟥 {clock} Удаление: {who} ({team})"
    if "penalty" in kind and ("miss" in kind or "saved" in kind):
        return f"❌ {clock} Незабитый пенальти: {who} ({team})"
    return None


def goals_list(s):
    return "\n".join(t for t in (event_text(e) for e in s.get("keyEvents") or []
                                 if e.get("scoringPlay")) if t)


def stats_block(s):
    teams = (s.get("boxscore") or {}).get("teams") or []
    if len(teams) < 2:
        return "\n📊 Статистика пока недоступна."
    teams = sorted(teams, key=lambda t: 0 if t.get("homeAway") == "home" else 1)
    h = {x.get("name"): x.get("displayValue") for x in teams[0].get("statistics") or []}
    a = {x.get("name"): x.get("displayValue") for x in teams[1].get("statistics") or []}
    lines = ["\n📊 <b>Статистика</b>"]
    for key, name in STATS:
        if key in h or key in a:
            suffix = "%" if key in ("possessionPct",) and "%" not in str(h.get(key, "")) else ""
            lines.append(f"{name}: {esc(str(h.get(key, '0')))}{suffix} — {esc(str(a.get(key, '0')))}{suffix}")
    if len(lines) == 1:
        # названия у ESPN поменялись: показываем как есть
        labels = {x.get("name"): x.get("label") for x in teams[0].get("statistics") or []}
        for key, label in labels.items():
            lines.append(f"{esc(str(label))}: {esc(str(h.get(key)))} — {esc(str(a.get(key)))}")
    return "\n".join(lines) if len(lines) > 1 else "\n📊 Статистика пока недоступна."


def lineups_block(s):
    parts = []
    for r in s.get("rosters") or []:
        starters = [p for p in r.get("roster") or [] if p.get("starter")]
        if not starters:
            continue
        names = ", ".join(esc(p.get("athlete", {}).get("displayName", "?")) for p in starters)
        formation = f" ({esc(r['formation'])})" if r.get("formation") else ""
        parts.append(f"<b>{esc(r.get('team', {}).get('displayName', ''))}</b>{formation}\n{names}")
    return "\n\n".join(parts)


def final_text(s, prefix="🏁 Финал"):
    g = goals_list(s)
    return f"{prefix} ({league_name(s)})\n{score(s)}" + (f"\n\n{g}" if g else "") + "\n" + stats_block(s)


# ---------- основной цикл ----------

def find_match():
    now = datetime.now(timezone.utc)
    for league in LEAGUES:
        for lg, ev in chelsea_events(league, now - timedelta(days=1), now + timedelta(days=1)):
            st = ev["competitions"][0]["status"]["type"]
            mins = (ts(ev["date"]) - time.time()) / 60
            if st["state"] == "in" or (st["state"] == "pre" and -10 <= mins <= LOOKAHEAD_MIN):
                return lg, ev["id"]
    return None


def monitor(league, event_id):
    start = time.time()
    seen = set()
    sent_lineups = sent_kickoff = sent_ht = False

    while time.time() - start < MAX_RUNTIME:
        s = summary(league, event_id)
        st = status(s)["type"]
        kickoff = ts(comp(s)["date"])

        if st.get("name") in DEAD:
            send(f"⚠️ Матч {score(s)}: {esc(st.get('description') or st.get('name'))}")
            return

        if not sent_lineups and st["state"] != "post":
            block = lineups_block(s)
            if block:
                ko = datetime.fromtimestamp(kickoff, MSK).strftime("%H:%M")
                send(f"📋 <b>Составы</b> · {league_name(s)}, начало в {ko} МСК\n{score(s)}\n\n{block}")
                sent_lineups = True

        if st["state"] in ("in", "post"):
            events = s.get("keyEvents") or []
            if not sent_kickoff:
                started_min = (time.time() - kickoff) / 60
                if started_min > 10 or st["state"] == "post":
                    seen.update(e.get("id") for e in events)
                    g = goals_list(s)
                    clock = esc(status(s).get("displayClock") or "")
                    send(f"🔵 Матч идёт, {clock} ({league_name(s)})\n{score(s)}" + (f"\n\n{g}" if g else ""))
                else:
                    send(f"🟢 Матч начался! ({league_name(s)})\n{score(s)}")
                sent_kickoff = True

            for e in events:
                if e.get("id") in seen:
                    continue
                seen.add(e.get("id"))
                text = event_text(e)
                if text:
                    send(f"{text}\nСчёт: {score(s)}")

            if st.get("name") == "STATUS_HALFTIME" and not sent_ht:
                send(f"⏸ Перерыв ({league_name(s)})\n{score(s)}\n{stats_block(s)}")
                sent_ht = True

            if st["state"] == "post":
                time.sleep(120)  # даём статистике обновиться
                send(final_text(summary(league, event_id)))
                return

        # до матча не дёргаем данные зря: спим до момента, когда появятся составы
        wait = POLL_SECONDS
        if st["state"] == "pre":
            until_lineups = kickoff - PREMATCH_MIN * 60 - time.time()
            if sent_lineups:
                wait = max(30, min(POLL_SECONDS, kickoff - time.time()))
            elif until_lineups > 0:
                wait = until_lineups
        time.sleep(wait)


def main():
    if os.environ.get("TEST") == "true":
        now = datetime.now(timezone.utc)
        played = []
        for league in LEAGUES:
            for lg, ev in chelsea_events(league, now - timedelta(days=30), now):
                if ev["competitions"][0]["status"]["type"].get("completed"):
                    played.append((ts(ev["date"]), lg, ev["id"]))
        if not played:
            send("🧪 Тест: ESPN ответил, но сыгранных матчей Челси за месяц не нашлось.")
            return
        _, lg, eid = max(played)
        send(final_text(summary(lg, eid), prefix="🧪 Тест: последний матч Челси"))
        return

    match = find_match()
    if match:
        monitor(*match)


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        detail = str(err)
        if isinstance(err, urllib.error.HTTPError):
            detail = f"HTTP {err.code}: {err.read().decode(errors='replace')[:300]}"
        try:
            send(f"⚠️ Ошибка бота Челси:\n{esc(type(err).__name__)}: {esc(detail)}")
        finally:
            raise
