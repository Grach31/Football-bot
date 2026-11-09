'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { describe, hiddenByManual } = require('../site/release-engine.js');
const day = '2026-11-09';
const series = (episodes, extra = {}) => ({ kind: 'series', id: 's1', season: 1, total: 3, episodes, ...extra });
const ep = (n,date,time) => ({n,date,...(time?{time}:{})});

test('counts confirmed releases, never uses watch history', () => {
  const item = series([ep(1,'2026-11-02'),ep(2,'2026-11-09'),ep(3,'2026-11-16')]);
  const info = describe({...item,mine:'done',seen_ep:99,seen_season:1,seen_ep_season:1},day,'12:00');
  assert.equal(info.aired,2);
  assert.equal(info.total,3);
  assert.equal(info.group,'new');
  assert.equal(info.nextEpisode,3);
  assert.equal(info.eligibleArchive,false);
  assert.match(info.label,/2 из 3/);
});

test('Moscow airtime gates same-day episode', () => {
  const item = series([ep(1,day,'21:00'),ep(2,'2026-11-16'),ep(3,'2026-11-23')]);
  assert.equal(describe(item,day,'20:59').aired,0);
  assert.equal(describe(item,day,'21:00').aired,1);
});

test('simultaneous episodes counted separately', () => {
  const item = series([ep(1,day),ep(2,day),ep(3,'2026-11-16')]);
  assert.equal(describe(item,day).aired,2);
});

test('finale unlocks archive, not a watched flag', () => {
  const item = series([ep(1,'2026-11-01'),ep(2,'2026-11-04'),ep(3,day)]);
  const info = describe(item,day);
  assert.equal(info.finished,true);
  assert.equal(info.eligibleArchive,true);
  assert.equal(info.aired,3);
  assert.match(info.detail,/Сезон завершён/);
  assert.equal(hiddenByManual(info,info.releaseKey),true);
});

test('manual archive is release-bound; next season comes back', () => {
  const old = describe(series([ep(1,'2026-11-01'),ep(2,'2026-11-02'),ep(3,'2026-11-03')]),day);
  const next = describe(series([ep(1,'2027-01-05'),ep(2,'2027-01-12'),ep(3,'2027-01-19')],{season:2}),day);
  assert.equal(hiddenByManual(old,old.releaseKey),true);
  assert.equal(next.group,'soon');
  assert.equal(hiddenByManual(next,old.releaseKey),false);
});

test('13-day window automatically expires without manual action', () => {
  const item=series([ep(1,'2026-10-01'),ep(2,'2026-10-02'),ep(3,'2026-10-27')]);
  assert.equal(describe(item,'2026-11-08').group,'new');
  assert.equal(describe(item,'2026-11-09').group,'archive');
});

test('film archive only after confirmed premiere; no date is unknown', () => {
  assert.equal(describe({kind:'movie',date:'2026-11-10'},day).eligibleArchive,false);
  assert.equal(describe({kind:'movie',date:day},day).eligibleArchive,true);
  assert.equal(describe({kind:'movie'},day).eligibleArchive,false);
  assert.equal(describe({kind:'movie'},day).label,'Дата уточняется');
});

test('no fabricated episode totals and no false finale', () => {
  const item=series([ep(1,day)],{total:0});
  const info=describe(item,day);
  assert.equal(info.total,null);
  assert.equal(info.finished,false);
  assert.equal(info.eligibleArchive,false);
});

test('pure describe does not mutate source objects', () => {
  const item=series([ep(2,'2026-11-09'),ep(1,'2026-11-02')],{mine:'watching'});
  const before=JSON.stringify(item);
  describe(item,day);
  assert.equal(JSON.stringify(item),before);
});

test('future season date, recent film, and expired film groups', () => {
  assert.equal(describe({kind:'series',date:'2026-11-20',episodes:[]},day).group,'soon');
  assert.equal(describe({kind:'movie',date:'2026-11-01'},day).group,'new');
  assert.equal(describe({kind:'movie',date:'2026-10-20'},day).group,'archive');
});

test('series premiere without an episode grid is still recent for 13 days', () => {
  const item={kind:'series',date:'2026-11-05',status:'waiting',episodes:[]};
  assert.equal(describe(item,day).group,'new');
  assert.equal(describe(item,'2026-11-18').group,'archive');
});

test('episode numbers must cover the full season before archive is enabled', () => {
  const item=series([ep(2,'2026-11-01'),ep(3,'2026-11-02'),ep(4,'2026-11-03')]);
  const info=describe(item,day);
  assert.equal(info.eligibleArchive,false);
  assert.equal(info.finished,false);
});
