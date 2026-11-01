# Мой заработок

Приложение живёт в `series-app/site/earnings/` и открывается на GitHub Pages по адресу `/earnings/` рядом с Grach films.
Данные хранятся в Supabase (таблица `docs`, вход по e-mail и паролю), файл `earnings-app/supabase/setup.sql` создаёт таблицы и правила доступа.
Распознавание чеков: Edge Function `supabase/functions/scan-receipt`, ключ Anthropic лежит в секретах Supabase.
Личные данные (`seed.sql`) в репозиторий не кладём.
