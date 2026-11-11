'use strict';
/* Cinema Noir: single release-state model; release dates never mean a title was watched. */
const gfMoscowNow = () => new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
const gfInfo = (item,kind,today=todayStr()) => GFReleases.describe({...item,kind:kind==='m'?'movie':'series'},today,gfMoscowNow());
const gfArchiveKey = (kind,id) => 'gf_archive_v1:'+kind+':'+id;
const gfArchived = (item,kind,info=gfInfo(item,kind)) => GFReleases.hiddenByManual(info,lsGet(gfArchiveKey(kind,item.id)));
const gfArchiveButton = (item,kind,info=gfInfo(item,kind)) => (!info.eligibleArchive || info.group==='archive') ? '' :
  '<button class="gf-archive-action" type="button" data-act="gfarchive" data-kind="'+kind+'" data-id="'+esc(item.id)+'">'+
  (gfArchived(item,kind,info)?'↶ Вернуть из архива':'↗ Убрать в архив')+'</button>';
// Personal viewing list, intentionally independent of release dates and manual archive.
const gfWatchingKey = (kind,id) => 'gf_watching_v1:'+kind+':'+id;
const gfWatching = (item,kind='s') => { const local = lsGet(gfWatchingKey(kind,item.id)); return local === '1' ? true : local === '0' ? false : item.watching === true; };
const gfWatchingButton = (item,kind='s',info=gfInfo(item,kind)) =>
  (kind==='m'&&!info.eligibleArchive?'':'<button type="button" class="gf-watching-action'+(gfWatching(item,kind)?' is-watching':'')+
  '" data-act="gfwatching" data-kind="'+kind+'" data-id="'+esc(item.id)+'" aria-pressed="'+(gfWatching(item,kind)?'true':'false')+'">'+
  (gfWatching(item,kind)?'✓ Закончил смотреть':'▶ Смотрю сейчас')+'</button>');
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
  const canToggle=kind==='s'||info.eligibleArchive||gfWatching(obj,kind);
  const selected=gfWatching(obj,kind);
  const toggle=canToggle?'<button type="button" class="gf-card-watch'+(selected?' is-watching':'')+'" data-act="gfwatching" data-kind="'+kind+'" data-id="'+esc(obj.id)+'" aria-label="'+esc((selected?'Закончил смотреть: ':'Смотрю сейчас: ')+obj.title)+'" aria-pressed="'+selected+'" title="'+(selected?'Закончил смотреть':'Смотрю сейчас')+'">'+(selected?'✓':'▶')+'</button>':'';
  return '<div class="gf-poster-card">'+
    '<a class="'+(compact?'gf-grid-card':'gf-card')+(archived?' gf-archived':'')+'" href="'+esc(link)+'">'+
    '<div class="gf-poster-wrap">'+poster(obj)+'<span class="gf-poster-badge">'+esc(info.label)+'</span></div>'+
    '<strong>'+esc(obj.title)+'</strong><span class="gf-card-meta">'+esc(info.detail)+'</span></a>'+
    toggle+'</div>';
}
function gfSection(title,subtitle,items,more){
  if(!items.length)return '';
  return '<section class="gf-block"><div class="gf-block-head"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div>'+
  (more?'<a href="'+esc(more)+'">Все ›</a>':'')+'</div><div class="gf-rail">'+items.slice(0,14).map(x=>gfCard(x)).join('')+'</div></section>';
}
function viewWeek(){
  const today=todayStr(), all=gfEntries(today).sort(gfOrder);
  const watching=all.filter(x=>gfWatching(x.obj,x.kind));
  const entries=all.filter(x=>!gfWatching(x.obj,x.kind)&&!gfArchived(x.obj,x.kind,x.info));
  const news=entries.filter(x=>x.kind==='s'&&x.info.group==='new');
  const filmPremieres=entries.filter(x=>x.kind==='m'&&x.info.group==='new');
  const soon=entries.filter(x=>x.info.group==='soon');
  const recommendations=(DISC.items||[]).filter(x=>x.rec&&!inCollection(x)).slice(0,8).map(obj=>({obj,kind:obj.kind==='film'?'m':'s',info:gfInfo({...obj,date:obj.date||''},obj.kind==='film'?'m':'s',today),href:'#/d/'+encodeURIComponent(obj.id)}));
  const recHTML=recommendations.length?'<section class="gf-block"><div class="gf-block-head"><div><h2>Рекомендации</h2><p>Что ещё посмотреть</p></div><a href="#/discover">Все ›</a></div><div class="gf-rail">'+
    recommendations.map(x=>'<a class="gf-card" href="'+x.href+'"><div class="gf-poster-wrap">'+poster(x.obj)+'</div><strong>'+esc(x.obj.title)+'</strong><span class="gf-card-meta">Для тебя</span></a>').join('')+'</div></section>':'';
  return '<div class="gf-shell">'+gfHeader('Твой кинозал')+
    gfSection('Смотрю сейчас','Твои сериалы и фильмы · независимо от даты релиза',watching)+
    gfSection('Новые серии','Вышли за последние 13 дней',news)+
    gfSection('Скоро выйдет','Подтверждённые даты следующих релизов',soon)+
    gfSection('Премьеры фильмов','Недавние релизы из твоей коллекции',filmPremieres)+recHTML+
    (!news.length&&!filmPremieres.length&&!soon.length?'<p class="gf-empty">Сейчас нет недавних или ожидаемых релизов. Вся коллекция — во вкладке «Моё».</p>':'')+
    '<p class="gf-version">Расписание: '+esc(DATA.updated||'не указано')+' · v'+APP_V+'</p></div>';
}
function gfSearchServer(q){
  if(!jfBase()||!lsGet('jf_token'))return '';
  if(jfItems===null){
    if(!jfLoading&&!jfErr)setTimeout(jfLoad,0);
    return '<section class="gf-search-group"><h2>Мой сервер · Jellyfin</h2><p class="gf-hint">'+esc(jfErr||'Загружаю медиатеку сервера…')+'</p></section>';
  }
  const found=jfItems.filter(x=>(x.Name||'').toLocaleLowerCase('ru').includes(q));
  if(!found.length)return '';
  const base=jfBase();
  return '<section class="gf-search-group"><h2>Мой сервер · Jellyfin <span>'+found.length+'</span></h2><div class="gf-grid">'+
    found.map(x=>{
      const img=x.ImageTags&&x.ImageTags.Primary?base+'/Items/'+encodeURIComponent(x.Id)+'/Images/Primary?maxWidth=400&quality=85&tag='+encodeURIComponent(x.ImageTags.Primary):'';
      const url=base+'/web/#/details?id='+encodeURIComponent(x.Id);
      return '<a class="gf-grid-card" href="'+esc(url)+'" target="_blank" rel="noopener">'+
        '<div class="gf-poster-wrap">'+poster({title:x.Name,poster:img})+'</div><strong>'+esc(x.Name)+'</strong>'+
        '<span class="gf-card-meta">'+(x.Type==='Series'?'Сериал':'Фильм')+' · Jellyfin</span></a>';
    }).join('')+'</div></section>';
}
function gfSearchAll(){
  const q=sq.trim().toLocaleLowerCase('ru');
  const groups=[
    ['Сериалы',(DATA.series||[]).map(obj=>({obj,kind:'s',info:gfInfo(obj,'s')}))],
    ['Фильмы',(MOVIES.items||[]).map(obj=>({obj,kind:'m',info:gfInfo(obj,'m')}))]
  ];
  const own=groups.map(([label,entries])=>[label,entries.filter(x=>(x.obj.title||'').toLocaleLowerCase('ru').includes(q)).sort(gfOrder)]);
  const server=gfSearchServer(q);
  const found=own.reduce((sum,[,entries])=>sum+entries.length,0);
  return '<div class="gf-search-results">'+own.filter(([,entries])=>entries.length).map(([label,entries])=>
    '<section class="gf-search-group"><h2>'+label+' <span>'+entries.length+'</span></h2><div class="gf-grid">'+entries.map(x=>gfCard(x,true)).join('')+'</div></section>'
  ).join('')+server+(!found&&!server?'<p class="gf-hint">В коллекции ничего не найдено.</p>':'')+'</div>';
}
function viewMine(section){
  const active=['series','movies','server'].includes(section)?section:'series';
  const s=DATA.series||[],m=MOVIES.items||[];
  const nav=[['series','Сериалы',s.length],['movies','Фильмы',m.length],['server','Мой сервер',jfItems?.length||'']];
  const query=sq.trim();
  const search='<label class="gf-search-label" for="sq">Поиск по всей медиатеке</label>'+
    '<input class="gf-search" id="sq" type="search" placeholder="Сериалы, фильмы и Jellyfin" aria-label="Поиск по всей медиатеке" value="'+esc(sq)+'" autocomplete="off">';
  let body='';
  if(query){
    body=gfSearchAll();
  }else if(active==='server'){
    body='<div class="gf-server-note">Отдельная медиатека Jellyfin. Общий поиск выше также ищет по серверу после подключения.</div>'+
      chipRow([['all','Все'],['Movie','Фильмы'],['Series','Сериалы']],jfkind,'data-jfkind')+viewJfServer();
  }else{
    const entries=(active==='series'?s.map(obj=>({obj,kind:'s',info:gfInfo(obj,'s')})):m.map(obj=>({obj,kind:'m',info:gfInfo(obj,'m')})))
      .sort((a,b)=>{
        const aa=gfArchived(a.obj,a.kind,a.info)||a.info.group==='archive';
        const bb=gfArchived(b.obj,b.kind,b.info)||b.info.group==='archive';
        return Number(aa)-Number(bb)||gfOrder(a,b);
      });
    const current=entries.filter(x=>!(gfArchived(x.obj,x.kind,x.info)||x.info.group==='archive'));
    const old=entries.filter(x=>gfArchived(x.obj,x.kind,x.info)||x.info.group==='archive');
    body='<div class="gf-collection-title">Актуальное <span>'+current.length+'</span></div>'+
      '<div class="gf-grid">'+current.map(x=>gfCard(x,true)).join('')+'</div>'+
      (current.length?'':'<p class="gf-hint">Пока нет актуальных релизов.</p>')+
      '<div class="gf-collection-title gf-archive-title">Архив <span>'+old.length+'</span></div>'+
      '<div class="gf-grid">'+old.map(x=>gfCard(x,true)).join('')+'</div>'+
      (old.length?'':'<p class="gf-hint">Архив пока пуст.</p>');
  }
  return '<div class="gf-shell">'+gfHeader('Моё')+'<div class="gf-collection-nav">'+nav.map(([id,label,count])=>'<a class="gf-collection-tile'+(id===active?' selected':'')+'" href="#/mine/'+id+'"><strong>'+label+'</strong><span>'+count+(id==='server'?' · Jellyfin':' в коллекции')+'</span></a>').join('')+'</div>'+
    '<div class="gf-collection-toolbar"><span class="gf-subtle">Актуальное — сначала</span><div class="gf-toolbar-actions"><a class="gf-add gf-add-primary" href="'+(active==='movies'?'#/addm':'#/add')+'">+ Добавить</a></div></div>'+
    search+body+'<p class="gf-version">v'+APP_V+'</p></div>';
}


