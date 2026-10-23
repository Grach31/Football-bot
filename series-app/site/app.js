'use strict';

const $app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const MSK = 'Europe/Moscow';
const PAL = [
  ['#6C4DFF', '#1B0F55'], ['#FFA94D', '#8C2F00'], ['#FF6AA2', '#6A0F3A'], ['#2FBF71', '#0B3D26'],
  ['#36D1DC', '#0B4F6C'], ['#E8590C', '#4A1500'], ['#4C8DFF', '#0D2A63'], ['#C77DFF', '#3A0F66'],
];
const GROUPS = [
  ['airing', 'Выходит сейчас'],
  ['soon', 'Скоро'],
  ['nodate', 'Дата не объявлена'],
  ['out', 'Вышел'],
  ['closed', 'Закрыт: продолжения не будет'],
];
const SFILTERS = [['all', 'Все'], ['airing', 'Выходит'], ['soon', 'Скоро'], ['nodate', 'Нет даты'], ['out', 'Вышел'], ['closed', 'Закрыт']];
const CHEV = '<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

// образы для главной; новые картинки добавляйте в конец списка
const HERO = ['avatars/fallout.jpg', 'avatars/got.jpg', 'avatars/gangster.jpg', 'avatars/samurai.jpg'];
{ const i = new Image(); i.src = HERO[Math.floor(Date.parse(new Date().toISOString().slice(0, 10)) / 86400000) % HERO.length]; } // загрузка образа дня заранее
let DISC = { updated: '', items: [] };
let dfilter = 'all';
let DATA = { updated: '', series: [] };
let CONFIG = {};
let SUBS = { updated: '', items: [] };
let MOVIES = { updated: '', items: [] };
let mfilter = 'all';
let confirmDel = '';
let filter = 'all';
let sfilter = 'all';
let libfilter = 'all';
let stab = 'subs';
let msfilter = 'all';

