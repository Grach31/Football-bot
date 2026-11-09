'use strict';
/* Grach Films: poster theme, series details and credits. Navigation and home live in minimal.js. */

const APP_V = '74.3';
const NEON = ['#ff8a3d', '#ffd24d', '#3dff9a', '#ff5d8f', '#4d8bff', '#a58bff', '#3dd5ff', '#ff6b6b'];
const neonKey = (s) => String(s.id || s.title);
const neonOf = (s) => NEON[hash(s.title || neonKey(s)) % NEON.length];
/* общий постер: неоновая рамка своего цвета */
function poster(s) {
  const [a, b] = PAL[hash(s.title) % PAL.length];
  const c = neonOf(s);
  const inner = s.poster ? `<img src="${esc(s.poster)}" alt="" loading="lazy" decoding="async">` : `<span class="ptitle">${esc(s.title)}</span>`;
  return `<div class="poster" data-cid="${esc(neonKey(s))}" style="--pc:${c};background:linear-gradient(160deg,${a},${b})" role="img" aria-label="${esc(s.title)}">${inner}</div>`;
}

/* Settings icon shared by the compact header. The random icon is DICE in app.js. */
const GEAR = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

/* Series details: release timeline only, no watched/unwatched buttons or credits. */
function viewSeries(id){
  const s=DATA.series.find(x=>x.id===id);
  if(!s)return '<a class="back" href="#/mine/series">‹ Сериалы</a><p class="empty">Сериал не найден.</p>';
  const info=gfInfo(s,'s'), col=neonOf(s);
  const total=info.total||0;
  const events=(s.episodes||[]).filter(e=>e&&e.date&&Number(e.n)>0).slice().sort(byAirDate);
  const today=todayStr();
  const episodes=events.length?'<section class="gf-detail-section"><h2>Календарь серий</h2><div class="gf-episode-list">'+events.map(e=>{
    const out=GFReleases.isOut(e,today,gfMoscowNow());
    return '<div class="gf-episode'+(out?' aired':'')+'"><span class="gf-ep-number">'+esc(e.n)+'</span><div><strong>Серия '+esc(e.n)+(total?' из '+total:'')+'</strong><small>'+esc(longDate(e.date))+(e.time?' · '+esc(e.time)+' МСК':'')+'</small></div><span class="gf-ep-status">'+(out?'Вышла':'Ожидается')+'</span></div>';
  }).join('')+'</div></section>':'<p class="gf-hint">Расписание эпизодов пока не объявлено.</p>';
  return '<div class="gf-detail"><a class="back" href="#/mine/series">‹ Сериалы</a><div class="gf-detail-head">'+
    (s.poster?'<img class="gf-detail-poster" src="'+esc(s.poster)+'" alt="">':'<div class="gf-detail-poster gf-detail-placeholder" style="--pc:'+col+'">'+esc(s.title)+'</div>')+
    '<div class="gf-detail-text"><div class="gf-eyebrow">GRACH FILMS · СЕРИАЛ</div><h1>'+esc(s.title)+'</h1>'+
    '<p class="gf-detail-meta">'+(s.season?'Сезон '+esc(s.season)+' · ':'')+esc(s.service||'Моя коллекция')+'</p>'+
    '<div class="gf-detail-state">'+gfDecor(info)+'</div></div></div>'+
    (s.note?'<p class="gf-detail-note">'+esc(s.note)+'</p>':'')+
    jfWatch(s.title)+
    gfWatchingButton(s)+
    (gfArchived(s,'s',info)?'<p class="gf-archived-info">Убран с главной на этом устройстве</p>':'')+
    gfArchiveButton(s,'s',info)+episodes+
    '<div class="gf-detail-foot">Расписание обновляется автоматически. Выход серии не означает просмотр.</div></div>';
}
function afterRender(page){
  const nav=document.getElementById('tabs');
  if(nav){
    if(!nav.querySelector('.npill')){const p=document.createElement('i');p.className='npill';nav.prepend(p);}
    const links=[...nav.querySelectorAll('a')],k=links.findIndex(a=>a.classList.contains('on'));
    const p=nav.querySelector('.npill');if(p)p.style.transform=k<0?'translateX(-200%)':'translateX('+(k*100)+'%)';
  }
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
