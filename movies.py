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


def candidates(today, state):
    """Популярные свежие фильмы и сериалы, которые впервые появились в онлайн-кинотеатрах,
    плюс новые серии популярных сериалов, вышедшие сегодня."""
    out, online = [], set(state["online"])
    first_run = not state["online"]
    newly_online = []
    for page in range(1, 6):
        for f in api("v2.2/films/collections", type="TOP_POPULAR_ALL", page=page).get("items", []):
            fid = f.get("kinopoiskId")
            if not fid or (f.get("year") or 0) < today.year - 1:
                continue
            is_series = f.get("type") in ("TV_SERIES", "MINI_SERIES")
            if is_series:
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
            if fid in online:
                continue
            where = platforms_for(fid)
            time.sleep(0.1)
            if where:
                online.add(fid)
                newly_online.append({"id": fid, "kind": "series" if is_series else "film",
                                     "episode": "новый сериал в онлайн-кинотеатре", "where": where})
    state["online"] = sorted(online)
    # первый запуск: всё, что уже в онлайне, попадает в базу; присылаем только лучшие 10
    out.extend(newly_online)
    return out, first_run


def card(d, item, where):
    name = d.get("nameRu") or d.get("nameOriginal") or d.get("nameEn") or "Без названия"
    year = f" ({d['year']})" if d.get("year") else ""
    icon = "🎬" if item["kind"] == "film" else "📺"
    lines = [f"{icon} <b>{esc(name)}</b>{esc(year)}"]
    if item["kind"] == "series":
        lines.append(f"🆕 Новая серия: {esc(item['episode'])}")
    elif item["kind"] == "new_series":
        lines.append("🆕 Новый сериал в онлайне")
    else:
        lines.append("🆕 Появился в онлайне")
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
            data = json.load(f)
    except FileNotFoundError:
        data = {}
    if isinstance(data, list):  # старый формат
        data = {"sent": data}
    data.setdefault("sent", [])
    data.setdefault("online", [])
    data.setdefault("last_day", "")
    return data


def save_state(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    state["sent"] = state["sent"][-3000:]
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, ensure_ascii=False)


