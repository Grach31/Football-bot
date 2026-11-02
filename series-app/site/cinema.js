'use strict';
/* ===== Grach films: новый дизайн «кинозал» =====
   Загружается после app.js и заменяет экраны: главная (зал), страница сериала (плёнка), календарь (табло),
   добавляет титры после финала и вступление. Данные и логика сохранения остаются в app.js. */

const APP_V = '66';
const NEON = ['#ff8a3d', '#ffd24d', '#3dff9a', '#ff5d8f', '#4d8bff', '#a58bff', '#3dd5ff', '#ff6b6b'];
let NEON_CACHE = {};
try { NEON_CACHE = JSON.parse(localStorage.getItem('neon_cache') || '{}'); } catch (e) { NEON_CACHE = {}; }
const neonKey = (s) => String(s.id || s.title);
const neonOf = (s) => NEON_CACHE[neonKey(s)] || NEON[hash(s.title || neonKey(s)) % NEON.length];
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

/* основной цвет постера: неоновая подсветка берётся из картинки */
function domColor(url) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      try {
        const W = 24, H = 36, c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H);
        const d = x.getImageData(0, 0, W, H).data, bins = {};
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
          if (v < 0.25 || s < 0.25) continue;
          let h = 0; const df = mx - mn;
          if (mx === r) h = ((g - b) / df) % 6; else if (mx === g) h = (b - r) / df + 2; else h = (r - g) / df + 4;
          h = (h * 60 + 360) % 360;
          const k = Math.round(h / 24), w = s * v;
          const o = bins[k] || (bins[k] = { w: 0, r: 0, g: 0, b: 0 });
          o.w += w; o.r += r * w; o.g += g * w; o.b += b * w;
        }
        let best = null; for (const k in bins) if (!best || bins[k].w > best.w) best = bins[k];
        if (!best) return res(null);
        let r = best.r / best.w, g = best.g / best.w, b = best.b / best.w;
        const mx = Math.max(r, g, b); const sc = 255 / mx; r *= sc; g *= sc; b *= sc; // яркость до максимума
        res('#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''));
      } catch (e) { res(null); }
    };
    im.onerror = () => res(null);
    im.src = url;
  });
}
const colorQueue = new Set();
function ensureColors(items) {
  items.forEach((s) => {
    if (!s.poster || NEON_CACHE[neonKey(s)] || colorQueue.has(neonKey(s))) return;
    colorQueue.add(neonKey(s));
    domColor(s.poster).then((c) => {
      if (!c) return;
      NEON_CACHE[neonKey(s)] = c;
      try { localStorage.setItem('neon_cache', JSON.stringify(NEON_CACHE)); } catch (e) {}
      document.querySelectorAll(`[data-cid="${CSS.escape(neonKey(s))}"]`).forEach((el) => { el.style.setProperty('--c', c); el.style.setProperty('--pc', c); });
      const cur = PG.list && PG.list[PG.idx]; if (cur && neonKey(cur.src || cur) === neonKey(s)) hallTheme(cur);
    });
  });
}

/* общий постер: неоновая рамка своего цвета */
poster = function (s) {
  const [a, b] = PAL[hash(s.title) % PAL.length];
  const c = neonOf(s);
  const inner = s.poster ? `<img src="${esc(s.poster)}" alt="" loading="lazy" decoding="async">` : `<span class="ptitle">${esc(s.title)}</span>`;
  return `<div class="poster" data-cid="${esc(neonKey(s))}" style="--pc:${c};background:linear-gradient(160deg,${a},${b})" role="img" aria-label="${esc(s.title)}">${inner}</div>`;
};

/* ---------- ОБЩАЯ КАРУСЕЛЬ-ЗАЛ (главная, сериалы, фильмы, библиотека) ---------- */
const PG = { cfg: null, list: [], idx: 0, active: '', timer: null, raf: 0, q: '', saved: {} };
const STAGE_SEATS = (() => { let h = ''; [[88, 22, 12], [112, 28, 10], [138, 36, 8]].forEach(([y, w, cnt], r) => { const gap = 400 / cnt; for (let i = 0; i < cnt; i++) { const x = gap * i + gap / 2 - w / 2; h += `<path class="row" d="M${x},${y + 30} v-${16 + r * 2} q0,-${12 + r * 3} ${w / 2},-${12 + r * 3} q${w / 2},0 ${w / 2},${12 + r * 3} v${16 + r * 2} z"/><path class="rim" d="M${x + 1},${y + 10 - r * 2} q0,-${12 + r * 3} ${w / 2 - 1},-${12 + r * 3} q${w / 2 - 1},0 ${w / 2 - 1},${12 + r * 3}"/>`; } }); return h; })();
const GEAR = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const MAGN = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';

/* верхняя панель: одна и та же на всех вкладках */
function pageHeader(add) {
  return `<div class="hrow1"><button type="button" class="hbrand glass" data-intro="1" aria-label="На стартовый экран"><div class="hlogo"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg></div>GRACH FILMS</button>${add ? '<a class="hadd" href="#/addlib">+ Добавить</a>' : ''}<a class="hbtn glass" href="#/settings" aria-label="Настройки">${GEAR}</a></div>`;
}
const seriesItem = (s, today, st) => ({ id: s.id, title: s.title, poster: s.poster, href: `#/s/${s.id}`, src: s, kind: 's',
  meta: [metaFor(s, today), (badgeFor(s, today)[1] || '')].filter(Boolean).join(' · '), badge: st === 'new' ? 'СЕРИЯ ' + (lastOut(s, today) || { e: {} }).e.n : '',
  act: st === 'new' ? 'seen' : st === 'wait' ? 'unseen' : '' });
