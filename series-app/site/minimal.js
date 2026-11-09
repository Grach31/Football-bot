'use strict';
/* Grach Films v70: two destinations, one collection model, independent Jellyfin server.
   Retains all legacy routes and their editing capabilities. */
const gfSection = (title, subtitle, items, more) => {
  if (!items.length) return '';
  const cards = items.slice(0, 12).map((it) => {
    const obj = it.obj || it, href = it.href || (it.kind === 'm' ? '#/m/' : '#/s/') + encodeURIComponent(obj.id);
    const tag = it.tag || '', meta = it.meta || (it.kind === 'm' ? 'Фильм' : 'Сериал');
    return `<a class="gf-card" href="${esc(href)}">${poster(obj)}<strong>${esc(obj.title)}</strong><span>${esc(meta)}</span>${tag ? `<em>${esc(tag)}</em>` : ''}</a>`;
  }).join('');
  return `<section class="gf-block"><div class="gf-block-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${more ? `<a href="${esc(more)}" aria-label="Открыть раздел ${esc(title)}">Все ›</a>` : ''}</div><div class="gf-rail">${cards}</div></section>`;
};
const gfHeader = (label) => `<header class="gf-header"><div><div class="gf-eyebrow">GRACH FILMS</div><h1>${esc(label)}</h1></div><div class="gf-actions"><a href="#/search" class="gf-icon" aria-label="Поиск">${MAGN}</a><a href="#/settings" class="gf-icon" aria-label="Настройки">${GEAR}</a></div></header>`;
const gfSeriesDate = (s) => (s.episodes || []).map(e => e.date).filter(Boolean).sort()[0] || s.date || '';
const gfSeriesNext = (s, today) => (s.episodes || []).filter(e => e.date > today).sort((a,b) => a.date.localeCompare(b.date))[0];
const gfRecent = (d,today) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && d <= today && addDays(d, 13) >= today;

