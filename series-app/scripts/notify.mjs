// Отправка push-уведомлений о сериалах, которые выходят сегодня (по Москве).
//
// Запуск:
//   node notify.mjs                 обычная отправка
//   node notify.mjs --dry-run       только показать, что было бы отправлено
//   node notify.mjs --date 2026-10-22   проверить конкретную дату
//   node notify.mjs --test          отправить тестовое уведомление
//
// Секреты (переменные окружения):
//   VAPID_PRIVATE_KEY   приватный ключ push (пара к ключу в site/data/config.json)
//   PUSH_SUBSCRIPTION   «код устройства» из приложения: объект или массив объектов
//   VAPID_SUBJECT       необязательно, по умолчанию mailto:series@example.com

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import {releasePayloads,payloadForEvent} from './notification-events.mjs';
import { createECDH, createDecipheriv, hkdfSync, createHash } from 'node:crypto';
export function decryptDevice(box, privateKey) {
  if (box?.v !== 1 || typeof box.ciphertext !== 'string' || box.ciphertext.length > 16000) throw new Error('invalid_device');
  const ecdh=createECDH('prime256v1');ecdh.setPrivateKey(Buffer.from(privateKey,'base64url'));
  const info=Buffer.from('family-space-push-v1');
  const key=hkdfSync('sha256',ecdh.computeSecret(Buffer.from(box.epk,'base64url')),Buffer.from(box.salt,'base64url'),info,32);
  const encrypted=Buffer.from(box.ciphertext,'base64url');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(box.iv,'base64url'));
  decipher.setAAD(info);decipher.setAuthTag(encrypted.subarray(-16));
  const subscription=JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]).toString());
  const url=new URL(subscription.endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com'].includes(url.hostname) && !url.hostname.endsWith('.notify.windows.com') && !url.hostname.endsWith('.wns.windows.com')) throw new Error('invalid_push_endpoint');
  if (!subscription.keys?.auth || !subscription.keys?.p256dh) throw new Error('invalid_push_keys');
  return subscription;
}
export const deviceKey = subscription => createHash('sha256').update(subscription.endpoint).digest('hex').slice(0,24);
export async function deliverToDevices(payloads, devices, { state, legacy = [], test = false, send, now = () => new Date().toISOString(), onError = () => {}, shouldSend = () => true }) {
  let sent = 0, failed = 0;
  for (const payload of payloads) for (const device of devices) {
    if (!shouldSend(payload,device)) continue;
    const key = payload.tag + ':device:' + deviceKey(device);
    if (!test && (state.sent[key] || state.sent[payload.tag] && legacy.some(value => value.endpoint === device.endpoint))) continue;
    try {
      await send(device, payload); sent++;
      if (!test) state.sent[key] = now();
    } catch (error) { failed++; onError(Number(error.statusCode) || 0); }
  }
  return { sent, failed };
}


const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'site', 'data');
const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const dry = has('--dry-run');
const test = has('--test');
const today = val('--date') || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
const nowMsk = val('--date') ? '23:59' : new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const defaultReleaseTime = '10:00'; // No confirmed hour in catalog; notification at 10:00 MSK, not a claim of actual release.
const due = (time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') ? time <= nowMsk : defaultReleaseTime <= nowMsk;
const stateFile = path.join(here, '..', '..', 'state', 'grach-films-push.json');
let state = { sent: {} };
try { const loaded = JSON.parse(fs.readFileSync(stateFile, 'utf8')); if (loaded && typeof loaded.sent === 'object' && loaded.sent && !Array.isArray(loaded.sent)) state = loaded; } catch (e) { /* initial run */ }
const saveState = () => { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n'); };

const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'series.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));

let subsData = { items: [] };
try { subsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'subscriptions.json'), 'utf8')); } catch (e) { /* файла нет — подписок нет */ }

let moviesData = { items: [] };
try { moviesData = JSON.parse(fs.readFileSync(path.join(dataDir, 'movies.json'), 'utf8')); } catch (e) { /* фильмов нет */ }
let journal;
try {journal=JSON.parse(fs.readFileSync(path.join(dataDir,'notifications.json'),'utf8'));}catch{}
const recentEvents=(!val('--date') && journal)?.items?.filter(event => Date.parse(event.at)>=Date.now()-72*60*60*1000).map(payloadForEvent);
const payloads = test
  ? [{ title: 'Grach films', body: 'Проверка: уведомления работают', tag: 'test', url: './#/week' }]
  : recentEvents || releasePayloads({series:data.series,movies:moviesData.items,subscriptions:subsData.items,today,nowMsk});

