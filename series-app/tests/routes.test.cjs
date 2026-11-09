'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname,'../site');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const data = {
  'data/series.json': {updated:'2026-11-09',series:[
    {id:'finished',title:'Финальный сериал',season:1,total:2,status:'airing',mine:'done',seen_ep:0,episodes:[{n:1,date:'2026-11-01'},{n:2,date:'2026-11-09'}]},
    {id:'upcoming',title:'Будущий сериал',season:1,total:3,status:'waiting',episodes:[{n:1,date:'2026-11-19'},{n:2,date:'2026-11-26'},{n:3,date:'2026-12-03'}]}
  ]},
  'data/movies.json': {updated:'2026-11-09',items:[{id:'movie',title:'Вышедший фильм',date:'2026-11-09',status:'watched'}]},
  'data/config.json': {repo:{owner:'Grach31',name:'Football-bot',path:'series-app/site/data/series.json',branch:'main'}},
  'data/subscriptions.json': {items:[]},
  'data/discover.json': {items:[]},
  'data/pool.json': {items:[]}
};
test('jsdom: all routes, archive, old links, Jellyfin isolation and Cinema Noir', async t => {
  const dom = new JSDOM(read('index.html'),{
    url:'https://example.test/series-app/site/?today=2026-11-09#/week',
    runScripts:'dangerously',pretendToBeVisual:true
  });
  const w=dom.window;
  t.after(()=>w.close());
  const errors=[];
  w.addEventListener('error',e=>errors.push(e.message));
  w.scrollTo=()=>{};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
  w.fetch=async url=>({
    ok:true,
    json:async()=>JSON.parse(JSON.stringify(data[String(url)]||{items:[]}))
  });
  for(const file of ['release-engine.js','app.js','cinema.js','minimal.js'])vm.runInContext(read(file),dom.getInternalVMContext(),{filename:file});
  await w.boot(true);
  const app=()=>w.document.getElementById('app').textContent;
  const go=hash=>{w.location.hash=hash;w.render();};
  assert.equal(w.document.querySelectorAll('#tabs a').length,2);
  assert.match(app(),/Новые серии/);
  assert.match(app(),/Премьеры фильмов/);
  assert.match(app(),/Финальный сериал/);
  assert.match(app(),/Вышедший фильм/);
  assert.doesNotMatch(app(),/Продолжить просмотр|Посмотрел|Хочу посмотреть/);
  // The overlay button is a sibling of the anchor: tapping it must not navigate.
  const homeToggle=w.document.querySelector('.gf-poster-card [data-act="gfwatching"][data-kind="s"][data-id="finished"]');
  assert.ok(homeToggle,'play toggle directly on series poster');
  assert.equal(homeToggle.getAttribute('aria-pressed'),'false');
  const homeHash=w.location.hash;
  homeToggle.click();
  assert.equal(w.location.hash,homeHash,'poster play does not open the detail page');
  assert.equal(w.localStorage.getItem('gf_watching_v1:s:finished'),'1');
  assert.equal(w.document.querySelectorAll('.gf-card[href="#/s/finished"]').length,1,'watching series has no duplicate home card');
  assert.equal(w.document.querySelector('[data-act="gfwatching"][data-id="finished"]').textContent,'✓');
  w.document.querySelector('[data-act="gfwatching"][data-id="finished"]').click();
  assert.equal(w.localStorage.getItem('gf_watching_v1:s:finished'),null,'check removes from watching without navigation');
  go('#/mine/movies');
  const movieToggle=w.document.querySelector('.gf-poster-card [data-act="gfwatching"][data-kind="m"][data-id="movie"]');
  assert.ok(movieToggle,'released film has quick button on poster');
  const movieHash=w.location.hash;
  movieToggle.click();
  assert.equal(w.location.hash,movieHash,'film poster toggle does not navigate');
  assert.equal(w.localStorage.getItem('gf_watching_v1:m:movie'),'1');
  go('#/week');
  assert.ok(w.document.querySelector('.gf-block .gf-card[href="#/m/movie"]'),'added film appears in watching rail');
  w.document.querySelector('[data-act="gfwatching"][data-kind="m"][data-id="movie"]').click();
  assert.equal(w.localStorage.getItem('gf_watching_v1:m:movie'),null);
  go('#/s/finished');
  const archive=w.document.querySelector('[data-act="gfarchive"]');
  assert.ok(archive,'finale archive button');
  archive.click();
  assert.ok(w.localStorage.getItem('gf_archive_v1:s:finished'));
  go('#/week');
  assert.doesNotMatch(app(),/Финальный сериал/);
  go('#/mine/series');
  assert.match(app(),/Финальный сериал/);
  assert.match(app(),/Архив/);
  // Even a manually archived, finished season can be part of a personal viewing queue.
  go('#/s/finished');
  assert.ok(w.document.querySelector('[data-act="gfwatching"]'));
  assert.match(w.document.querySelector('[data-act="gfwatching"]').textContent,/Смотрю сейчас/);
  w.document.querySelector('[data-act="gfwatching"]').click();
  assert.equal(w.localStorage.getItem('gf_watching_v1:s:finished'),'1');
  assert.match(w.document.querySelector('[data-act="gfwatching"]').textContent,/Закончил смотреть/);
  assert.ok(w.localStorage.getItem('gf_archive_v1:s:finished'),'manual archive unchanged');
  go('#/mine/series');
  assert.doesNotMatch(app(),/Смотрю сейчас/,'personal list removed from collection');
  assert.equal(w.document.querySelectorAll('.gf-grid-card[href="#/s/finished"]').length,1,'archive remains visible in collection');
  go('#/week');
  assert.equal(w.document.querySelectorAll('.gf-block')[0].querySelector('h2').textContent,'Смотрю сейчас','personal rail first on home');
  assert.equal(w.document.querySelectorAll('.gf-block')[0].querySelectorAll('.gf-card[href="#/s/finished"]').length,1,'archived series on home');
  assert.equal(w.document.querySelectorAll('.gf-card[href="#/s/finished"]').length,1,'no duplicate between home rails');
  go('#/s/finished');
  w.document.querySelector('[data-act="gfwatching"]').click();
  assert.equal(w.localStorage.getItem('gf_watching_v1:s:finished'),null);
  assert.ok(w.localStorage.getItem('gf_archive_v1:s:finished'),'finishing does not erase release archive');
  go('#/week');
  assert.doesNotMatch(app(),/Финальный сериал/,'archived series no longer on home after finishing');
  go('#/s/upcoming');
  w.document.querySelector('[data-act="gfwatching"]').click();
  go('#/week');
  assert.ok(w.document.querySelector('.gf-block .gf-card[href="#/s/upcoming"]'),'watching also works for upcoming seasons');
  go('#/s/upcoming');
  assert.equal(w.document.querySelector('[data-act="gfarchive"]'),null,'no archive before finale');
  go('#/m/movie');
  assert.ok(w.document.querySelector('[data-act="gfarchive"]'),'movie archive after premiere');
  assert.ok(w.document.querySelector('[data-act="gfwatching"]'),'released movie has personal button');
  w.document.querySelector('[data-act="gfwatching"]').click();
  assert.equal(w.localStorage.getItem('gf_watching_v1:m:movie'),'1','movie uses separate local key');
  go('#/week');
  assert.equal(w.document.querySelectorAll('.gf-block')[0].querySelectorAll('.gf-card').length,2,'combined series and film watching');
  assert.equal(w.document.querySelectorAll('.gf-card[href="#/m/movie"]').length,1,'film not duplicated across home rails');
  go('#/mine/movies');
  assert.doesNotMatch(app(),/Смотрю сейчас/,'no watching section in Movies');
  assert.equal(w.document.querySelectorAll('.gf-grid-card[href="#/m/movie"]').length,1,'film remains in collection');
  go('#/m/movie');
  w.document.querySelector('[data-act="gfwatching"]').click();
  assert.equal(w.localStorage.getItem('gf_watching_v1:m:movie'),null,'movie can be finished');
  go('#/mine/movies');
  assert.match(app(),/Вышедший фильм/);
  go('#/mine/movies');
  assert.match(app(),/Вышедший фильм/);
  go('#/mine/server');
  assert.match(app(),/Jellyfin/);
  assert.equal(w.document.querySelectorAll('#sq').length,1,'one search field even on server');
  go('#/mine/series');
  assert.equal(w.document.querySelectorAll('#sq').length,1,'one search field in series');
  const search=w.document.querySelector('#sq');
  search.value='ф';
  search.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.match(app(),/Финальный сериал/);
  assert.match(app(),/Вышедший фильм/);
  assert.equal(w.document.querySelectorAll('#sq').length,1,'one shared search field');
  go('#/mine/movies');
  assert.match(app(),/Финальный сериал/);
  assert.match(app(),/Вышедший фильм/);
  w.localStorage.setItem('jf_url','https://jellyfin.example');
  w.localStorage.setItem('jf_token','test-token');
  vm.runInContext("jfItems=[{Id:'jf1',Name:'Фильм с сервера',Type:'Movie'}]",dom.getInternalVMContext());
  w.render();
  assert.match(app(),/Фильм с сервера/);
  assert.equal(w.document.querySelectorAll('#sq').length,1,'Jellyfin uses same search field');
  go('#/search');
  assert.equal(w.location.hash,'#/mine/series','legacy search routes to global search');
  go('#/random');
  assert.ok(app().length>0);
  go('#/list');assert.equal(w.location.hash,'#/mine/series');
  go('#/movies');assert.equal(w.location.hash,'#/mine/movies');
  go('#/lib');assert.equal(w.location.hash,'#/mine/server');
  go('#/cal');assert.equal(w.location.hash,'#/week');
  go('#/settings');assert.ok(app().length>0);
  go('#/add');assert.ok(w.document.querySelector('#addform'));
  assert.doesNotMatch(app(),/Сохранить токен|Удалить токен/,'token panel removed from add page');
  go('#/addm');assert.ok(w.document.querySelector('#mform'));
  assert.doesNotMatch(app(),/Сохранить токен|Удалить токен/,'token panel removed from movie add page');
  go('#/settings');
  const tokenTab=w.document.querySelector('[data-stab="token"]');
  assert.ok(tokenTab);
  tokenTab.click();
  assert.match(app(),/Токен GitHub/);
  assert.match(app(),/Сохранить токен/);
  assert.deepEqual(errors,[]);
});