def run_ru(today, state):
    sent = state["sent"]
    seen = set(sent)
    picked = []
    items, _ = candidates(today, state)
    for item in items:
        key = str(item.get("key") or item["id"])
        if key in seen or any(str(p[0].get("key") or p[0]["id"]) == key for p in picked):
            continue
        # сериал с новой серией сегодня не дублируем карточкой «новый сериал»
        if item.get("where") and any(p[0]["id"] == item["id"] for p in picked):
            continue
        d = details(item["id"])
        if not d or skip_by_genre(d):
            continue
        where = item.get("where") or platforms_for(item["id"])
        if not where:
            continue
        if item["kind"] == "series" and item.get("episode", "").startswith("новый"):
            item = dict(item, kind="new_series")
        picked.append((item, d, where))

    picked.sort(key=lambda p: (rating_of(p[1]), p[1].get("ratingKinopoiskVoteCount") or 0), reverse=True)
    picked = picked[:TOP_N]

    date_ru = f"{today.day} {RU_MONTHS[today.month - 1]}"
    if not picked:
        send_text(f"🎬 Новинки онлайн-кинотеатров · {date_ru}\n\nСегодня новинок нет.")
        return

    send_text(f"🎬 <b>Новинки онлайн-кинотеатров · {date_ru}</b>\n"
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
            send_text(text)
        sent.append(str(item.get("key") or item["id"]))
        time.sleep(1)


# ---------- мировые новинки (TMDB) ----------

TMDB = "https://api.themoviedb.org/3"
WORLD = {  # id провайдера в TMDB (регион US) -> название
    8: "Netflix", 1899: "HBO Max", 384: "HBO Max", 350: "Apple TV+",
    337: "Disney+", 9: "Amazon Prime Video", 119: "Amazon Prime Video",
}
SKIP_TMDB_GENRES = "99,16"  # документальные, анимация (в т.ч. аниме)


def tmdb(path, **params):
    token = os.environ["TMDB_TOKEN"].strip()
    headers = {"Accept": "application/json"}
    if token.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {token}"
    else:
        params["api_key"] = token
    url = f"{TMDB}/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
        return json.load(r)


def tmdb_where(kind, tid):
    res = tmdb(f"{kind}/{tid}/watch/providers").get("results", {})
    names = []
    for region in ("US", "GB"):
        for p in res.get(region, {}).get("flatrate", []) or []:
            label = WORLD.get(p.get("provider_id"))
            if label and label not in names:
                names.append(label)
    return names


def world_items(today):
    day = today.isoformat()
    providers = "|".join(str(k) for k in WORLD)
    common = dict(watch_region="US", with_watch_providers=providers, without_genres=SKIP_TMDB_GENRES,
                  sort_by="popularity.desc", language="ru-RU", page=1)
    out = []
    movies = tmdb("discover/movie", region="US", with_release_type="4",
                  **{"release_date.gte": day, "release_date.lte": day}, **common).get("results", [])
    for m in movies:
        out.append({"kind": "movie", "id": m["id"], "key": f"tmdb-m-{m['id']}", "data": m})
    shows = tmdb("discover/tv", **{"air_date.gte": day, "air_date.lte": day}, **common).get("results", [])
    for t in shows:
        d = tmdb(f"tv/{t['id']}", language="ru-RU")
        ep = d.get("last_episode_to_air") or {}
        if ep.get("air_date") != day:
            nxt = d.get("next_episode_to_air") or {}
            ep = nxt if nxt.get("air_date") == day else None
        if not ep:
            continue
        label = f"{ep.get('season_number')} сезон, {ep.get('episode_number')} серия"
        out.append({"kind": "tv", "id": t["id"], "data": d, "episode": label,
                    "key": f"tmdb-t-{t['id']}-{ep.get('season_number')}-{ep.get('episode_number')}"})
    return out


def world_card(item, where):
    d = item["data"]
    name = d.get("title") or d.get("name") or d.get("original_title") or d.get("original_name") or "Без названия"
    orig = d.get("original_title") or d.get("original_name") or ""
    date = d.get("release_date") or d.get("first_air_date") or ""
    year = f" ({date[:4]})" if date else ""
    icon = "📺" if item["kind"] == "tv" else "🎬"
    lines = [f"{icon} <b>{esc(name)}</b>{esc(year)}"]
    if orig and orig != name:
        lines.append(f"<i>{esc(orig)}</i>")
    if item["kind"] == "tv":
        lines.append(f"🆕 Новая серия: {esc(item['episode'])}")
    if d.get("vote_average"):
        lines.append(f"⭐ TMDB {round(float(d['vote_average']), 1)}")
    desc = d.get("overview") or ""
    if desc:
        desc = desc if len(desc) <= 300 else desc[:297].rsplit(" ", 1)[0] + "…"
        lines.append(f"\n{esc(desc)}")
    lines.append(f"\n📍 Где смотреть: {esc(', '.join(where))}")
    kind = "tv" if item["kind"] == "tv" else "movie"
    lines.append(f"🔗 https://www.themoviedb.org/{kind}/{item['id']}")
    return "\n".join(lines)


def run_world(today, state):
    sent = state["sent"]
    seen = set(sent)
    picked = []
    for item in world_items(today):
        if item["key"] in seen or any(p[0]["key"] == item["key"] for p in picked):
            continue
        where = tmdb_where("tv" if item["kind"] == "tv" else "movie", item["id"])
        if not where:
            continue
        picked.append((item, where))
        if len(picked) >= TOP_N:
            break
    date_ru = f"{today.day} {RU_MONTHS[today.month - 1]}"
    if not picked:
        send_text(f"🌍 Мировые новинки · {date_ru}\n\nСегодня новинок нет.")
        return
    send_text(f"🌍 <b>Мировые новинки · {date_ru}</b>\n"
              "Netflix, HBO Max, Apple TV+, Disney+, Amazon Prime Video")
    chat = os.environ["TELEGRAM_CHAT_ID"]
    for item, where in picked:
        text = world_card(item, where)
        poster = item["data"].get("poster_path")
        try:
            if poster and len(text) <= 1000:
                tg("sendPhoto", chat_id=chat, photo=f"https://image.tmdb.org/t/p/w500{poster}",
                   caption=text, parse_mode="HTML")
            else:
                send_text(text)
        except urllib.error.HTTPError:
            send_text(text)
        sent.append(item["key"])
        time.sleep(1)


def main():
    today = datetime.now(MSK).date()
    if os.environ.get("TEST_DATE"):
        today = datetime.strptime(os.environ["TEST_DATE"], "%Y-%m-%d").date()
    state = load_state()
    state["last_day"] = today.isoformat()
    errors = []
    blocks = [("российские", "KINOPOISK_TOKEN", run_ru), ("мировые", "TMDB_TOKEN", run_world)]
    for name, secret, fn in blocks:
        if not os.environ.get(secret):
            errors.append(f"{name}: не найден секрет {secret}")
            continue
        try:
            fn(today, state)
        except Exception as err:
            detail = str(err)
            if isinstance(err, urllib.error.HTTPError):
                detail = f"HTTP {err.code}: {err.read().decode(errors='replace')[:200]}"
            errors.append(f"{name}: {type(err).__name__}: {detail}")
        save_state(state)
    if errors:
        send_text("⚠️ Бот новинок кино:\n" + esc("\n".join(errors)))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
