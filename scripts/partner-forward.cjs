'use strict';
// Fixed B/D candidates; capture and remote seal are separate from settlement.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const repo='takechanman12250711-oss/chappy-boatrace-ai';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const json=x=>JSON.stringify(x)+'\n';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function protocol(root) {
  const raw=fs.readFileSync(path.join(root,'config/partner-forward.json'));
  const value=JSON.parse(raw);
  if(hash(fs.readFileSync(path.join(root,'scripts/research-escape-partners.cjs')))!==value.selectorSha256) throw Error('selector_changed');
  return {value,digest:hash(raw)};
}
function validTickets(a){return Array.isArray(a)&&a.length>0&&a.length<=10&&new Set(a).size===a.length&&a.every(t=>/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split('-')).size===3);}
function heads(a){return a.map(t=>t[0]).sort().join('');}
function validSnapshot(s,p){
  return s?.version==='partner-forward-snapshot-v1'&&s.protocolHash===p.digest&&s.selectorHash===p.value.selectorSha256&&s.method===p.value.method&&
    /^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(s.raceKey)&&s.date===s.raceKey.slice(0,8)&&
    /^[a-f0-9]{64}$/.test(s.sourceSha256)&&s.sourcePath===`data/note-drafts/${s.date}/${s.raceKey}-${s.sourceSha256}.json`&&
    /^\d+$/.test(s.runId)&&/^\d+$/.test(s.runAttempt)&&/^[a-f0-9]{40}$/.test(s.workflowHead)&&/^[a-f0-9]{40}$/.test(s.codeCommit)&&
    Date.parse(s.selectedAt)<=Date.parse(s.capturedAt)&&Date.parse(s.capturedAt)<Date.parse(s.deadlineAt)&&
    p.value.variants.every(k=>validTickets(s[k])&&s[k].length===s.baseline.length&&heads(s[k])===heads(s.baseline));
}
function validSeal(r,p){
  const s=r?.snapshot,a=r?.artifact;
  return r?.version==='partner-forward-seal-v1'&&validSnapshot(s,p)&&r.snapshotHash===hash(json(s))&&
    Number.isSafeInteger(a?.id)&&a.id>0&&/^sha256:[a-f0-9]{64}$/.test(a.digest)&&
    a.runId===s.runId&&a.workflowHead===s.workflowHead&&a.name===`partner-forward-${s.runId}-${s.runAttempt}`&&
    Date.parse(s.capturedAt)<Date.parse(a.createdAt)+1000&&Date.parse(a.createdAt)<=Date.parse(a.confirmedAt)&&Date.parse(a.confirmedAt)<Date.parse(s.deadlineAt);
}
function writeOnce(file,bytes){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{const fd=fs.openSync(temp,'wx');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    try{fs.linkSync(temp,file);}catch(e){if(e.code!=='EEXIST'||fs.readFileSync(file,'utf8')!==bytes)throw e;}
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function files(root,dir){const base=path.join(root,dir);if(!fs.existsSync(base))return [];return fs.readdirSync(base).filter(d=>/^\d{8}$/.test(d)).sort().flatMap(d=>fs.readdirSync(path.join(base,d)).filter(f=>f.endsWith('.json')).sort().map(f=>path.posix.join(dir,d,f)));}
function cohort(root,p){
  const rejected={},byRace=new Map();
  for(const file of files(root,'data/partner-forward')){
    try{const raw=fs.readFileSync(path.join(root,file)),r=JSON.parse(raw);if(!validSeal(r,p)||path.basename(file)!==`${r.snapshot.raceKey}-${hash(raw)}.json`)throw Error('invalid-seal');
      const old=byRace.get(r.snapshot.raceKey);const order=x=>`${x.artifact.confirmedAt}|${x.snapshot.capturedAt}|${x.snapshotHash}`;
      if(!old||order(r)<order(old))byRace.set(r.snapshot.raceKey,r);
    }catch(e){rejected[e.message]=(rejected[e.message]||0)+1;}
  }
  return {rows:[...byRace.values()].sort((a,b)=>a.artifact.confirmedAt.localeCompare(b.artifact.confirmedAt)||a.snapshot.raceKey.localeCompare(b.snapshot.raceKey)).slice(0,p.value.targetRaces),rejected};
}
function capture(root,out,env=process.env,now=Date.now()){
  if(env.GITHUB_REPOSITORY!==repo||env.GITHUB_REF!=='refs/heads/main')throw Error('capture_context_invalid');
  const p=protocol(root), existing=cohort(root,p), seen=new Set(existing.rows.map(r=>r.snapshot.raceKey)), skips={};
  fs.mkdirSync(out,{recursive:true});if(fs.readdirSync(out).length)throw Error('capture_directory_not_empty');
  const codeCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const {assess}=require('./build-race-review-progress'),selector=require('./research-escape-partners.cjs');
  const staged=new Map();
  if(seen.size<p.value.targetRaces)for(const file of files(root,'data/note-drafts').filter(f=>f.split('/')[2]===new Date(now+9*3600000).toISOString().slice(0,10).replace(/-/g,''))){
    try{
      const raw=fs.readFileSync(path.join(root,file)),bundle=JSON.parse(raw),r=bundle.record;
      if(!r||Date.parse(r.deadlineAt)<=now||seen.has(r.raceKey))continue;
      const a=assess(bundle);if(a.reason)throw Error(a.reason);if(a.method!==p.value.method)throw Error('other-method');
      if(a.row.practicalSelectionEvidence?.status!=='validated')throw Error('invalid-selection-evidence');
      const sourceSha256=hash(raw);if(path.basename(file)!==`${r.raceKey}-${sourceSha256}.json`)throw Error('source-hash-mismatch');
      const row={baseline:a.row.prediction.practicalTickets,pool:a.row.prediction.candidate24Tickets,evidence:a.row.practicalSelectionEvidence,
        courses:selector.courseMap(r.prediction.preRaceConditions?.boats,true)};
      const selected=selector.select(row,{samples:0,pairs:{}});if(selected.reason)throw Error(selected.reason);
      const s={version:'partner-forward-snapshot-v1',protocolHash:p.digest,selectorHash:p.value.selectorSha256,method:a.method,
        raceKey:r.raceKey,date:r.date,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,capturedAt:new Date(now).toISOString(),
        sourcePath:file,sourceSha256,runId:String(env.GITHUB_RUN_ID),runAttempt:String(env.GITHUB_RUN_ATTEMPT),workflowHead:env.GITHUB_SHA,codeCommit,
        baseline:selected.baseline,control:selected.control,guarded:selected.guarded};
      if(!validSnapshot(s,p))throw Error('invalid-snapshot');
      const old=staged.get(s.raceKey);if(!old||s.selectedAt>old.selectedAt||(s.selectedAt===old.selectedAt&&s.sourceSha256<old.sourceSha256))staged.set(s.raceKey,s);
    }catch(e){skips[e.message]=(skips[e.message]||0)+1;}
  }
  for(const s of staged.values())writeOnce(path.join(out,hash(json(s))+'.json'),json(s));
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`count=${staged.size}\n`);
  const result={captured:staged.size,alreadySealed:seen.size,target:p.value.targetRaces,skips};console.log(JSON.stringify(result));return result;
}
async function seal(root,out,env=process.env,fetcher=fetch){
  if(env.GITHUB_REPOSITORY!==repo||env.GITHUB_REF!=='refs/heads/main'||!/^\d+$/.test(env.PARTNER_ARTIFACT_ID||''))throw Error('seal_context_invalid');
  const p=protocol(root),response=await fetcher(`https://api.github.com/repos/${repo}/actions/artifacts/${env.PARTNER_ARTIFACT_ID}`,{
    headers:{Authorization:`Bearer ${env.GH_TOKEN}`,Accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error('artifact_metadata_unavailable');
  const a=await response.json(),digest='sha256:'+String(env.PARTNER_ARTIFACT_DIGEST||'').replace(/^sha256:/,'');
  const server=Date.parse(response.headers.get('date'))+1000; // HTTP Date has second precision: use its upper bound.
  if(!Number.isFinite(server)||a.expired||a.id!==Number(env.PARTNER_ARTIFACT_ID)||a.digest!==digest||
    a.name!==`partner-forward-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`||String(a.workflow_run?.id)!==env.GITHUB_RUN_ID||a.workflow_run?.head_sha!==env.GITHUB_SHA)throw Error('artifact_identity_mismatch');
  let saved=0,late=0;
  for(const file of fs.readdirSync(out).filter(f=>/^[a-f0-9]{64}\.json$/.test(f))){
    const raw=fs.readFileSync(path.join(out,file)),s=JSON.parse(raw);if(file!==hash(raw)+'.json'||!validSnapshot(s,p))throw Error('snapshot_hash_mismatch');
    if(s.runId!==env.GITHUB_RUN_ID||s.runAttempt!==env.GITHUB_RUN_ATTEMPT||s.workflowHead!==env.GITHUB_SHA)throw Error('snapshot_run_mismatch');
    const receipt={version:'partner-forward-seal-v1',snapshotHash:hash(raw),snapshot:s,artifact:{id:a.id,digest:a.digest,name:a.name,
      runId:s.runId,workflowHead:s.workflowHead,createdAt:a.created_at,confirmedAt:new Date(server).toISOString()}};
    if(server>=Date.parse(s.deadlineAt)){late++;continue;}
    if(!validSeal(receipt,p))throw Error('invalid-artifact-time');
    const bytes=json(receipt);writeOnce(path.join(root,'data/partner-forward',s.date,`${s.raceKey}-${hash(bytes)}.json`),bytes);saved++;
  }
  console.log(JSON.stringify({sealed:saved,late}));return {saved,late};
}
function report(root){
  const p=protocol(root),c=cohort(root,p),{resultOf,chooseOfficialResult}=require('./audit-escape-main.cjs'),input=require('./analysis-input-contract');
  const results=new Map(),wanted=new Set(c.rows.map(r=>r.snapshot.raceKey));
  for(const date of new Set(c.rows.map(r=>r.snapshot.date))){const f=path.join(root,'data/results',date+'.json');if(!fs.existsSync(f))continue;
    for(const r of read(f).races||[]){const k=input.raceKey(r);if(wanted.has(k))results.set(k,chooseOfficialResult(results.get(k),r));}}
  const ledger=path.join(root,'data/stats/race-review-results.json');if(fs.existsSync(ledger))for(const r of Object.values(read(ledger).races||{})){const k=input.raceKey(r);if(wanted.has(k))results.set(k,chooseOfficialResult(results.get(k),r));}
  const settled=[],pending=[],excluded=[];
  for(const r of c.rows){const s=r.snapshot,result=resultOf(results.get(s.raceKey));if(!result)pending.push(s.raceKey);else if(result.excluded)excluded.push({raceKey:s.raceKey,reason:result.excluded});else settled.push({...s,...result});}
  const stats={};for(const k of p.value.variants){const stake=settled.reduce((s,r)=>s+r[k].length*100,0),hits=settled.filter(r=>r[k].includes(r.actual)),returned=hits.reduce((s,r)=>s+r.payout,0);stats[k]={races:settled.length,hits:hits.length,stake,returned,hitRate:settled.length?hits.length/settled.length*100:null,recoveryRate:stake?returned/stake*100:null};}
  const {compareSelections}=require('./research-escape-partners.cjs');
  const d={version:'partner-forward-report-v1',generatedAt:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA||'',protocol:p.value,protocolHash:p.digest,
    productionChanged:false,automaticProductionChange:false,usableForPrediction:false,decisionGate:{status:'INSUFFICIENT_EVIDENCE',reason:'100 races are a fixed research checkpoint, not a registered adoption gate'},
    sealed:c.rows.length,target:p.value.targetRaces,checkpointReached:c.rows.length===p.value.targetRaces,pending,excluded,rejected:c.rejected,
    firstConfirmedAt:c.rows[0]?.artifact.confirmedAt||null,lastConfirmedAt:c.rows.at(-1)?.artifact.confirmedAt||null,
    stats,comparisons:{priorityVsSaved:compareSelections(settled,'baseline','control'),guardedVsSaved:compareSelections(settled,'baseline','guarded'),guardedVsPriority:compareSelections(settled,'control','guarded')},rows:c.rows};
  const file=path.join(root,'data/stats/partner-forward-report.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',json(d));fs.renameSync(file+'.tmp',file);
  console.log(JSON.stringify({...d,rows:undefined}));return d;
}
if(require.main===module){const [mode,out]=process.argv.slice(2);Promise.resolve().then(()=>mode==='capture'?capture(process.cwd(),out):mode==='seal'?seal(process.cwd(),out):mode==='report'?report(process.cwd()):Promise.reject(Error('invalid-mode'))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={hash,json,protocol,validSnapshot,validSeal,cohort,capture,seal,report};