const movieItem = (m, today) => ({ id: m.id, title: m.title, poster: m.poster, href: `#/m/${m.id}`, src: m, kind: 'm', meta: ['Фильм', movieBadge(m, today), m.service].filter(Boolean).join(' · '), badge: '', act: '' });
const discItem = (it) => ({ id: it.id, title: it.title, poster: it.poster, href: `#/d/${it.id}`, src: it, kind: 'd', badge: '',
  meta: [it.kind === 'film' ? 'Фильм' : 'Сериал', it.rating ? '★ ' + it.rating : '', it.date ? shortDate(it.date) : it.when].filter(Boolean).join(' · '), act: '' });

/* подборки для каждой вкладки */
function cfgWeek(today) {
  const st = DATA.series.map((s) => ({ s, st: airState(s, today) }));
  const lastDays = (s) => { const l = lastOut(s, today); return l ? l.days : 99; };
  const nd = (s) => (nextUnaired(s, today) || {}).date || '9999';
  const now = st.filter((x) => x.st === 'new' || x.st === 'soon').sort((a, b) => (a.st === b.st ? (a.st === 'new' ? lastDays(a.s) - lastDays(b.s) : nd(a.s) < nd(b.s) ? -1 : 1) : a.st === 'new' ? -1 : 1)).map((x) => seriesItem(x.s, today, x.st));
  const wait = st.filter((x) => x.st === 'wait').sort((a, b) => (nd(a.s) < nd(b.s) ? -1 : 1)).map((x) => seriesItem(x.s, today, 'wait'));
  const ssoon = DATA.series.filter((s) => sState(s, today) === 'soon').sort((a, b) => { const x = nextEp(a, today), y = nextEp(b, today); return (x ? x.date : '9999') < (y ? y.date : '9999') ? -1 : 1; }).map((s) => seriesItem(s, today, ''));
  const fsoon = MOVIES.items.filter((m) => m.status !== 'watched' && m.date && m.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1)).map((m) => movieItem(m, today));
  const prem = (DISC.items || []).filter((it) => !it.rec).map(discItem), recs = (DISC.items || []).filter((it) => it.rec).map(discItem);
  const groups = [
    { k: 'now', label: 'Выходят сейчас', c: '#3dff9a', items: now }, { k: 'wait', label: 'Жду следующую серию', c: '#ffd24d', items: wait },
    { k: 'ssoon', label: 'Сериалы скоро', c: '#4d8bff', items: ssoon }, { k: 'fsoon', label: 'Фильмы скоро', c: '#a58bff', items: fsoon },
    { k: 'prem', label: 'Премьеры', c: '#ff5d8f', items: prem }, { k: 'recs', label: 'Вам может понравиться', c: '#3dd5ff', items: recs },
  ].filter((g) => g.items.length);
  return { key: 'week', groups, below: false };
}
function cfgSeries(today) {
  const nd = (s) => { const n = nextEp(s, today); return n ? n.date : '9999'; };
  const mk = (k) => DATA.series.filter((s) => effMine(s) === k).sort((a, b) => (nd(a) < nd(b) ? -1 : nd(a) > nd(b) ? 1 : 0)).map((s) => seriesItem(s, today, airState(s, today) === 'new' ? 'new' : ''));
  return { key: 'list', groups: [{ k: 'watching', label: 'Смотрю', c: '#3dff9a', items: mk('watching') }, { k: 'want', label: 'Хочу посмотреть', c: '#ffd24d', items: mk('want') }], below: true };
}
function cfgMovies(today) {
  const base = MOVIES.items.slice().reverse().filter((m) => m.status !== 'watched');
  const isSoon = (m) => m.status !== 'watching' && m.date && m.date >= today;
  return { key: 'movies', below: true, groups: [
    { k: 'watching', label: 'Смотрю', c: '#3dff9a', items: base.filter((m) => m.status === 'watching').map((m) => movieItem(m, today)) },
    { k: 'want', label: 'Хочу посмотреть', c: '#ffd24d', items: base.filter((m) => m.status !== 'watching' && !isSoon(m)).map((m) => movieItem(m, today)) },
    { k: 'soon', label: 'Скоро', c: '#a58bff', items: base.filter(isSoon).sort((a, b) => (a.date < b.date ? -1 : 1)).map((m) => movieItem(m, today)) },
  ] };
}
function cfgLib(today) {
  const all = libItems().sort((x, y) => ((y.it.rating || 0) - (x.it.rating || 0)) || x.it.title.localeCompare(y.it.title, 'ru'));
  const conv = (x) => { const o = x.kind === 's' ? seriesItem(x.it, today, '') : movieItem(x.it, today); o.meta = [x.kind === 's' ? 'Сериал' : 'Фильм', x.it.rating ? '★ ' + Number(x.it.rating).toFixed(1) : ''].filter(Boolean).join(' · '); return o; };
  const b = jfBase(); let jf = [];
  if (b && jfItems) jf = jfItems.map((x) => ({ id: 'jf-' + x.Id, title: x.Name, kind: 'j', ext: true, href: b + '/web/#/details?id=' + x.Id, act: '', badge: '', src: { id: 'jf-' + x.Id, title: x.Name }, meta: [x.Type === 'Series' ? 'Сериал' : 'Фильм', x.ProductionYear].filter(Boolean).join(' · '),
    poster: x.ImageTags && x.ImageTags.Primary ? `${b}/Items/${x.Id}/Images/Primary?maxWidth=400&quality=85&tag=${encodeURIComponent(x.ImageTags.Primary)}` : '' }));
  return { key: 'lib', add: true, search: true, below: true, groups: [
    { k: 's', label: 'Сериалы', c: '#3dff9a', items: all.filter((x) => x.kind === 's').map(conv) },
    { k: 'm', label: 'Фильмы', c: '#a58bff', items: all.filter((x) => x.kind === 'm').map(conv) },
    { k: 'jf', label: 'Сервер', c: '#ffd24d', items: jf, server: true },
  ] };
}