/* ---------- даты ---------- */
function todayStr() {
  const t = params.get('today');
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return new Intl.DateTimeFormat('en-CA', { timeZone: MSK }).format(new Date());
}
const d0 = (s) => new Date(s + 'T00:00:00Z');
function addDays(s, n) { const x = d0(s); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const fmt = (s, o) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', ...o }).format(d0(s));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const shortDate = (s) => fmt(s, { day: 'numeric', month: 'short' }).replace('.', '');
const longDate = (s) => fmt(s, { day: 'numeric', month: 'long' });
const weekday = (s) => fmt(s, { weekday: 'long' });
const weekdayShort = (s) => fmt(s, { weekday: 'short' }).replace('.', '');

/* ---------- утилиты ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function hash(str) { let h = 0; for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; }
const eps = (s) => s.episodes || [];
const unit = (s) => s.unit || 'серия';
const nextEp = (s, today) => eps(s).find((e) => e.date >= today) || null;

function tile(s, small) {
  const kind = s.status === 'waiting' ? 'blue' : (s.status === 'nodate' || s.status === 'ended') ? 'gray' : '';
  const inner = s.poster ? `<img src="${esc(s.poster)}" alt="">` : esc(s.title.charAt(0));
  return `<div class="tile ${kind}" aria-hidden="true">${inner}</div>`;
}
function poster(s) {
  const [a, b] = PAL[hash(s.title) % PAL.length];
  const inner = s.poster ? `<img src="${esc(s.poster)}" alt="" loading="lazy" decoding="async">` : `<span class="ptitle">${esc(s.title)}</span>`;
  return `<div class="poster" style="background:linear-gradient(160deg,${a},${b})" role="img" aria-label="${esc(s.title)}">${inner}</div>`;
}
const palOf = (s) => PAL[hash(s.title) % PAL.length];
function badgeFor(s, today) {
  if (s.status === 'airing') {
    const n = nextEp(s, today);
    const num = n ? `${n.n}${s.total ? '/' + s.total : ''}` : (s.total ? `${s.total}` : '');
    const when = n ? (n.date === today ? 'Сегодня' : n.date === addDays(today, 1) ? 'Завтра' : shortDate(n.date)) : 'Уточняется';
    return [num, when];
  }
  if (s.status === 'waiting') return ['', s.when || 'Ждём'];
  if (s.status === 'nodate') return ['', 'Нет даты'];
  return ['', 'Завершён'];
}
function pcard(s, today) {
  const [num, when] = badgeFor(s, today);
  return `<a class="pcard" href="#/s/${esc(s.id)}">${poster(s)}<div class="bds">${num ? `<span class="bd">${esc(num)}</span>` : ''}<span class="bl">${esc(when)}</span></div></a>`;
}
function chipFor(s, today) {
  if (s.status === 'airing') {
    const n = nextEp(s, today);
    if (!n) return ['gray', 'график уточняется'];
    return n.date === today ? ['amber', 'сегодня'] : ['amber', shortDate(n.date)];
  }
  if (s.status === 'waiting') return ['blue', s.when || 'ждём'];
  if (s.status === 'nodate') return ['gray', 'нет даты'];
  return ['gray', 'завершён'];
}
function metaFor(s, today) {
  const p = [];
  if (s.season) p.push(`${s.season} сезон`);
  if (s.status === 'airing') {
    const n = nextEp(s, today);
    if (n) p.push(`${n.n} ${unit(s)}${s.total ? ' из ' + s.total : ''}`);
    else if (s.total) p.push(`${s.total} серий`);
  }
  if (s.service) p.push(s.service);
  return p.join(' · ');
}

/* ---------- экраны ---------- */
function viewWeek() {
  const today = todayStr();
  const end = addDays(today, 13);
  const airing = DATA.series.filter((s) => s.status === 'airing' && nextEp(s, today))
    .sort((a, b) => (nextEp(a, today).date < nextEp(b, today).date ? -1 : 1));
  let html = `<div class="brand"><svg width="22" height="22" viewBox="0 0 24 24" fill="#8CC4FF" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>Grach films</div>`;
  // главная картинка: каждый день новый образ
  const day = Math.floor(d0(today).getTime() / 86400000);
  html += `<div class="avhero"><img src="${esc(HERO[day % HERO.length])}" alt=""></div>`;
  if (airing.length) html += `<h2 class="hd">Выходят сейчас</h2><div class="hrow2">${airing.map((s) => pcard(s, today)).join('')}</div>`;
  const wait = DATA.series.filter((s) => s.status === 'waiting');
  if (wait.length) html += `<h2 class="hd">Ждём новые сезоны</h2><div class="hrow2">${wait.map((s) => pcard(s, today)).join('')}</div>`;

  const soonMovies = MOVIES.items.filter((m) => m.status !== 'watched' && m.date && m.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (soonMovies.length) html += `<h2 class="hd">Фильмы скоро</h2><div class="hrow2">${soonMovies.map((m) => `<a class="pcard" href="#/m/${esc(m.id)}">${poster(m)}<div class="bds"><span class="bl">${esc(movieBadge(m, today))}</span></div></a>`).join('')}</div>`;

  const byDate = {};
  DATA.series.forEach((s) => eps(s).forEach((e) => {
    if (e.date >= today && e.date <= end) (byDate[e.date] = byDate[e.date] || []).push({ s, e });
  }));
  const dates = Object.keys(byDate).sort();
  html += `<h2 class="hd">Расписание на две недели</h2>`;
  if (!dates.length) html += '<p class="empty">На ближайшие две недели новых серий нет.</p>';
  dates.forEach((date) => {
    const label = date === today ? 'Сегодня' : date === addDays(today, 1) ? 'Завтра' : cap(weekday(date));
    html += `<div class="row-head"><b>${label}</b><span>${longDate(date)}</span></div><div class="stack">`;
    byDate[date].forEach(({ s, e }) => {
      const fin = s.total && e.n === s.total ? ' · финал' : '';
      const time = e.time ? `<div class="chip amber">${esc(e.time)}</div>` : CHEV;
      html += `<a class="card" href="#/s/${esc(s.id)}">${tile(s)}<div class="grow"><div class="ttl">${esc(s.title)}</div>` +
        `<div class="meta">${e.n} ${unit(s)}${s.total ? ' из ' + s.total : ''}${fin}${s.service ? ' · ' + esc(s.service) : ''}</div></div>${time}</a>`;
    });
    html += '</div>';
  });
  const pending = DATA.series.filter((s) => s.status === 'airing' && !nextEp(s, today));
  if (pending.length) {
    html += '<div class="row-head"><b>График уточняется</b></div><div class="stack">';
    pending.forEach((s) => {
      html += `<a class="card" href="#/s/${esc(s.id)}">${tile(s)}<div class="grow"><div class="ttl">${esc(s.title)}</div><div class="meta">${esc(metaFor(s, today))}</div></div>${CHEV}</a>`;
    });
    html += '</div>';
  }
  html += `<p class="foot">Данные обновлены ${esc(DATA.updated)}. Даты взяты из открытых источников и могут меняться.</p>`;
  return html;
}

function seg(mode) {
  return `<div class="seg"><a href="#/list" class="${mode === 'list' ? 'on' : ''}">Список</a><a href="#/posters" class="${mode === 'posters' ? 'on' : ''}">Постеры</a></div>`;
}
/* ---------- мои разделы: смотрю / хочу / просмотрено ---------- */
const MINE = { want: 'Хочу посмотреть', watching: 'Смотрю', done: 'Посмотрел' };
const MINE_LABEL = MINE;
const MFILTERS = [['all', 'Все'], ...Object.entries(MINE)];
const MSFILTERS = [['all', 'Все'], ['soon', 'Скоро'], ['nodate', 'Нет даты'], ['out', 'Вышел']];
// «Смотрю» → «Просмотрено» автоматически через 5 дней после последней серии;
// «Просмотрено» → «Смотрю», когда появляется новый сезон
function effMine(s) {
  const today = todayStr();
  const list = s.episodes || [];
  const last = list.length ? list.map((e) => e.date).sort().pop() : null;
  const aired = list.some((e) => e.date <= today);
  const finished = last && (s.status === 'ended' || (s.total && list.length >= s.total));
  // новый сезон объявлен, но первая серия ещё не вышла
  const announced = s.status === 'waiting' || (list.length > 0 && !aired);
  if (s.mine === 'watching') {
    if (finished && addDays(last, 5) <= today) return 'done';
    return 'watching';
  }
  if (s.mine === 'done') {
    if (announced) return 'watching';
    if (s.seen_season && (s.season || 1) > s.seen_season && aired) return 'watching';
    return 'done';
  }
  return s.mine || '';
}
async function setMine(id, val) {
  const msg = document.getElementById('s_msg'); if (msg) msg.textContent = 'Сохраняю…';
  try {
    DATA = await ghEdit('series.json', (d) => {
      const x = d.series.find((y) => y.id === id); if (!x) return;
      if (val) x.mine = val; else delete x.mine;
      if (val === 'done') x.seen_season = x.season || 1; else delete x.seen_season;
    }, 'Сериалы: раздел');
    render();
  } catch (err) { if (msg) msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; }
}

// состояние самого сериала (определяю я): выходит / скоро / нет даты / вышел / закрыт
function sState(s, today) {
  const list = s.episodes || [];
  const aired = list.some((e) => e.date <= today);
  if (s.status === 'waiting' || (list.length > 0 && !aired)) return 'soon';
  if (s.status === 'airing') return 'airing';
  if (s.status === 'nodate') return 'nodate';
  return s.closed ? 'closed' : 'out';
}
const chipRow = (arr, cur, attr) => '<div class="chips">' + arr.filter(([k]) => k !== 'all').map(([k, l]) => `<button type="button" class="fbtn ${cur === k ? 'on' : ''}" ${attr}="${k}">${l}</button>`).join('') + '</div>';
function viewList(mode) {
  const today = todayStr();
  let html = `<div class="hrow"><h1>Сериалы</h1><a class="addbtn" href="#/add" aria-label="Добавить сериал">+ Добавить</a></div>` +
    chipRow(Object.entries({ all: 'Все', ...MINE }), filter, 'data-filter') + chipRow(SFILTERS, sfilter, 'data-sfilter');
  const all = DATA.series.map((s) => ({ s, st: sState(s, today) })).filter((x) => (filter === 'all' || effMine(x.s) === filter) && (sfilter === 'all' || x.st === sfilter));
  if (!all.length) return html + '<p class="empty">Здесь пока пусто. Измените фильтры или добавьте сериал.</p>';
  GROUPS.forEach(([key, label]) => {
    let list = all.filter((x) => x.st === key).map((x) => x.s);
    if (!list.length) return;
    if (key === 'airing' || key === 'soon') {
      list = list.slice().sort((a, b) => {
        const na = nextEp(a, today), nb = nextEp(b, today);
        return (na ? na.date : '9999') < (nb ? nb.date : '9999') ? -1 : 1;
      });
    }
    if (sfilter === 'all') html += `<div class="group">${label}</div>`;
    html += '<div class="stack tight">' + list.map((s) => {
      const [c, t] = chipFor(s, today);
      const m = effMine(s);
      return `<a class="card compact" href="#/s/${esc(s.id)}">${poster(s)}<div class="grow"><div class="ttl">${esc(s.title)}</div><div class="meta">${esc(metaFor(s, today))}${m ? ' · ' + MINE[m] : ''}</div></div><div class="chip ${c}">${esc(t)}</div></a>`;
    }).join('') + '</div>';
  });
  return html;
}


/* ---------- где смотреть (только российские сервисы; зарубежное — через «Твоё») ---------- */
function watchLink(s) {
  const q = encodeURIComponent(s.title);
  const sv = (s.service || '').toLowerCase();
  let name, url;
  if (sv.includes('кинопоиск')) { name = 'Кинопоиске'; url = `https://www.kinopoisk.ru/index.php?kp_query=${q}`; }
  else if (sv.includes('кион') || sv.includes('kion')) { name = 'KION'; url = 'https://kion.ru/'; }
  else if (sv.includes('иви') || sv.includes('ivi')) { name = 'Иви'; url = `https://www.ivi.ru/search/?q=${q}`; }
  else if (sv.includes('wink')) { name = 'Wink'; url = 'https://wink.ru/'; }
  else if (sv.includes('okko')) { name = 'Okko'; url = 'https://okko.tv/'; }
  else if (sv.includes('start') || sv.includes('старт')) { name = 'Start'; url = 'https://start.ru/'; }
  else if (sv.includes('premier') || sv.includes('тнт')) { name = 'Premier'; url = 'https://premier.one/'; }
  else { name = 'Твоё'; url = 'https://tvoe.live/'; }
  if (s.watch_url) url = s.watch_url;
  if (s.watch_name) name = s.watch_name;
  return { name, url, direct: !!s.watch_url };
}

function viewSeries(id) {
  const today = todayStr();
  const s = DATA.series.find((x) => x.id === id);
  if (!s) return '<a class="back" href="#/list">‹ Сериалы</a><p class="empty">Такого сериала в списке нет.</p>';
  const [c, t] = chipFor(s, today);
  const statusText = { airing: 'Выходит сейчас', waiting: 'Ждём: ' + (s.when || ''), nodate: 'Дата не объявлена', ended: s.closed ? 'Закрыт: продолжения не будет' : 'Вышел' }[s.status];
  const [ga] = palOf(s);
  const [bnum] = badgeFor(s, today);
  let html = `<div class="shero${s.poster ? ' haspic' : ''}" style="--ga:${ga}"><a class="back" href="#/list"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Сериалы</a>` + (s.poster ? `<img class="spic" src="${esc(s.poster)}" alt="">` : '') +
    `<div class="stitle">${esc(s.title)}</div><div class="cmeta">${bnum ? `<span class="pill">${esc(bnum.replace('/', ' / '))}</span>` : ''}<span>${esc(metaFor(s, today))}</span></div>` +
    `<div class="chip ${c}" style="margin-top:10px">${esc(statusText)}</div></div>`;
  if (s.note) html += `<p class="note">${esc(s.note)}</p>`;
  if (s.status === 'airing' || s.status === 'ended') {
    const w = watchLink(s);
    html += `<a class="btn watch" href="${esc(w.url)}" target="_blank" rel="noopener">Смотреть в ${esc(w.name)}</a>${w.direct ? '' : '<span class="meta"> откроется главная или поиск сервиса</span>'}`;
  }
  {
    const cur = effMine(s), has = !!lsGet('gh_token');
    if (has) html += '<div class="chips" style="margin-top:12px">' + [...Object.entries(MINE), ['', 'Убрать']].map(([k, l]) => `<button type="button" class="fbtn ${cur === k ? 'on' : ''}" data-act="setmine" data-id="${esc(s.id)}" data-val="${k}">${l}</button>`).join('') + '</div><div id="s_msg" class="meta" role="status"></div>';
    else if (cur) html += `<p class="meta">Мой раздел: ${MINE_LABEL[cur]}</p>`;
  }
  const list = eps(s);
  if (list.length) {
    const done = list.filter((e) => e.date < today);
    const upcoming = list.filter((e) => e.date >= today);
    html += '<div class="group">Серии</div><div class="stack tight">';
    if (done.length) {
      const last = done[done.length - 1];
      html += `<div class="ep done"><span aria-hidden="true">✓</span><span>Вышло ${done.length}${s.total ? ' из ' + s.total : ''} · последняя ${longDate(last.date)}</span></div>`;
    }
    upcoming.forEach((e, i) => {
      const r = e.date === today ? 'сегодня' : e.date === addDays(today, 1) ? 'завтра' : (s.total && e.n === s.total ? 'финал' : '');
      html += `<div class="ep ${i === 0 ? 'next' : ''}"><span class="n">${e.n}</span><span class="d">${longDate(e.date)} · ${weekdayShort(e.date)}${e.time ? ' · ' + esc(e.time) : ''}</span><span class="r">${r}</span></div>`;
    });
    html += '</div>';
    if (s.approx) html += '<p class="foot">Число выпусков не подтверждено, список дат будет уточняться.</p>';
  }
  return html;
}

/* ---------- уведомления ---------- */
function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function viewNotify() {
  return `<h1>Уведомления</h1>
<div class="panel"><h2>Состояние</h2><div id="nstate" class="meta">Проверяю…</div><div id="nbtns"></div></div>
<div id="ncode"></div>
<div class="panel"><h2>Как подключить</h2><ol class="steps">
<li>Откройте приложение с иконки на экране «Домой» (на iPhone: Safari → «Поделиться» → «На экран Домой»).</li>
<li>Нажмите «Включить уведомления» и разрешите их.</li>
<li>Скопируйте «код устройства» и добавьте его в GitHub как секрет <b>PUSH_SUBSCRIPTION</b>.</li>
<li>Нажмите «Проверить», чтобы убедиться, что уведомление показывается.</li>
</ol></div>`;
}

async function currentSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
async function refreshNotify() {
  const st = document.getElementById('nstate');
  const btns = document.getElementById('nbtns');
  const code = document.getElementById('ncode');
  if (!st) return;
  if (!pushSupported()) {
    st.innerHTML = isIOS && !isStandalone()
      ? '<span class="warn">Откройте приложение с экрана «Домой».</span> В обычной вкладке Safari уведомления на iPhone недоступны.'
      : '<span class="warn">Этот браузер не поддерживает push-уведомления.</span>';
    btns.innerHTML = '';
    return;
  }
  const sub = await currentSub();
  const perm = Notification.permission;
  if (perm === 'denied') {
    st.innerHTML = '<span class="warn">Уведомления запрещены.</span> Разрешите их в настройках телефона для этого приложения.';
    btns.innerHTML = '';
    return;
  }
  if (sub) {
    st.innerHTML = '<span class="ok">Уведомления включены на этом устройстве.</span>';
    btns.innerHTML = '<button type="button" class="btn" data-act="test">Проверить</button>';
    code.innerHTML = `<div class="panel"><h2>Код устройства</h2><p>Добавьте его в GitHub как секрет PUSH_SUBSCRIPTION. Это нужно один раз.</p>` +
      `<textarea class="code" id="subcode" readonly aria-label="Код устройства">${esc(JSON.stringify(sub.toJSON()))}</textarea>` +
      `<button type="button" class="btn ghost" data-act="copy">Скопировать код</button><span id="copied" class="ok"></span></div>`;
  } else {
    st.textContent = 'Уведомления ещё не включены.';
    btns.innerHTML = '<button type="button" class="btn" data-act="enable">Включить уведомления</button>';
    code.innerHTML = '';
  }
}
async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return refreshNotify();
    const reg = await navigator.serviceWorker.ready;
    if (!(await reg.pushManager.getSubscription())) {
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.vapidPublicKey) });
    }
  } catch (err) {
    const st = document.getElementById('nstate');
    if (st) st.innerHTML = `<span class="warn">Не получилось включить:</span> ${esc(err.message || err)}`;
    return;
  }
  refreshNotify();
}
async function testPush() {
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification('Grach films', { body: 'Проверка: уведомления работают', icon: 'icons/icon-192.png', tag: 'test' });
}
async function copyCode() {
  const el = document.getElementById('subcode');
  const note = document.getElementById('copied');
  try { await navigator.clipboard.writeText(el.value); note.textContent = ' Скопировано'; }
  catch (e) { el.select(); note.textContent = ' Выделено, скопируйте вручную'; }
}


