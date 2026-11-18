// Server-only schedule enrichment. No credentials or catalog snapshots in this file.
// Imported by tests; invoked by the existing cinema workflow with its own secrets.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const norm = value => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
export function identityOf(item) {
  const hint=typeof item.poster_query==='string'?item.poster_query.trim():'';
  let alias=item.original_title || '', year=Number(item.year) || null;
  if (!alias && /[A-Za-z]/.test(hint) && !/[А-Яа-яЁё]/.test(hint)) {
    const candidates=[...hint.matchAll(/\b(?:19|20)\d{2}\b/g)].filter(match=>match.index>0 && Number(match[0])<=new Date().getUTCFullYear()+5);
    const date=candidates.at(-1);
    alias=(date?hint.slice(0,date.index):hint).replace(/\s+(?:HBO|Netflix|Prime Video|Apple TV\+?|Disney\+?|official poster|poster)\s*$/i,'').trim();
    if(!year && date)year=Number(date[0]);
  }
  const signature=norm(alias || item.title)+':'+(year || '');
  return {alias,year,signature};
}
export function matchTitle(item, candidates, kind) {
  const identity=identityOf(item), names=(identity.alias?[identity.alias]:[item.title]).map(norm);
  const exact=candidates.filter(candidate=>{
    if(candidate.media_type && candidate.media_type!==kind)return false;
    if(!names.some(name=>[candidate.name,candidate.title,candidate.original_name,candidate.original_title,candidate.nameRu,candidate.nameEn,candidate.nameOriginal].some(value=>norm(value)===name)))return false;
    const year=Number(String(candidate.first_air_date || candidate.release_date || candidate.year || '').slice(0,4));
    return !identity.year || year===identity.year;
  });
  return exact.length===1?exact[0]:null;
}
export function mergeSeason(item, details, seasons, today) {
  const previous = Number(item.season) || 1;
  const dated = seasons.filter(season => season.n >= previous && season.episodes.some(episode => validDate(episode.date))).sort((a,b) => a.n-b.n);
  let selected = dated.find(season => season.n === previous);
  // Advance only to a confirmed season whose first episode is already out.
  const started = dated.filter(season => season.n > previous && season.episodes.some(episode => validDate(episode.date) && episode.date <= today));
  if (started.length) selected = started.at(-1);
  if (!selected) {
    const upcoming = dated.find(season => season.n > previous) || details.nextSeason;
    return upcoming ? { ...item, next_season: upcoming } : item;
  }
  const next = structuredClone(item);
  if (selected.n !== previous) {
    next.season_history = { ...(item.season_history || {}), [previous]: { episodes: item.episodes || [], total: item.total || null } };
    next.episodes = []; next.date = ''; delete next.approx;
  }
  const managed = item.release_sync?.managedSeason === selected.n;
  const old = new Map((managed ? [] : (next.episodes || [])).map(episode => [Number(episode.n), episode]));
  const manualTotal = selected.n === previous && !managed && Number(item.total)>0 ? Number(item.total) : null;
  const episodes = selected.episodes.filter(episode => Number.isInteger(episode.n) && episode.n > 0 && (!manualTotal || episode.n<=manualTotal) && validDate(episode.date)).map(episode => {
    const manual = old.get(episode.n);
    return manual && validDate(manual.date) && !managed ? manual : { ...(manual || {}), ...episode };
  });
  // Retain independently confirmed manual rows missing from the provider.
  for (const [n, episode] of old) if (!episodes.some(value => value.n === n) && validDate(episode.date)) episodes.push(episode);
  next.season = selected.n;
  next.episodes = episodes.sort((a,b) => a.n-b.n);
  if (manualTotal) next.total = manualTotal;
  else if (selected.total > 0) { next.total = selected.total; delete next.approx; }
  if (!validDate(next.date) && next.episodes.length) next.date = next.episodes[0].date;
  next.status = next.episodes.some(episode => episode.date > today) ? 'airing' : details.ended ? 'ended' : 'waiting';
  const upcoming = dated.find(season => season.n > selected.n);
  if (upcoming) next.next_season = upcoming;
  else if (details.nextSeason) next.next_season = details.nextSeason; // Announcement without invented dates.
  else delete next.next_season;
  return next;
}

