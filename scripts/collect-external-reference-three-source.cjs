'use strict';
const fs=require('node:fs'), path=require('node:path');
const {hiyoriDailySignals,macourWakamatsuSignals,macourWakamatsuRaceSignal,brPublicCapability,captureFromSignal}=require('./external-reference-source-adapters.cjs');
const {saveCapture}=require('./external-reference-three-source.cjs');

const jstDate=now=>new Date(now+9*3600000).toISOString().slice(0,10).replace(/-/g,'');
function deadlines(root,date){
 const file=path.join(root,'data','predictions',date+'.json'), map=new Map();
 if(!fs.existsSync(file)) return map;
 const walk=v=>{
  if(!v||typeof v!=='object') return;
  if(typeof v.raceKey==='string'&&typeof v.deadlineAt==='string') map.set(v.raceKey,Date.parse(v.deadlineAt));
  for(const x of Object.values(v)) if(x&&typeof x==='object') Array.isArray(x)?x.forEach(walk):walk(x);
 };
 try{walk(JSON.parse(fs.readFileSync(file)));}catch{}
 return map;
}
async function get(url,fetcher=fetch){
 const r=await fetcher(url,{redirect:'follow',signal:AbortSignal.timeout(7000),headers:{'User-Agent':'ChappyResearch/1.0 (public pre-race reference comparison)','Cache-Control':'no-cache'}});
 if(!r.ok) throw new Error('http_'+r.status);
 const b=Buffer.from(await r.arrayBuffer()); if(b.length>1024*1024) throw new Error('response_too_large');
 return b;
}
async function collect({root=process.cwd(),now=Date.now(),fetcher=fetch}={}){
 const date=jstDate(now), ds=deadlines(root,date), captured=[], skipped=[], errors=[];
 const sources=[
  {source:'hiyori',url:`https://kyoteibiyori.com/blog/${date}0001`,parse:b=>hiyoriDailySignals(b.toString('utf8'),date)}
 ];
 for(const s of sources){
  try{
   const bytes=await get(s.url,fetcher), signals=s.parse(bytes);
   for(const signal of signals){
    const deadline=ds.get(signal.raceKey);
    if(!Number.isFinite(deadline)){skipped.push({source:s.source,raceKey:signal.raceKey,reason:'no_local_pre_race_deadline'});continue;}
    if(deadline-now<=120000){skipped.push({source:s.source,raceKey:signal.raceKey,reason:'outside_pre_result_window'});continue;}
    const value=captureFromSignal(s.source,signal,{capturedAt:new Date(now).toISOString(),sourceUrl:s.url,rawBytes:bytes});
    captured.push({source:s.source,raceKey:signal.raceKey,file:path.relative(root,saveCapture(root,value))});
   }
  }catch(e){errors.push({source:s.source,reason:e.message});}
 }
 // Macour exposes public race-by-race Wakamatsu previews. Fetch only locally
 // known races that are still safely before deadline; never fetch result pages.
 for(let raceNo=1;raceNo<=12;raceNo++){
  const raceKey=`${date}-20-${raceNo}`, deadline=ds.get(raceKey);
  if(!Number.isFinite(deadline)||deadline-now<=120000) continue;
  const url=`https://wyosou.macour.jp/index/list/day/${date}/no/${raceNo}`;
  try{
   const bytes=await get(url,fetcher), signal=macourWakamatsuRaceSignal(bytes.toString('utf8'),date,raceNo);
   if(!signal){skipped.push({source:'macour',raceKey,reason:'public_preview_not_ready_or_unstructured'});continue;}
   const value=captureFromSignal('macour',signal,{capturedAt:new Date(now).toISOString(),sourceUrl:url,rawBytes:bytes});
   captured.push({source:'macour',raceKey,file:path.relative(root,saveCapture(root,value))});
  }catch(e){errors.push({source:'macour',raceKey,reason:e.message});}
 }
 let br;
 try{
  const url='https://boatrace.site/', bytes=await get(url,fetcher);
  br={url,...brPublicCapability(bytes.toString('utf8'))};
 }catch(e){br={url:'https://boatrace.site/',raceLevelPublic:false,methodologyAvailable:false,error:e.message};}
 const report={version:'external-reference-collector-v1',generatedAt:new Date(now).toISOString(),date,
  productionChanged:false,automaticApplication:false,usableForPrediction:false,captured,skipped,errors,
  capabilities:{hiyori:{raceLevelPublic:true},macour:{raceLevelPublic:'wakamatsu_public_preview_only'},br},
  note:'BR public site exposes methodology; race-level B/E/S/A/G/K/L/W values are sold on note/regimag, so no race capture is fabricated.'};
 const out=path.join(root,'data','stats','external-reference-collector-v1.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 return report;
}
if(require.main===module) collect().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={jstDate,deadlines,get,collect};
