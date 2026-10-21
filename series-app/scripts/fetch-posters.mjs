// Скачивает постеры в site/posters/ и прописывает поле poster в site/data/series.json.
// Запускается в workflow перед публикацией сайта; результат в репозиторий не коммитится.
// Секреты (необязательно): TMDB_TOKEN, KINOPOISK_TOKEN. Без них ничего не делает.
// Ошибки по отдельным сериалам не останавливают работу.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.join(here, '..', 'site');
const dataFile = path.join(siteDir, 'data', 'series.json');
const outDir = path.join(siteDir, 'posters');

const tmdbToken = (process.env.TMDB_TOKEN || '').trim();
const kpToken = (process.env.KINOPOISK_TOKEN || '').trim();
if (!tmdbToken && !kpToken) { console.log('Нет ключей TMDB_TOKEN и KINOPOISK_TOKEN, постеры пропущены.'); process.exit(0); }

const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const moviesFile = path.join(siteDir, 'data', 'movies.json');
let movies = { items: [] };
try { movies = JSON.parse(fs.readFileSync(moviesFile, 'utf8')); } catch (e) { /* фильмов нет */ }
fs.mkdirSync(outDir, { recursive: true });

const clean = (t) => t.split(/[.:]/)[0].trim() || t;

async function getJson(url, headers) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function download(url, file) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

async function fromTmdb(query) {
  if (!tmdbToken) return null;
  const headers = { Accept: 'application/json' };
  const params = new URLSearchParams({ query, language: 'ru-RU' });
  if (tmdbToken.startsWith('eyJ')) headers.Authorization = `Bearer ${tmdbToken}`; else params.set('api_key', tmdbToken);
  const j = await getJson(`https://api.themoviedb.org/3/search/multi?${params}`, headers);
  const hit = (j.results || []).find((x) => (x.media_type === 'tv' || x.media_type === 'movie') && x.poster_path);
  return hit ? `https://image.tmdb.org/t/p/w342${hit.poster_path}` : null;
}
async function fromKinopoisk(query) {
  if (!kpToken) return null;
  const j = await getJson(`https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}&page=1`, { 'X-API-KEY': kpToken });
  const hit = (j.films || []).find((x) => x.posterUrlPreview);
  return hit ? hit.posterUrlPreview : null;
}

// страница на Кинопоиске: там кнопка «Смотреть» ведёт в нужный российский сервис
async function kpPage(query, isSeries) {
  if (!kpToken) return null;
  const j = await getJson(`https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(query)}&page=1`, { 'X-API-KEY': kpToken });
  const tv = (x) => /SERIES|SHOW/.test(x.type || '');
  const list = j.films || [];
  const hit = list.find((x) => tv(x) === isSeries) || list[0];
  return hit ? `https://www.kinopoisk.ru/${tv(hit) ? 'series' : 'film'}/${hit.filmId}/` : null;
}

let ok = 0;
for (const [s, prefix] of [...data.series.map((x) => [x, '']), ...movies.items.map((x) => [x, 'm-'])]) {
  if (!s.kp_url) {
    for (const q of [...new Set([s.poster_query, s.title, clean(s.title)].filter(Boolean))]) {
      try { s.kp_url = await kpPage(q, !prefix); } catch (e) { console.warn(`${s.title}: kp — ${e.message}`); }
      if (s.kp_url) break;
    }
  }
  if (s.poster) continue;
  const queries = [s.poster_query, s.title, clean(s.title)].filter(Boolean);
  let url = null;
  for (const q of [...new Set(queries)]) {
    for (const src of [fromTmdb, fromKinopoisk]) {
      try { url = await src(q); } catch (e) { console.warn(`${s.title}: ${src.name} — ${e.message}`); }
      if (url) break;
    }
    if (url) break;
  }
  if (!url) { console.log(`Постер не найден: ${s.title}`); continue; }
  try {
    await download(url, path.join(outDir, `${prefix}${s.id}.jpg`));
    s.poster = `posters/${prefix}${s.id}.jpg`;
    ok += 1;
  } catch (e) { console.warn(`${s.title}: не удалось скачать — ${e.message}`); }
}
fs.writeFileSync(dataFile, JSON.stringify(data, null, 2) + '\n');
if (movies.items.length) fs.writeFileSync(moviesFile, JSON.stringify(movies, null, 2) + '\n');
console.log(`Постеров загружено: ${ok} из ${data.series.length + movies.items.length}`);