export function providerClient({ tmdbToken = '', kpToken = '', request = fetch, pause = ms => new Promise(resolve => setTimeout(resolve,ms)) } = {}) {
  async function json(url, headers = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(url, { headers, signal: AbortSignal.timeout(20000) });
      if ((response.status === 429 || response.status >= 500) && attempt < 2) { await pause(Math.min(5000, (Number(response.headers.get('retry-after')) || attempt + 1) * 1000)); continue; }
      if (!response.ok) throw new Error('provider_http_' + response.status);
      return response.json();
    }
  }
  async function tmdb(endpoint, params = {}) {
    const query = new URLSearchParams({ language: 'ru-RU', ...params });
    const headers = { Accept: 'application/json' };
    if (tmdbToken.startsWith('eyJ')) headers.Authorization = 'Bearer ' + tmdbToken;
    else query.set('api_key', tmdbToken);
    return json('https://api.themoviedb.org/3/' + endpoint + '?' + query, headers);
  }
  async function kp(endpoint) { return json('https://kinopoiskapiunofficial.tech/api/' + endpoint, { 'X-API-KEY': kpToken }); }
  return {
    available: !!(tmdbToken || kpToken),
    async collect(item, kind, today) {
      const identity=identityOf(item);
      const options=[];
      const remember=(rows,provider)=>{for(const row of rows.slice(0,5)){const id=Number(row.id || row.kinopoiskId || row.filmId);if(id>0)options.push({provider,id,title:row.nameRu || row.title || row.name || row.original_title || row.original_name || '',original:row.original_title || row.original_name || row.nameEn || row.nameOriginal || '',year:Number(String(row.release_date || row.first_air_date || row.year || '').slice(0,4)) || null});}};
      let providerError;
      if (tmdbToken) try {
        const id = Number(item.tmdb_id || (item.release_sync?.provider === 'tmdb' && item.release_sync.identity === identity.signature && item.release_sync.id));
        const rows=id>0?[]:(await tmdb('search/'+kind,{query:identity.alias || item.title})).results || [];
        const hit=id>0?{id}:matchTitle(item,rows,kind);
        if(!hit)remember(rows,'tmdb');
        if (hit) {
          const data = await tmdb(kind + '/' + hit.id);
          const provenance = { provider: 'tmdb', id: hit.id, identity:identity.signature, url: 'https://www.themoviedb.org/' + kind + '/' + hit.id };
          if (kind === 'movie') {
            const countries = (await tmdb('movie/' + hit.id + '/release_dates')).results || [];
            const release = countries.find(country => country.iso_3166_1 === 'RU') || countries.find(country => country.iso_3166_1 === data.origin_country?.[0]);
            const premieres = (release?.release_dates || []).filter(value => validDate(value.release_date?.slice(0,10))).map(value => ({ date: value.release_date.slice(0,10), type: value.type, region: release.iso_3166_1 }));
            const chosen = premieres.find(value => value.type === 4) || premieres.find(value => value.type === 3) || premieres[0];
            const next = { ...item, premieres };
            if ((!validDate(item.date) || item.release_sync?.managedDate) && validDate(chosen?.date || data.release_date)) {
              next.date = chosen?.date || data.release_date;
              provenance.managedDate = true;
              provenance.region = chosen?.region || 'WORLD';
            }
            return { item: next, provenance };
          }
          const current = Number(item.season) || 1;
          const available = (data.seasons || []).filter(season => season.season_number > 0 && season.season_number >= current);
          // Current season plus nearest announced next season; never turn special episodes into S1.
          const latestStarted = Math.max(current, ...available.filter(season => validDate(season.air_date) && season.air_date <= today).map(season => season.season_number));
          const nearestFuture = Math.min(...available.filter(season => season.season_number > latestStarted).map(season => season.season_number));
          const requested = available.filter(season => [current, latestStarted, nearestFuture].includes(season.season_number));
          const seasons = [];
          for (const season of requested) {
            const detail = await tmdb('tv/' + hit.id + '/season/' + season.season_number);
            seasons.push({ n: season.season_number, total: (detail.episodes || []).length, date: validDate(season.air_date) ? season.air_date : null,
              episodes: (detail.episodes || []).filter(episode => validDate(episode.air_date)).map(episode => ({ n: Number(episode.episode_number), date: episode.air_date })) });
          }
          const announced = available.find(season => season.season_number > latestStarted);
          const next = mergeSeason(item, { ended: ['Ended','Canceled'].includes(data.status), nextSeason: announced ? { n: announced.season_number, date: validDate(announced.air_date) ? announced.air_date : null, total: announced.episode_count || null, episodes: [] } : null }, seasons, today);
          if ((!item.episodes?.length && !item.total) || item.release_sync?.managedSeason || next.season !== (Number(item.season)||1)) provenance.managedSeason = next.season;
          return { item: next, provenance };
        }
      } catch (error) { providerError = error; }
      if (kpToken) {
        const id = Number(item.kinopoisk_id || (item.release_sync?.provider === 'kinopoisk' && item.release_sync.identity === identity.signature && item.release_sync.id));
        const rows=id>0?[]:((await kp('v2.2/films?keyword='+encodeURIComponent(identity.alias || item.title)+'&type=ALL')).items || []).filter(value=>kind==='tv'?['TV_SERIES','MINI_SERIES','TV_SHOW'].includes(value.type):value.type==='FILM');
        const hit=id>0?{kinopoiskId:id}:matchTitle(item,rows.map(value=>({...value,media_type:kind})),kind);
        if(!hit)remember(rows,'kinopoisk');
        if (hit) {
          const providerId = hit.kinopoiskId || hit.filmId;
          if (kind === 'movie') {
            const distributions = await kp('v2.2/films/' + providerId + '/distributions');
            const premieres = (distributions.items || []).filter(value=>validDate(value.date) && ['WORLD_PREMIER','RUS_PREMIER','DIGITAL','DVD','BLURAY'].includes(value.type)).map(value=>({date:value.date,type:value.type==='DIGITAL'?4:['DVD','BLURAY'].includes(value.type)?5:3,region:value.type==='RUS_PREMIER'?'RU':value.country?.country || 'WORLD'}));
            const chosen = premieres.find(value=>value.type===4 && value.region==='RU') || premieres.find(value=>value.type===3 && value.region==='RU') || premieres.find(value=>value.type===4) || premieres[0];
            const next = {...item,premieres};
            const provenance = {provider:'kinopoisk',id:providerId,identity:identity.signature,url:'https://www.kinopoisk.ru/film/'+providerId+'/'};
            if (chosen && (!validDate(item.date) || item.release_sync?.managedDate)) { next.date=chosen.date; provenance.managedDate=true; provenance.region=chosen.region; }
            return {item:next,provenance};
          }
          const data = await kp('v2.2/films/' + providerId + '/seasons');
          const seasons = (data.items || []).filter(season => season.number > 0).map(season => ({ n: season.number, total: (season.episodes || []).length,
            episodes: (season.episodes || []).filter(episode => validDate(episode.releaseDate)).map(episode => ({ n: Number(episode.episodeNumber), date: episode.releaseDate })) }));
          const current = Number(item.season) || 1;
          const latestStarted = Math.max(current,...seasons.filter(season=>season.episodes.some(episode=>episode.date<=today)).map(season=>season.n));
          const announced = seasons.filter(season=>season.n>latestStarted).sort((a,b)=>a.n-b.n)[0];
          const next = mergeSeason(item, { nextSeason:announced || null }, seasons, today);
          return { item: next, provenance: { provider: 'kinopoisk', id: providerId, identity:identity.signature, url: 'https://www.kinopoisk.ru/series/' + providerId + '/', ...((!item.episodes?.length && !item.total) || item.release_sync?.managedSeason || next.season !== (Number(item.season)||1) ? { managedSeason: next.season } : {}) } };
        }
      }
      if (options.length) return {unresolved:true,candidates:options.slice(0,10)};
      if (providerError) throw providerError;
      return null;
    }
  };
}

