"""Матчи Челси: составы до матча, голы и удаления по ходу игры,
статистика в перерыве и после финального свистка.
Данные: API-Football (api-sports.io)."""
import html
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

API = "https://v3.football.api-sports.io"
CHELSEA_ID = 49
MSK = timezone(timedelta(hours=3))

LOOKAHEAD_MIN = 75      # начинаем следить, если до матча меньше стольких минут
PREMATCH_MIN = 50       # за сколько минут до начала ждём составы
POLL_SECONDS = 240      # как часто проверяем матч (в секундах)
MAX_RUNTIME = 4.5 * 3600

LIVE = {"1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"}
DONE = {"FT", "AET", "PEN"}
DEAD = {"PST", "CANC", "ABD", "AWD", "WO"}

STATS = [
    ("Ball Possession", "Владение"),
    ("expected_goals", "xG"),
    ("Total Shots", "Удары"),
    ("Shots on Goal", "В створ"),
    ("Corner Kicks", "Угловые"),
    ("Offsides", "Офсайды"),
    ("Fouls", "Фолы"),
    ("Yellow Cards", "Жёлтые"),
    ("Red Cards", "Красные"),
    ("Goalkeeper Saves", "Сейвы"),
    ("Total passes", "Передачи"),
    ("Passes %", "Точность передач"),
]

esc = html.escape


def api(path, **params):
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"x-apisports-key": os.environ["API_FOOTBALL_KEY"]})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    if data.get("errors"):
        raise RuntimeError(f"API-Football: {data['errors']}")
    return data.get("response", [])


def send(text):
    url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}/sendMessage"
    body = urllib.parse.urlencode({
        "chat_id": os.environ["TELEGRAM_CHAT_ID"],
        "text": text[:4000],
        "parse_mode": "HTML",
    }).encode()
    urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=30)


def score(fx):
    h, a = fx["teams"]["home"]["name"], fx["teams"]["away"]["name"]
    gh, ga = fx["goals"]["home"], fx["goals"]["away"]
    if gh is None:
        return f"{esc(h)} — {esc(a)}"
    return f"{esc(h)} <b>{gh}:{ga}</b> {esc(a)}"


def league(fx):
    return esc(fx["league"]["name"])


def minute(e):
    t = e["time"]
    return f"{t['elapsed']}'" + (f"+{t['extra']}" if t.get("extra") else "")


def event_key(e):
    return (e["time"]["elapsed"], e["time"].get("extra"), e["type"], e.get("detail"),
            (e.get("player") or {}).get("name"), e["team"]["id"])


def event_text(e):
    player = esc((e.get("player") or {}).get("name") or "?")
    team = esc(e["team"]["name"])
    typ, det = e["type"], e.get("detail") or ""
    if typ == "Goal":
        if det == "Missed Penalty":
            return f"❌ {minute(e)} Незабитый пенальти: {player} ({team})"
        label = {"Own Goal": " (автогол)", "Penalty": " (пенальти)"}.get(det, "")
        assist = (e.get("assist") or {}).get("name")
        a = f", пас: {esc(assist)}" if assist and det == "Normal Goal" else ""
        return f"⚽ {minute(e)} ГОЛ{label}! {player} ({team}){a}"
    if typ == "Card" and "Red" in det:
        return f"🟥 {minute(e)} Удаление: {player} ({team})"
    if typ == "Var":
        return f"📺 {minute(e)} VAR: {esc(det)} ({team})"
    return None


def goals_list(fx):
    lines = [event_text(e) for e in fx.get("events") or []
             if e["type"] == "Goal" and e.get("detail") != "Missed Penalty"]
    return "\n".join(lines)


def stats_block(fx):
    st = fx.get("statistics") or []
    if len(st) < 2:
        return "\n📊 Статистика пока недоступна."
    if st[0]["team"]["id"] != fx["teams"]["home"]["id"]:
        st = [st[1], st[0]]
    h = {s["type"]: s["value"] for s in st[0]["statistics"]}
    a = {s["type"]: s["value"] for s in st[1]["statistics"]}
    lines = ["\n📊 <b>Статистика</b>"]
    for key, name in STATS:
        hv, av = h.get(key), a.get(key)
        if hv is None and av is None:
            continue
        lines.append(f"{name}: {hv if hv is not None else 0} — {av if av is not None else 0}")
    return "\n".join(lines)


def lineups_block(fx):
    parts = []
    for t in fx.get("lineups") or []:
        xi = ", ".join(esc(p["player"]["name"]) for p in t.get("startXI") or [])
        if not xi:
            continue
        coach = (t.get("coach") or {}).get("name")
        c = f"\nТренер: {esc(coach)}" if coach else ""
        parts.append(f"<b>{esc(t['team']['name'])}</b> ({esc(t.get('formation') or '?')})\n{xi}{c}")
    return "\n\n".join(parts)


