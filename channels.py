"""Пересылает новые посты публичных Telegram-каналов в чат с ботом.
Читает открытую веб-версию канала (t.me/s/название), номер последнего
отправленного поста хранит в state/channels.json."""
import html
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

CHANNELS = ["KFNik", "dmitrynikotin", "chelseafcrus"]   # каналы для пересылки (имя из ссылки t.me/...)
STATE_FILE = "state/channels.json"
CHECK_EVERY = 60       # как часто проверять каналы в режиме без перерыва (секунды)
FOOTBALL_EVERY = 600   # как часто проверять завершённые матчи (секунды)


def esc(text):
    return html.escape(str(text), quote=False)


def get_page(channel):
    req = urllib.request.Request(f"https://t.me/s/{channel}",
                                 headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def clean(fragment):
    fragment = re.sub(r"<br\s*/?>", "\n", fragment)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(fragment).strip()


def parse(page):
    title_m = re.search(r'<meta property="og:title" content="([^"]*)"', page)
    title = html.unescape(title_m.group(1)) if title_m else ""
    posts = []
    for block in page.split('class="tgme_widget_message_wrap')[1:]:
        m = re.search(r'data-post="[^"/]+/(\d+)"', block)
        if not m:
            continue
        text_m = re.search(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', block, re.S)
        photos = re.findall(r"tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)", block)
        has_video = "tgme_widget_message_video" in block or "tgme_widget_message_roundvideo" in block
        posts.append({
            "id": int(m.group(1)),
            "text": clean(text_m.group(1)) if text_m else "",
            "photos": photos,
            "video": has_video,
        })
    return title, posts


def tg(method, **params):
    url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}/{method}"
    body = urllib.parse.urlencode(params).encode()
    urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=60)


def deliver(channel, title, post):
    link = f"https://t.me/{channel}/{post['id']}"
    head = f"📢 <b>{esc(title or channel)}</b>"
    body = esc(post["text"])
    if post["video"]:
        body += ("\n\n" if body else "") + "📹 В посте видео — смотри по ссылке"
    text = f"{head}\n\n{body}\n\n🔗 {link}" if body else f"{head}\n\n🔗 {link}"
    chat = os.environ["TELEGRAM_CHAT_ID"]

    photos = post["photos"][:10]
    if photos:
        caption_fits = len(text) <= 1000
        try:
            if len(photos) == 1:
                tg("sendPhoto", chat_id=chat, photo=photos[0],
                   caption=text if caption_fits else head, parse_mode="HTML")
            else:
                media = [{"type": "photo", "media": url} for url in photos]
                media[0].update(caption=text if caption_fits else head, parse_mode="HTML")
                tg("sendMediaGroup", chat_id=chat, media=json.dumps(media))
            if caption_fits:
                return
        except urllib.error.HTTPError:
            pass  # картинку не приняли — отправим хотя бы текст
    if post["text"] or post["video"] or photos:
        tg("sendMessage", chat_id=chat, text=text[:4000], parse_mode="HTML",
           disable_web_page_preview="true")


def main():
    try:
        with open(STATE_FILE) as f:
            state = json.load(f)
    except FileNotFoundError:
        state = {}

    try:
        for channel in CHANNELS:
            title, posts = parse(get_page(channel))
            if not posts:
                continue
            last = state.get(channel)
            if last is None:
                # первый запуск: присылаем только самый свежий пост, без старой ленты
                new = posts[-1:]
            else:
                new = [p for p in posts if p["id"] > last]
            for post in sorted(new, key=lambda p: p["id"]):
                deliver(channel, title, post)
                state[channel] = post["id"]
            state.setdefault(channel, posts[-1]["id"])
    finally:
        # сохраняем, что уже отправили, даже если что-то упало посередине
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)


def save_to_git():
    """Запоминаем последний отправленный пост в репозитории, чтобы
    следующий запуск не прислал его повторно."""
    run = lambda *cmd: subprocess.run(cmd, capture_output=True, text=True)
    run("git", "add", STATE_FILE, "state/football.json", "state/movies.json")
    if run("git", "diff", "--cached", "--quiet").returncode == 0:
        return
    run("git", "commit", "-m", "Каналы: последний отправленный пост")
    run("git", "pull", "--rebase", "-X", "theirs")
    run("git", "push")


def notify_error(err):
    tg("sendMessage", chat_id=os.environ["TELEGRAM_CHAT_ID"],
       text=f"⚠️ Ошибка пересылки каналов:\n{type(err).__name__}: {err}"[:4000])


MOVIES_HOUR = 21  # во сколько по Москве присылать новинки кино


def run_movies_if_due():
    """Раз в день после 21:00 МСК присылает подборку новинок кино (movies.py)."""
    if not (os.environ.get("KINOPOISK_TOKEN") or os.environ.get("TMDB_TOKEN")):
        return
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone(timedelta(hours=3)))
    if now.hour < MOVIES_HOUR:
        return
    try:
        with open("state/movies.json") as f:
            last = json.load(f).get("last_day", "")
    except (FileNotFoundError, AttributeError, ValueError):
        last = ""
    if last == now.date().isoformat():
        return
    try:
        import movies
        movies.main()
    except BaseException:  # movies.main сам пишет об ошибке в Telegram
        pass
    save_to_git()


def loop(minutes):
    """Проверяем каналы раз в минуту, пока не выйдет время запуска."""
    stop_at = time.time() + minutes * 60
    errors_in_row = 0
    football_errors = 0
    next_football = 0
    while time.time() < stop_at:
        # результаты футбола: раз в FOOTBALL_EVERY секунд (бот bot.py)
        if os.environ.get("FOOTBALL_API_KEY") and time.time() >= next_football:
            next_football = time.time() + FOOTBALL_EVERY
            try:
                import bot
                bot.main()
                football_errors = 0
            except Exception as err:
                football_errors += 1
                if football_errors == 3:
                    try:
                        tg("sendMessage", chat_id=os.environ["TELEGRAM_CHAT_ID"],
                           text=f"⚠️ Ошибка футбольных результатов:\n{type(err).__name__}: {err}"[:4000])
                    except Exception:
                        pass
        run_movies_if_due()
        try:
            main()
            save_to_git()
            errors_in_row = 0
        except Exception as err:
            errors_in_row += 1
            if errors_in_row == 3:  # о разовых сбоях сети не пишем
                try:
                    notify_error(err)
                except Exception:
                    pass
        time.sleep(CHECK_EVERY)


if __name__ == "__main__":
    minutes = int(os.environ.get("LOOP_MINUTES") or 0)
    if minutes:
        loop(minutes)
    else:
        try:
            main()
        except Exception as err:
            try:
                notify_error(err)
            finally:
                raise
