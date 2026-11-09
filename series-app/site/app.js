'use strict';

const $app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const MSK = 'Europe/Moscow';
const PAL = [
  ['#6C4DFF', '#1B0F55'], ['#FFA94D', '#8C2F00'], ['#FF6AA2', '#6A0F3A'], ['#2FBF71', '#0B3D26'],
  ['#36D1DC', '#0B4F6C'], ['#E8590C', '#4A1500'], ['#4C8DFF', '#0D2A63'], ['#C77DFF', '#3A0F66'],
];

let DISC = { updated: '', items: [] };
let POOL = { updated: '', items: [] };
let rnd = null;
let dfilter = 'all';
let DATA = { updated: '', series: [] };
let CONFIG = {};
let SUBS = { updated: '', items: [] };
let MOVIES = { updated: '', items: [] };
let stab = 'subs';

/* ---------- даты ---------- */
function todayStr() {
  const t = params.get('today');
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return new Intl.DateTimeFormat('en-CA', { timeZone: MSK }).format(new Date());
}
const d0 = (s) => new Date(s + 'T00:00:00Z');
function addDays(s, n) { const x = d0(s); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
const fmt = (s, o) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', ...o }).format(d0(s));
const shortDate = (s) => fmt(s, { day: 'numeric', month: 'short' }).replace('.', '');
const longDate = (s) => fmt(s, { day: 'numeric', month: 'long' });

/* ---------- утилиты ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function hash(str) { let h = 0; for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; }
const byAirDate = (a, b) => (a.date + 'T' + (a.time || '00:00')).localeCompare(b.date + 'T' + (b.time || '00:00'));
let sq = '';
const hit = (t) => !sq || (t || '').toLowerCase().includes(sq.toLowerCase().trim());
const chipRow = (arr, cur, attr) => '<div class="chips">' + arr.filter(([k]) => k !== 'all').map(([k, l]) => `<button type="button" class="fbtn ${cur === k ? 'on' : ''}" ${attr}="${k}">${l}</button>`).join('') + '</div>';


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
<p class="meta">Сериал появится в «Моё». Даты уточняются автоматически.</p>${has ? '' : '<p class="meta">Для добавления настрой токен в <a href="#/settings" style="color:var(--accent)">настройках</a>.</p>'}</div>`;
}

function slugify(t) {
  const m = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  return t.toLowerCase().split('').map((c) => (m[c] !== undefined ? m[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'series';
}
// по частям: String.fromCharCode(...bytes) на большом файле упирается в лимит аргументов (в Safari около 65 тысяч)
const u8ToB64 = (s) => {
  const b = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64ToStr = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

async function addSeries(e) {
  e.preventDefault();
  const msg = document.getElementById('a_msg');
  const btn = document.getElementById('a_submit');
  const title = document.getElementById('a_title').value.trim();
  if (!title || !lsGet('gh_token')) return;
  const service = document.getElementById('a_service').value, note = document.getElementById('a_note').value.trim();
  btn.disabled = true; msg.textContent = 'Сохраняю…';
  try {
    DATA = await ghEdit('series.json', (d) => {
      if (d.series.some((s) => s.title.toLowerCase() === title.toLowerCase())) throw new Error('Такой сериал уже есть в списке.');
      let id = slugify(title); let n = 2; const base = id;
      while (d.series.some((s) => s.id === id)) id = `${base}-${n++}`;
      const item = { id, title, service, status: 'nodate', added: todayStr() };
      if (note) item.note = note;
      d.series.push(item);
    }, `Сериалы: добавить «${title}»`);
    msg.innerHTML = '<span class="ok">Добавлено.</span> В списке появится через минуту после обновления сайта.';
    document.getElementById('addform').reset();
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
${has ? '' : '<p class="meta">Чтобы сохранять, добавьте токен GitHub на <a href="#/settings" style="color:var(--accent)">настройках</a>.</p>'}</div>`;
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
    lsSet('gh_last_edit', String(Date.now()));
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


/* ---------- карточка фильма: только дата релиза ---------- */
function viewMovie(id){
  const m=MOVIES.items.find(x=>x.id===id);
  if(!m)return '<a class="back" href="#/mine/movies">‹ Фильмы</a><p class="empty">Фильм не найден.</p>';
  const info=gfInfo(m,'m');
  return '<div class="gf-detail"><a class="back" href="#/mine/movies">‹ Фильмы</a><div class="gf-detail-head">'+
    (m.poster?'<img class="gf-detail-poster" src="'+esc(m.poster)+'" alt="">':'<div class="gf-detail-poster gf-detail-placeholder">'+esc(m.title)+'</div>')+
    '<div class="gf-detail-text"><div class="gf-eyebrow">GRACH FILMS · ФИЛЬМ</div><h1>'+esc(m.title)+'</h1>'+
    '<p class="gf-detail-meta">'+esc(m.service||'Моя коллекция')+'</p><div class="gf-detail-state">'+gfDecor(info)+'</div></div></div>'+
    (m.note?'<p class="gf-detail-note">'+esc(m.note)+'</p>':'')+jfWatch(m.title)+
    gfWatchingButton(m,'m',info)+
    (gfArchived(m,'m',info)?'<p class="gf-archived-info">Убран с главной на этом устройстве</p>':'')+
    gfArchiveButton(m,'m',info)+
    '<div class="gf-detail-foot">Дата кинопремьеры не подтверждает онлайн-доступность.</div></div>';
}
function viewAddMovie() {
  const has = !!lsGet('gh_token');
  return `<a class="back" href="#/mine/movies"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Фильмы</a><h1>Добавить фильм</h1>
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
      const it = { id: `${slugify(title)}-${Date.now().toString(36).slice(-4)}`, title, service: document.getElementById('m_service').value, added: todayStr() };
      const date = document.getElementById('m_date').value; if (date) it.date = date;
      const note = document.getElementById('m_note').value.trim(); if (note) it.note = note;
      d.items.push(it);
    }, `Фильмы: добавить «${title}»`);
    msg.innerHTML = '<span class="ok">Добавлено.</span> Постер появится после следующей публикации сайта.';
    document.getElementById('mform').reset();
  } catch (err) { msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; }
  btn.disabled = false;
}
/* ---------- премьеры: подборка раз в неделю ---------- */
const DFILTERS = [['all', 'Все'], ['series', 'Сериалы'], ['film', 'Фильмы']];
const inCollection = (it) => { const t = it.title.toLowerCase(); return DATA.series.some((x) => x.title.toLowerCase() === t) || MOVIES.items.some((x) => x.title.toLowerCase() === t); };
function viewDiscover() {
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
const DICE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="8.5" r=".9" fill="currentColor"/><circle cx="12" cy="12" r=".9" fill="currentColor"/><circle cx="8.5" cy="15.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="15.5" r=".9" fill="currentColor"/></svg>';
/* ---------- случайный выбор: «нечего смотреть», бесконечная лента из TMDB ---------- */
// Ключ TMDB (только чтение) хранится на телефоне, в код и репозиторий не попадает.
const tmdbKey = () => lsGet('tmdb_key');
const TG = { 28: 'боевик', 12: 'приключения', 16: 'мультфильм', 35: 'комедия', 80: 'криминал', 18: 'драма', 10751: 'семейный', 14: 'фэнтези', 36: 'история', 27: 'ужасы', 10402: 'музыка', 9648: 'детектив', 10749: 'мелодрама', 878: 'фантастика', 53: 'триллер', 10752: 'военный', 37: 'вестерн', 10759: 'боевик и приключения', 10765: 'фантастика и фэнтези', 10768: 'война и политика' };
let rndBuf = [], rndBusy = null, rndLoading = false, rndAttempted = false, rndMax = {}, rndKind = 0, rndErr = '';
const rndCache = new Map();
let rndSeen = new Set(); try { rndSeen = new Set(JSON.parse(lsGet('rnd_seen') || '[]')); } catch (e) {}
const rndMark = (id) => { rndSeen.add(id); lsSet('rnd_seen', JSON.stringify([...rndSeen].slice(-400))); };
const rndOk = (it) => it && !rndSeen.has(it.id) && !inCollection(it);
async function tmdbBatch(kind) {
  const tv = kind === 'series', t = tv ? 'tv' : 'movie';
  const max = rndMax[t] || 1;
  const page = 1 + Math.floor(Math.random() * Math.min(max, 40));
  const url = `https://api.themoviedb.org/3/discover/${t}?api_key=${encodeURIComponent(tmdbKey())}&language=ru-RU&sort_by=popularity.desc&vote_average.gte=${tv ? 7.6 : 7.4}&vote_count.gte=${tv ? 800 : 2000}&without_genres=99,10764,10767,10763,10766,10762&page=${page}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('TMDB ' + r.status);
  const j = await r.json();
  rndMax[t] = j.total_pages || 1;
  return (j.results || []).filter((x) => x.poster_path && x.overview && x.overview.length > 30).map((x) => {
    const title = tv ? x.name : x.title, y = (tv ? x.first_air_date : x.release_date) || '';
    return { id: `t-${t}-${x.id}`, title, kind: tv ? 'series' : 'film', year: y.slice(0, 4), genre: (x.genre_ids || []).map((g) => TG[g]).filter(Boolean).slice(0, 3).join(', '), rating: Math.round(x.vote_average * 10) / 10, desc: x.overview, poster: `https://image.tmdb.org/t/p/w500${x.poster_path}` };
  }).sort(() => Math.random() - 0.5);
}
async function rndFill() {
  if (!tmdbKey()) return;
  if (rndBusy) return rndBusy;
  rndBusy = (async () => {
    for (let n = 0; n < 4 && rndBuf.filter(rndOk).length < 4; n++) {
      try { const items = await tmdbBatch(rndKind++ % 2 ? 'series' : 'film'); rndErr = ''; items.forEach((x) => { if (rndOk(x) && !rndBuf.some((b) => b.id === x.id)) rndBuf.push(x); }); } catch (e) { rndErr = String(e.message || e); break; }
    }
  })().finally(() => { rndBusy = null; });
  return rndBusy;
}
function rndFromPool() {
  const list = POOL.items.filter((x) => rndOk(x) && (!rnd || x.id !== rnd.id));
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}
async function rndNext() {
  rndAttempted = true;
  if (rnd) rndMark(rnd.id);
  rndBuf = rndBuf.filter(rndOk);
  if (!rndBuf.length && tmdbKey()) { rndLoading = true; render(); await rndFill(); rndLoading = false; rndBuf = rndBuf.filter(rndOk); }
  rnd = rndBuf.shift() || rndFromPool();
  if (rnd) { rndCache.set(rnd.id, rnd); if (rnd.poster) { const im = new Image(); im.src = rnd.poster; } }
  if (location.hash === '#/random') { render(); window.scrollTo(0, 0); }
  if (rndBuf.length < 3) rndFill();
}
function viewRandom() {
  const back = '<a class="back" href="#/week"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Главная</a>';
  if (!rnd && !rndLoading && !rndAttempted) { rndAttempted = true; setTimeout(rndNext, 0); return `${back}<p class="empty">Подбираю…</p>`; }
  if (rndLoading) return `${back}<p class="empty">Подбираю…</p>`;
  if (!rnd) return `${back}<p class="empty">Пока нет новых вариантов. ${rndErr ? esc('TMDB: ' + rndErr) : 'Вся доступная подборка уже показана.'}</p><button type="button" class="btn wide ghost" data-act="rreset">Начать подбор заново</button>${!tmdbKey() ? '<div class="panel"><h2>Расширить подборку</h2><p>Можно подключить TMDB, указав API Key. Ключ хранится только на этом устройстве.</p><input id="r_key" class="inp" placeholder="Ключ TMDB" autocomplete="off" autocapitalize="off"><button type="button" class="btn wide" data-act="savetmdb">Подключить</button></div>' : ''}`;
  const it = rnd, [ga, gb] = palOf(it), added = inCollection(it), has = !!lsGet('gh_token');
  const I = {
    plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const ab = (act, ico, label, cls) => `<button type="button" class="ab ${cls || ''}" data-act="${act}" data-id="${esc(it.id)}"${added && act !== 'rnext' ? ' disabled' : ''}><i><svg width="${cls === 'main' ? 28 : 24}" height="${cls === 'main' ? 28 : 24}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[ico]}</svg></i><span>${label}</span></button>`;
  const pic = it.poster ? `<img class="spic big" src="${esc(it.poster)}" alt="">` : `<div class="spic big nopic" style="background:linear-gradient(160deg,${ga},${gb})"></div>`;
  let html = `<div class="shero haspic" style="--ga:${ga}">${back}<div class="stage">${pic}<div class="side">` +
    ab('dadd', 'plus', added ? 'Добавлено' : 'Добавить', added ? 'dim' : '') + `</div></div>` +
    `<div class="stitle">${esc(it.title)}</div><div class="cmeta">${it.rating ? `<span class="pill">★ ${esc(Number(it.rating).toFixed(1))}</span>` : ''}<span>${it.kind === 'film' ? 'Фильм' : 'Сериал'}${it.year ? ' · ' + esc(String(it.year)) : ''}${it.genre ? ' · ' + esc(it.genre) : ''}</span></div></div>`;
  html += '<p class="swhint">← листайте влево или вправо: следующий →</p>';
  if (it.desc) html += `<p class="note">${esc(it.desc)}</p>`;
  html += '<div id="d_msg" class="meta" role="status"></div>';
  if (!added && !has) html += '<p class="meta">Чтобы добавить, сохраните токен GitHub в настройках.</p>';
  if (!tmdbKey()) html += `<div class="panel"><h2>Бесконечная лента</h2><p>Сейчас выпадают тайтлы из готовой подборки. Чтобы лента не заканчивалась, вставьте ключ TMDB (API Key). Он хранится только на этом телефоне.</p><input id="r_key" class="inp" placeholder="Ключ TMDB" autocomplete="off" autocapitalize="off"><button type="button" class="btn wide" data-act="savetmdb">Включить</button></div>`;
  else html += `<p class="foot">Данные и постеры: TMDB.${rndErr ? ' Сейчас TMDB не отвечает, показываю готовую подборку.' : ''} <a href="#/random" data-act="deltmdb" style="text-decoration:underline">Убрать ключ</a></p>`;
  return html;
}
function viewDisc(id) {
  const it = DISC.items.find((x) => x.id === id);
  if (!it) return '<a class="back" href="#/week">‹ Главная</a><p class="empty">Этой премьеры уже нет в подборке: список обновляется раз в неделю.</p>';
  const [ga] = palOf(it);
  const added = inCollection(it), has = !!lsGet('gh_token');
  const when = it.date ? longDate(it.date) : (it.rec ? 'Уже вышло' : (it.when || 'Дата уточняется'));
  let html = `<div class="shero${it.poster ? ' haspic' : ''}" style="--ga:${ga}"><a class="back" href="#/week"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Главная</a>` + (it.poster ? `<img class="spic" src="${esc(it.poster)}" alt="">` : '') +
    `<div class="stitle">${esc(it.title)}</div><div class="cmeta">${it.rating ? `<span class="pill">★ ${esc(String(it.rating))}</span>` : ''}<span>${it.kind === 'film' ? 'Фильм' : 'Сериал'}${it.country === 'ru' ? ' · Россия' : ''}${it.service ? ' · ' + esc(it.service) : ''}</span></div><div class="chip amber" style="margin-top:10px">${esc(when)}</div></div>`;
  if (it.desc) html += `<p class="note">${esc(it.desc)}</p>`;
  if (it.because) html += `<p class="meta">Почему рекомендую: ${esc(it.because)}</p>`;
  if (it.note) html += `<p class="meta">${esc(it.note)}</p>`;
  html += added ? '<div class="chip gray" style="margin-top:12px">Уже в коллекции</div>' : `<button type="button" class="btn wide" data-act="dadd" data-id="${esc(it.id)}">Добавить в коллекцию</button>`;
  html += '<div id="d_msg" class="meta" role="status"></div>';
  if (!added && !has) html += '<p class="meta">Чтобы добавить, сохраните токен GitHub на странице «Добавить сериал».</p>';
  return html;
}
async function discoverAdd(id) {
  const it = DISC.items.find((x) => x.id === id) || POOL.items.find((x) => x.id === id) || rndCache.get(id); if (!it) return;
  const msg = document.getElementById('d_msg');
  if (!lsGet('gh_token')) { if (msg) msg.innerHTML = '<span class="warn">Нужен токен GitHub: Настройки → Токен.</span>'; return; }
  if (msg) msg.textContent = 'Сохраняю…';
  try {
    if (it.kind === 'film') {
      MOVIES = await ghEdit('movies.json', (d) => {
        if (d.items.some((x) => x.title.toLowerCase() === it.title.toLowerCase())) return;
        const m = { id: `${slugify(it.title)}-${Date.now().toString(36).slice(-4)}`, title: it.title, service: it.service || 'Твоё', added: todayStr() };
        if (it.date) m.date = it.date; if (it.note) m.note = it.note;
        d.items.push(m);
      }, `Фильмы: добавить «${it.title}»`);
    } else {
      DATA = await ghEdit('series.json', (d) => {
        if (d.series.some((x) => x.title.toLowerCase() === it.title.toLowerCase())) return;
        const x = { id: slugify(it.title), title: it.title, service: it.service || null, status: it.date || it.when ? 'waiting' : 'nodate', added: todayStr() };
        if (it.date) x.date = it.date; if (it.when || it.date) x.when = it.when || longDate(it.date); if (it.note) x.note = it.note;
        d.series.push(x);
      }, `Сериалы: добавить «${it.title}»`);
    }
    render();
  } catch (err) { if (msg) msg.innerHTML = `<span class="warn">${esc(err.message || err)}</span>`; }
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
/* ---------- Jellyfin: кнопка «Смотреть на моём сервере» ---------- */
function jfBase() { return lsGet('jf_url').replace(/\/+$/, ''); }
function jfWatch(title) {
  const b = jfBase();
  if (!title) return '';
  if (!b) return '<a class="btn watch" href="#/jf">Смотреть</a><span class="meta"> сначала укажите адрес сервера</span>';
  return `<a class="btn watch" href="${esc(b + '/web/#/search?query=' + encodeURIComponent(title))}" target="_blank" rel="noopener">Смотреть</a>`;
}
/* ---------- вкладка «Сервер»: что лежит на моём Jellyfin ---------- */
let jfItems = null, jfLoading = false, jfErr = '', jfkind = 'all';
function jfDevId() { let d = lsGet('jf_dev'); if (!d) { d = 'gf-' + Math.random().toString(36).slice(2, 12); lsSet('jf_dev', d); } return d; }
function jfAuth(tok) { return 'MediaBrowser Client="Grach films", Device="Web", DeviceId="' + jfDevId() + '", Version="1.0"' + (tok ? ', Token="' + tok + '"' : ''); }
function jfNetErr(e) { return /Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message || e)) ? 'Не удалось связаться с сервером. Проверьте, что ноутбук включён и адрес в «Настройки → Jellyfin» верный.' : String(e && e.message || e); }
async function jfLogin(user, pw) {
  const b = jfBase();
  const r = await fetch(b + '/Users/AuthenticateByName', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: jfAuth() }, body: JSON.stringify({ Username: user, Pw: pw }) });
  if (r.status === 401 || r.status === 400) throw new Error('Неверный логин или пароль.');
  if (!r.ok) throw new Error('Сервер ответил ошибкой ' + r.status + '.');
  const d = await r.json();
  lsSet('jf_token', d.AccessToken); lsSet('jf_uid', d.User && d.User.Id);
}
async function jfLoad() {
  const b = jfBase(), tok = lsGet('jf_token'), uid = lsGet('jf_uid');
  if (!b || !tok || !uid || jfLoading) return;
  jfLoading = true; jfErr = '';
  try {
    const r = await fetch(`${b}/Items?userId=${encodeURIComponent(uid)}&Recursive=true&IncludeItemTypes=Movie,Series&SortBy=SortName&SortOrder=Ascending&Fields=ProductionYear&EnableTotalRecordCount=false`, { headers: { Authorization: jfAuth(tok) } });
    if (r.status === 401) { lsSet('jf_token', ''); lsSet('jf_uid', ''); jfItems = null; jfErr = 'Нужно войти заново.'; }
    else if (!r.ok) throw new Error('Сервер ответил ошибкой ' + r.status + '.');
    else jfItems = (await r.json()).Items || [];
  } catch (e) { jfErr = jfNetErr(e); jfItems = null; }
  jfLoading = false;
  if (location.hash.startsWith('#/mine')) render();
}
function viewJfServer() {
  const b = jfBase();
  if (!b) return '<div class="panel"><p>Сначала укажите адрес сервера: <a href="#/jf">Настройки → Jellyfin</a>.</p></div>';
  const warn = jfErr ? `<p class="meta"><span class="warn">${esc(jfErr)}</span></p>` : '';
  if (!lsGet('jf_token')) {
    return `<div class="panel"><h2>Вход на сервер</h2>${warn}<form data-jfform autocomplete="off">
<input class="inp" id="jf_user" placeholder="Логин" autocapitalize="none" autocomplete="username">
<input class="inp" id="jf_pass" type="password" placeholder="Пароль" autocomplete="current-password">
<button type="submit" class="btn">Войти</button></form>
<p class="meta">Пароль не сохраняется, на устройстве остаётся только ключ доступа.</p></div>`;
  }
  if (jfItems === null) { if (!jfLoading && !jfErr) setTimeout(jfLoad, 0); return warn + (jfErr ? '<button type="button" class="btn ghost" data-act="jfrefresh">Повторить</button>' : '<p class="empty">Загружаю список с сервера…</p>'); }
  const list = jfItems.filter((x) => hit(x.Name) && (jfkind === 'all' || x.Type === jfkind));
  let html = `<p class="meta">${jfItems.length} ${plural(jfItems.length, ['тайтл', 'тайтла', 'тайтлов'])} на сервере · <a href="#" data-act="jfrefresh">обновить</a> · <a href="#" data-act="jflogout">выйти</a></p>`;
  if (!jfItems.length) return html + '<p class="empty">На сервере пока пусто. Когда добавите фильмы в библиотеку Jellyfin, они появятся здесь.</p>';
  if (!list.length) return html + '<p class="empty">Ничего не найдено.</p>';
  html += '<div class="mgrid">' + list.map((x) => {
    const img = x.ImageTags && x.ImageTags.Primary ? `${b}/Items/${x.Id}/Images/Primary?maxWidth=400&quality=85&tag=${encodeURIComponent(x.ImageTags.Primary)}` : '';
    const tag = (x.Type === 'Series' ? 'Сериал' : 'Фильм') + (x.ProductionYear ? ' · ' + x.ProductionYear : '');
    return `<a class="pcard" href="${esc(b + '/web/#/details?id=' + x.Id)}" target="_blank" rel="noopener">${poster({ title: x.Name, poster: img })}<div class="bds"><span class="bl">${esc(tag)}</span></div></a>`;
  }).join('') + '</div>';
  return html;
}
function jellyfinPanel() {
  const cur = jfBase();
  return `<div class="panel"><h2>Мой сервер Jellyfin</h2><p>${cur ? '<span class="ok">Адрес сохранён на этом устройстве.</span>' : 'Адрес вашего Jellyfin, например http://100.x.y.z:8096. Хранится только на этом устройстве, на GitHub не попадает.'}</p>
<input class="inp" id="a_jf" type="url" inputmode="url" placeholder="http://100.x.y.z:8096" value="${esc(cur)}" autocomplete="off">
<button type="button" class="btn ghost" data-act="savejf">Сохранить адрес</button>
${cur ? '<button type="button" class="btn ghost" data-act="deljf">Удалить адрес</button>' : ''}
<p class="meta">Кнопка откроет поиск по названию на вашем сервере. Для доступа вне дома нужен включённый Tailscale.</p></div>`;
}
function viewSettings() {
  const body = stab === 'notify' ? viewNotify() : stab === 'token' ? tokenPanel() : stab === 'jf' ? jellyfinPanel() : viewSubs();
  return '<a class="back" href="#/week">‹ Главная</a><h1>Настройки</h1>' + chipRow([['subs', 'Подписки'], ['notify', 'Уведомления'], ['jf', 'Jellyfin'], ['token', 'Токен']], stab, 'data-stab') + body.replace(/^<h1>.*?<\/h1>/, '');
}