viewWeek = function () {
  const today = todayStr();
  const series = DATA.series || [], movies = MOVIES.items || [];
  const watching = [
    ...series.filter(s => effMine(s) === 'watching').map(s => ({obj:s,kind:'s',tag:airState(s,today)==='new'?'Новая серия':''})),
    ...movies.filter(m => m.status === 'watching').map(m => ({obj:m,kind:'m'}))
  ];
  const fresh = [
    ...series.filter(s => effMine(s)!=='done' && s.status === 'airing' && airState(s,today)==='new')
      .map(s => ({obj:s,kind:'s',tag:'Новая серия',date:(lastOut(s,today)||{}).e?.date||today})),
    ...series.filter(s => effMine(s)==='want' && gfRecent(gfSeriesDate(s),today) && s.status !== 'nodate' && s.status !== 'waiting')
      .map(s => ({obj:s,kind:'s',tag:'Премьера',date:gfSeriesDate(s)})),
    ...movies.filter(m => m.status === 'want' && gfRecent(m.date,today))
      .map(m => ({obj:m,kind:'m',tag:'Премьера',date:m.date}))
  ].sort((a,b)=>b.date.localeCompare(a.date)).filter((it,i,arr)=>arr.findIndex(z=>z.kind===it.kind&&z.obj.id===it.obj.id)===i);
  const upcoming = [
    ...series.filter(s=>effMine(s)==='want').map(s=>({obj:s,kind:'s',date:gfSeriesNext(s,today)?.date||((gfSeriesDate(s)>today)?gfSeriesDate(s):'')})),
    ...movies.filter(m=>m.status==='want'&&m.date>today).map(m=>({obj:m,kind:'m',date:m.date}))
  ].filter(x=>x.date).sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({...x,tag:shortDate(x.date)}));
  const recommendations = (DISC.items || []).filter(it=>it.rec).slice(0,5).map(it=>({obj:it,kind:it.kind==='film'?'m':'s',href:'#/d/'+encodeURIComponent(it.id),tag:'Для тебя',meta:it.kind==='film'?'Фильм':'Сериал'}));
  const empty = '<div class="gf-empty">Здесь пока нет записей. Добавь фильм или сериал через поиск.</div>';
  return `<div class="gf-shell">${gfHeader('Твой кинозал')}
    <div class="gf-feature"><div class="gf-feature-title">Сегодня в твоём кино</div><p>Новые серии, премьеры и всё, что ты собираешься посмотреть.</p><a href="#/search" class="gf-primary">Найти фильм или сериал ›</a></div>
    ${gfSection('Продолжить просмотр','То, что ты смотришь',watching,'#/mine/series')}
    ${gfSection('Новое для тебя','Вышедшие серии и премьеры из твоего списка',fresh,'#/mine/series')}
    ${gfSection('Скоро выйдет','Подтверждённые ближайшие даты',upcoming,'#/cal')}
    ${gfSection('Рекомендации','Подобрано по твоей истории просмотров',recommendations,'#/discover')}
    ${!watching.length&&!fresh.length&&!upcoming.length?empty:''}
    <div class="gf-shortcuts"><a href="#/cal">Календарь премьер ›</a><a href="#/random">Подобрать случайное ›</a></div>
    <p class="gf-version">Данные: ${esc(DATA.updated)} · Версия ${APP_V}</p>
  </div>`;
};
function viewMine(section) {
  const active = ['series','movies','server'].includes(section) ? section : 'series';
  const s = DATA.series || [], m = MOVIES.items || [];
  const watchedS = s.filter(x=>effMine(x)==='done').length, watchedM = m.filter(x=>x.status==='watched').length;
  const tabs = [['series','Сериалы',s.length],['movies','Фильмы',m.length],['server','Мой сервер',jfItems?.length||'']];
  const nav = tabs.map(([id,label,count])=>`<a class="gf-collection-tile${active===id?' selected':''}" href="#/mine/${id}"><strong>${label}</strong><span>${count!==''?count+' · ':''}${id==='server'?'Jellyfin':id==='series'?watchedS+' просмотрено':watchedM+' просмотрено'}</span></a>`).join('');
  const filters = [['all','Все'],['want','Хочу'],['watching','Смотрю'],['done','Посмотрел']];
  const filterNav = filters.map(([id,label])=>`<button type="button" class="gf-filter${mineStatus===id?' selected':''}" data-mine-status="${id}">${label}</button>`).join('');
  let body = '';
  if (active === 'server') {
    body = `<div class="gf-server-note">Твоя медиатека Jellyfin. Серверные фильмы не смешиваются с личными списками.</div>
       <input class="gf-search" id="sq" type="search" placeholder="Поиск на сервере" value="${esc(sq)}">
       ${chipRow([['all','Все'],['Movie','Фильмы'],['Series','Сериалы']],jfkind,'data-jfkind')}
       ${viewJfServer()}`;
  } else {
    const src = active==='series'?s:m;
    const status = x => active==='series'?effMine(x):(x.status==='watched'?'done':x.status==='watching'?'watching':'want');
    const rows = src.filter(x=>(mineStatus==='all'||status(x)===mineStatus)&&hit(x.title));
    body = `<div class="gf-collection-toolbar"><div class="gf-filters">${filterNav}</div><a href="${active==='series'?'#/add':'#/addm'}" class="gf-add">+ Добавить</a></div>
      <input class="gf-search" id="sq" type="search" placeholder="Поиск в ${active==='series'?'сериалах':'фильмах'}" value="${esc(sq)}">
      <div class="gf-grid">${rows.map(x=>`<a class="gf-grid-card" href="#/${active==='series'?'s':'m'}/${encodeURIComponent(x.id)}">${poster(x)}<strong>${esc(x.title)}</strong><small>${status(x)==='done'?'Посмотрел':status(x)==='watching'?'Смотрю':'Хочу посмотреть'}</small></a>`).join('')}</div>
      ${rows.length?'':'<p class="gf-empty">В этом разделе пока ничего нет.</p>'}`;
  }
  return `<div class="gf-shell">${gfHeader('Моё')}<div class="gf-collection-nav">${nav}</div>${body}<p class="gf-version">Версия ${APP_V}</p></div>`;
}
function viewSearch() {
  const q=sq.trim().toLowerCase();
  const own=[
    ...(DATA.series||[]).map(x=>({obj:x,kind:'s'})),
    ...(MOVIES.items||[]).map(x=>({obj:x,kind:'m'}))
  ].filter(x=>q&&x.obj.title.toLowerCase().includes(q));
  const existing=new Set(own.map(x=>x.obj.title.toLowerCase()));
  const suggested=(DISC.items||[]).filter(x=>q&&x.title.toLowerCase().includes(q)&&!existing.has(x.title.toLowerCase()))
    .map(x=>({obj:x,href:'#/d/'+encodeURIComponent(x.id),kind:x.kind==='film'?'m':'s',meta:x.kind==='film'?'Фильм':'Сериал'}));
  return `<div class="gf-shell">${gfHeader('Поиск')}
    <input class="gf-search" id="sq" type="search" placeholder="Название фильма или сериала" value="${esc(sq)}" autofocus>
    ${q?gfSection('В твоей коллекции',own.length+' найдено',own):'<p class="gf-hint">Найди уже добавленное или добавь новый фильм или сериал.</p>'}
    ${q?gfSection('Из подборок',suggested.length+' найдено',suggested):''}
    ${q&&!own.length&&!suggested.length?'<p class="gf-empty">Не найдено в сохранённых данных. Можно добавить вручную.</p>':''}
    <div class="gf-shortcuts"><a href="#/add">+ Добавить сериал</a><a href="#/addm">+ Добавить фильм</a><a href="#/random">Открыть рекомендации</a></div>
    <p class="gf-version">Версия ${APP_V}</p></div>`;
}
