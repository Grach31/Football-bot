// Отправка push-уведомлений о сериалах, которые выходят сегодня (по Москве).
//
// Запуск:
//   node notify.mjs                 обычная отправка
//   node notify.mjs --dry-run       только показать, что было бы отправлено
//   node notify.mjs --date 2026-10-22   проверить конкретную дату
//   node notify.mjs --test          отправить тестовое уведомление
//
// Секреты (переменные окружения):
//   VAPID_PRIVATE_KEY   приватный ключ push (пара к ключу в site/data/config.json)
//   PUSH_SUBSCRIPTION   «код устройства» из приложения: объект или массив объектов
//   VAPID_SUBJECT       необязательно, по умолчанию mailto:series@example.com

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'site', 'data');
const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const dry = has('--dry-run');
const test = has('--test');
const today = val('--date') || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());

const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'series.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));

const weekday = (s) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long' }).format(new Date(s + 'T00:00:00Z'));

function buildPayloads(date) {
  const out = [];
  for (const s of data.series) {
    const todays = (s.episodes || []).filter((e) => e.date === date);
    if (!todays.length) continue;
    const u = s.unit || 'серия';
    const verb = u === 'выпуск' ? 'вышел' : 'вышла';
    const last = todays[todays.length - 1];
    const fin = s.total && last.n === s.total ? ' (финал)' : '';
    let title;
    if (todays.length > 1) {
      const plural = u === 'выпуск' ? 'выпуски' : 'серии';
      title = `${s.title}: вышли ${plural} ${todays[0].n}–${last.n}${fin}`;
    } else {
      title = `${s.title}: ${verb} ${last.n} ${u}${fin}`;
    }
    const parts = [];
    if (s.service) parts.push(s.service);
    parts.push(last.time ? `сегодня, ${weekday(date)}, в ${last.time}` : `сегодня, ${weekday(date)}`);
    out.push({ title, body: parts.join(' · '), tag: `${s.id}-${date}`, url: `./#/s/${s.id}` });
  }
  return out;
}

const payloads = test
  ? [{ title: 'Сериалы', body: 'Проверка: уведомления работают', tag: 'test', url: './#/week' }]
  : buildPayloads(today);

console.log(`Дата: ${today}. Уведомлений к отправке: ${payloads.length}`);
for (const p of payloads) console.log(` - ${p.title} | ${p.body}`);

if (!payloads.length) process.exit(0);
if (dry) { console.log('Пробный запуск, ничего не отправлено.'); process.exit(0); }

const privateKey = process.env.VAPID_PRIVATE_KEY;
const rawSub = process.env.PUSH_SUBSCRIPTION;
if (!privateKey || !rawSub) {
  console.error('Не заданы секреты VAPID_PRIVATE_KEY и/или PUSH_SUBSCRIPTION. Добавьте их в Settings → Secrets and variables → Actions.');
  process.exit(1);
}

let subs;
try {
  const parsed = JSON.parse(rawSub);
  subs = Array.isArray(parsed) ? parsed : [parsed];
} catch (err) {
  console.error('Секрет PUSH_SUBSCRIPTION не похож на JSON. Скопируйте «код устройства» в приложении целиком.');
  process.exit(1);
}

webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:series@example.com', config.vapidPublicKey, privateKey);

let sent = 0;
let failed = 0;
for (const sub of subs) {
  for (const p of payloads) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(p), { TTL: 60 * 60 * 12 });
      sent += 1;
    } catch (err) {
      failed += 1;
      const code = err.statusCode;
      if (code === 404 || code === 410) console.error('Подписка устарела: включите уведомления в приложении заново и обновите секрет PUSH_SUBSCRIPTION.');
      else console.error(`Ошибка отправки (${code || 'без кода'}): ${err.body || err.message}`);
    }
  }
}
console.log(`Отправлено: ${sent}, ошибок: ${failed}`);
if (sent === 0) process.exit(1);