/* разметка зала */
function carouselHtml(cfg, today) {
  PG.cfg = cfg;
  if (PG.pageKey !== cfg.key) { PG.q = ''; PG.pageKey = cfg.key; }
  const saved = PG.saved[cfg.key];
  const want = cfg.key === 'lib' ? (libfilter === 'all' ? 's' : libfilter) : (saved && saved.active);
  const first = cfg.groups.find((g) => g.items.length) || cfg.groups[0];
  PG.active = (cfg.groups.find((g) => g.k === want) || first || { k: '' }).k;
  const chips = cfg.groups.map((g) => `<button type="button" class="hchip${g.k === PG.active ? ' on' : ''}" data-hg="${g.k}" style="--c:${g.c}"><i></i>${esc(g.label)}<em>${g.server && jfItems === null ? '' : g.items.length}</em></button>`).join('');
  const search = cfg.search ? `<div class="hsrch glass">${MAGN}<input id="hq" type="search" placeholder="Поиск по названию" autocomplete="off" value="${esc(PG.q)}"></div>` : '';
  return `<section class="hall${cfg.search ? ' hs' : ''}" id="hall"><div class="beam"></div><canvas id="dust"></canvas>
    <div class="htop">${pageHeader(cfg.add)}${search}<div class="hchips" id="hchips">${chips}</div></div>
    <div class="screenwrap"><div class="hglow"></div><div class="hstage" id="hstage"></div><div class="hrefl"></div></div>
    <div class="hinfo" id="hinfo"><h2 id="hit"></h2><p id="him"></p><div class="hbtns"><a class="go" id="hopen" href="#/list"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="#04101c"/></svg>Открыть</a><button type="button" class="glass hround" id="hact" hidden></button></div><div class="hbtns hbtns2" id="hbtns2" hidden></div><div id="d_msg" class="meta" role="status"></div></div>
    <div class="seats"><svg viewBox="0 0 400 150" preserveAspectRatio="none"><g>${STAGE_SEATS}</g></svg></div></section><div class="below" id="hbelow"></div>`;
}
viewWeek = function () { const t = todayStr(); return carouselHtml(cfgWeek(t), t) + `<p class="foot">Данные обновлены ${esc(DATA.updated)}. Даты взяты из открытых источников и могут меняться. Версия ${APP_V}.</p>`; };
viewList = function () { const t = todayStr(); return carouselHtml(cfgSeries(t), t); };
viewMovies = function () { const t = todayStr(); return carouselHtml(cfgMovies(t), t); };
viewLib = function () { const t = todayStr(); return carouselHtml(cfgLib(t), t); };