/* ---------- добавление сериала ---------- */
const SERVICES = ['Кинопоиск', 'KION', 'Иви', 'Wink', 'Твоё', 'Okko', 'Premier', 'Start', 'Netflix', 'Apple TV+', 'Prime Video', 'Paramount+', 'Другой'];
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };

function viewAdd() {
  const has = !!lsGet('gh_token');
  return `<h1>Добавить сериал</h1>
<div class="panel"><form id="addform" autocomplete="off">
<label class="lbl" for="a_title">Название</label>
<input class="inp" id="a_title" required placeholder="Например, Сёгун">
<label class="lbl" for="a_service">Где смотрите</label>
<select class="inp" id="a_service">${SERVICES.map((x) => `<option>${x}</option>`).join('')}</select>
<label class="lbl" for="a_note">Заметка (необязательно)</label>
<input class="inp" id="a_note" placeholder="Например, 2 сезон">
<button type="submit" class="btn" ${has ? '' : 'disabled'} id="a_submit">Добавить</button>
<div id="a_msg" class="meta" role="status"></div>
</form>
<p class="meta">Сериал появится в списке «Нет даты». Даты выхода серий я подтягиваю при еженедельной проверке.</p></div>
<div class="panel"><h2>Доступ к GitHub</h2>
<p>${has ? '<span class="ok">Токен сохранён на этом телефоне.</span>' : 'Нужен один раз: токен GitHub только для этого репозитория (Contents: Read and write).'}</p>
<input class="inp" id="a_token" type="password" placeholder="${has ? 'Заменить токен' : 'Вставьте токен'}" autocomplete="off">
<button type="button" class="btn ghost" data-act="savetoken">Сохранить токен</button>
${has ? '<button type="button" class="btn ghost" data-act="deltoken">Удалить токен</button>' : ''}
<a class="meta" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="display:block;margin-top:8px">Создать токен на GitHub</a></div>`;
}

