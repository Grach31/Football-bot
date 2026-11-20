# Football-bot

Личные проекты, которые крутятся в GitHub Actions и на GitHub Pages.

| Что | Где | Как запускается |
|---|---|---|
| Приложение **Grach films** (сериалы, фильмы, подборки, Jellyfin) | `series-app/` | сайт публикуется workflow `series-app.yml`, push-уведомления приходят каждый день в 10:00 МСК |
| Результаты футбола в Telegram | `bot.py`, `football_loop.py` | Отключены: `football-loop.yml` и `football.yml` не отправляют сообщения |
| Матчи Челси (составы, голы, итог) | `chelsea.py` | Отключены: `chelsea.yml` не отправляет сообщения |
| Новинки кино в Telegram (сейчас выключены: нет ключей в `football-loop.yml`) | `movies.py` | после 21:00 МСК из цикла или вручную: `movies.yml` |

Состояние ботов лежит в `state/`, его коммитит сам workflow.
Секреты (`TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `FOOTBALL_API_KEY`, `KINOPOISK_TOKEN`, `TMDB_TOKEN`, `VAPID_PRIVATE_KEY`, `PUSH_SUBSCRIPTION`) задаются в Settings → Secrets and variables → Actions.