function curGroup() { return (PG.cfg && PG.cfg.groups.find((g) => g.k === PG.active)) || { items: [] }; }
function groupList() { const q = PG.q.trim().toLowerCase(); const g = curGroup(); return q ? g.items.filter((x) => x.title.toLowerCase().includes(q)) : g.items.slice(); }
function hallTheme(it) { const c = neonOf(it.src || it), r = document.documentElement.style; r.setProperty('--g', c); r.setProperty('--g2', shade(c, 0.32)); }
function hallPlace() {
  const stage = document.getElementById('hstage'); if (!stage) return;
  const n = PG.list.length;
  [...stage.children].forEach((e, i) => {
    let k = i - PG.idx; if (k > n / 2) k -= n; if (k < -n / 2) k += n; const a = Math.abs(k);
    e.style.transform = `translateX(${k * 64}%) translateZ(${-a * 150}px) rotateY(${-k * 42}deg) scale(${k === 0 ? 1.12 : 1})`;
    e.style.opacity = a > 2 ? 0 : 1 - a * 0.28;
    e.style.filter = k === 0 ? 'none' : `brightness(${0.55 - a * 0.1}) saturate(.8)`;
    e.style.zIndex = 10 - a; e.classList.toggle('cur', k === 0);
  });
}
function hallInfo(first) {
  const it = PG.list[PG.idx], el = document.getElementById('hinfo'); if (!el) return;
  const apply = () => {
    const t = document.getElementById('hit'); if (!t) return;
    const open = document.getElementById('hopen'), act = document.getElementById('hact');
    if (!it) { t.textContent = 'Здесь пока пусто'; document.getElementById('him').textContent = curGroup().server ? 'Нужно войти на сервер' : 'В этой подборке ничего нет'; open.style.display = 'none'; act.hidden = true; }
    else {
      t.textContent = it.title; document.getElementById('him').textContent = it.meta; open.style.display = ''; open.setAttribute('href', it.href);
      if (it.ext) { open.setAttribute('target', '_blank'); open.setAttribute('rel', 'noopener'); } else { open.removeAttribute('target'); open.removeAttribute('rel'); }
      if (it.act) { act.hidden = false; act.dataset.act = it.act; act.dataset.id = it.id; act.textContent = it.act === 'seen' ? '✓' : '↺'; act.setAttribute('aria-label', it.act === 'seen' ? 'Серия просмотрена' : 'Вернуть: серия не просмотрена'); } else act.hidden = true;
      hallTheme(it);
    }
    const b2 = document.getElementById('hbtns2'), dm = document.getElementById('d_msg'); if (dm) dm.textContent = '';
    if (b2) {
      if (it && it.kind === 'd') {
        b2.hidden = false;
        if (inCollection(it.src)) b2.innerHTML = '<span class="hin">Уже в вашем списке</span>';
        else b2.innerHTML = `<button type="button" class="glass gl hwant" data-act="dadd" data-id="${esc(it.id)}">＋ Хочу посмотреть</button>` + (it.src.rec ? `<button type="button" class="glass gl hseen" data-act="dlib" data-id="${esc(it.id)}">✓ Смотрел</button>` : '');
      } else { b2.hidden = true; b2.innerHTML = ''; }
    }
    el.classList.remove('sw');
  };
  if (first) apply(); else { el.classList.add('sw'); setTimeout(apply, 200); }
}
function hallGo(i) { const n = PG.list.length; if (!n) return; PG.idx = (i + n) % n; hallPlace(); hallInfo(false); const b = document.querySelector('.hall .beam'); if (b) { b.style.opacity = '1'; setTimeout(() => { b.style.opacity = ''; }, 130); } saveState(); }
function saveState() { if (PG.cfg) PG.saved[PG.cfg.key] = { active: PG.active, idx: PG.idx }; }
function hallBuild() {
  const stage = document.getElementById('hstage'); if (!stage) return;
  stage.innerHTML = '';
  PG.list.forEach((it, i) => {
    const e = document.createElement('div'); const c = neonOf(it.src || it), [a, b] = PAL[hash(it.title) % PAL.length];
    e.className = 'pc' + (it.poster ? '' : ' noimg'); e.dataset.cid = neonKey(it.src || it); e.style.setProperty('--c', c); e.style.setProperty('--bgp', `linear-gradient(160deg,${a},${b})`);
    e.innerHTML = (it.poster ? `<img src="${esc(it.poster)}" alt="">` : '') + (it.badge ? `<i>${esc(it.badge)}</i>` : '') + (it.poster ? '' : `<span>${esc(it.title)}</span>`);
    e.onclick = () => { if (i !== PG.idx) { stopHallTimer(); hallGo(i); } else if (it.ext) window.open(it.href, '_blank', 'noopener'); else location.hash = it.href; };
    stage.appendChild(e);
  });
  hallPlace(); hallInfo(true);
  const sec = document.querySelector('.hall'); if (sec) sec.classList.toggle('empty', !PG.list.length);
  renderBelow();
}
function renderBelow() {
  const box = document.getElementById('hbelow'); if (!box || !PG.cfg || !PG.cfg.below) return;
  const g = curGroup(), today = todayStr();
  let html = '';
  if (g.server) {
    html += (jfItems && jfItems.length && !PG.list.length) ? '<p class="empty">Ничего не найдено.</p>' : '';
    if (jfItems === null || !jfBase() || !lsGet('jf_token')) html += viewJfServer();
    else if (!jfItems.length) html += viewJfServer();
  } else if (!PG.list.length) {
    html += `<p class="empty">${PG.q ? 'Ничего не найдено.' : PG.cfg.key === 'lib' ? 'Пока пусто. Всё, что вы отметите «Посмотрел», появится здесь. Старое можно добавить кнопкой «+ Добавить».' : 'Здесь пока пусто.'}</p>`;
  }
  if (PG.list.length) {
    html += `<h2 class="hd">${esc(g.label)}</h2><div class="mgrid">` + PG.list.map((it) => {
      if (it.kind === 's') return pcard(it.src, today, false);
      const tag = it.meta.split(' · ').slice(-1)[0];
      return `<a class="pcard" href="${esc(it.href)}"${it.ext ? ' target="_blank" rel="noopener"' : ''}>${poster(it.src && it.kind !== 'j' ? it.src : { id: it.id, title: it.title, poster: it.poster })}<div class="bds"><span class="bl">${esc(tag)}</span></div></a>`;
    }).join('') + '</div>';
  }
  box.innerHTML = html;
}
function stopHallTimer() { clearInterval(PG.timer); PG.timer = null; }
function startHallTimer() { stopHallTimer(); PG.timer = setInterval(() => { if (!document.getElementById('hall')) return stopHallTimer(); if (window.scrollY < 300 && !document.hidden && PG.list.length > 1 && document.activeElement && document.activeElement.id !== 'hq') hallGo(PG.idx + 1); }, 6500); }
function setGroup(k) {
  PG.active = k; PG.idx = 0; PG.list = groupList();
  const stage = document.getElementById('hstage');
  document.querySelectorAll('#hchips .hchip').forEach((x) => x.classList.toggle('on', x.dataset.hg === k));
  stage.style.opacity = 0; setTimeout(() => { hallBuild(); stage.style.opacity = 1; saveState(); }, 240);
  if (PG.cfg.key === 'lib') libfilter = k;
  if (k === 'jf' && jfItems === null && jfBase() && lsGet('jf_token') && !jfLoading) jfLoad();
}