export async function collectCatalog(catalog, kind, { provider, now = new Date(), force = false } = {}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now);
  const key = kind === 'tv' ? 'series' : 'items', next = structuredClone(catalog);
  const counts = { checked: 0, updated: 0, unresolved: 0, failed: 0, locked: 0 };
  for (let index = 0; index < next[key].length; index++) {
    const item = next[key][index];
    if (item.schedule_locked || item.no_schedule) { counts.locked++; continue; }
    if (!force && item.release_sync?.schema === 2 && now - new Date(item.release_sync?.checkedAt || 0) < (kind === 'tv' ? 6 : 24) * 3600000) continue;
    counts.checked++;
    try {
      const result = await provider.collect(item, kind, today);
      if (!result || result.unresolved) { counts.unresolved++; next[key][index] = { ...item, release_sync: { ...(item.release_sync || {}), schema:2, status: 'unresolved', candidates:result?.candidates || [], checkedAt: now.toISOString() } }; continue; }
      next[key][index] = { ...result.item, release_sync: { ...result.provenance, schema:2, checkedAt: now.toISOString() } };
      counts.updated++;
    } catch { counts.failed++; } // Do not persist request URLs, auth headers or provider response bodies.
  }
  if (counts.updated) next.updated = today;
  return { catalog: next, counts };
}

async function main() {
  const args = process.argv.slice(2), index = args.indexOf('--site-dir');
  if (index < 0 || !args[index + 1]) throw new Error('Usage: node cinema-collector.mjs --site-dir series-app/site [--force]');
  const directory = path.resolve(args[index + 1], 'data');
  const provider = providerClient({ tmdbToken: (process.env.TMDB_TOKEN || '').trim(), kpToken: (process.env.KINOPOISK_TOKEN || '').trim() });
  if (!provider.available) throw new Error('No schedule provider configured; existing catalog was not changed.');
  const now = new Date(), report = { checkedAt: now.toISOString(), status: 'ready', series: null, movies: null };
  for (const [name, kind] of [['series','tv'], ['movies','movie']]) {
    const file = path.join(directory, name + '.json');
    const result = await collectCatalog(JSON.parse(await fs.readFile(file, 'utf8')), kind, { provider, now, force: args.includes('--force') });
    report[name] = result.counts;
    if (result.counts.failed) report.status = 'partial';
    if (result.counts.checked) await fs.writeFile(file, JSON.stringify(result.catalog, null, 2) + '\n');
  }
  if (report.series.checked + report.movies.checked) await fs.writeFile(path.join(directory, 'collector-status.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (report.series.checked + report.movies.checked > 0 && report.series.failed + report.movies.failed === report.series.checked + report.movies.checked) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(() => { console.error('Cinema collector failed; inspect provider configuration and connectivity. Secrets are never logged.'); process.exitCode = 1; });
