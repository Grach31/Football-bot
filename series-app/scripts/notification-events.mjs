// Native release/subscription payload builders shared by journal and sender.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function releasePayloads({series=[],movies=[],subscriptions=[],today,nowMsk='23:59'}) {
const data={series},moviesData={items:movies},subsData={items:subscriptions};
const defaultReleaseTime='10:00';
const due=time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') ? time<=nowMsk : defaultReleaseTime<=nowMsk;
function moviePayloads(date) {
  return (moviesData.items || []).filter((m) => m.date === date && due(m.time)).map((m) => ({
    title: `${m.title}: выходит сегодня`, body: m.service ? `Фильм · ${m.service}` : 'Фильм', tag: `movie-${m.id}-${date}`, url: `./#/m/${m.id}`,
  }));
}

const d0 = (x) => new Date(x + 'T00:00:00Z');
function addMonths(x, n, day) {
  const dt = d0(x); const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
}
function subNext(it, today) {
  let d = it.next;
  if (it.period === 'once' || d >= today) return d;
  const day = +d.slice(8, 10); let i = 0;
  const step = { month: 1, '3m': 3, '6m': 6, year: 12 }[it.period] || 1;
  while (d < today && i < 600) { i += 1; d = addMonths(it.next, step * i, day); }
  return d;
}
const money = (n) => `${Number(n).toLocaleString('ru-RU')} ₽`;
function subPayloads(date) {
  const out = [];
  for (const it of subsData.items || []) {
    const nx = subNext(it, date);
    const left = Math.round((d0(nx) - d0(date)) / 86400000);
    if ((left !== 3 && left !== 1 && left !== 0) || !due('10:00')) continue;
    const once = it.period === 'once';
    const when = left === 0 ? 'сегодня' : left === 1 ? 'завтра' : 'через 3 дня';
    const title = once ? `${it.service}: доступ заканчивается ${when}` : `${it.service}: списание ${when}`;
    out.push({ title, body: once ? 'Продлите, если ещё смотрите' : `${money(it.price)}. Если сервис не нужен, отмените подписку`, tag: `sub-${it.id}-${nx}-${left}`, url: './#/subs' });
  }
  return out;
}

const weekday = (s) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long' }).format(new Date(s + 'T00:00:00Z'));

function buildPayloads(date) {
  const out = [];
  for (const s of data.series) {
    if (s.no_schedule) continue;
    const todays = (s.episodes || []).filter((e) => e.date === date && due(e.time));
    if (!todays.length) continue;
    // Episodes on one day with different release times are separate notifications.
    const groups = new Map();
    for (const e of todays) {
      const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time || '') ? e.time : defaultReleaseTime;
      if (!groups.has(time)) groups.set(time, []);
      groups.get(time).push(e);
    }
    for (const [time, episodes] of groups) {
      const u = s.unit || 'серия';
      const verb = u === 'выпуск' ? 'вышел' : 'вышла';
      const last = episodes[episodes.length - 1];
      const fin = s.total && last.n === s.total ? ' (финал)' : '';
      const title = episodes.length > 1
        ? `${s.title}: вышли ${u === 'выпуск' ? 'выпуски' : 'серии'} ${episodes[0].n}–${last.n}${fin}`
        : `${s.title}: ${verb} ${last.n} ${u}${fin}`;
      const parts = [];
      if (s.service) parts.push(s.service);
      if (s.season) parts.push('Сезон '+s.season);
      parts.push(`сегодня, ${weekday(date)}${episodes.some(e => e.time) ? ', в ' + time : ''}`);
      out.push({ title, body: parts.join(' · '), tag: `series-${s.id}-${date}-${time}`, url: `./#/s/${s.id}` });
    }
  }
  return out;
}


return [...buildPayloads(today),...moviePayloads(today),...subPayloads(today)];
}

const dateOnly = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d+'T00:00:00Z'));
export function updateJournal({series=[],movies=[],subscriptions=[],journal={items:[]},state={},today,nowMsk='23:59',now=new Date().toISOString()}) {
  const known=new Set(state.catalog || []),catalog=[...series.map(x=>['s',x]),...movies.map(x=>['m',x])];
  const events=new Map((journal.items || []).map(x=>[x.id,x]));
  // First run establishes a baseline; it never announces the entire old catalog.
  if(Array.isArray(state.catalog))for(const [kind,item] of catalog)if(!known.has(kind+':'+item.id)) {
    const added=dateOnly(item.added)?item.added:today,id='catalog-'+kind+'-'+item.id+'-'+added;
    if(!events.has(id))events.set(id,{id,category:'catalog',title:(kind==='s'?'Добавлен сериал «':'Добавлен фильм «')+item.title+'»',body:'Каталог пополнен',at:now,route:'#/module/cinema/'+kind+'/'+encodeURIComponent(item.id)});
  }
  const first=dateOnly(state.checkedDate)?state.checkedDate:today;
  const earliest=new Date(Date.parse(today+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);
  for(let date=first>earliest?first:earliest;date<=today;date=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)){
    const due=releasePayloads({series,movies,subscriptions,today:date,nowMsk:date===today?nowMsk:'23:59'});
    for(const payload of due){
      const category=payload.tag.startsWith('sub-')?'subscriptions':payload.tag.startsWith('movie-')?'movies':'episodes';
      const route=payload.url.includes('#/subs')?'#/settings/cinema/subs':'#/module/cinema/'+payload.url.split('#/')[1];
      if(!events.has(payload.tag))events.set(payload.tag,{id:payload.tag,category,title:payload.title,body:payload.body,route,at:date+'T'+(date===today?nowMsk:'23:59')+':00+03:00'});
    }
  }
  const cutoff=Date.parse(now)-90*86400000;
  const items=[...events.values()].filter(x=>Date.parse(x.at)>=cutoff).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,500);
  return {journal:{version:1,updated:now,items},state:{version:1,checkedDate:today,catalog:catalog.map(([kind,x])=>kind+':'+x.id)}};
}
export function payloadForEvent(event) {
  const route=event.route.startsWith('#/module/cinema/')?'./#/'+event.route.slice('#/module/cinema/'.length):event.route==='#/settings/cinema/subs'?'./#/subs':'./#/notifications';
  return {title:event.title,body:event.body,tag:event.id,url:route,category:event.category};
}
export async function writeJournal({siteDir,stateFile,now=new Date()}={}){
  const read=async(file,fallback)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}};
  const data=path.join(siteDir,'data');
  const [s,m,u,journal,state]=await Promise.all([read(path.join(data,'series.json'),{series:[]}),read(path.join(data,'movies.json'),{items:[]}),read(path.join(data,'subscriptions.json'),{items:[]}),read(path.join(data,'notifications.json'),{items:[]}),read(stateFile,{})]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(now),nowMsk=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  const result=updateJournal({series:s.series,movies:m.items,subscriptions:u.items,journal,state,today,nowMsk,now:now.toISOString()});
  await fs.mkdir(path.dirname(stateFile),{recursive:true});
  await fs.writeFile(path.join(data,'notifications.json'),JSON.stringify(result.journal,null,2)+'\n');await fs.writeFile(stateFile,JSON.stringify(result.state,null,2)+'\n');
  return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const flag=process.argv.indexOf('--site-dir'),siteDir=flag>=0?path.resolve(process.argv[flag+1]):path.resolve('series-app/site');
 const result=await writeJournal({siteDir,stateFile:path.resolve('state/grach-films-events.json')});console.log('Notification journal:',result.journal.items.length,'events; catalog baseline:',result.state.catalog.length);
}