function initHall() {
  stopHallTimer(); cancelAnimationFrame(PG.raf);
  const hall = document.getElementById('hall'); if (!hall || !PG.cfg) return;
  const sv = PG.saved[PG.cfg.key]; PG.q = PG.q || '';
  PG.list = groupList();
  PG.idx = sv && sv.active === PG.active ? Math.min(sv.idx || 0, Math.max(0, PG.list.length - 1)) : 0;
  hallBuild(); ensureColors(PG.cfg.groups.flatMap((g) => g.items.map((x) => x.src || x)).filter((x) => x.poster));
  const stage = document.getElementById('hstage'); let sx = null;
  stage.addEventListener('pointerdown', (e) => { sx = e.clientX; stopHallTimer(); });
  stage.addEventListener('pointerup', (e) => { if (sx === null) return; const dx = e.clientX - sx; if (Math.abs(dx)>40) hallGo(PG.idx + (dx < 0 ? 1 : -1)); sx = null; });
  document.querySelectorAll('#hchips .hchip').forEach((b) => { b.onclick = () => setGroup(b.dataset.hg); });
  const q = document.getElementById('hq');
  if (q) q.addEventListener('input', () => { PG.q = q.value; PG.idx = 0; PG.list = groupList(); hallBuild(); });
  startHallTimer();
  /* пыль в луче */
  const c = document.getElementById('dust'), x = c.getContext('2d'); let W, H; const P = [];
  const rs = () => { const r = c.getBoundingClientRect(); W = c.width = r.width * devicePixelRatio; H = c.height = r.height * devicePixelRatio; }; rs();
  for (let i = 0; i < 70; i++) P.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.8 + 0.4, s: Math.random() * 0.0004 + 0.00008, d: Math.random() * 6.28, a: Math.random() * 0.6 + 0.2 });
  const loop = () => {
    if (!document.body.contains(c)) return;
    if (window.scrollY < 700) {
      x.clearRect(0, 0, W, H); const col = getComputedStyle(document.documentElement).getPropertyValue('--g').trim() || '#fff';
      P.forEach((p) => { p.y -= p.s * 2; p.d += 0.008; p.x += Math.sin(p.d) * 0.0004; if (p.y < 0.06) { p.y = 1; p.x = Math.random(); }
        const px = (0.5 + (p.x - 0.5) * (0.25 + (1 - p.y) * 0.9)) * W, py = p.y * H;
        x.globalAlpha = Math.max(0, p.a * (1 - Math.abs(p.y - 0.5)) * 0.9); x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 8; x.beginPath(); x.arc(px, py, p.r * devicePixelRatio, 0, 6.28); x.fill(); });
    }
    PG.raf = requestAnimationFrame(loop);
  };
  loop();
}

/* ---------- вступление и занавес (раз в день) ---------- */
/* ---------- вступление: случайный выбор + вход в зал ---------- */
let introLoading = false;
async function introNext() {
  if (rnd) rndMark(rnd.id);
  rndBuf = rndBuf.filter(rndOk);
  if (!rndBuf.length && tmdbKey()) { await rndFill(); rndBuf = rndBuf.filter(rndOk); }
  rnd = rndBuf.shift() || rndFromPool();
  if (rnd) { rndCache.set(rnd.id, rnd); if (rnd.poster) { const im = new Image(); im.src = rnd.poster; } }
  if (rndBuf.length < 3) rndFill();
  return rnd;
}
function introPaint() {
  const box = document.getElementById('irndin'); if (!box) return;
  if (introLoading) { box.innerHTML = '<div class="irmsg">Подбираю…</div>'; return; }
  const it = rnd;
  if (!it) { box.innerHTML = '<div class="irmsg">Не получилось подобрать. Проверьте интернет.</div><button type="button" class="glass gl" id="irnext">Ещё раз</button>'; document.getElementById('irnext').onclick = () => introAdvance(1); return; }
  const [ga, gb] = palOf(it), added = inCollection(it), c = neonOf(it);
  const meta = [it.rating ? '★ ' + Number(it.rating).toFixed(1) : '', it.kind === 'film' ? 'Фильм' : 'Сериал', it.year, it.genre].filter(Boolean).join(' · ');
  box.innerHTML = `<div class="irrow"><div class="irpic" id="irpic" style="--c:${c};background:linear-gradient(160deg,${ga},${gb})">${it.poster ? `<img src="${esc(it.poster)}" alt="">` : ''}</div>` +
    `<div class="irside">${added ? '<span class="irin">В списке</span>' : '<button type="button" class="iab" id="irwant" aria-label="Хочу посмотреть"><i>＋</i><span>Хочу</span></button><button type="button" class="iab" id="irseen" aria-label="Уже смотрел"><i>✓</i><span>Смотрел</span></button>'}</div></div>` +
    `<div class="irtitle">${esc(it.title)}</div><div class="irmeta">${esc(meta)}</div><button type="button" class="glass gl irbtn" id="irnext">Дальше →</button><div class="irmsg" id="irmsg"></div>`;
  document.getElementById('irnext').onclick = () => introAdvance(1);
  const w = document.getElementById('irwant'), s = document.getElementById('irseen');
  if (w) w.onclick = () => introAdd(false); if (s) s.onclick = () => introAdd(true);
  let sx = null; const pic = document.getElementById('irpic');
  pic.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  pic.addEventListener('pointerup', (e) => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) introAdvance(dx < 0 ? 1 : -1); });
}
async function introAdvance(dir) {
  const pic = document.getElementById('irpic');
  if (pic) { pic.style.transition = 'transform .22s, opacity .22s'; pic.style.transform = `translateX(${-dir * 90}px) rotate(${-dir * 8}deg)`; pic.style.opacity = 0; }
  await new Promise((r) => setTimeout(r, 200));
  await introNext(); introPaint();
}
async function introAdd(lib) {
  const it = rnd, msg = document.getElementById('irmsg'); if (!it || !msg) return;
  if (!lsGet('gh_token')) { msg.textContent = 'Нужен токен GitHub: «Настройки» → «Токен».'; return; }
  msg.textContent = 'Сохраняю…';
  try { await discoverAdd(it.id, lib); } catch (e) {}
  const m2 = document.getElementById('irmsg'); if (!m2) return;
  if (inCollection(it)) { m2.textContent = lib ? 'Добавлено в библиотеку' : 'Добавлено в «Хочу посмотреть»'; setTimeout(() => introAdvance(1), 800); } else m2.textContent = 'Не получилось сохранить';
}
let introChecked = false;
function closeIntro(instant) {
  document.getElementById('intro') && document.getElementById('intro').classList.add('hide');
  const done = () => { document.body.style.overflow = ''; document.querySelectorAll('.curt,#intro').forEach((e) => e.remove()); document.body.classList.remove('cur-open'); };
  if (instant) return done();
  setTimeout(() => { document.body.classList.add('cur-open'); setTimeout(done, 2400); }, 500);
}
function showIntro() {
  document.querySelectorAll('.curt,#intro').forEach((e) => e.remove()); document.body.classList.remove('cur-open');
  const today = todayStr();
  const n1 = DATA.series.filter((s) => effMine(s) === 'watching').length;
  const n2 = DATA.series.filter((s) => sState(s, today) === 'soon').length + MOVIES.items.filter((m) => m.status !== 'watched' && m.date && m.date >= today).length;
  const n3 = DATA.series.filter((s) => airState(s, today) === 'new').length;
  let i = 0; const title = ['Grach', 'films'].map((w) => `<span class="ln">${[...w].map((ch) => `<span class="ch" style="--i:${i++}">${ch}</span>`).join('')}</span>`).join('');
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="curt cl"></div><div class="curt cr"></div><section id="intro"><div class="irnd" id="irnd"><div id="irndin"></div></div><div class="ibox"><div class="kick">Личный кинозал</div><h1 id="ititle" aria-label="Grach films">${title}</h1><div class="istats"><div><b data-to="${n1}">0</b><small>смотрю</small></div><div><b data-to="${n2}">0</b><small>ждут выхода</small></div><div><b data-to="${n3}">0</b><small>новых серий</small></div></div><button type="button" class="go" id="ienter">Войти в зал <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#04101c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div></section>`;
  while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('.istats b').forEach((el) => { const to = +el.dataset.to; let s = null; const f = (t) => { if (!s) s = t; const p = Math.min(1, (t - s) / 1200); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); }; setTimeout(() => requestAnimationFrame(f), 1300); });
  document.getElementById('ienter').onclick = () => { if ((location.hash || '#/week') !== '#/week') location.hash = '#/week'; closeIntro(false); };
  introLoading = !rnd; introPaint();
  if (!rnd) introNext().then(() => { introLoading = false; introPaint(); }); else introLoading = false;
}
function maybeIntro() {
  if (introChecked) return; introChecked = true;
  if (params.get('nointro')) return;
  showIntro();
}
document.addEventListener('click', (ev) => { if (ev.target.closest('[data-intro]')) { ev.preventDefault(); showIntro(); } });