let testRequests=[];
try {testRequests=JSON.parse(fs.readFileSync(path.join(dataDir,'family-push-tests.json'),'utf8')).items || [];}catch{}
if(!test)for(const request of testRequests)if(typeof request.id==='string' && typeof request.deviceId==='string' && Date.parse(request.at)>=Date.now()-86400000)payloads.push({title:'МОЁ · Серверный тест',body:'Уведомление отправлено сервером Family Space.',tag:'server-test-'+request.id,url:'./#/notifications',category:'server_test',targetDeviceId:request.deviceId});
console.log(`Дата: ${today}, время Москвы: ${nowMsk}. Новых уведомлений к отправке: ${payloads.length}`);
for (const p of payloads) console.log(` - ${p.title} | ${p.body}`);

if (!payloads.length) process.exit(0);
if (dry) { console.log('Пробный запуск, ничего не отправлено.'); process.exit(0); }

const privateKey = process.env.VAPID_PRIVATE_KEY;
const rawSub = process.env.PUSH_SUBSCRIPTION;
if (!privateKey) {
  console.error('Не заданы секреты VAPID_PRIVATE_KEY и/или PUSH_SUBSCRIPTION. Добавьте их в Settings → Secrets and variables → Actions.');
  process.exit(1);
}

const preferences=new Map(),deviceIds=new Map();
let subs;
try {
  const parsed = JSON.parse(rawSub || '[]');
  subs = Array.isArray(parsed) ? parsed : [parsed];
} catch (err) {
  console.error('Секрет PUSH_SUBSCRIPTION не похож на JSON. Скопируйте «код устройства» в приложении целиком.');
  process.exit(1);
}

// Additional Family Space devices are encrypted to the existing VAPID public key.
// Only this workflow has its private key. No device endpoint or auth secret is public.
try {
  const devices=JSON.parse(fs.readFileSync(path.join(dataDir,'family-push-devices.json'),'utf8')).items || [];
  for (const device of devices) {
    try { const sub=decryptDevice(device.box,privateKey); preferences.set(sub.endpoint,device.preferences || {});deviceIds.set(sub.endpoint,device.id); if(!subs.some(existing=>existing.endpoint===sub.endpoint))subs.push(sub); }
    catch { console.error('Family Space: invalid encrypted device (no sensitive details logged)'); }
  }
} catch { /* Old subscriptions continue to work before device enrollment. */ }
if (!subs.length) { console.error('No devices registered'); process.exit(1); }
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:series@example.com', config.vapidPublicKey, privateKey);

let legacy=[]; try { const parsed=JSON.parse(rawSub || '[]'); legacy=Array.isArray(parsed)?parsed:[parsed]; } catch {}
const {sent,failed}=await deliverToDevices(payloads,subs,{
  state,legacy,test,
  shouldSend:(payload,device)=>payload.targetDeviceId ? deviceIds.get(device.endpoint)===payload.targetDeviceId : test || (preferences.get(device.endpoint)?.pushEnabled!==false && preferences.get(device.endpoint)?.[payload.category]!==false),
  send:(sub,payload)=>webpush.sendNotification(sub,JSON.stringify(payload),{TTL:60*60*12}),
  onError:code=>console.error('Push delivery failed ('+code+'); device data is not logged.')
});
if (!test) {
  const tests=testRequests.map(request=>{
    const device=subs.find(sub=>deviceIds.get(sub.endpoint)===request.deviceId);
    const delivered=device && state.sent['server-test-'+request.id+':device:'+deviceKey(device)];
    return {id:request.id,deviceId:request.deviceId,status:delivered?'accepted':device?'pending':'unknown_device',at:delivered || request.at};
  });
  fs.writeFileSync(path.join(dataDir,'notification-delivery.json'),JSON.stringify({checkedAt:new Date().toISOString(),sent,failed,tests},null,2)+'\n');
  const cutoff = Date.now() - 90 * 86400000;
  for (const [key, at] of Object.entries(state.sent)) if (Date.parse(at) < cutoff) delete state.sent[key];
  saveState();
}
console.log(`Отправлено: ${sent}, ошибок: ${failed}. Запомнено уведомлений: ${Object.keys(state.sent).length}`);
if (failed) process.exitCode = 1;
