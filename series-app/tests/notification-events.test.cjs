const test=require('node:test'),assert=require('node:assert/strict');
test('journal uses native payloads, common event IDs, no catalog flood and no duplicate updates',async()=>{
 const {updateJournal,payloadForEvent,releasePayloads}=await import('../scripts/notification-events.mjs');
 const args={series:[{id:'s1',title:'Сериал',season:2,total:1,episodes:[{n:1,date:'2026-11-18'}]}],movies:[{id:'m1',title:'Фильм',date:'2026-11-18'}],subscriptions:[{id:'sub1',service:'Сервис',next:'2026-11-19',period:'month',price:400}],today:'2026-11-18',nowMsk:'12:00',now:'2026-11-18T09:00:00Z'};
 const first=updateJournal(args);assert.equal(first.journal.items.length,3);assert.equal(first.journal.items.some(x=>x.category==='catalog'),false);
 assert.deepEqual(new Set(first.journal.items.map(x=>x.id)),new Set(releasePayloads(args).map(x=>x.tag)));
 const repeated=updateJournal({...args,...first});assert.equal(repeated.journal.items.length,3);
 const added=updateJournal({...args,...first,movies:[...args.movies,{id:'m2',title:'Новый фильм',added:'2026-11-18'}]});assert.equal(added.journal.items.filter(x=>x.category==='catalog').length,1);assert.equal(added.journal.items.find(x=>x.category==='catalog').route,'#/module/cinema/m/m2');
 assert.equal(payloadForEvent(added.journal.items.find(x=>x.category==='catalog')).url,'./#/m/m2');
});
test('late run catches releases since the last check without inventing undated events',async()=>{
 const {updateJournal}=await import('../scripts/notification-events.mjs');const args={series:[{id:'late',title:'Сериал',episodes:[{n:1,date:'2026-11-17'}]},{id:'unknown',title:'Неизвестно'}],today:'2026-11-18',nowMsk:'12:00',now:'2026-11-18T09:00:00Z',state:{checkedDate:'2026-11-17',catalog:['s:late','s:unknown']}};
 const out=updateJournal(args);assert.equal(out.journal.items.length,1);assert.match(out.journal.items[0].id,/2026-11-17/);
 const early=updateJournal({...args,state:{checkedDate:'2026-11-18',catalog:[]},series:[{id:'early',title:'Позже',episodes:[{n:1,date:'2026-11-18',time:'20:00'}]}]});assert.equal(early.journal.items.some(x=>x.category==='episodes'),false);
});
test('actual sender honors per-device filters and retains retry/dedup delivery state',async()=>{
 const fs=require('node:fs/promises');const source=await fs.readFile(require('node:path').join(__dirname,'../scripts/notify.mjs'),'utf8');
 const block=source.slice(source.indexOf('export const deviceKey'),source.indexOf('const here ='));
 const {deliverToDevices}=await import('data:text/javascript,'+encodeURIComponent("import {createHash} from 'node:crypto';\n"+block));
 const state={sent:{}},devices=[{endpoint:'https://fixture/one'},{endpoint:'https://fixture/two'}],payloads=[{tag:'same-event',category:'movies'}];let calls=0;
 const options={state,send:async()=>{calls++;},shouldSend:(p,d)=>d===devices[0]};
 await deliverToDevices(payloads,devices,options);await deliverToDevices(payloads,devices,options);assert.equal(calls,1);assert.equal(Object.keys(state.sent).length,1);
});