def final_text(fx, prefix="🏁 Финал"):
    g = goals_list(fx)
    return f"{prefix} ({league(fx)})\n{score(fx)}" + (f"\n\n{g}" if g else "") + "\n" + stats_block(fx)


def find_fixture():
    today = datetime.now(MSK)
    dates = [today.date()]
    if today.hour >= 23:
        dates.append(today.date() + timedelta(days=1))
    for d in dates:
        for fx in api("fixtures", team=CHELSEA_ID, date=d.isoformat(), timezone="Europe/Moscow"):
            st = fx["fixture"]["status"]["short"]
            mins = (fx["fixture"]["timestamp"] - time.time()) / 60
            if st in LIVE or (st == "NS" and mins <= LOOKAHEAD_MIN) or (st == "TBD" and mins <= LOOKAHEAD_MIN):
                return fx
    return None


def monitor(fixture_id):
    start = time.time()
    seen = set()
    sent_lineups = sent_kickoff = sent_ht = False

    while time.time() - start < MAX_RUNTIME:
        fx = api("fixtures", id=fixture_id)[0]
        st = fx["fixture"]["status"]["short"]
        kickoff = fx["fixture"]["timestamp"]

        if st in DEAD:
            send(f"⚠️ Матч {score(fx)}: {esc(fx['fixture']['status']['long'])}")
            return

        if not sent_lineups and fx.get("lineups") and st not in DONE:
            block = lineups_block(fx)
            if block:
                ko = datetime.fromtimestamp(kickoff, MSK).strftime("%H:%M")
                send(f"📋 <b>Составы</b> · {league(fx)}, начало в {ko} МСК\n{score(fx)}\n\n{block}")
                sent_lineups = True

        if st in LIVE or st in DONE:
            events = fx.get("events") or []
            if not sent_kickoff:
                elapsed = fx["fixture"]["status"].get("elapsed") or 0
                if elapsed > 5 or st in DONE:
                    # подключились посреди матча: прошлые события только сводкой
                    seen.update(event_key(e) for e in events)
                    g = goals_list(fx)
                    send(f"🔵 Матч идёт, {elapsed}' ({league(fx)})\n{score(fx)}" + (f"\n\n{g}" if g else ""))
                else:
                    send(f"🟢 Матч начался! ({league(fx)})\n{score(fx)}")
                sent_kickoff = True

            for e in events:
                k = event_key(e)
                if k in seen:
                    continue
                seen.add(k)
                text = event_text(e)
                if text:
                    send(f"{text}\nСчёт: {score(fx)}")

            if st == "HT" and not sent_ht:
                send(f"⏸ Перерыв ({league(fx)})\n{score(fx)}\n{stats_block(fx)}")
                sent_ht = True

            if st in DONE:
                time.sleep(120)  # даём статистике обновиться
                send(final_text(api("fixtures", id=fixture_id)[0]))
                return

        # до матча не тратим запросы: спим до момента, когда появятся составы
        wait = POLL_SECONDS
        if st in ("NS", "TBD"):
            until_lineups = kickoff - PREMATCH_MIN * 60 - time.time()
            if sent_lineups:
                wait = max(30, min(POLL_SECONDS, kickoff - time.time()))
            elif until_lineups > 0:
                wait = until_lineups
        time.sleep(wait)


def main():
    if os.environ.get("TEST") == "true":
        today = datetime.now(MSK).date()
        season = today.year if today.month >= 7 else today.year - 1
        played = [fx for fx in api("fixtures", team=CHELSEA_ID, season=season,
                                   **{"from": (today - timedelta(days=21)).isoformat(),
                                      "to": today.isoformat()},
                                   timezone="Europe/Moscow")
                  if fx["fixture"]["status"]["short"] in DONE]
        if not played:
            send("🧪 Тест: API ответил, но сыгранных матчей Челси за 3 недели не нашлось.")
            return
        last = max(played, key=lambda f: f["fixture"]["timestamp"])
        # в списке матчей нет статистики — догружаем матч целиком
        send(final_text(api("fixtures", id=last["fixture"]["id"])[0],
                        prefix="🧪 Тест: последний матч Челси"))
        return

    fx = find_fixture()
    if fx:
        monitor(fx["fixture"]["id"])


if __name__ == "__main__":
    try:
        if not os.environ.get("API_FOOTBALL_KEY"):
            raise RuntimeError("не найден секрет API_FOOTBALL_KEY (проверь название в Settings → Secrets)")
        main()
    except Exception as err:
        detail = str(err)
        if isinstance(err, urllib.error.HTTPError):
            detail = f"HTTP {err.code}: {err.read().decode(errors='replace')[:300]}"
        try:
            send(f"⚠️ Ошибка бота Челси:\n{esc(type(err).__name__)}: {esc(detail)}")
        finally:
            raise