function slugify(t) {
  const m = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  return t.toLowerCase().split('').map((c) => (m[c] !== undefined ? m[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'series';
}
const u8ToB64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64ToStr = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

async function ghFile(token) {
  const R = CONFIG.repo;
  const url = `https://api.github.com/repos/${R.owner}/${R.name}/contents/${R.path}`;
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  return { url, h, branch: R.branch };
}
async function addSeries(e) {
  e.preventDefault();
  const msg = document.getElementById('a_msg');
  const btn = document.getElementById('a_submit');
  const token = lsGet('gh_token');
  const title = document.getElementById('a_title').value.trim();
  if (!title || !token) return;
  btn.disabled = true; msg.textContent = 'Сохраняю…';
  try {
    const { url, h, branch } = await ghFile(token);
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(`${url}?ref=${branch}`, { headers: h, cache: 'no-store' });
      if (r.status === 401 || r.status === 403) throw new Error('Токен не подошёл или у него нет прав на запись.');
      if (!r.ok) throw new Error(`GitHub ответил ${r.status}`);
      const f = await r.json();
      const data = JSON.parse(b64ToStr(f.content));
      if (data.series.some((s) => s.title.toLowerCase() === title.toLowerCase())) throw new Error('Такой сериал уже есть в списке.');
      let id = slugify(title); let n = 2; const base = id;
      while (data.series.some((s) => s.id === id)) id = `${base}-${n++}`;
      const item = { id, title, service: document.getElementById('a_service').value, status: 'nodate', mine: 'want', added: todayStr() };
      const note = document.getElementById('a_note').value.trim();
      if (note) item.note = note;
      data.series.push(item);
      data.updated = todayStr();
      const body = { message: `Сериалы: добавить «${title}»`, content: u8ToB64(JSON.stringify(data, null, 2) + '\n'), sha: f.sha, branch };
      const p = await fetch(url, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (p.status === 409 && attempt === 0) continue;
      if (!p.ok) throw new Error(`Не удалось сохранить (${p.status})`);
      DATA = data;
      msg.innerHTML = `<span class="ok">Добавлено.</span> В списке появится через минуту после обновления сайта.`;
      document.getElementById('addform').reset();
      break;
    }
  } catch (err) {
    msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`;
  }
  btn.disabled = false;
}


/* ---------- подписки ---------- */
const PMONTHS = { month: 1, '3m': 3, '6m': 6, year: 12 };
const PLABEL = { '3m': 'за 3 месяца', '6m': 'за 6 месяцев', year: 'в год' };
function addMonths(s, n, day) {
  const x = d0(s); const y = x.getUTCFullYear(), m = x.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
}
// ближайшая дата списания/окончания: если дата прошла, переносим на следующий период
function subNext(it, today) {
  let d = it.next;
  if (it.period === 'once' || d >= today) return d;
  const day = +d.slice(8, 10); let i = 0;
  const step = PMONTHS[it.period] || 1;
  while (d < today && i < 600) { i += 1; d = addMonths(it.next, step * i, day); }
  return d;
}
const daysBetween = (a, b) => Math.round((d0(b) - d0(a)) / 86400000);
const plural = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; };
const money = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`;

function viewSubs() {
  const today = todayStr();
  const items = SUBS.items.map((it) => { const nx = subNext(it, today); return { ...it, nx, left: daysBetween(today, nx) }; }).sort((a, b) => a.left - b.left);
  const has = !!lsGet('gh_token');
  const perMonth = items.reduce((s, it) => s + (it.period === 'once' ? 0 : it.price / (PMONTHS[it.period] || 1)), 0);
  let html = `<h1>Подписки</h1>`;
  if (items.length) html += `<p class="meta">В среднем ${money(Math.round(perMonth))} в месяц · ${items.length} ${plural(items.length, ['сервис', 'сервиса', 'сервисов'])}</p>`;
  else html += '<p class="empty">Подписок пока нет. Добавьте первую ниже.</p>';
  html += '<div class="stack tight" style="margin-top:12px">' + items.map((it) => {
    const cls = it.left <= 1 ? 'warn' : it.left <= 3 ? 'soon' : '';
    const big = it.left < 0 ? 'закончилась' : it.left === 0 ? 'сегодня' : `${it.left} ${plural(it.left, ['день', 'дня', 'дней'])}`;
    const what = it.period === 'once' ? 'доступ до' : 'списание';
    return `<div class="card compact subcard"><div class="grow"><div class="ttl">${esc(it.service)}</div><div class="meta">${what} ${longDate(it.nx)} · ${money(it.price)}${PLABEL[it.period] ? ' ' + PLABEL[it.period] : ''}${it.note ? ' · ' + esc(it.note) : ''}</div></div>` +
      `<div class="left ${cls}">${big}</div>${has ? `<button type="button" class="xbtn" data-act="delsub" data-id="${esc(it.id)}" aria-label="Удалить ${esc(it.service)}">×</button>` : ''}</div>`;
  }).join('') + '</div>';
  html += `<div class="panel"><h2>Добавить подписку</h2><form id="subform" autocomplete="off">
<label class="lbl" for="s_service">Сервис</label>
<select class="inp" id="s_service">${SERVICES.map((x) => `<option>${x}</option>`).join('')}</select>
<label class="lbl" for="s_price">Цена, ₽</label>
<input class="inp" id="s_price" type="number" inputmode="decimal" min="0" required placeholder="399">
<label class="lbl" for="s_next">Ближайшее списание или конец доступа</label>
<input class="inp" id="s_next" type="date" required>
<label class="lbl" for="s_period">Как часто</label>
<select class="inp" id="s_period"><option value="month">Каждый месяц</option><option value="3m">Раз в 3 месяца</option><option value="6m">Раз в полгода</option><option value="year">Раз в год</option><option value="once">Один раз (без продления)</option></select>
<button type="submit" class="btn" id="s_submit" ${has ? '' : 'disabled'}>Добавить</button>
<div id="s_msg" class="meta" role="status"></div></form>
${has ? '' : '<p class="meta">Чтобы сохранять, добавьте токен GitHub на странице <a href="#/add" style="color:var(--accent)">«Добавить сериал»</a>.</p>'}</div>`;
  return html;
}

async function ghEdit(file, mutate, message) {
  const token = lsGet('gh_token');
  const R = CONFIG.repo;
  const url = `https://api.github.com/repos/${R.owner}/${R.name}/contents/${R.path.replace('series.json', file)}`;
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${url}?ref=${R.branch}`, { headers: h, cache: 'no-store' });
    if (r.status === 401 || r.status === 403) throw new Error('Токен не подошёл или у него нет прав на запись.');
    if (!r.ok) throw new Error(`GitHub ответил ${r.status}`);
    const f = await r.json();
    const data = JSON.parse(b64ToStr(f.content));
    mutate(data);
    data.updated = todayStr();
    const p = await fetch(url, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, content: u8ToB64(JSON.stringify(data, null, 2) + '\n'), sha: f.sha, branch: R.branch }) });
    if (p.status === 409 && attempt === 0) continue;
    if (!p.ok) throw new Error(`Не удалось сохранить (${p.status})`);
    return data;
  }
}
async function addSub(e) {
  e.preventDefault();
  const msg = document.getElementById('s_msg'); const btn = document.getElementById('s_submit');
  const service = document.getElementById('s_service').value;
  const it = { id: `${slugify(service)}-${Date.now().toString(36)}`, service, price: Number(document.getElementById('s_price').value), next: document.getElementById('s_next').value, period: document.getElementById('s_period').value };
  btn.disabled = true; msg.textContent = 'Сохраняю…';
  try {
    SUBS = await ghEdit('subscriptions.json', (d) => { d.items.push(it); }, `Подписки: добавить ${service}`);
    render();
  } catch (err) { msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; btn.disabled = false; }
}
async function delSub(id) {
  try { SUBS = await ghEdit('subscriptions.json', (d) => { d.items = d.items.filter((x) => x.id !== id); }, 'Подписки: удалить'); render(); }
  catch (err) { alert(err.message); }
}


/* ---------- фильмы ---------- */
function movieBadge(m, today) {
  if (m.status === 'watched') return 'Посмотрел';
  if (m.status === 'watching') return 'Смотрю';
  if (m.date) {
    if (m.date === today) return 'Сегодня';
    if (m.date === addDays(today, 1)) return 'Завтра';
    if (m.date > today) return shortDate(m.date);
  }
  return 'В планах';
}
const mState = (m, today) => (m.date ? (m.date >= today ? 'soon' : 'out') : 'nodate');
const mMine = (m) => (m.status === 'watched' ? 'done' : m.status === 'watching' ? 'watching' : 'want');
function viewMovies() {
  const today = todayStr();
  let list = MOVIES.items.slice().reverse().filter((m) => (mfilter === 'all' || mMine(m) === mfilter) && (msfilter === 'all' || mState(m, today) === msfilter));
  let html = `<div class="hrow"><h1>Фильмы</h1><a class="addbtn" href="#/addm">+ Добавить</a></div>` + chipRow(MFILTERS, mfilter, 'data-mfilter') + chipRow(MSFILTERS, msfilter, 'data-msfilter');
  if (!list.length) return html + '<p class="empty">Здесь пока пусто. Измените фильтры или нажмите «+ Добавить».</p>';
  html += '<div class="mgrid">' + list.map((m) =>
    `<a class="pcard" href="#/m/${esc(m.id)}">${poster(m)}<div class="bds"><span class="bl">${esc(movieBadge(m, today))}</span></div></a>`).join('') + '</div>';
  return html;
}
function viewMovie(id) {
  const today = todayStr();
  const m = MOVIES.items.find((x) => x.id === id);
  if (!m) return '<a class="back" href="#/movies">‹ Фильмы</a><p class="empty">Такого фильма в списке нет.</p>';
  const [ga] = palOf(m);
  const has = !!lsGet('gh_token');
  const watched = m.status === 'watched';
  const chip = watched ? ['gray', 'Посмотрел'] : m.status === 'watching' ? ['blue', 'Смотрю'] : (m.date && m.date >= today) ? ['amber', 'Выходит ' + longDate(m.date)] : ['blue', 'Хочу посмотреть'];
  const w = watchLink(m);
  let html = `<div class="shero${m.poster ? ' haspic' : ''}" style="--ga:${ga}"><a class="back" href="#/movies"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Фильмы</a>` +
    (m.poster ? `<img class="spic" src="${esc(m.poster)}" alt="">` : '') +
    `<div class="stitle">${esc(m.title)}</div><div class="cmeta"><span>${esc(m.service || 'Твоё')}</span></div><div class="chip ${chip[0]}" style="margin-top:10px">${esc(chip[1])}</div></div>`;
  if (m.note) html += `<p class="note">${esc(m.note)}</p>`;
  html += `<a class="btn watch" href="${esc(w.url)}" target="_blank" rel="noopener">Смотреть в ${esc(w.name)}</a>${w.direct ? '' : '<span class="meta"> откроется главная или поиск сервиса</span>'}`;
  if (has) {
    html += '<div class="chips" style="margin-top:12px">' + Object.entries(MINE).map(([k, l]) => `<button type="button" class="fbtn ${mMine(m) === k ? 'on' : ''}" data-act="mset" data-id="${esc(m.id)}" data-val="${k}">${l}</button>`).join('') + '</div>' +
      `<button type="button" class="btn ghost wide danger" data-act="mdel" data-id="${esc(m.id)}">${confirmDel === m.id ? 'Точно удалить?' : 'Удалить'}</button><div id="m_msg" class="meta" role="status"></div>`;
  } else {
    html += '<p class="meta">Чтобы отмечать и удалять фильмы, добавьте токен GitHub на странице «Добавить сериал».</p>';
  }
  return html;
}
function viewAddMovie() {
  const has = !!lsGet('gh_token');
  return `<a class="back" href="#/movies"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Фильмы</a><h1>Добавить фильм</h1>
<div class="panel"><form id="mform" autocomplete="off">
<label class="lbl" for="m_title">Название</label>
<input class="inp" id="m_title" required placeholder="Например, Дюна">
<label class="lbl" for="m_service">Где смотреть</label>
<select class="inp" id="m_service">${SERVICES.map((x) => `<option${x === 'Твоё' ? ' selected' : ''}>${x}</option>`).join('')}</select>
<label class="lbl" for="m_date">Дата выхода (если известна)</label>
<input class="inp" id="m_date" type="date">
<label class="lbl" for="m_note">Заметка (необязательно)</label>
<input class="inp" id="m_note" placeholder="Например, посоветовал друг">
<button type="submit" class="btn" id="m_submit" ${has ? '' : 'disabled'}>Добавить</button>
<div id="m_msg" class="meta" role="status"></div></form>
${has ? '' : '<p class="meta">Чтобы сохранять, добавьте токен GitHub на странице <a href="#/add" style="color:var(--accent)">«Добавить сериал»</a>.</p>'}</div>`;
}
async function addMovie(e) {
  e.preventDefault();
  const msg = document.getElementById('m_msg'); const btn = document.getElementById('m_submit');
  const title = document.getElementById('m_title').value.trim();
  if (!title) return;
  btn.disabled = true; msg.textContent = 'Сохраняю…';
  try {
    MOVIES = await ghEdit('movies.json', (d) => {
      if (d.items.some((x) => x.title.toLowerCase() === title.toLowerCase())) throw new Error('Такой фильм уже есть в списке.');
      const it = { id: `${slugify(title)}-${Date.now().toString(36).slice(-4)}`, title, service: document.getElementById('m_service').value, status: 'want', added: todayStr() };
      const date = document.getElementById('m_date').value; if (date) it.date = date;
      const note = document.getElementById('m_note').value.trim(); if (note) it.note = note;
      d.items.push(it);
    }, `Фильмы: добавить «${title}»`);
    msg.innerHTML = '<span class="ok">Добавлено.</span> Постер появится после следующей публикации сайта.';
    document.getElementById('mform').reset();
  } catch (err) { msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; }
  btn.disabled = false;
}
async function movieAct(act, id, val) {
  if (act === 'mdel' && confirmDel !== id) { confirmDel = id; render(); return; }
  const msg = document.getElementById('m_msg'); if (msg) msg.textContent = 'Сохраняю…';
  try {
    if (act === 'mset') {
      MOVIES = await ghEdit('movies.json', (d) => { const m = d.items.find((x) => x.id === id); if (m) m.status = ({ done: 'watched', watching: 'watching', want: 'want' })[val] || 'want'; }, 'Фильмы: раздел');
      render();
    } else {
      MOVIES = await ghEdit('movies.json', (d) => { d.items = d.items.filter((x) => x.id !== id); }, 'Фильмы: удалить');
      confirmDel = ''; location.hash = '#/movies';
    }
  } catch (err) { if (msg) msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; }
}

/* ---------- премьеры: подборка раз в неделю ---------- */
const DFILTERS = [['all', 'Все'], ['series', 'Сериалы'], ['film', 'Фильмы']];
const inCollection = (it) => { const t = it.title.toLowerCase(); return DATA.series.some((x) => x.title.toLowerCase() === t) || MOVIES.items.some((x) => x.title.toLowerCase() === t); };
function viewDiscover() {
  const today = todayStr();
  let list = DISC.items.filter((x) => dfilter === 'all' || x.kind === dfilter);
  let html = `<h1>Премьеры</h1><p class="meta">Самые ожидаемые премьеры, российские и зарубежные. Оценку ★ показываю, когда она есть. Подборку обновляю раз в неделю${DISC.updated ? ' · обновлено ' + longDate(DISC.updated) : ''}.</p><div class="chips">` +
    DFILTERS.map(([k, l]) => `<button type="button" class="fbtn ${dfilter === k ? 'on' : ''}" data-dfilter="${k}">${l}</button>`).join('') + '</div>';
  if (!list.length) return html + '<p class="empty">Подборка пока пустая. Она заполнится при ближайшем обновлении.</p>';
  html += '<div class="stack tight" style="margin-top:12px">' + list.map((it) => {
    const added = inCollection(it);
    const meta = [it.kind === 'film' ? 'Фильм' : 'Сериал', it.country === 'ru' ? 'Россия' : '', it.date ? longDate(it.date) : (it.when || ''), it.service || ''].filter(Boolean).join(' · ');
    const rate = it.rating ? `<span class="chip amber">★ ${esc(String(it.rating))}</span>` : '';
    return `<a class="card compact" href="#/d/${esc(it.id)}">${poster(it)}<div class="grow"><div class="ttl">${esc(it.title)}</div><div class="meta">${esc(meta)}</div><div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${rate}` +
      (added ? '<span class="chip gray">В списке</span>' : '') + `</div></div></a>`;
  }).join('') + '</div><div id="d_msg" class="meta" role="status"></div>';
  return html;
}
function viewDisc(id) {
  const it = DISC.items.find((x) => x.id === id);
  if (!it) return '<a class="back" href="#/discover">‹ Премьеры</a><p class="empty">Этой премьеры уже нет в подборке: список обновляется раз в неделю.</p>';
  const [ga] = palOf(it);
  const added = inCollection(it), has = !!lsGet('gh_token');
  const when = it.date ? longDate(it.date) : (it.when || 'Дата уточняется');
  let html = `<div class="shero${it.poster ? ' haspic' : ''}" style="--ga:${ga}"><a class="back" href="#/discover"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Премьеры</a>` + (it.poster ? `<img class="spic" src="${esc(it.poster)}" alt="">` : '') +
    `<div class="stitle">${esc(it.title)}</div><div class="cmeta">${it.rating ? `<span class="pill">★ ${esc(String(it.rating))}</span>` : ''}<span>${it.kind === 'film' ? 'Фильм' : 'Сериал'}${it.country === 'ru' ? ' · Россия' : ''}${it.service ? ' · ' + esc(it.service) : ''}</span></div><div class="chip amber" style="margin-top:10px">${esc(when)}</div></div>`;
  if (it.desc) html += `<p class="note">${esc(it.desc)}</p>`;
  if (it.note) html += `<p class="meta">${esc(it.note)}</p>`;
  html += added ? '<div class="chip gray" style="margin-top:12px">Уже в вашем списке</div>' : `<button type="button" class="btn wide" data-act="dadd" data-id="${esc(it.id)}">Хочу посмотреть</button>`;
  html += '<div id="d_msg" class="meta" role="status"></div>';
  if (!added && !has) html += '<p class="meta">Чтобы добавить, сохраните токен GitHub на странице «Добавить сериал».</p>';
  return html;
}
async function discoverAdd(id) {
  const it = DISC.items.find((x) => x.id === id); if (!it) return;
  const msg = document.getElementById('d_msg');
  if (!lsGet('gh_token')) { if (msg) msg.innerHTML = '<span class="warn">Нужен токен GitHub: «Добавить сериал» → токен.</span>'; return; }
  if (msg) msg.textContent = 'Сохраняю…';
  try {
    if (it.kind === 'film') {
      MOVIES = await ghEdit('movies.json', (d) => {
        if (d.items.some((x) => x.title.toLowerCase() === it.title.toLowerCase())) return;
        const m = { id: `${slugify(it.title)}-${Date.now().toString(36).slice(-4)}`, title: it.title, service: it.service || 'Твоё', status: 'want', added: todayStr() };
        if (it.date) m.date = it.date; if (it.note) m.note = it.note; d.items.push(m);
      }, `Фильмы: «${it.title}» из премьер`);
    } else {
      DATA = await ghEdit('series.json', (d) => {
        if (d.series.some((x) => x.title.toLowerCase() === it.title.toLowerCase())) return;
        const x = { id: slugify(it.title), title: it.title, service: it.service || null, status: it.date || it.when ? 'waiting' : 'nodate', mine: 'want', added: todayStr() };
        if (it.when || it.date) x.when = it.when || longDate(it.date); if (it.note) x.note = it.note; d.series.push(x);
      }, `Сериалы: «${it.title}» из премьер`);
    }
    render();
  } catch (err) { if (msg) msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; }
}

/* ---------- библиотека: всё, что посмотрел ---------- */
function libItems() {
  const a = DATA.series.filter((s) => effMine(s) === 'done').map((it) => ({ it, kind: 's', href: `#/s/${it.id}` }));
  const b = MOVIES.items.filter((m) => m.status === 'watched').map((it) => ({ it, kind: 'm', href: `#/m/${it.id}` }));
  return [...a, ...b];
}
function viewLib() {
  const all = libItems();
  const list = all.filter((x) => libfilter === 'all' || x.kind === libfilter)
    .sort((x, y) => ((y.it.rating || 0) - (x.it.rating || 0)) || x.it.title.localeCompare(y.it.title, 'ru'));
  const rated = list.filter((x) => x.it.rating);
  const avg = rated.length ? (rated.reduce((n, x) => n + x.it.rating, 0) / rated.length).toFixed(1) : null;
  let html = `<div class="hrow"><h1>Библиотека</h1><a class="addbtn" href="#/addlib">+ Добавить</a></div>` +
    `<p class="meta">${list.length ? `${list.length} ${plural(list.length, ['тайтл', 'тайтла', 'тайтлов'])}${avg ? ` · средняя оценка ★ ${avg}` : ''} · рейтинг Кинопоиска` : ''}</p>` +
    chipRow([['s', 'Сериалы'], ['m', 'Фильмы']], libfilter, 'data-libfilter');
  if (!list.length) return html + '<p class="empty">Пока пусто. Всё, что вы отметите «Посмотрел», появится здесь. Старое можно добавить кнопкой «+ Добавить».</p>';
  html += '<div class="mgrid">' + list.map((x) =>
    `<a class="pcard" href="${esc(x.href)}">${poster(x.it)}<div class="bds"><span class="bl">${x.it.rating ? '★ ' + esc(Number(x.it.rating).toFixed(1)) : '★ —'}</span></div></a>`).join('') + '</div>';
  return html;
}
function viewAddLib() {
  const has = !!lsGet('gh_token');
  return `<a class="back" href="#/lib"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Библиотека</a><h1>Что вы уже смотрели</h1>
<div class="panel"><form id="libform" autocomplete="off">
<label class="lbl" for="l_title">Название</label>
<input class="inp" id="l_title" required placeholder="Например: Во все тяжкие">
<label class="lbl" for="l_kind">Что это</label>
<select class="inp" id="l_kind"><option value="s">Сериал</option><option value="m">Фильм</option></select>
<button type="submit" class="btn" id="l_submit" ${has ? '' : 'disabled'}>Добавить в библиотеку</button>
<div id="l_msg" class="meta" role="status"></div>
${has ? '' : '<p class="meta">Нужен токен GitHub: «Настройки» → «Токен».</p>'}</form></div>`;
}
async function addLib(e) {
  e.preventDefault();
  const msg = document.getElementById('l_msg'); const btn = document.getElementById('l_submit');
  const title = document.getElementById('l_title').value.trim(); const kind = document.getElementById('l_kind').value;
  if (!title) return;
  btn.disabled = true; msg.textContent = 'Сохраняю…';
  try {
    if (kind === 's') {
      DATA = await ghEdit('series.json', (d) => {
        const x = d.series.find((y) => y.title.toLowerCase() === title.toLowerCase());
        if (x) { x.mine = 'done'; x.seen_season = x.season || 1; return; }
        d.series.push({ id: `${slugify(title)}-${Date.now().toString(36).slice(-4)}`, title, service: null, status: 'ended', mine: 'done', seen_season: 1, added: todayStr() });
      }, `Библиотека: «${title}»`);
    } else {
      MOVIES = await ghEdit('movies.json', (d) => {
        const x = d.items.find((y) => y.title.toLowerCase() === title.toLowerCase());
        if (x) { x.status = 'watched'; return; }
        d.items.push({ id: `${slugify(title)}-${Date.now().toString(36).slice(-4)}`, title, service: 'Твоё', status: 'watched', added: todayStr() });
      }, `Библиотека: «${title}»`);
    }
    msg.innerHTML = '<span class="ok">Добавлено.</span> Рейтинг и постер появятся после следующей публикации сайта.';
    document.getElementById('libform').reset();
  } catch (err) { msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; }
  btn.disabled = false;
}

/* ---------- настройки: подписки, уведомления, токен ---------- */
function tokenPanel() {
  const has = !!lsGet('gh_token');
  return `<div class="panel"><h2>Токен GitHub</h2><p>${has ? '<span class="ok">Токен сохранён на этом телефоне.</span>' : 'Нужен один раз: токен GitHub только для этого репозитория (Contents: Read and write). Без него нельзя добавлять и переносить сериалы и фильмы.'}</p>
<input class="inp" id="a_token" type="password" placeholder="${has ? 'Заменить токен' : 'Вставьте токен'}" autocomplete="off">
<button type="button" class="btn ghost" data-act="savetoken">Сохранить токен</button>
${has ? '<button type="button" class="btn ghost" data-act="deltoken">Удалить токен</button>' : ''}
<a class="meta" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="display:block;margin-top:8px">Создать токен на GitHub</a></div>`;
}
function viewSettings() {
  const body = stab === 'notify' ? viewNotify() : stab === 'token' ? tokenPanel() : viewSubs();
  return '<h1>Настройки</h1>' + chipRow([['subs', 'Подписки'], ['notify', 'Уведомления'], ['token', 'Токен']], stab, 'data-stab') + body.replace(/^<h1>.*?<\/h1>/, '');
}

/* ---------- роутер ---------- */
function render() {
  const h = location.hash === '#/posters' ? '#/list' : (location.hash || '#/week');
  const parts = h.replace(/^#\//, '').split('/');
  let page = parts[0] || 'week';
  let html;
  if (page === 'subs' || page === 'notify') { stab = page; page = 'settings'; }
  if (page === 'list') html = viewList('list');
  else if (page === 's') html = viewSeries(decodeURIComponent(parts[1] || ''));
  else if (page === 'settings') html = viewSettings();
  else if (page === 'lib') html = viewLib();
  else if (page === 'addlib') html = viewAddLib();
  else if (page === 'add') html = viewAdd();
  else if (page === 'discover') html = viewDiscover();
  else if (page === 'd') html = viewDisc(decodeURIComponent(parts[1] || ''));
  else if (page === 'movies') html = viewMovies();
  else if (page === 'm') html = viewMovie(decodeURIComponent(parts[1] || ''));
  else if (page === 'addm') html = viewAddMovie();
  else html = viewWeek();
  $app.innerHTML = html;
  const tab = page === 's' || page === 'add' ? 'list' : (page === 'm' || page === 'addm') ? 'movies' : page === 'd' ? 'discover' : page === 'addlib' ? 'lib' : page;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (page === 'settings' && stab === 'notify') refreshNotify();
  if (page === 'settings' && stab === 'subs') document.getElementById('subform').addEventListener('submit', addSub);
  if (page === 'addlib') document.getElementById('libform').addEventListener('submit', addLib);
  if (page === 'addm') document.getElementById('mform').addEventListener('submit', addMovie);
  if (page === 'add') document.getElementById('addform').addEventListener('submit', addSeries);
}

document.addEventListener('click', (ev) => {
  const mf = ev.target.closest('[data-mfilter]');
  if (mf) { mfilter = mfilter === mf.dataset.mfilter ? 'all' : mf.dataset.mfilter; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const sf = ev.target.closest('[data-sfilter]');
  if (sf) { sfilter = sfilter === sf.dataset.sfilter ? 'all' : sf.dataset.sfilter; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const msf = ev.target.closest('[data-msfilter]');
  if (msf) { msfilter = msfilter === msf.dataset.msfilter ? 'all' : msf.dataset.msfilter; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const lf = ev.target.closest('[data-libfilter]');
  if (lf) { libfilter = libfilter === lf.dataset.libfilter ? 'all' : lf.dataset.libfilter; render(); return; }
  const st = ev.target.closest('[data-stab]');
  if (st) { stab = st.dataset.stab; render(); return; }
  const df = ev.target.closest('[data-dfilter]');
  if (df) { dfilter = df.dataset.dfilter; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const f = ev.target.closest('[data-filter]');
  if (f) { filter = filter === f.dataset.filter ? 'all' : f.dataset.filter; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const a = ev.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'enable') enablePush();
  if (a.dataset.act === 'test') testPush();
  if (a.dataset.act === 'copy') copyCode();
  if (a.dataset.act === 'savetoken') { const v = document.getElementById('a_token').value.trim(); if (v) { lsSet('gh_token', v); render(); } }
  if (a.dataset.act === 'mset' || a.dataset.act === 'mdel') movieAct(a.dataset.act, a.dataset.id, a.dataset.val);
  if (a.dataset.act === 'delsub') delSub(a.dataset.id);
  if (a.dataset.act === 'dadd') discoverAdd(a.dataset.id);
  if (a.dataset.act === 'setmine') setMine(a.dataset.id, a.dataset.val);
  if (a.dataset.act === 'deltoken') { lsSet('gh_token', ''); render(); }
});
window.addEventListener('hashchange', render);

async function boot() {
  try {
    const [d, c] = await Promise.all([
      fetch('data/series.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('data/config.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]);
    DATA = d; CONFIG = c;
    try { SUBS = await fetch('data/subscriptions.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
    try { DISC = await fetch('data/discover.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
    try { MOVIES = await fetch('data/movies.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
  } catch (err) {
    $app.innerHTML = '<h1>Сериалы</h1><p class="empty">Не удалось загрузить данные. Проверьте интернет и откройте приложение ещё раз.</p>';
    return;
  }
  render();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
