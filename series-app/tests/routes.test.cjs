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
  go('#/s/upcoming');
  assert.equal(w.document.querySelector('[data-act="gfarchive"]'),null,'no archive before finale');
  go('#/m/movie');
  assert.ok(w.document.querySelector('[data-act="gfarchive"]'),'movie archive after premiere');
  go('#/mine/movies');
  assert.match(app(),/Вышедший фильм/);
  go('#/mine/server');
  assert.match(app(),/Jellyfin/);
  go('#/search');
  assert.ok(w.document.querySelector('#sq'));
  go('#/random');
  assert.ok(app().length>0);
  go('#/list');assert.equal(w.location.hash,'#/mine/series');
  go('#/movies');assert.equal(w.location.hash,'#/mine/movies');
  go('#/lib');assert.equal(w.location.hash,'#/mine/server');
  go('#/cal');assert.equal(w.location.hash,'#/week');
  go('#/settings');assert.ok(app().length>0);
  go('#/add');assert.ok(w.document.querySelector('#addform'));
  go('#/addm');assert.ok(w.document.querySelector('#mform'));
  assert.deepEqual(errors,[]);
});
