'use strict';
// Add immutable note-only official inputs; never replace a valid daily input by its outcome.
const fs=require('node:fs'),path=require('node:path');
const h=require('./independent-weather-history-v1.cjs');
const archive=require('./daily-prediction-source-archive');
const VERSION='independent-weather-history-v2',SOURCE='data/stats/independent-weather-history-v2.json';
const bump=(o,k)=>{o[k]=(o[k]||0)+1;};
function timestamp(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return NaN;
  const day=Date.parse(value.slice(0,10)+'T00:00:00Z');
  return Number.isFinite(day)&&new Date(day).toISOString().slice(0,10)===value.slice(0,10)?Date.parse(value):NaN;
}
function noteProjection(raw,file,date){
  let b;try{b=JSON.parse(raw);}catch{return {reason:'note-json-invalid'};}
  const r=b?.record,a=b?.generationAudit,key=r?.raceKey,sha256=h.hash(raw);
  if(b?.version!=='note-draft-bundle-v1'||!r||r.date!==date||
    !/^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(key||'')||key!==`${r.date}-${r.jcd}-${r.raceNo}`||
    file!==`data/note-drafts/${date}/${key}-${sha256}.json`||!/^[a-f0-9]{40}$/.test(b.sourceCommit||''))return {reason:'note-source-or-identity-invalid'};
  const selected=timestamp(r.selectedAt),captured=timestamp(b.capturedAt),audited=timestamp(a?.auditedAt),deadline=timestamp(r.deadlineAt);
  if(!Number.isFinite(selected)||captured!==selected||!(selected<=audited&&audited<deadline)||
    a?.version!=='note-publication-audit-v1'||a.raceKey!==key||a.contentReady!==true||
    r.reviewEvidence?.officialResultUsedForPrediction===true)return {reason:'note-audit-or-clock-invalid'};
  const p=h.project(r,date);if(p.reason)return p;
  // Retain official facts only, not model scores, article text, tickets or odds.
  const v=p.value,record={date,jcd:r.jcd,raceNo:r.raceNo,raceKey:key,selectedAt:v.selectedAt,deadlineAt:v.deadlineAt,
    prediction:{preRaceConditions:{schemaVersion:4,source:'boatrace-official',sourceTiming:'pre_deadline',officialResultUsed:false,
      sourceFetchedAt:v.sourceFetchedAt,weather:(r.prediction?.preRaceConditions||r.preRaceConditions).weather,
      boats:v.rows.map(x=>({boatNo:x.boat,course:x.course,registerNo:x.registerNo,courseOfficial:true,courseMappingSource:'official-start-image'}))}}};
  return {value:v,record,source:{path:file,sha256,sourceCommit:b.sourceCommit,capturedAt:b.capturedAt,auditedAt:a.auditedAt}};
}
function supplement(out,date,notes,results,blocked){
  if(date<out.window.firstDate||date>out.window.lastDate)return;
  const c=out.noteSupplement,canonical=new Map();
  for(const {raw,file} of notes){
    c.examined++;const n=noteProjection(raw,file,date);
    if(n.reason){bump(c.rejected,n.reason);continue;}c.eligible++;
    const key=n.value.raceKey;if(blocked.has(key)){c.dailyOverlap++;continue;}
    const old=canonical.get(key);if(old)c.duplicateBundles++;
    // Latest eligible capture; equal times use raw SHA ascending, independent of results.
    if(!old||Date.parse(n.value.selectedAt)>Date.parse(old.value.selectedAt)||
      Date.parse(n.value.selectedAt)===Date.parse(old.value.selectedAt)&&n.source.sha256<old.source.sha256)canonical.set(key,n);
  }
  c.canonicalRaces+=canonical.size;
  for(const n of canonical.values()){
    const before=out.evidence.length,oldRejected={...out.coverage.rejected};
    h.ingest(out,date,{predictions:[n.record]},results,[{path:n.source.path,sha256:n.source.sha256}]);
    for(const [reason,count] of Object.entries(out.coverage.rejected))if(count>(oldRejected[reason]||0))bump(c.rejected,reason);
    if(out.evidence.length===before)continue;
    const e=out.evidence[before];e.predictionKind='note-draft-bundle';e.noteSource=n.source;c.acceptedRaces++;
  }
}
function build(root,{now=new Date(),sourceCommit=process.env.GITHUB_SHA||''}={}){
  const raw=fs.readFileSync(path.join(root,h.SOURCE)),base=JSON.parse(raw),asOfDate=new Date(now.getTime()+9*3600000).toISOString().slice(0,10).replaceAll('-','');
  const expected=h.create({asOfDate,generatedAt:now.toISOString(),sourceCommit});
  if(base.version!==h.VERSION||base.builderHash!==h.hash(fs.readFileSync(require.resolve('./independent-weather-history-v1.cjs')))||
    base.sourceCommit!==sourceCommit||h.json(base.window)!==h.json(expected.window)||!(Date.parse(base.generatedAt)<=now.getTime())||
    base.usableForPrediction!==false||base.automaticApplication!==false)throw Error('weather_note_baseline_invalid');
  const out=base,blocked=new Set();
  // Include every valid daily input, even if its result was rejected: no outcome-based fallback.
  for(const ref of out.sourceFiles.filter(x=>/^data\/predictions\/\d{8}\.json$/.test(x.path))){
    const bytes=fs.readFileSync(path.join(root,ref.path));if(h.hash(bytes)!==ref.sha256)throw Error('weather_note_daily_source_changed');
    const data=JSON.parse(bytes),date=path.basename(ref.path,'.json');
    for(const kind of ['predictions','verificationPredictions'])for(const r of data[kind]||[]){const p=h.project(r,date);if(p.value)blocked.add(p.value.raceKey);}
  }
  out.version=VERSION;out.generatedAt=now.toISOString();out.baseline={path:h.SOURCE,sha256:h.hash(raw),builderHash:base.builderHash,acceptedRaces:base.coverage.acceptedRaces};
  out.noteSupplement={examined:0,eligible:0,dailyOverlap:0,duplicateBundles:0,canonicalRaces:0,acceptedRaces:0,rejected:{},missingResultFiles:[]};
  out.population='saved daily inputs plus valid immutable note-only official inputs; complete weather and six normal finishers; not all starts or causal suitability';
  const dir=path.join(root,'data/note-drafts');
  for(const date of fs.existsSync(dir)?fs.readdirSync(dir).filter(d=>/^\d{8}$/.test(d)&&d>=out.window.firstDate&&d<=out.window.lastDate).sort():[]){
    const resultPath=`data/results/${date}.json`;
    if(!fs.existsSync(path.join(root,resultPath))){out.noteSupplement.missingResultFiles.push(date);continue;}
    const resultRaw=fs.readFileSync(path.join(root,resultPath)),sha256=h.hash(resultRaw),existing=out.sourceFiles.find(x=>x.path===resultPath);
    if(existing&&existing.sha256!==sha256)throw Error('weather_note_result_source_changed');
    if(!existing)out.sourceFiles.push({path:resultPath,sha256});
    function* notes(){for(const f of fs.readdirSync(path.join(dir,date)).filter(f=>f.endsWith('.json')).sort()){
      const file=`data/note-drafts/${date}/${f}`;yield {file,raw:fs.readFileSync(path.join(root,file))};}}
    supplement(out,date,notes(),JSON.parse(resultRaw),blocked);
  }
  out.evidence.sort((a,b)=>a.raceKey.localeCompare(b.raceKey));out.builderHash=h.hash(fs.readFileSync(__filename));
  archive.atomicWrite(path.join(root,SOURCE),Buffer.from(h.json(out)));
  console.log(JSON.stringify({weatherHistoryV2:out.coverage,noteSupplement:out.noteSupplement}));return out;
}
if(require.main===module)build(process.cwd());
module.exports={...h,VERSION,SOURCE,noteProjection,supplement,build};
