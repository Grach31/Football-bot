'use strict';
// Pure date-based release engine; ignores viewing/history fields.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GFReleases = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const valid = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
  const plus = (d, days) => { const v = new Date(d + 'T00:00:00Z'); v.setUTCDate(v.getUTCDate() + days); return v.toISOString().slice(0, 10); };
  const format = d => valid(d) ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(d + 'T00:00:00Z')) : '';
  const byDate = (a, b) => (a.date + 'T' + (a.time || '00:00')).localeCompare(b.date + 'T' + (b.time || '00:00'));
  const isOut = (e, today, clock) => e.date < today || (e.date === today && (!e.time || e.time <= clock));
  function describe(item, today, clock = '23:59') {
    if (!valid(today)) throw new Error('describe requires Moscow YYYY-MM-DD');
    const movie = ['m','movie','film'].includes(item.kind);
    const date = valid(item.date) ? item.date : '';
    if (movie) {
      const released = !!date && date <= today;
      const recent = released && plus(date, 13) > today;
      return { kind:'movie', group:recent?'new':date>today?'soon':'archive',
        label:date?'Премьера · '+format(date):'Дата уточняется',
        detail:released?'Фильм вышел':date?'Ожидается премьера':'Дата уточняется',
        sortDate:date, latestDate:released?date:'', nextDate:date>today?date:'',
        eligibleArchive:released, releaseKey:released?'movie:'+date:'',
        finished:released, aired:released?1:0, total:1 };
    }
    const events = (Array.isArray(item.episodes)?item.episodes:[]).filter(e=>e&&valid(e.date)&&Number.isInteger(Number(e.n))&&Number(e.n)>0).slice().sort(byDate);
    const past = events.filter(e=>isOut(e,today,clock)), future=events.filter(e=>!isOut(e,today,clock));
    const last=past[past.length-1]||null, next=future[0]||null;
    const n=Number(item.total), total=Number.isInteger(n)&&n>0&&!item.approx?n:null;
    const releasedNumbers=new Set(past.map(e=>Number(e.n)));
    const aired=releasedNumbers.size;
    // A confirmed finale requires all episode numbers 1..total, not just N arbitrary entries.
    const finished=!!(total&&!future.length&&Array.from({length:total},(_,i)=>i+1).every(n=>releasedNumbers.has(n)));
    const latestDate=last?.date||(!events.length&&date<=today?date:'');
    const recent=!!(latestDate&&plus(latestDate,13)>today);
    const soonDate=next?.date||(!events.length&&date>today?date:'');
    const group=recent?'new':soonDate?'soon':'archive';
    let label=aired?'Вышло '+aired+(total?' из '+total:'')+' серий':soonDate?'Премьера · '+format(soonDate):'Дата уточняется';
    let detail=next?'Следующая серия '+next.n+' · '+format(next.date):finished?'Сезон завершён':item.status==='waiting'&&!soonDate?'Ждём новый сезон':'Следующая дата уточняется';
    if(!past.length&&next){label='Серия '+next.n+' · '+format(next.date);detail='Премьера сезона';}
    if(!events.length&&date&&date<=today){label='Премьера · '+format(date);detail='Расписание серий уточняется';}
    return {kind:'series',group,label,detail,sortDate:group==='soon'?soonDate:latestDate||soonDate||'',latestDate,
      nextDate:soonDate,eligibleArchive:finished,
      releaseKey:finished?'series:'+String(item.season||1)+':'+total+':'+last.date+':'+String(last.n):'',
      finished,aired,total,latestEpisode:last?.n||0,nextEpisode:next?.n||0};
  }
  function hiddenByManual(info, saved){return !!(saved&&info.releaseKey&&saved===info.releaseKey);}
  return {describe,hiddenByManual,isOut};
});
