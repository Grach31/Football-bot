'use strict';
/* ===== Grach films: новый дизайн «кинозал» =====
   Загружается после app.js и заменяет экраны: главная (зал), страница сериала (плёнка), календарь (табло),
   добавляет титры после финала и вступление. Данные и логика сохранения остаются в app.js. */

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
      if (HALL.cur && neonKey(HALL.cur) === neonKey(s)) hallTheme(HALL.cur);
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

/* ---------- ЗАЛ ---------- */
const HALL = { items: [], list: [], idx: 0, cur: null, timer: null, raf: 0, filter: 'all' };
function hallItems(today) {
  const rank = (s) => { const st = airState(s, today); if (st === 'new') return 0; if (st === 'wait') return 1; if (effMine(s) === 'watching') return 2; if (sState(s, today) === 'soon' || st === 'soon') return 3; return 9; };
  const ser = DATA.series.map((s) => ({ s, r: rank(s) })).filter((x) => x.r < 9)
    .sort((a, b) => (a.r - b.r) || (((nextUnaired(a.s, today) || {}).date || '9999') < ((nextUnaired(b.s, today) || {}).date || '9999') ? -1 : 1))
    .map(({ s, r }) => ({
      kind: 's', id: s.id, title: s.title, poster: s.poster, k: r <= 2 ? 'now' : 'soon', href: `#/s/${s.id}`, src: s,
      meta: [metaFor(s, today), s.total && seenEp(s) ? `${seenEp(s)} из ${s.total}` : ''].filter(Boolean).join(' · '),
      badge: r === 0 ? 'СЕРИЯ ' + (lastOut(s, today) || { e: {} }).e.n : '',
    }));
  const mov = MOVIES.items.filter((m) => m.status !== 'watched' && m.date && m.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((m) => ({ kind: 'm', id: m.id, title: m.title, poster: m.poster, k: 'film', href: `#/m/${m.id}`, src: m, meta: ['Фильм', movieBadge(m, today), m.service].filter(Boolean).join(' · '), badge: '' }));
  let all = [...ser.slice(0, 7), ...mov.slice(0, 4)];
  if (!all.length) all = DATA.series.slice(0, 6).map((s) => ({ kind: 's', id: s.id, title: s.title, poster: s.poster, k: 'now', href: `#/s/${s.id}`, src: s, meta: metaFor(s, today), badge: '' }));
  return all;
}
const STAGE_SEATS = (() => { let h = ''; [[88, 22, 12], [112, 28, 10], [138, 36, 8]].forEach(([y, w, cnt], r) => { const gap = 400 / cnt; for (let i = 0; i < cnt; i++) { const x = gap * i + gap / 2 - w / 2; h += `<path class="row" d="M${x},${y + 30} v-${16 + r * 2} q0,-${12 + r * 3} ${w / 2},-${12 + r * 3} q${w / 2},0 ${w / 2},${12 + r * 3} v${16 + r * 2} z"/><path class="rim" d="M${x + 1},${y + 10 - r * 2} q0,-${12 + r * 3} ${w / 2 - 1},-${12 + r * 3} q${w / 2 - 1},0 ${w / 2 - 1},${12 + r * 3}"/>`; } }); return h; })();
const GEAR = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

viewWeek = function () {
  const today = todayStr();
  HALL.items = hallItems(today);
  const newEp = DATA.series.map((s) => ({ s, st: airState(s, today) })).filter((x) => x.st === 'new').sort((a, b) => lastOut(a.s, today).days - lastOut(b.s, today).days)[0];
  let ticket = '';
  if (newEp) {
    const lo = lastOut(newEp.s, today);
    ticket = `<div class="hticket" id="hticket"><a class="t1" href="#/s/${esc(newEp.s.id)}"><div style="min-width:0"><small>Новая серия · ${lo.days === 0 ? 'сегодня' : lo.days === 1 ? 'вчера' : lo.days + ' дн. назад'}</small><b>${esc(newEp.s.title)}</b><em>Серия ${lo.e.n}${newEp.s.total ? ' из ' + newEp.s.total : ''}${newEp.s.service ? ' · ' + esc(newEp.s.service) : ''}</em></div><div class="stampA">ПРОСМОТРЕНО</div></a><button type="button" class="t2" id="tear" data-sid="${esc(newEp.s.id)}"><div class="tx">НАДОРВАТЬ<br>БИЛЕТ</div></button></div>`;
  }
  let html = `<section class="hall" id="hall"><div class="beam"></div><canvas id="dust"></canvas>
    <div class="htop"><div class="hrow1"><div class="hbrand glass"><div class="hlogo"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg></div>GRACH FILMS</div><a class="hbtn glass" href="#/settings" aria-label="Настройки">${GEAR}</a></div>
    <div class="hchips" id="hchips"><button type="button" class="hchip on" data-hf="all" style="--c:#e9eefc"><i></i>Все</button><button type="button" class="hchip" data-hf="now" style="--c:#3dff9a"><i></i>Сейчас идёт</button><button type="button" class="hchip" data-hf="soon" style="--c:#ffd24d"><i></i>Скоро</button><button type="button" class="hchip" data-hf="film" style="--c:#a58bff"><i></i>Афиша</button></div></div>
    <div class="screenwrap"><div class="hglow"></div><div class="hstage" id="hstage"></div><div class="hrefl"></div></div>
    <div class="hinfo" id="hinfo"><h2 id="hit"></h2><p id="him"></p><div class="hbtns"><a class="go" id="hopen" href="#/list"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="#04101c"/></svg>Открыть</a><a class="glass gl" href="#/random">🎲 Случайный</a></div></div>
    ${ticket}
    <div class="seats"><svg viewBox="0 0 400 150" preserveAspectRatio="none"><g>${STAGE_SEATS}</g></svg></div></section><div class="below">`;
  html += weekRows(today);
  return html + '</div>';
};

function weekRows(today) {
  const states = DATA.series.map((s) => ({ s, st: airState(s, today) }));
  const lastDays = (s) => { const l = lastOut(s, today); return l ? l.days : 99; };
  const nd = (s) => (nextUnaired(s, today) || {}).date || '9999';
  const topRow = states.filter((x) => x.st === 'new' || x.st === 'soon').sort((a, b) => (a.st === b.st ? (a.st === 'new' ? lastDays(a.s) - lastDays(b.s) : nd(a.s) < nd(b.s) ? -1 : 1) : a.st === 'new' ? -1 : 1)).map((x) => x.s);
  const waitRow = states.filter((x) => x.st === 'wait').sort((a, b) => (nd(a.s) < nd(b.s) ? -1 : 1)).map((x) => x.s);
  let html = '';
  if (topRow.length) html += `<h2 class="hd">Выходят сейчас</h2><div class="hrow2">${topRow.map((s) => pcard(s, today, true)).join('')}</div>`;
  if (waitRow.length) html += `<h2 class="hd">Жду следующую серию</h2><div class="hrow2">${waitRow.map((s) => pcard(s, today, true)).join('')}</div>`;
  const wait = DATA.series.filter((s) => sState(s, today) === 'soon').sort((a, b) => { const x = nextEp(a, today), y = nextEp(b, today); return (x ? x.date : '9999') < (y ? y.date : '9999') ? -1 : 1; });
  if (wait.length) html += `<h2 class="hd">Сериалы скоро</h2><div class="hrow2">${wait.map((s) => pcard(s, today)).join('')}</div>`;
  const soonMovies = MOVIES.items.filter((m) => m.status !== 'watched' && m.date && m.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (soonMovies.length) html += `<h2 class="hd">Фильмы скоро</h2><div class="hrow2">${soonMovies.map((m) => `<a class="pcard" href="#/m/${esc(m.id)}">${poster(m)}<div class="bds"><span class="bl">${esc(movieBadge(m, today))}</span></div></a>`).join('')}</div>`;
  const prem = (DISC.items || []).filter((it) => !it.rec), recs = (DISC.items || []).filter((it) => it.rec);
  if (prem.length) html += `<h2 class="hd">Премьеры</h2><div class="hrow2">${prem.map((it) => `<a class="pcard" href="#/d/${esc(it.id)}">${poster(it)}<div class="bds">${it.rating ? `<span class="bd">★ ${esc(String(it.rating))}</span>` : ''}<span class="bl">${esc(it.date ? shortDate(it.date) : (it.when || 'ожидается'))}</span></div></a>`).join('')}</div>`;
  if (recs.length) html += `<h2 class="hd">Вам может понравиться</h2><div class="hrow2">${recs.map((it) => `<a class="pcard" href="#/d/${esc(it.id)}">${poster(it)}<div class="bds">${it.rating ? `<span class="bd">★ ${esc(String(it.rating))}</span>` : ''}<span class="bl">${it.kind === 'film' ? 'Фильм' : 'Сериал'}</span></div></a>`).join('')}</div>`;
  html += `<p class="foot">Данные обновлены ${esc(DATA.updated)}. Даты взяты из открытых источников и могут меняться.</p>`;
  return html;
}

function hallTheme(it) {
  const c = neonOf(it), r = document.documentElement.style;
  r.setProperty('--g', c); r.setProperty('--g2', shade(c, 0.32));
}
function hallPlace() {
  const stage = document.getElementById('hstage'); if (!stage) return;
  const n = HALL.list.length;
  [...stage.children].forEach((e, i) => {
    let k = i - HALL.idx; if (k > n / 2) k -= n; if (k < -n / 2) k += n; const a = Math.abs(k);
    e.style.transform = `translateX(${k * 64}%) translateZ(${-a * 150}px) rotateY(${-k * 42}deg) scale(${k === 0 ? 1.12 : 1})`;
    e.style.opacity = a > 2 ? 0 : 1 - a * 0.28;
    e.style.filter = k === 0 ? 'none' : `brightness(${0.55 - a * 0.1}) saturate(.8)`;
    e.style.zIndex = 10 - a; e.classList.toggle('cur', k === 0);
  });
}
function hallInfo(first) {
  const it = HALL.list[HALL.idx], el = document.getElementById('hinfo'); if (!it || !el) return;
  HALL.cur = it;
  const apply = () => { const t = document.getElementById('hit'); if (!t) return; t.textContent = it.title; document.getElementById('him').textContent = it.meta; document.getElementById('hopen').setAttribute('href', it.href); hallTheme(it); el.classList.remove('sw'); };
  if (first) apply(); else { el.classList.add('sw'); setTimeout(apply, 200); }
}
function hallGo(i) { const n = HALL.list.length; if (!n) return; HALL.idx = (i + n) % n; hallPlace(); hallInfo(false); const b = document.querySelector('.hall .beam'); if (b) { b.style.opacity = '1'; setTimeout(() => { b.style.opacity = ''; }, 130); } }
function hallBuild() {
  const stage = document.getElementById('hstage'); if (!stage) return;
  stage.innerHTML = '';
  HALL.list.forEach((it, i) => {
    const e = document.createElement('div'); const c = neonOf(it), [a, b] = PAL[hash(it.title) % PAL.length];
    e.className = 'pc' + (it.poster ? '' : ' noimg'); e.dataset.cid = neonKey(it); e.style.setProperty('--c', c); e.style.setProperty('--bgp', `linear-gradient(160deg,${a},${b})`);
    e.innerHTML = (it.poster ? `<img src="${esc(it.poster)}" alt="">` : '') + (it.badge ? `<i>${esc(it.badge)}</i>` : '') + (it.poster ? '' : `<span>${esc(it.title)}</span>`);
    e.onclick = () => { if (i === HALL.idx) location.hash = it.href; else { stopHallTimer(); hallGo(i); } };
    stage.appendChild(e);
  });
  hallPlace(); hallInfo(true);
}
function stopHallTimer() { clearInterval(HALL.timer); HALL.timer = null; }
function startHallTimer() { stopHallTimer(); HALL.timer = setInterval(() => { if (!document.getElementById('hall')) return stopHallTimer(); if (window.scrollY < 300 && !document.hidden) hallGo(HALL.idx + 1); }, 6500); }

function initHall() {
  stopHallTimer(); cancelAnimationFrame(HALL.raf);
  const hall = document.getElementById('hall'); if (!hall) return;
  HALL.filter = 'all'; HALL.list = HALL.items.slice(); HALL.idx = 0;
  hallBuild(); ensureColors(HALL.items.map((x) => x.src)); ensureColors((DISC.items || []));
  const stage = document.getElementById('hstage'); let sx = null;
  stage.addEventListener('pointerdown', (e) => { sx = e.clientX; stopHallTimer(); });
  stage.addEventListener('pointerup', (e) => { if (sx === null) return; const dx = e.clientX - sx; if (Math.abs(dx) > 40) hallGo(HALL.idx + (dx < 0 ? 1 : -1)); sx = null; });
  document.querySelectorAll('#hchips .hchip').forEach((b) => { b.onclick = () => {
    document.querySelectorAll('#hchips .hchip').forEach((x) => x.classList.toggle('on', x === b));
    const m = b.dataset.hf; HALL.list = m === 'all' ? HALL.items.slice() : HALL.items.filter((x) => x.k === m); if (!HALL.list.length) HALL.list = HALL.items.slice(); HALL.idx = 0;
    stage.style.opacity = 0; setTimeout(() => { hallBuild(); stage.style.opacity = 1; }, 240);
  }; });
  const tear = document.getElementById('tear');
  if (tear) tear.onclick = () => { document.getElementById('hticket').classList.add('torn'); setTimeout(() => markSeen(tear.dataset.sid, true), 1100); };
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
    HALL.raf = requestAnimationFrame(loop);
  };
  loop();
}

/* ---------- вступление и занавес (раз в день) ---------- */
let introChecked = false;
function maybeIntro() {
  if (introChecked) return; introChecked = true;
  const day = todayStr();
  if (params.get('nointro') || (!params.get('intro') && lsGet('intro_day') === day)) return;
  const today = todayStr();
  const n1 = DATA.series.filter((s) => effMine(s) === 'watching').length;
  const n2 = DATA.series.filter((s) => sState(s, today) === 'soon').length + MOVIES.items.filter((m) => m.status !== 'watched' && m.date && m.date >= today).length;
  const n3 = DATA.series.filter((s) => airState(s, today) === 'new').length;
  let i = 0; const title = ['Grach', 'films'].map((w) => `<span class="ln">${[...w].map((ch) => `<span class="ch" style="--i:${i++}">${ch}</span>`).join('')}</span>`).join('');
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="curt cl"></div><div class="curt cr"></div><section id="intro"><div class="ibox"><div class="kick">Личный кинозал</div><h1 id="ititle" aria-label="Grach films">${title}</h1><p class="ilead">Все ваши сериалы и фильмы на одном экране: что смотрите, что скоро выйдет и что посмотреть сегодня вечером.</p><div class="istats"><div><b data-to="${n1}">0</b><small>смотрю</small></div><div><b data-to="${n2}">0</b><small>ждут выхода</small></div><div><b data-to="${n3}">0</b><small>новых серий</small></div></div><button type="button" class="go" id="ienter">Войти в зал <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#04101c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div></section>`;
  while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('.istats b').forEach((el) => { const to = +el.dataset.to; let s = null; const f = (t) => { if (!s) s = t; const p = Math.min(1, (t - s) / 1200); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); }; setTimeout(() => requestAnimationFrame(f), 1300); });
  document.getElementById('ienter').onclick = () => {
    lsSet('intro_day', day);
    document.getElementById('intro').classList.add('hide');
    setTimeout(() => { document.body.classList.add('cur-open'); setTimeout(() => { document.body.style.overflow = ''; document.querySelectorAll('.curt,#intro').forEach((e) => e.remove()); document.body.classList.remove('cur-open'); }, 2400); }, 500);
  };
}

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
  let html = `<div class="cvh"><h1>Сеансы</h1><p class="sub" style="margin:6px 0 0">Ближайшие выходы на табло</p></div><div class="board"><div class="bh"><b>БЛИЖАЙШИЕ</b><span>ЗАЛ 1</span></div><div id="rows">`;
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
  if (page === 'week') { initHall(); maybeIntro(); } else { stopHallTimer(); }
  if (page === 'cal') initBoard();
  if (page === 's') initSeries(decodeURIComponent((location.hash.split('/')[2] || '')));
}