/* ---------- СТРАНИЦА СЕРИАЛА: плёнка ---------- */
const FPOS = ['0% 0%', '100% 12%', '50% 100%', '0% 90%', '100% 100%', '50% 0%', '0% 45%', '100% 55%'];
const seriesN = (s) => Math.max(s.total || 0, ...eps(s).map((e) => e.n), 0);
viewSeries = function (id) {
  const today = todayStr();
  const s = DATA.series.find((x) => x.id === id);
  if (!s) return '<a class="back" href="#/list">‹ Сериалы</a><p class="empty">Такого сериала в списке нет.</p>';
  const col = neonOf(s);
  const statusText = { airing: 'Выходит сейчас', waiting: 'Ждём: ' + (s.when || ''), nodate: 'Дата не объявлена', ended: s.closed ? 'Закрыт: продолжения не будет' : 'Вышел' }[s.status];
  const N = seriesN(s), list = eps(s), seen = seenEp(s);
  const BACK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  let html = `<div class="scov" data-cid="${esc(neonKey(s))}" style="--pc:${col}"><a class="back" href="#/list">${BACK}Сериалы</a><div class="scrow">${s.poster ? `<img class="spic" src="${esc(s.poster)}" alt="">` : ''}<div class="stt"><h1>${esc(s.title)}</h1><div class="sm">${esc(metaFor(s, today))}<br>${esc(statusText)}</div></div></div>`;
  if (N && list.length) html += `<div class="sprog"><i id="sbar" data-w="${Math.round(seen / N * 100)}"></i></div><div class="spl"><span id="spl1"></span><span id="spl2"></span></div>`;
  html += '</div>';
  if (s.note) html += `<p class="note">${esc(s.note)}</p>`;
  if (s.status === 'airing' || s.status === 'ended') html += jfWatch(s.title);
  {
    const cur = effMine(s), has = !!lsGet('gh_token');
    if (has) html += '<div class="chips" style="margin-top:12px">' + [...Object.entries(MINE), ['', 'Убрать']].map(([k, l]) => `<button type="button" class="fbtn ${cur === k ? 'on' : ''}" data-act="setmine" data-id="${esc(s.id)}" data-val="${k}">${l}</button>`).join('') + '</div><div id="s_msg" class="meta" role="status"></div>';
    else if (cur) html += `<p class="meta">Мой раздел: ${MINE_LABEL[cur]}</p>`;
  }
  if (N && list.length) {
    html += '<div class="sh">Плёнка серий</div><div class="strip" id="strip" data-sid="' + esc(s.id) + '">';
    for (let i = 1; i <= N; i++) {
      const e = list.find((x) => x.n === i);
      const aired = !!e && epAired(e, today);
      const sub = e ? (aired ? longDate(e.date) : 'выйдет ' + shortDate(e.date) + (e.time ? ' · ' + e.time : '')) : 'дата не объявлена';
      const bg = s.poster ? `background-image:url('${esc(s.poster)}');background-position:${FPOS[(i - 1) % FPOS.length]}` : `--bgp:linear-gradient(160deg,color-mix(in srgb,${col} 70%,#000),#0a0d18);background:var(--bgp)`;
      const fin = s.total && i === s.total ? ' · финал' : '';
      html += `<div class="fw"><div class="fcode">▸${i}A</div><div class="fr${i <= seen ? ' seen' : ''}${aired ? '' : ' locked'}" data-ep="${i}" data-aired="${aired ? 1 : 0}" style="${bg}"><div class="fo"></div><div class="nx">СЛЕДУЮЩАЯ</div><div class="lk">${aired ? '' : 'ЕЩЁ НЕТ'}</div><div class="fn">${i}</div><div class="ft">Серия ${i}${fin}<small>${esc(sub)}</small></div><div class="mk">✓</div></div></div>`;
    }
    html += '</div>';
    if (s.approx) html += '<p class="foot">Число выпусков не подтверждено, список дат будет уточняться.</p>';
  }
  return html;
};
function paintStrip(s, anim) {
  const strip = document.getElementById('strip'); if (!strip) return;
  const seen = seenEp(s), N = seriesN(s);
  strip.querySelectorAll('.fr').forEach((f) => {
    const i = +f.dataset.ep, was = f.classList.contains('seen'), now = i <= seen;
    f.classList.toggle('seen', now); f.classList.toggle('next', !now && f.dataset.aired === '1' && i === seen + 1);
    if (anim && now && !was) { f.classList.remove('dev'); void f.offsetWidth; f.classList.add('dev'); }
  });
  const bar = document.getElementById('sbar'); if (bar) bar.style.width = Math.round(seen / N * 100) + '%';
  const a = document.getElementById('spl1'), b = document.getElementById('spl2');
  if (a) a.textContent = `Просмотрено ${seen} из ${N}`;
  if (b) b.textContent = seen >= N ? 'Досмотрено' : `Осталось ${N - seen}`;
}
function initSeries(id) {
  const s = DATA.series.find((x) => x.id === id); if (!s) return;
  ensureColors([s]);
  const bar = document.getElementById('sbar'); if (bar) { bar.style.width = '0'; setTimeout(() => { bar.style.width = bar.dataset.w + '%'; }, 250); }
  paintStrip(s, false);
  const nx = document.querySelector('.fr.next');
  if (nx) setTimeout(() => window.scrollTo({ top: nx.getBoundingClientRect().top + window.scrollY - 220, behavior: 'smooth' }), 700);
}
async function markEp(id, n) {
  const s = DATA.series.find((y) => y.id === id); if (!s) return;
  if (!lsGet('gh_token')) { alert('Чтобы отмечать серии, нужен токен GitHub: «Настройки» (шестерёнка на главной) → «Токен».'); return; }
  const N = seriesN(s), cur = seenEp(s), target = n === cur ? n - 1 : n, season = s.season || 1, prev = { ep: s.seen_ep, season: s.seen_ep_season };
  const apply = (x) => { if (target > 0) { x.seen_ep = target; x.seen_ep_season = season; } else { delete x.seen_ep; delete x.seen_ep_season; } };
  apply(s); paintStrip(s, true);
  if (N && target >= N) setTimeout(() => showCredits(s), 1900);
  try {
    await ghEdit('series.json', (d) => { const x = d.series.find((z) => z.id === id); if (x) apply(x); }, `Сериалы: «${s.title}» просмотрено до серии ${target}`);
  } catch (err) {
    if (prev.ep) { s.seen_ep = prev.ep; s.seen_ep_season = prev.season; } else { delete s.seen_ep; delete s.seen_ep_season; }
    paintStrip(s, false); closeCredits(true); alert(err.message || String(err));
  }
}
document.addEventListener('click', (ev) => {
  const f = ev.target.closest('#strip .fr');
  if (f && f.dataset.aired === '1') { ev.preventDefault(); markEp(f.closest('#strip').dataset.sid, +f.dataset.ep); }
});

