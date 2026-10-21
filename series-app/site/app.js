'use strict';

const $app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const MSK = 'Europe/Moscow';
const PAL = [
  ['#6C4DFF', '#1B0F55'], ['#FFA94D', '#8C2F00'], ['#FF6AA2', '#6A0F3A'], ['#2FBF71', '#0B3D26'],
  ['#36D1DC', '#0B4F6C'], ['#E8590C', '#4A1500'], ['#4C8DFF', '#0D2A63'], ['#C77DFF', '#3A0F66'],
];
const GROUPS = [
  ['airing', 'Выходят сейчас'],
  ['waiting', 'Ждём новый сезон'],
  ['nodate', 'Дата не объявлена'],
  ['ended', 'Завершены'],
];
const FILTERS = [['all', 'Все'], ['airing', 'Выходят'], ['waiting', 'Ждём'], ['nodate', 'Нет даты'], ['ended', 'Завершены']];
const CHEV = '<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

let DATA = { updated: '', series: [] };
let CONFIG = {};
let SUBS = { updated: '', items: [] };
let MOVIES = { updated: '', items: [] };
let mfilter = 'all';
let confirmDel = '';
let filter = 'all';

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
  const inner = s.poster ? `<img src="${esc(s.poster)}" alt="">` : `<span class="ptitle">${esc(s.title)}</span>`;
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
  const h = airing[0];
  if (h) {
    const n = nextEp(h, today);
    const [a] = palOf(h);
    const when = n.date === today ? 'сегодня' : n.date === addDays(today, 1) ? 'завтра' : longDate(n.date);
    html += `<a class="chero" href="#/s/${esc(h.id)}" style="--ga:${a}"><div class="ctitle">${esc(h.title)}</div>` +
      `<div class="cmeta"><span class="pill">${n.n}${h.total ? ' / ' + h.total : ''}</span><span>${esc(h.service || '')}</span><span>${when}</span></div>` +
      `<p class="cdesc">${esc(h.note || `${cap(unit(h))} ${n.n} выходит ${when}.`)}</p></a>`;
  }
  if (airing.length) html += `<h2 class="hd">Выходят сейчас</h2><div class="hrow2">${airing.map((s) => pcard(s, today)).join('')}</div>`;
  const wait = DATA.series.filter((s) => s.status === 'waiting');
  if (wait.length) html += `<h2 class="hd">Ждём новые сезоны</h2><div class="hrow2">${wait.map((s) => pcard(s, today)).join('')}</div>`;

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
function viewList(mode) {
  const today = todayStr();
  let html = `<div class="hrow"><h1>Сериалы</h1><a class="addbtn" href="#/add" aria-label="Добавить сериал">+ Добавить</a></div><div class="chips">` +
    FILTERS.map(([k, l]) => `<button type="button" class="fbtn ${filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('') + '</div>';
  GROUPS.forEach(([key, label]) => {
    if (filter !== 'all' && filter !== key) return;
    let list = DATA.series.filter((s) => s.status === key);
    if (!list.length) return;
    if (key === 'airing') {
      list = list.slice().sort((a, b) => {
        const na = nextEp(a, today), nb = nextEp(b, today);
        return (na ? na.date : '9999') < (nb ? nb.date : '9999') ? -1 : 1;
      });
    }
    html += `<div class="group">${label}</div>`;
    if (mode === 'posters') {
      html += '<div class="grid">' + list.map((s) => {
        const [c, t] = chipFor(s, today);
        return `<a class="pcell" href="#/s/${esc(s.id)}"><div style="position:relative">${poster(s)}<div class="chip ${c}" style="position:absolute;left:10px;top:10px;padding:5px 9px;background:rgba(15,17,21,.78)">${esc(t)}</div></div>` +
          `<div class="meta" style="margin:0">${esc(metaFor(s, today))}</div></a>`;
      }).join('') + '</div>';
    } else {
      html += '<div class="stack tight">' + list.map((s) => {
        const [c, t] = chipFor(s, today);
        return `<a class="card compact" href="#/s/${esc(s.id)}">${poster(s)}<div class="grow"><div class="ttl">${esc(s.title)}</div><div class="meta">${esc(metaFor(s, today))}</div></div><div class="chip ${c}">${esc(t)}</div></a>`;
      }).join('') + '</div>';
    }
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
  const statusText = { airing: 'Выходит сейчас', waiting: 'Ждём: ' + (s.when || ''), nodate: 'Дата не объявлена', ended: 'Завершён' }[s.status];
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
      const item = { id, title, service: document.getElementById('a_service').value, status: 'nodate', added: todayStr() };
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
const MFILTERS = [['all', 'Все'], ['want', 'Хочу посмотреть'], ['soon', 'Скоро'], ['watched', 'Просмотрено']];
function movieBadge(m, today) {
  if (m.status === 'watched') return 'Просмотрено';
  if (m.date) {
    if (m.date === today) return 'Сегодня';
    if (m.date === addDays(today, 1)) return 'Завтра';
    if (m.date > today) return shortDate(m.date);
  }
  return 'В планах';
}
function viewMovies() {
  const today = todayStr();
  let list = MOVIES.items.slice().reverse();
  if (mfilter === 'want') list = list.filter((m) => m.status !== 'watched');
  if (mfilter === 'soon') list = list.filter((m) => m.status !== 'watched' && m.date && m.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (mfilter === 'watched') list = list.filter((m) => m.status === 'watched');
  let html = `<div class="hrow"><h1>Фильмы</h1><a class="addbtn" href="#/addm">+ Добавить</a></div><div class="chips">` +
    MFILTERS.map(([k, l]) => `<button type="button" class="fbtn ${mfilter === k ? 'on' : ''}" data-mfilter="${k}">${l}</button>`).join('') + '</div>';
  if (!list.length) return html + '<p class="empty">Здесь пока пусто. Нажмите «+ Добавить» и вставьте название фильма.</p>';
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
  const chip = watched ? ['gray', 'Просмотрено'] : (m.date && m.date >= today) ? ['amber', 'Выходит ' + longDate(m.date)] : ['blue', 'Хочу посмотреть'];
  const w = watchLink(m);
  let html = `<div class="shero${m.poster ? ' haspic' : ''}" style="--ga:${ga}"><a class="back" href="#/movies"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Фильмы</a>` +
    (m.poster ? `<img class="spic" src="${esc(m.poster)}" alt="">` : '') +
    `<div class="stitle">${esc(m.title)}</div><div class="cmeta"><span>${esc(m.service || 'Твоё')}</span></div><div class="chip ${chip[0]}" style="margin-top:10px">${esc(chip[1])}</div></div>`;
  if (m.note) html += `<p class="note">${esc(m.note)}</p>`;
  html += `<a class="btn watch" href="${esc(w.url)}" target="_blank" rel="noopener">Смотреть в ${esc(w.name)}</a>${w.direct ? '' : '<span class="meta"> откроется главная или поиск сервиса</span>'}`;
  if (has) {
    html += `<button type="button" class="btn ghost wide" data-act="mwatched" data-id="${esc(m.id)}">${watched ? 'Вернуть в список' : 'Отметить просмотренным'}</button>` +
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
async function movieAct(act, id) {
  if (act === 'mdel' && confirmDel !== id) { confirmDel = id; render(); return; }
  const msg = document.getElementById('m_msg'); if (msg) msg.textContent = 'Сохраняю…';
  try {
    if (act === 'mwatched') {
      MOVIES = await ghEdit('movies.json', (d) => { const m = d.items.find((x) => x.id === id); if (m) m.status = m.status === 'watched' ? 'want' : 'watched'; }, 'Фильмы: отметка просмотра');
      render();
    } else {
      MOVIES = await ghEdit('movies.json', (d) => { d.items = d.items.filter((x) => x.id !== id); }, 'Фильмы: удалить');
      confirmDel = ''; location.hash = '#/movies';
    }
  } catch (err) { if (msg) msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; }
}

/* ---------- роутер ---------- */
function render() {
  const h = location.hash === '#/posters' ? '#/list' : (location.hash || '#/week');
  const parts = h.replace(/^#\//, '').split('/');
  const page = parts[0] || 'week';
  let html;
  if (page === 'list') html = viewList('list');
  else if (page === 's') html = viewSeries(decodeURIComponent(parts[1] || ''));
  else if (page === 'notify') html = viewNotify();
  else if (page === 'add') html = viewAdd();
  else if (page === 'subs') html = viewSubs();
  else if (page === 'movies') html = viewMovies();
  else if (page === 'm') html = viewMovie(decodeURIComponent(parts[1] || ''));
  else if (page === 'addm') html = viewAddMovie();
  else html = viewWeek();
  $app.innerHTML = html;
  const tab = page === 's' || page === 'add' ? 'list' : (page === 'm' || page === 'addm') ? 'movies' : page;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (page === 'notify') refreshNotify();
  if (page === 'addm') document.getElementById('mform').addEventListener('submit', addMovie);
  if (page === 'subs') document.getElementById('subform').addEventListener('submit', addSub);
  if (page === 'add') document.getElementById('addform').addEventListener('submit', addSeries);
}

document.addEventListener('click', (ev) => {
  const mf = ev.target.closest('[data-mfilter]');
  if (mf) { mfilter = mf.dataset.mfilter; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const f = ev.target.closest('[data-filter]');
  if (f) { filter = f.dataset.filter; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const a = ev.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'enable') enablePush();
  if (a.dataset.act === 'test') testPush();
  if (a.dataset.act === 'copy') copyCode();
  if (a.dataset.act === 'savetoken') { const v = document.getElementById('a_token').value.trim(); if (v) { lsSet('gh_token', v); render(); } }
  if (a.dataset.act === 'mwatched' || a.dataset.act === 'mdel') movieAct(a.dataset.act, a.dataset.id);
  if (a.dataset.act === 'delsub') delSub(a.dataset.id);
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
    try { MOVIES = await fetch('data/movies.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
  } catch (err) {
    $app.innerHTML = '<h1>Сериалы</h1><p class="empty">Не удалось загрузить данные. Проверьте интернет и откройте приложение ещё раз.</p>';
    return;
  }
  render();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
