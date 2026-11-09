'use strict';
/* Cinema Noir: single release-state model; release dates never mean a title was watched. */
const gfMoscowNow = () => new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
const gfInfo = (item,kind,today=todayStr()) => GFReleases.describe({...item,kind:kind==='m'?'movie':'series'},today,gfMoscowNow());
const gfArchiveKey = (kind,id) => 'gf_archive_v1:'+kind+':'+id;
const gfArchived = (item,kind,info=gfInfo(item,kind)) => GFReleases.hiddenByManual(info,lsGet(gfArchiveKey(kind,item.id)));
const gfArchiveButton = (item,kind,info=gfInfo(item,kind)) => !info.eligibleArchive ? '' :
  '<button class="gf-archive-action" type="button" data-act="gfarchive" data-kind="'+kind+'" data-id="'+esc(item.id)+'">'+
  (gfArchived(item,kind,info)?'↶ Вернуть из архива':'↗ Убрать в архив')+'</button>';
const gfDecor = (info) => '<span class="gf-release-label">'+esc(info.label)+'</span><span class="gf-release-detail">'+esc(info.detail)+'</span>';
const gfHeader = (label) => '<header class="gf-header"><div><div class="gf-eyebrow">GRACH FILMS / PRIVATE CINEMA</div><h1>'+esc(label)+'</h1></div><div class="gf-actions"><a href="#/random" class="gf-icon" aria-label="Случайный фильм или сериал">'+DICE+'</a><a href="#/settings" class="gf-icon" aria-label="Настройки">'+GEAR+'</a></div></header>';
const gfEntries = (today) => [
  ...(DATA.series||[]).map(obj=>({obj,kind:'s',info:gfInfo(obj,'s',today)})),
  ...(MOVIES.items||[]).map(obj=>({obj,kind:'m',info:gfInfo(obj,'m',today)}))
];
const gfOrder = (a,b) => {
  const tier={new:0,soon:1,archive:2};
  const t=tier[a.info.group]-tier[b.info.group];if(t)return t;
  if(a.info.group==='soon')return (a.info.sortDate||'9999').localeCompare(b.info.sortDate||'9999');
  return (b.info.sortDate||'').localeCompare(a.info.sortDate||'')||a.obj.title.localeCompare(b.obj.title,'ru');
};
function gfCard(it,compact=false){
  const {obj,kind,info}=it;
  const link='#/'+(kind==='m'?'m':'s')+'/'+encodeURIComponent(obj.id);
  const archived=gfArchived(obj,kind,info)||info.group==='archive';
  return '<a class="'+(compact?'gf-grid-card':'gf-card')+(archived?' gf-archived':'')+'" href="'+esc(link)+'">'+
    '<div class="gf-poster-wrap">'+poster(obj)+'<span class="gf-poster-badge">'+esc(info.label)+'</span></div>'+
    '<strong>'+esc(obj.title)+'</strong><span class="gf-card-meta">'+esc(info.detail)+'</span></a>';
}
function gfSection(title,subtitle,items,more){
  if(!items.length)return '';
  return '<section class="gf-block"><div class="gf-block-head"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div>'+
  (more?'<a href="'+esc(more)+'">Все ›</a>':'')+'</div><div class="gf-rail">'+items.slice(0,14).map(x=>gfCard(x)).join('')+'</div></section>';
}
function viewWeek(){
  const today=todayStr(), entries=gfEntries(today).filter(x=>!gfArchived(x.obj,x.kind,x.info)).sort(gfOrder);
  const news=entries.filter(x=>x.kind==='s'&&x.info.group==='new');
  const filmPremieres=entries.filter(x=>x.kind==='m'&&x.info.group==='new');
  const soon=entries.filter(x=>x.info.group==='soon');
  const recommendations=(DISC.items||[]).filter(x=>x.rec&&!inCollection(x)).slice(0,8).map(obj=>({obj,kind:obj.kind==='film'?'m':'s',info:gfInfo({...obj,date:obj.date||''},obj.kind==='film'?'m':'s',today),href:'#/d/'+encodeURIComponent(obj.id)}));
  const recHTML=recommendations.length?'<section class="gf-block"><div class="gf-block-head"><div><h2>Рекомендации</h2><p>Что ещё посмотреть</p></div><a href="#/discover">Все ›</a></div><div class="gf-rail">'+
    recommendations.map(x=>'<a class="gf-card" href="'+x.href+'"><div class="gf-poster-wrap">'+poster(x.obj)+'</div><strong>'+esc(x.obj.title)+'</strong><span class="gf-card-meta">Для тебя</span></a>').join('')+'</div></section>':'';
  return '<div class="gf-shell">'+gfHeader('Твой кинозал')+
    gfSection('Новые серии','Вышли за последние 13 дней',news)+
    gfSection('Скоро выйдет','Подтверждённые даты следующих релизов',soon)+
    gfSection('Премьеры фильмов','Недавние релизы из твоей коллекции',filmPremieres)+recHTML+
    (!news.length&&!filmPremieres.length&&!soon.length?'<p class="gf-empty">Сейчас нет недавних или ожидаемых релизов. Вся коллекция — во вкладке «Моё».</p>':'')+
    '<p class="gf-version">Расписание: '+esc(DATA.updated||'не указано')+' · v'+APP_V+'</p></div>';
}
function viewMine(section){
  const active=['series','movies','server'].includes(section)?section:'series';
  const s=DATA.series||[],m=MOVIES.items||[];
  const nav=[['series','Сериалы',s.length],['movies','Фильмы',m.length],['server','Мой сервер',jfItems?.length||'']];
  let body='';
  if(active==='server'){
    body='<div class="gf-server-note">Отдельная медиатека Jellyfin. Данные сервера не смешиваются с коллекцией.</div>'+
      '<input class="gf-search" id="sq" type="search" placeholder="Поиск на сервере" value="'+esc(sq)+'">'+
      chipRow([['all','Все'],['Movie','Фильмы'],['Series','Сериалы']],jfkind,'data-jfkind')+viewJfServer();
  }else{
    const entries=(active==='series'?s.map(obj=>({obj,kind:'s',info:gfInfo(obj,'s')})):m.map(obj=>({obj,kind:'m',info:gfInfo(obj,'m')})))
      .filter(x=>hit(x.obj.title)).sort((a,b)=>{
        const aa=gfArchived(a.obj,a.kind,a.info)||a.info.group==='archive';
        const bb=gfArchived(b.obj,b.kind,b.info)||b.info.group==='archive';
        return Number(aa)-Number(bb)||gfOrder(a,b);
      });
    const current=entries.filter(x=>!(gfArchived(x.obj,x.kind,x.info)||x.info.group==='archive'));
    const old=entries.filter(x=>gfArchived(x.obj,x.kind,x.info)||x.info.group==='archive');
    body='<div class="gf-collection-toolbar"><span class="gf-subtle">Актуальное — сначала</span><div class="gf-toolbar-actions"><a class="gf-add" href="#/search">Поиск</a><a class="gf-add gf-add-primary" href="'+(active==='series'?'#/add':'#/addm')+'">+ Добавить</a></div></div>'+
    '<input class="gf-search" id="sq" type="search" placeholder="Поиск по коллекции" value="'+esc(sq)+'">'+
    '<div class="gf-collection-title">Актуальное <span>'+current.length+'</span></div>'+
    '<div class="gf-grid">'+current.map(x=>gfCard(x,true)).join('')+'</div>'+
    (current.length?'':'<p class="gf-hint">Пока нет актуальных релизов.</p>')+
    '<div class="gf-collection-title gf-archive-title">Архив <span>'+old.length+'</span></div>'+
    '<div class="gf-grid">'+old.map(x=>gfCard(x,true)).join('')+'</div>'+
    (old.length?'':'<p class="gf-hint">Архив пока пуст.</p>');
  }
  return '<div class="gf-shell">'+gfHeader('Моё')+'<div class="gf-collection-nav">'+nav.map(([id,label,count])=>'<a class="gf-collection-tile'+(id===active?' selected':'')+'" href="#/mine/'+id+'"><strong>'+label+'</strong><span>'+count+(id==='server'?' · Jellyfin':' в коллекции')+'</span></a>').join('')+'</div>'+body+
    '<p class="gf-version">v'+APP_V+'</p></div>';
}
function viewSearch(){
  const q=sq.trim().toLowerCase();
  const own=[...(DATA.series||[]).map(obj=>({obj,kind:'s',info:gfInfo(obj,'s')})),...(MOVIES.items||[]).map(obj=>({obj,kind:'m',info:gfInfo(obj,'m')}))].filter(x=>q&&x.obj.title.toLowerCase().includes(q));
  const existing=new Set(own.map(x=>x.obj.title.toLowerCase()));
  const discovered=(DISC.items||[]).filter(x=>q&&x.title.toLowerCase().includes(q)&&!existing.has(x.title.toLowerCase()));
  return '<div class="gf-shell">'+gfHeader('Поиск')+'<input class="gf-search" id="sq" type="search" placeholder="Фильм или сериал" value="'+esc(sq)+'" autofocus>'+
    (q?'<div class="gf-collection-title">В твоей коллекции</div><div class="gf-grid">'+own.map(x=>gfCard(x,true)).join('')+'</div>':'<p class="gf-hint">Поиск по твоей коллекции и рекомендациям.</p>')+
    (q&&discovered.length?'<div class="gf-collection-title">Из подборок</div><div class="gf-grid">'+discovered.map(obj=>'<a class="gf-grid-card" href="#/d/'+encodeURIComponent(obj.id)+'"><div class="gf-poster-wrap">'+poster(obj)+'</div><strong>'+esc(obj.title)+'</strong></a>').join('')+'</div>':'')+
    '<div class="gf-shortcuts"><a href="#/add">+ Добавить сериал</a><a href="#/addm">+ Добавить фильм</a></div></div>';
}