/* ---------- титры после финала (только настоящие данные) ---------- */
function ensureCredits() {
  let c = document.getElementById('credits'); if (c) return c;
  c = document.createElement('div'); c.id = 'credits';
  c.innerHTML = '<button type="button" class="skip" id="cskip">Пропустить</button><div class="croll" id="croll"></div><div class="nx2" id="cnext"><button type="button" class="go" id="cback">Вернуться в зал</button></div>';
  document.body.appendChild(c);
  document.getElementById('cskip').onclick = () => closeCredits();
  document.getElementById('cback').onclick = () => { closeCredits(); location.hash = '#/week'; };
  return c;
}
function showCredits(s) {
  const list = eps(s).map((e) => e.date).sort(), c = ensureCredits();
  const days = s.added ? Math.max(1, Math.round((d0(todayStr()) - d0(s.added)) / 86400000)) : 0;
  const rows = [['Главный зритель', 'Вы'], ['Серий', `${seriesN(s)}${s.season ? ' · ' + s.season + ' сезон' : ''}`]];
  if (s.service) rows.push(['Смотрели на', s.service]);
  if (list.length) rows.push(['Выходил', `${shortDate(list[0])} – ${shortDate(list[list.length - 1])}`]);
  if (days) rows.push(['В вашем списке', days + ' дн.']);
  document.getElementById('croll').innerHTML = `<h3>${esc(s.title)}</h3>` + rows.map(([a, b]) => `<div class="r"><small>${esc(a)}</small><b>${esc(b)}</b></div>`).join('') + '<div class="end">КОНЕЦ</div>';
  const nx = document.getElementById('cnext'); c.classList.remove('on'); nx.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
  clearTimeout(window._ct); window._ct = setTimeout(() => nx.classList.add('on'), 21000);
}
function closeCredits() { const c = document.getElementById('credits'); if (!c) return; c.classList.remove('on'); const nx = document.getElementById('cnext'); if (nx) nx.classList.remove('on'); clearTimeout(window._ct); }

