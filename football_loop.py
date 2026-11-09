"""Цикл на 6 часов в GitHub Actions: раз в FOOTBALL_EVERY секунд проверяет
результаты футбола (bot.py), раз в день после 21:00 МСК присылает новинки кино
(movies.py, если заданы ключи) и сохраняет состояние в репозиторий.
Пересылка Telegram-каналов отсюда убрана: код лежит в истории git (коммит перед
«Чистка мёртвого кода»), если понадобится вернуть."""
import json
import os
import subprocess
import time
import urllib.parse
import urllib.request

FOOTBALL_EVERY = 600   # как часто проверять завершённые матчи (секунды)
CHECK_EVERY = 60       # шаг цикла (секунды)
MOVIES_HOUR = 21       # во сколько по Москве присылать новинки кино


def tg(method, **params):
    url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}/{method}"
    body = urllib.parse.urlencode(params).encode()
    urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=60)


def save_to_git():
    """Запоминаем состояние в репозитории, чтобы следующий запуск не прислал то же самое."""
    run = lambda *cmd: subprocess.run(cmd, capture_output=True, text=True)
    run("git", "add", "state/football.json", "state/movies.json")
    if run("git", "diff", "--cached", "--quiet").returncode == 0:
        return
    run("git", "commit", "-m", "Футбол и кино: состояние")
    run("git", "pull", "--rebase", "-X", "theirs")
    run("git", "push")


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


def football_step(state):
    """Один проход футбола: результаты матчей и сохранение состояния. Три сбоя подряд — сообщение в Telegram."""
    try:
        import bot
        bot.main()
        save_to_git()
        state["errors"] = 0
    except Exception as err:
        state["errors"] += 1
        if state["errors"] == 3:  # о разовых сбоях сети не пишем
            try:
                tg("sendMessage", chat_id=os.environ["TELEGRAM_CHAT_ID"],
                   text=f"⚠️ Ошибка футбольных результатов:\n{type(err).__name__}: {err}"[:4000])
            except Exception:
                pass


def loop(minutes):
    """Работаем, пока не выйдет время запуска; следующий запуск подхватит cron."""
    stop_at = time.time() + minutes * 60
    state = {"errors": 0}
    next_football = 0
    while time.time() < stop_at:
        if os.environ.get("FOOTBALL_API_KEY") and time.time() >= next_football:
            next_football = time.time() + FOOTBALL_EVERY
            football_step(state)
        run_movies_if_due()
        time.sleep(CHECK_EVERY)


if __name__ == "__main__":
    minutes = int(os.environ.get("LOOP_MINUTES") or 0)
    if minutes:
        loop(minutes)
    else:
        football_step({"errors": 0})