/* ---------- роутер ---------- */
let lastPage = '', typing = false;
let lastMineSection = '';
function render() {
  const h = location.hash || '#/week';
  const parts = h.replace(/^#\//, '').split('/');
  let page = parts[0] || 'week';
  // Legacy calendar links always return to the main screen.
  if (page === 'cal') { location.replace('#/week'); return; }
  // Old bookmarks and in-app back links open the new collection, not legacy carousel screens.
  if (page === 'list' || page === 'posters') { location.replace('#/mine/series'); return; }
  if (page === 'movies') { location.replace('#/mine/movies'); return; }
  if (page === 'lib') { location.replace('#/mine/server'); return; }
  if (page === 'search') { location.replace('#/mine/series'); return; }
  if (page === 'mine' && (parts[1] || 'series') !== lastMineSection) { lastMineSection = parts[1] || 'series'; }
  if (page === 'random' && lastPage !== 'random') { rnd = null; rndLoading = false; rndAttempted = false; }
  if (page !== lastPage) { sq = ''; lastPage = page; }
  let html;
  if (page === 'subs' || page === 'notify' || page === 'jf') { stab = page; page = 'settings'; }
  if (page === 's') html = viewSeries(decodeURIComponent(parts[1] || ''));
  else if (page === 'settings') html = viewSettings();
  else if (page === 'mine') html = viewMine(parts[1] || 'series');
  else if (page === 'add') html = viewAdd();
  else if (page === 'discover') html = viewDiscover();
  else if (page === 'd') html = viewDisc(decodeURIComponent(parts[1] || ''));
  else if (page === 'random') html = viewRandom();

  else if (page === 'm') html = viewMovie(decodeURIComponent(parts[1] || ''));
  else if (page === 'addm') html = viewAddMovie();
  else html = viewWeek();
  $app.innerHTML = html;
  const tab = ['mine','s','m','add','addm'].includes(page) ? 'mine' : 'week';
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  if (!typing) window.scrollTo(0, 0);
  if (typeof afterRender === 'function') afterRender(page);
  if (page === 'settings' && stab === 'notify') refreshNotify();
  if (page === 'settings' && stab === 'subs') document.getElementById('subform').addEventListener('submit', addSub);
  if (page === 'addm') document.getElementById('mform').addEventListener('submit', addMovie);
  if (page === 'add') document.getElementById('addform').addEventListener('submit', addSeries);
}

document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'sq') return;
  sq = ev.target.value; const pos = ev.target.selectionStart; typing = true; render(); typing = false;
  const el = document.getElementById('sq'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
});
document.addEventListener('click', (ev) => {
  const jk = ev.target.closest('[data-jfkind]');
  if (jk) { jfkind = jfkind === jk.dataset.jfkind ? 'all' : jk.dataset.jfkind; render(); return; }
  const st = ev.target.closest('[data-stab]');
  if (st) { stab = st.dataset.stab; render(); return; }
  const df = ev.target.closest('[data-dfilter]');
  if (df) { dfilter = df.dataset.dfilter; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const a = ev.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'enable') enablePush();
  if (a.dataset.act === 'test') testPush();
  if (a.dataset.act === 'copy') copyCode();
  if (a.dataset.act === 'savetoken') { const v = document.getElementById('a_token').value.trim(); if (v) { lsSet('gh_token', v); render(); } }
  if(a.dataset.act==='gfwatching'){
    ev.preventDefault();
    const kind=a.dataset.kind||'s',id=a.dataset.id;
    if(kind!=='s'&&kind!=='m')return;
    const item=kind==='s'?DATA.series.find(x=>x.id===id):MOVIES.items.find(x=>x.id===id);
    if(!item)return;
    // Films can be marked only after their confirmed release date.
    if(kind==='m'&&!gfInfo(item,'m').eligibleArchive)return;
    lsSet(gfWatchingKey(kind,item.id),gfWatching(item,kind)?'':'1');
    const y=window.scrollY;
    render();
    window.scrollTo(0,y);
    return;
  }
  if(a.dataset.act==='gfarchive'){
    const kind=a.dataset.kind, id=a.dataset.id;
    if(!['s','m'].includes(kind))return;
    const item=kind==='s'?DATA.series.find(x=>x.id===id):MOVIES.items.find(x=>x.id===id);
    if(!item)return;
    const info=gfInfo(item,kind);
    if(!info.eligibleArchive)return;
    const key=gfArchiveKey(kind,id);
    lsSet(key,gfArchived(item,kind,info)?'':info.releaseKey);
    render();return;
  }
  if (a.dataset.act === 'delsub') delSub(a.dataset.id);
  if (a.dataset.act === 'rreset') { ev.preventDefault(); rndSeen.clear(); lsSet('rnd_seen', '[]'); rnd = null; rndBuf = []; rndErr = ''; rndAttempted = false; rndNext(); return; }
  if (a.dataset.act === 'rnext') { const st = document.querySelector('.stage'); if (st && !st.classList.contains('busy')) { st.classList.add('busy', 'out'); setTimeout(rndNext, 160); } return; }
  if (a.dataset.act === 'savetmdb') { const v = (document.getElementById('r_key') || {}).value; if (v && v.trim()) { lsSet('tmdb_key', v.trim()); rndBuf = []; rndNext(); } return; }
  if (a.dataset.act === 'deltmdb') { ev.preventDefault(); lsSet('tmdb_key', ''); rndBuf = []; render(); return; }
  if (a.dataset.act === 'dadd') {
    const rid = a.dataset.id, act = a.dataset.act, inRnd = location.hash === '#/random';
    if (inRnd) {
      const st = document.querySelector('.stage'); if (st && st.classList.contains('busy')) return;
      if (st) st.classList.add('busy');
      discoverAdd(rid).then(() => {
        if (location.hash !== '#/random' || !rnd || rnd.id !== rid) return;
        if (!inCollection(rnd)) { const s2 = document.querySelector('.stage'); if (s2) s2.classList.remove('busy'); return; }
        const s3 = document.querySelector('.stage'); if (s3) { s3.classList.add('busy', 'ok', 'out'); const nb = s3.querySelector(`.ab[data-act="${act}"]`); if (nb) { nb.classList.add('sel'); nb.classList.remove('dim'); nb.style.opacity = 1; const sv = nb.querySelector('svg'); if (sv) sv.innerHTML = '<path d="M5 12.5l4.5 4.5L19 7.5"/>'; const sp = nb.querySelector('span'); if (sp) sp.textContent = 'Добавлено'; } }
        setTimeout(rndNext, 380);
      });
      return;
    }
    discoverAdd(rid);
    return;
  }
  if (a.dataset.act === 'deltoken') { lsSet('gh_token', ''); render(); }
  if (a.dataset.act === 'savejf') { const v = document.getElementById('a_jf').value.trim(); if (/^https?:\/\//i.test(v)) { lsSet('jf_url', v); render(); } }
  if (a.dataset.act === 'deljf') { lsSet('jf_url', ''); render(); }
  if (a.dataset.act === 'jfrefresh') { ev.preventDefault(); jfItems = null; jfErr = ''; jfLoad(); render(); }
  if (a.dataset.act === 'jflogout') { ev.preventDefault(); lsSet('jf_token', ''); lsSet('jf_uid', ''); jfItems = null; jfErr = ''; render(); }
});
document.addEventListener('submit', async (ev) => {
  if (!ev.target.matches('[data-jfform]')) return;
  ev.preventDefault();
  const u = (document.getElementById('jf_user') || {}).value || '', pw = (document.getElementById('jf_pass') || {}).value || '';
  if (!u.trim()) return;
  try { await jfLogin(u.trim(), pw); jfErr = ''; jfItems = null; } catch (e) { jfErr = jfNetErr(e); }
  render();
});
window.addEventListener('hashchange', render);

async function boot(manual) {
  try {
    const [d, c] = await Promise.all([
      fetch('data/series.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('data/config.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]);
    DATA = d; CONFIG = c;
    try { SUBS = await fetch('data/subscriptions.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
    try { DISC = await fetch('data/discover.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
    try { MOVIES = await fetch('data/movies.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
    try { POOL = await fetch('data/pool.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
    // сайт обновляется через пару минут после правки; пока он не пересобрался, берём свежие данные прямо из репозитория
    try {
      const last = Number(lsGet('gh_last_edit') || 0), token = lsGet('gh_token');
      if (token && (manual || Date.now() - last < 15 * 60 * 1000)) {
        const R = CONFIG.repo;
        const fresh = async (file) => {
          const r = await fetch(`https://api.github.com/repos/${R.owner}/${R.name}/contents/${R.path.replace('series.json', file)}?ref=${R.branch}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
          if (!r.ok) throw new Error(r.status);
          return JSON.parse(b64ToStr((await r.json()).content));
        };
        const [a, m, u] = await Promise.all([fresh('series.json').catch(() => null), fresh('movies.json').catch(() => null), fresh('subscriptions.json').catch(() => null)]);
        // постеры и рейтинги подставляются при сборке сайта и в репозитории их нет: переносим из загруженной версии
        const keep = (fresh, old, key) => { const map = new Map((old[key] || []).map((x) => [x.id, x])); (fresh[key] || []).forEach((x) => { const o = map.get(x.id); if (o) { if (o.poster && !x.poster) x.poster = o.poster; if (o.rating && !x.rating) x.rating = o.rating; } }); return fresh; };
        if (a) DATA = keep(a, DATA, 'series'); if (m) MOVIES = keep(m, MOVIES, 'items'); if (u) SUBS = u;
      }
    } catch (e) {}
  } catch (err) {
    if (manual) return false;
    $app.innerHTML = '<h1>Сериалы</h1><p class="empty">Не удалось загрузить данные. Проверьте интернет и откройте приложение ещё раз.</p>';
    return;
  }
  render();
  return true;
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
// Refresh release states after Moscow midnight and pick up newly published schedules on resume.
// Avoid overlapping network refreshes while the PWA is in use.
let lastReleaseDay = todayStr(), lastResumeRefresh = Date.now(), releaseRefreshBusy = false;
async function refreshReleaseState() {
  if (document.hidden || releaseRefreshBusy) return;
  const day = todayStr(), dayChanged = day !== lastReleaseDay;
  if (!dayChanged && Date.now() - lastResumeRefresh < 15 * 60 * 1000) return;
  releaseRefreshBusy = true;
  lastReleaseDay = day;
  lastResumeRefresh = Date.now();
  try { await boot(true); } finally { releaseRefreshBusy = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshReleaseState(); });
window.addEventListener('focus', refreshReleaseState);
setInterval(refreshReleaseState, 60 * 1000);

/* ---------- свайп между тайтлами из одного списка ---------- */
let navList = [];
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a.pcard, a.card');
  if (!a) return;
  const box = a.closest('.hrow2, .mgrid, .stack');
  if (!box) return;
  navList = [...box.querySelectorAll('a.pcard, a.card')].map((x) => x.getAttribute('href')).filter((h) => /^#\/(s|m|d)\//.test(h || ''));
}, true);
{
  let sx = 0, sy = 0, t0 = 0, ok = false;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; t0 = Date.now();
    ok = e.touches.length === 1 && sx > 28 && sx < window.innerWidth - 28 && !e.target.closest('input, textarea, select');
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!ok) return; ok = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - t0 > 700) return;
    const i = navList.indexOf(location.hash);
    if (i < 0) return;
    const j = dx < 0 ? i + 1 : i - 1;
    if (j < 0 || j >= navList.length) return;
    $app.classList.remove('slideL', 'slideR');
    void $app.offsetWidth;
    $app.classList.add(dx < 0 ? 'slideL' : 'slideR');
    location.hash = navList[j];
  }, { passive: true });
}

/* ---------- свайп в случайном выборе: следующий тайтл ---------- */
{
  let sx = 0, sy = 0, t0 = 0, ok = false;
  document.addEventListener('touchstart', (e) => {
    ok = location.hash === '#/random' && !!e.target.closest('.shero') && e.touches.length === 1;
    if (ok) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now(); }
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!ok) return; ok = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - t0 > 800) return;
    const st = document.querySelector('.stage'); if (!st || st.classList.contains('busy')) return;
    st.classList.add('busy', 'out'); st.style.setProperty('--sw', dx < 0 ? '-40px' : '40px');
    setTimeout(rndNext, 160);
  }, { passive: true });
}

/* ---------- потяни вниз, чтобы обновить ---------- */
{
  const ind = document.createElement('div');
  ind.id = 'ptr'; ind.textContent = '↓'; document.body.appendChild(ind);
  let y0 = 0, pull = 0, on = false, busy = false;
  const set = (h, txt) => { ind.style.transform = `translate(-50%, ${h - 44}px)`; ind.style.opacity = Math.min(1, h / 50); if (txt) ind.textContent = txt; };
  document.addEventListener('touchstart', (e) => {
    on = !busy && window.scrollY <= 0 && e.touches.length === 1 && !e.target.closest('input, textarea, select');
    y0 = e.touches[0].clientY; pull = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!on) return;
    const dy = e.touches[0].clientY - y0;
    if (dy <= 0 || window.scrollY > 0) { pull = 0; set(0); return; }
    pull = Math.min(dy * 0.5, 80);
    ind.classList.remove('spin'); set(pull, pull >= 60 ? '↑ отпусти' : '↓');
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    if (!on) return; on = false;
    if (pull < 60) { ind.style.transition = 'transform .2s, opacity .2s'; set(0); setTimeout(() => (ind.style.transition = ''), 250); return; }
    busy = true; ind.classList.add('spin'); ind.textContent = '⟳'; set(50);
    const ok = await boot(true);
    ind.classList.remove('spin'); ind.textContent = ok ? '✓' : '✕'; await new Promise((r) => setTimeout(r, 600));
    ind.style.transition = 'transform .2s, opacity .2s'; set(0); setTimeout(() => (ind.style.transition = ''), 250); busy = false;
  });
}
