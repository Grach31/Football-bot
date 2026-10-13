"""Новинки российских онлайн-кинотеатров: фильмы, вышедшие в онлайн сегодня,
и новые серии популярных сериалов. Отправка каждый день в 21:00 МСК.
Данные: Kinopoisk Unofficial API (kinopoiskapiunofficial.tech)."""
import html
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

API = "https://kinopoiskapiunofficial.tech/api"
MSK = timezone(timedelta(hours=3))
STATE_FILE = "state/movies.json"
TOP_N = 10

# онлайн-кинотеатры: как показывать -> как их может называть API
PLATFORMS = {
    "Кинопоиск": ("кинопоиск", "kinopoisk"),
    "Okko": ("okko",),
    "Иви": ("иви", "ivi"),
    "Wink": ("wink",),
    "START": ("start",),
    "PREMIER": ("premier", "премьер"),
    "KION": ("kion", "кион"),
}
SKIP_GENRES = {"документальный", "мультфильм", "аниме"}
MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY",
          "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
RU_MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля",
             "августа", "сентября", "октября", "ноября", "декабря"]


def esc(text):
    return html.escape(str(text), quote=False)


def api(path, **params):
    url = f"{API}/{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    req = urllib.request.Request(url, headers={"X-API-KEY": os.environ["KINOPOISK_TOKEN"],
                                               "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:  # лимит запросов в секунду
                time.sleep(2)
                continue
            if e.code == 404:
                return {}
            raise


def tg(method, **params):
    url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}/{method}"
    body = urllib.parse.urlencode(params).encode()
    urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=60)


def send_text(text):
    tg("sendMessage", chat_id=os.environ["TELEGRAM_CHAT_ID"], text=text[:4000],
       parse_mode="HTML", disable_web_page_preview="true")


def platforms_for(film_id):
    data = api(f"v2.2/films/{film_id}/external_sources", page=1)
    found = []
    for item in data.get("items", []):
        name = str(item.get("platform") or "").lower()
        for label, keys in PLATFORMS.items():
            if label not in found and any(k in name for k in keys):
                found.append(label)
    return found


def details(film_id):
    return api(f"v2.2/films/{film_id}")


def genres_of(d):
    return [g.get("genre", "") for g in d.get("genres", []) if g.get("genre")]


def skip_by_genre(d):
    return bool(SKIP_GENRES & {g.lower() for g in genres_of(d)}) or d.get("type") == "VIDEO"


def rating_of(d):
    return d.get("ratingKinopoisk") or d.get("ratingImdb") or 0


def candidates(today):
    """Фильмы с цифровым релизом сегодня + новые серии популярных сериалов."""
    out = []
    # 1) цифровые релизы месяца, оставляем сегодняшние
    page = 1
    while page <= 5:
        data = api("v2.1/films/releases", year=today.year, month=MONTHS[today.month - 1], page=page)
        rel = data.get("releases", [])
        for r in rel:
            if str(r.get("releaseDate", ""))[:10] == today.isoformat():
                out.append({"id": r["filmId"], "kind": "film"})
        if len(rel) < 10:
            break
        page += 1
    # 2) новые серии популярных сериалов
    popular = api("v2.2/films/collections", type="TOP_POPULAR_ALL", page=1).get("items", [])
    for f in popular:
        if f.get("type") not in ("TV_SERIES", "MINI_SERIES"):
            continue
        fid = f.get("kinopoiskId")
        seasons = api(f"v2.2/films/{fid}/seasons").get("items", [])
        todays = [ep for s in seasons for ep in s.get("episodes", [])
                  if str(ep.get("releaseDate") or "")[:10] == today.isoformat()]
        if todays:
            eps = sorted(todays, key=lambda e: (e.get("seasonNumber", 0), e.get("episodeNumber", 0)))
            first, last = eps[0], eps[-1]
            label = f"{first.get('seasonNumber')} сезон, " + (
                f"{first.get('episodeNumber')} серия" if len(eps) == 1
                else f"серии {first.get('episodeNumber')}–{last.get('episodeNumber')}")
            out.append({"id": fid, "kind": "series", "episode": label,
                        "key": f"{fid}-{first.get('seasonNumber')}-{first.get('episodeNumber')}"})
    return out


