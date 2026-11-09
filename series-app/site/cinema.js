'use strict';
/* Grach Films: poster theme, series details and credits. Navigation and home live in minimal.js. */

const APP_V = '71';
const NEON = ['#ff8a3d', '#ffd24d', '#3dff9a', '#ff5d8f', '#4d8bff', '#a58bff', '#3dd5ff', '#ff6b6b'];
let NEON_CACHE = {};
try { NEON_CACHE = JSON.parse(localStorage.getItem('neon_cache') || '{}'); } catch (e) { NEON_CACHE = {}; }
const neonKey = (s) => String(s.id || s.title);
const neonOf = (s) => NEON_CACHE[neonKey(s)] || NEON[hash(s.title || neonKey(s)) % NEON.length];
/* общий постер: неоновая рамка своего цвета */
poster = function (s) {
  const [a, b] = PAL[hash(s.title) % PAL.length];
  const c = neonOf(s);
  const inner = s.poster ? `<img src="${esc(s.poster)}" alt="" loading="lazy" decoding="async">` : `<span class="ptitle">${esc(s.title)}</span>`;
  return `<div class="poster" data-cid="${esc(neonKey(s))}" style="--pc:${c};background:linear-gradient(160deg,${a},${b})" role="img" aria-label="${esc(s.title)}">${inner}</div>`;
};

/* Icons shared by the compact header; the retired carousel and intro were removed. */
const MAGN = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
const GEAR = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

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

/* ---------- после каждой отрисовки ---------- */
function afterRender(page) {
  const nav = document.getElementById('tabs');
  if (nav) {
    if (!nav.querySelector('.npill')) { const p = document.createElement('i'); p.className = 'npill'; nav.prepend(p); }
    const links = [...nav.querySelectorAll('a')], k = links.findIndex((a) => a.classList.contains('on'));
    const p = nav.querySelector('.npill'); if (p) p.style.transform = k < 0 ? 'translateX(-200%)' : `translateX(${k * 100}%)`;
  }
  if (page !== 's') document.documentElement.style.removeProperty('--g');
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
