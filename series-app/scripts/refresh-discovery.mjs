// Existing cinema server only. Credentials stay in its original workflow environment.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const norm = s => String(s || '').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');
export function normalizeTitle(row,kind,today) {
  if (!Number.isSafeInteger(row.id) || row.id<=0 || row.adult || !(row.title || row.name)) return null;
  const date = row.release_date || row.first_air_date || '';
  return {catalog_source:'tmdb',id:'t-'+kind+'-'+row.id,tmdb_id:row.id,kind:kind==='movie'?'film':'series',title:row.title || row.name,original_title:row.original_title || row.original_name || '',year:validDate(date)?date.slice(0,4):'',date:validDate(date)?date:'',release_state:validDate(date)&&date<=today?'released':'upcoming',desc:row.overview || '',poster:row.poster_path?'https://image.tmdb.org/t/p/w500'+row.poster_path:'',...(row.vote_count>0 && row.vote_average>0?{rating:Math.round(row.vote_average*10)/10}:{})};
}
export async function refreshDiscovery({siteDir,token='',request=fetch,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date()),force=false,random=Math.random}={}) {
  const read = async (name,fallback) => {try{return JSON.parse(await fs.readFile(path.join(siteDir,'data',name+'.json'),'utf8'));}catch{return fallback;}};
  const previous=await read('discovery-status',{});
  if (!force && previous.checkedAt?.slice(0,10)===today && previous.status==='ready') return {status:'skipped'};
  if (!force && previous.attemptedAt && Date.now()-Date.parse(previous.attemptedAt)<3600000) return {status:'throttled'};
  const pool=await read('pool',{items:[]}),discover=await read('discover',{items:[]});
  const series=await read('series',{series:[]}),movies=await read('movies',{items:[]});
  const oldIds=new Set([...series.series,...movies.items].map(x=>norm(x.title)));
  const report={checkedAt:previous.checkedAt || null,attemptedAt:new Date().toISOString(),status:'error',requests:0};
  const results=[],recommendations=[];
  async function tmdb(endpoint,params={}) {
    const headers={Accept:'application/json'},query=new URLSearchParams({language:'ru-RU',include_adult:'false',...params});
    if(token.startsWith('eyJ'))headers.Authorization='Bearer '+token;else query.set('api_key',token);
    for(let attempt=0;attempt<3;attempt++){
      report.requests++;
      const response=await request('https://api.themoviedb.org/3/'+endpoint+'?'+query,{headers,signal:AbortSignal.timeout(20000)});
      if(!response.ok){if((response.status===429 || response.status>=500)&&attempt<2){await new Promise(r=>setTimeout(r,1000*(attempt+1)));continue;}throw new Error('tmdb_http_'+response.status);}
      return response.json();
    }
  }
  try {
    if(!token)throw new Error('tmdb_not_configured');
    for(const kind of ['movie','tv']) {
      const first=await tmdb('discover/'+kind,{sort_by:'popularity.desc',page:1});
      const max=Math.min(500,Number(first.total_pages)||1),pages=new Set([1]);
      for(let i=0;i<6;i++)pages.add(1+Math.floor(random()*max));
      for(const page of pages){const rows=page===1?first:await tmdb('discover/'+kind,{sort_by:'popularity.desc',page});for(const row of rows.results||[]){const item=normalizeTitle(row,kind,today);if(item)results.push(item);}}
      // Upcoming titles are not filtered out by vote thresholds.
      for(const page of [1,2]) {
        const rows=await tmdb('discover/'+kind,{sort_by:'popularity.desc',[kind==='movie'?'primary_release_date.gte':'first_air_date.gte']:today,page});
        for(const row of rows.results||[]){const item=normalizeTitle(row,kind,today);if(item)results.push(item);}
      }
      const own=kind==='movie'?movies.items:series.series;
      const seeds=own.filter(x=>x.tmdb_id || x.release_sync?.provider==='tmdb').slice().sort((a,b)=>(b.added||'').localeCompare(a.added||''));
      // Rotate verified collection seeds, independently of viewing flags/history.
      const offset=seeds.length?Number(today.replaceAll('-',''))%seeds.length:0;
      for(let i=0;i<Math.min(2,seeds.length);i++){
        const seed=seeds[(offset+i)%seeds.length],id=seed.tmdb_id || seed.release_sync.id;
        let rows;
        try { rows=await tmdb(kind+'/'+id+'/recommendations'); } catch(error) { if(error.message==='tmdb_http_404')continue;throw error; }
        for(const row of rows.results||[]){const item=normalizeTitle(row,kind,today);if(item&&!oldIds.has(norm(item.title))&&item.release_state==='released')recommendations.push({...item,rec:true,recommendation_source:'tmdb',because:'TMDB предлагает по тайтлу «'+seed.title+'» из твоей коллекции.'});}
      }
    }
    const fresh=new Map(results.map(x=>[x.id,x]));
    for(const item of pool.items || [])if(!fresh.has(item.id))fresh.set(item.id,item);
    const items=[...fresh.values()].slice(0,1000);
    if(!results.length)throw new Error('tmdb_empty_results');
    const recs=[...new Map(recommendations.map(x=>[x.id,x])).values()].slice(0,16);
    // Keep curated discoveries; replace only this generator's previous suggestions.
    const curated=(discover.items||[]).filter(x=>x.recommendation_source!=='tmdb');
    const curatedIds=new Set(curated.map(x=>x.id));
    const nextDiscover={...discover,updated:today,items:[...curated,...recs.filter(x=>!curatedIds.has(x.id))]};
    await fs.writeFile(path.join(siteDir,'data/pool.json'),JSON.stringify({...pool,updated:today,items},null,2)+'\n');
    if(recs.length)await fs.writeFile(path.join(siteDir,'data/discover.json'),JSON.stringify(nextDiscover,null,2)+'\n');
    Object.assign(report,{status:'ready',checkedAt:new Date().toISOString(),pool:items.length,recommendations:recs.length});
  } catch(error) {report.error=/^(tmdb_http_\d+|tmdb_empty_results|tmdb_not_configured)$/.test(error.message)?error.message:'tmdb_unavailable';}
  await fs.writeFile(path.join(siteDir,'data/discovery-status.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const flag=process.argv.indexOf('--site-dir');
  const report=await refreshDiscovery({siteDir:flag>=0?path.resolve(process.argv[flag+1]):path.resolve('series-app/site'),token:(process.env.TMDB_TOKEN||'').trim(),force:process.argv.includes('--force')});
  console.log(JSON.stringify(report));if(report.status==='error')process.exitCode=1;
}