def card(d, item, where):
    name = d.get("nameRu") or d.get("nameOriginal") or d.get("nameEn") or "Без названия"
    year = f" ({d['year']})" if d.get("year") else ""
    icon = "📺" if item["kind"] == "series" else "🎬"
    lines = [f"{icon} <b>{esc(name)}</b>{esc(year)}"]
    if item["kind"] == "series":
        lines.append(f"🆕 Новая серия: {esc(item['episode'])}")
    r = []
    if d.get("ratingKinopoisk"):
        r.append(f"КП {d['ratingKinopoisk']}")
    if d.get("ratingImdb"):
        r.append(f"IMDb {d['ratingImdb']}")
    if r:
        lines.append("⭐ " + " · ".join(r))
    g = genres_of(d)[:3]
    if g:
        lines.append(esc(", ".join(g)))
    desc = d.get("shortDescription") or d.get("description") or ""
    if desc:
        desc = desc if len(desc) <= 300 else desc[:297].rsplit(" ", 1)[0] + "…"
        lines.append(f"\n{esc(desc)}")
    lines.append(f"\n📍 Где смотреть: {esc(', '.join(where))}")
    if d.get("webUrl"):
        lines.append(f"🔗 {d['webUrl']}")
    return "\n".join(lines)


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def save_state(keys):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(keys[-2000:], f)


def main():
    today = datetime.now(MSK).date()
    if os.environ.get("TEST_DATE"):
        today = datetime.strptime(os.environ["TEST_DATE"], "%Y-%m-%d").date()
    sent = load_state()
    seen = set(sent)

    picked = []
    for item in candidates(today):
        key = str(item.get("key") or item["id"])
        if key in seen or any(str(p[0].get("key") or p[0]["id"]) == key for p in picked):
            continue
        d = details(item["id"])
        if not d or skip_by_genre(d):
            continue
        where = platforms_for(item["id"])
        if not where:
            continue
        picked.append((item, d, where))

    picked.sort(key=lambda p: (rating_of(p[1]), p[1].get("ratingKinopoiskVoteCount") or 0), reverse=True)
    picked = picked[:TOP_N]

    date_ru = f"{today.day} {RU_MONTHS[today.month - 1]}"
    if not picked:
        send_text(f"🎬 Новинки онлайн-кинотеатров · {date_ru}\n\nСегодня новинок нет.")
        return

    send_text(f"🎬 <b>Новинки онлайн-кинотеатров · {date_ru}</b>\n"
              f"{len(picked)} {('новинка' if len(picked) == 1 else 'новинки' if len(picked) < 5 else 'новинок')}: "
              "Кинопоиск, Okko, Иви, Wink, START, PREMIER, KION")
    chat = os.environ["TELEGRAM_CHAT_ID"]
    for item, d, where in picked:
        text = card(d, item, where)
        poster = d.get("posterUrlPreview") or d.get("posterUrl")
        try:
            if poster and len(text) <= 1000:
                tg("sendPhoto", chat_id=chat, photo=poster, caption=text, parse_mode="HTML")
            else:
                send_text(text)
        except urllib.error.HTTPError:
            send_text(text)  # постер не приняли — хотя бы текст
        sent.append(str(item.get("key") or item["id"]))
        time.sleep(1)
    save_state(sent)


if __name__ == "__main__":
    try:
        if not os.environ.get("KINOPOISK_TOKEN"):
            raise RuntimeError("не найден секрет KINOPOISK_TOKEN (Settings → Secrets → Actions)")
        main()
    except Exception as err:
        detail = str(err)
        if isinstance(err, urllib.error.HTTPError):
            detail = f"HTTP {err.code}: {err.read().decode(errors='replace')[:300]}"
        try:
            send_text(f"⚠️ Ошибка бота новинок кино:\n{esc(type(err).__name__)}: {esc(detail)}")
        finally:
            raise
