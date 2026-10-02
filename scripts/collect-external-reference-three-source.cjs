'use strict';
const fs=require('node:fs'), path=require('node:path');
const {hiyoriDailySignals,macourWakamatsuSignals,macourWakamatsuRaceSignal,brPublicCapability,captureFromSignal}=require('./external-reference-source-adapters.cjs');
const {saveCapture}=require('./external-reference-three-source.cjs');

const jstDate=now=>new Date(now+9*3600000).toISOString().slice(0,10).replace(/-/g,'');
function deadlines(root,date){
 const map=new Map();
 const walk=v=>{
  if(!v||typeof v!=='object') return;
  if(typeof v.raceKey==='string'&&typeof v.deadlineAt==='string'){
   const deadline=Date.parse(v.deadlineAt);
   if(Number.isFinite(deadline)) map.set(v.raceKey,deadline);
  }
  for(const x of Object.values(v)) if(x&&typeof x==='object') Array.isArray(x)?x.forEach(walk):walk(x);
 };
 // Prefer the small immutable exhibition-ready note sources. The canonical
 // daily prediction file can exceed 100 MB and some generations do not carry
 // deadlineAt at all; treating that as the only clock source made valid public
 // references look unmatched.
 const drafts=path.join(root,'data','note-drafts',date);
 if(fs.existsSync(drafts)){
  for(const name of fs.readdirSync(drafts).filter(n=>n.endsWith('.json')).sort()){
   try{walk(JSON.parse(fs.readFileSync(path.join(drafts,name),'utf8')));}catch{}
  }
 }
 // Union all existing trusted pre-race clock sources. Returning as soon as
 // one note draft was found made unrelated Hiyori/Macour races invisible.
 const file=path.join(root,'data','predictions',date+'.json');
 if(fs.existsSync(file)) try{walk(JSON.parse(fs.readFileSync(file,'utf8')));}catch{}
 return map;
}
async function get(url,fetcher=fetch){
 const r=await fetcher(url,{redirect:'follow',signal:AbortSignal.timeout(7000),headers:{'User-Agent':'ChappyResearch/1.0 (public pre-race reference comparison)','Cache-Control':'no-cache'}});
 if(!r.ok) throw new Error('http_'+r.status);
 const b=Buffer.from(await r.arrayBuffer()); if(b.length>1024*1024) throw new Error('response_too_large');
 return b;
}
function officialDeadlineFromHtml(html,date,raceNo){
 const text=String(html).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 const m=text.match(/締切予定時刻\s+((?:\d{1,2}:\d{2}\s*){1,12})/);
 if(!m) return null;
 const times=m[1].match(/\d{1,2}:\d{2}/g)||[], value=times[Number(raceNo)-1];
 if(!value) return null;
 const [hh,mm]=value.split(':').map(Number), y=Number(date.slice(0,4)),mo=Number(date.slice(4,6)),d=Number(date.slice(6,8));
 return Date.UTC(y,mo-1,d,hh-9,mm);
}
async function officialDeadline(date,jcd,raceNo,fetcher){
 const url=`https://www.boatrace.jp/owpc/pc/race/racelist?rno=${raceNo}&jcd=${jcd}&hd=${date}`;
 const bytes=await get(url,fetcher); return officialDeadlineFromHtml(bytes.toString('utf8'),date,raceNo);
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
    let deadline=ds.get(signal.raceKey);
    if(!Number.isFinite(deadline)){
     const [,jcd,raceNo]=signal.raceKey.split('-');
     try{deadline=await officialDeadline(date,jcd,raceNo,fetcher);}catch(e){errors.push({source:'official_deadline',raceKey:signal.raceKey,reason:e.message});}
    }
    if(!Number.isFinite(deadline)){skipped.push({source:s.source,raceKey:signal.raceKey,reason:'no_verified_pre_race_deadline'});continue;}
    if(deadline-now<=120000){skipped.push({source:s.source,raceKey:signal.raceKey,reason:'outside_pre_result_window'});continue;}
    const value=captureFromSignal(s.source,signal,{capturedAt:new Date(now).toISOString(),sourceUrl:s.url,rawBytes:bytes});
    captured.push({source:s.source,raceKey:signal.raceKey,file:path.relative(root,saveCapture(root,value))});
   }
  }catch(e){errors.push({source:s.source,reason:e.message});}
 }
 // Macour exposes public race-by-race Wakamatsu previews. Fetch only locally
 // known races that are still safely before deadline; never fetch result pages.
 for(let raceNo=1;raceNo<=12;raceNo++){
  const raceKey=`${date}-20-${raceNo}`; let deadline=ds.get(raceKey);
  if(!Number.isFinite(deadline)) try{deadline=await officialDeadline(date,'20',raceNo,fetcher);}catch(e){errors.push({source:'official_deadline',raceKey,reason:e.message});}
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
module.exports={jstDate,deadlines,get,officialDeadlineFromHtml,officialDeadline,collect};
