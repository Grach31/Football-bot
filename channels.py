"""Пересылает новые посты публичных Telegram-каналов в чат с ботом.
Читает открытую веб-версию канала (t.me/s/название), номер последнего
отправленного поста хранит в state/channels.json."""
import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

CHANNELS = ["KFNik", "dmitrynikotin"]   # каналы для пересылки (имя из ссылки t.me/...)
STATE_FILE = "state/channels.json"


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


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        try:
            tg("sendMessage", chat_id=os.environ["TELEGRAM_CHAT_ID"],
               text=f"⚠️ Ошибка пересылки каналов:\n{type(err).__name__}: {err}"[:4000])
        finally:
            raise
