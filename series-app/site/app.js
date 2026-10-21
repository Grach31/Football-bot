'use strict';

const $app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const MSK = 'Europe/Moscow';
const PAL = [
  ['#1E3A5F', '#0D1B2E'], ['#5A3B1E', '#2A1A0B'], ['#5A2E2E', '#231010'], ['#35503A', '#111C14'],
  ['#3F3068', '#171026'], ['#444A55', '#14161B'], ['#1F4B4F', '#0B1C1E'], ['#5A4A1E', '#241D0A'],
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
  const byDate = {};
  DATA.series.forEach((s) => eps(s).forEach((e) => {
    if (e.date >= today && e.date <= end) (byDate[e.date] = byDate[e.date] || []).push({ s, e });
  }));
  const dates = Object.keys(byDate).sort();
  let html = `<div class="sub">${cap(weekday(today))}, ${longDate(today)}</div><h1>Что выходит</h1>`;
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
  let html = `<h1>Сериалы</h1>${seg(mode)}<div class="chips">` +
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
        return `<a class="card compact" href="#/s/${esc(s.id)}">${tile(s)}<div class="grow"><div class="ttl">${esc(s.title)}</div><div class="meta">${esc(metaFor(s, today))}</div></div><div class="chip ${c}">${esc(t)}</div></a>`;
      }).join('') + '</div>';
    }
  });
  return html;
}

function viewSeries(id) {
  const today = todayStr();
  const s = DATA.series.find((x) => x.id === id);
  if (!s) return '<a class="back" href="#/list">‹ Сериалы</a><p class="empty">Такого сериала в списке нет.</p>';
  const [c, t] = chipFor(s, today);
  const statusText = { airing: 'Выходит сейчас', waiting: 'Ждём: ' + (s.when || ''), nodate: 'Дата не объявлена', ended: 'Завершён' }[s.status];
  let html = `<a class="back" href="#/list"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Сериалы</a>`;
  html += `<div class="hero">${poster(s)}<div><h1 style="font-size:26px">${esc(s.title)}</h1><div class="meta">${esc(metaFor(s, today))}</div><div class="chip ${c}" style="display:inline-block;margin-top:8px">${esc(statusText)}</div></div></div>`;
  if (s.note) html += `<p class="note">${esc(s.note)}</p>`;
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
  reg.showNotification('Сериалы', { body: 'Проверка: уведомления работают', icon: 'icons/icon-192.png', tag: 'test' });
}
async function copyCode() {
  const el = document.getElementById('subcode');
  const note = document.getElementById('copied');
  try { await navigator.clipboard.writeText(el.value); note.textContent = ' Скопировано'; }
  catch (e) { el.select(); note.textContent = ' Выделено, скопируйте вручную'; }
}

/* ---------- роутер ---------- */
function render() {
  const h = location.hash || '#/week';
  const parts = h.replace(/^#\//, '').split('/');
  const page = parts[0] || 'week';
  let html;
  if (page === 'list') html = viewList('list');
  else if (page === 'posters') html = viewList('posters');
  else if (page === 's') html = viewSeries(decodeURIComponent(parts[1] || ''));
  else if (page === 'notify') html = viewNotify();
  else html = viewWeek();
  $app.innerHTML = html;
  const tab = page === 'posters' || page === 's' ? 'list' : page;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  window.scrollTo(0, 0);
  if (page === 'notify') refreshNotify();
}

document.addEventListener('click', (ev) => {
  const f = ev.target.closest('[data-filter]');
  if (f) { filter = f.dataset.filter; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const a = ev.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'enable') enablePush();
  if (a.dataset.act === 'test') testPush();
  if (a.dataset.act === 'copy') copyCode();
});
window.addEventListener('hashchange', render);

async function boot() {
  try {
    const [d, c] = await Promise.all([
      fetch('data/series.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('data/config.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]);
    DATA = d; CONFIG = c;
  } catch (err) {
    $app.innerHTML = '<h1>Сериалы</h1><p class="empty">Не удалось загрузить данные. Проверьте интернет и откройте приложение ещё раз.</p>';
    return;
  }
  render();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