/* ---------- СЕАНСЫ: табло и календарь ---------- */
const AL = ' АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789.:-ABCDEFGHIJKLMNOPQRSTUVWXYZ!?+';
const W1 = 15, W2 = 20;
function boardRows(today) {
  const out = [];
  DATA.series.filter((s) => !s.no_schedule).forEach((s) => eps(s).forEach((e) => { if (e.date >= today) out.push({ date: e.date, title: s.title, sub: `${unit(s)} ${e.n}`, href: `#/s/${s.id}`, c: neonOf(s) }); }));
  MOVIES.items.filter((m) => m.status !== 'watched' && m.date && m.date >= today).forEach((m) => out.push({ date: m.date, title: m.title, sub: 'фильм', href: `#/m/${m.id}`, c: neonOf(m) }));
  // у каждого сериала в табло только ближайшая серия
  const seen = new Set(), res = [];
  out.sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((r) => { if (seen.has(r.href)) return; seen.add(r.href); res.push(r); });
  return res.slice(0, 6);
}
const flapT = (s, w) => { s = String(s).toUpperCase(); return s.length > w ? s.slice(0, w - 1) + '.' : s; };
window.viewCal = function () {
  const today = todayStr(); calview = 'month';
  const rows = boardRows(today);
  let html = `<div class="pghead">${pageHeader(false)}</div><div class="board"><div class="bh"><b>БЛИЖАЙШИЕ</b><span>ЗАЛ 1</span></div><div id="rows">`;
  if (!rows.length) html += '<p class="empty" style="margin:8px 4px 14px">Ближайших выходов нет.</p>';
  rows.forEach((r, i) => {
    const mon = fmt(r.date, { month: 'short' }).replace('.', '').slice(0, 3);
    const line2 = `${weekdayShort(r.date)} ${r.date.slice(8, 10)} ${mon} ${r.sub}`;
    html += `<a class="rowb" href="${esc(r.href)}" style="--c:${r.c}" data-l1="${esc(flapT(r.title, W1))}" data-l2="${esc(flapT(line2, W2))}"><div class="fl"></div><div class="fl"></div></a>`;
  });
  html += `</div></div><div class="hd" style="margin-top:26px">Календарь</div>${calHtml(today)}`;
  return html;
};
function initBoard() {
  document.querySelectorAll('#rows .rowb').forEach((r, ri) => {
    const [a, b] = r.querySelectorAll('.fl');
    const mk = (el, w, cls) => { const cs = []; for (let i = 0; i < w; i++) { const c = document.createElement('div'); c.className = 'cell ' + cls; c.innerHTML = '<span> </span>'; el.appendChild(c); cs.push(c); } return cs; };
    const A = mk(a, W1, 'big'), B = mk(b, W2, 'sm'), l1 = r.dataset.l1, l2 = r.dataset.l2;
    const set = (c, ch, delay) => {
      const target = Math.max(0, AL.indexOf(ch)); let cur = 0; if (!target) return;
      setTimeout(() => { (function step() { cur = (cur + 1) % AL.length; c.firstChild.textContent = AL[cur]; c.classList.remove('flip'); void c.offsetWidth; c.classList.add('flip'); if (cur !== target) setTimeout(step, 40); })(); }, delay);
    };
    for (let i = 0; i < W1; i++) set(A[i], l1[i] || ' ', ri * 170 + i * 26);
    for (let i = 0; i < W2; i++) set(B[i], l2[i] || ' ', ri * 170 + i * 18 + 110);
  });
}

/* ---------- после каждой отрисовки ---------- */
function afterRender(page) {
  const nav = document.getElementById('tabs');
  if (nav) {
    if (!nav.querySelector('.npill')) { const p = document.createElement('i'); p.className = 'npill'; nav.prepend(p); }
    const links = [...nav.querySelectorAll('a')], k = links.findIndex((a) => a.classList.contains('on'));
    const p = nav.querySelector('.npill'); if (p) p.style.transform = k < 0 ? 'translateX(-200%)' : `translateX(${k * 100}%)`;
  }
  if (page !== 's') document.documentElement.style.removeProperty('--g');
  if (page === 'week' || page === 'list' || page === 'movies' || page === 'lib') { initHall(); if (page === 'week') maybeIntro(); } else { stopHallTimer(); }
  if (page === 'cal') initBoard();
  if (page === 's') initSeries(decodeURIComponent((location.hash.split('/')[2] || '')));
}

/* постеры и рейтинги подставляются при сборке сайта и в репозитории их нет: после любого сохранения переносим их в свежие данные */
{
  const _ghEdit = ghEdit;
  ghEdit = async function (file, mutate, message) {
    const prevS = DATA.series || [], prevM = MOVIES.items || [];
    const r = await _ghEdit(file, mutate, message);
    const carry = (fresh, old) => { const m = new Map(old.map((x) => [x.id, x])); (fresh || []).forEach((x) => { const o = m.get(x.id); if (o) { if (o.poster && !x.poster) x.poster = o.poster; if (o.rating && !x.rating) x.rating = o.rating; } }); };
    if (r && r.series) carry(r.series, prevS);
    if (r && r.items && file === 'movies.json') carry(r.items, prevM);
    return r;
  };
}

/* обновление без ручной перезагрузки: проверка при возвращении в приложение и каждые 5 минут */
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller; let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had || reloading) return; reloading = true; location.reload(); });
  const check = () => navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 5 * 60 * 1000);
}
