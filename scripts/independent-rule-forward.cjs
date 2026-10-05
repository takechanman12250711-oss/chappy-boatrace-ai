'use strict';
// Reuses the existing live-note collection and daily audit. No race fetching, new schedule or publishing.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {hash}=require('./independent-role-selector.cjs');
const {buildShadow}=require('./independent-rule-shadow.cjs');
const REPO='takechanman12250711-oss/chappy-boatrace-ai';
const json=x=>JSON.stringify(x)+'\n';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function protocol(root){
  const raw=fs.readFileSync(path.join(root,'config/independent-rule-forward.json'));
  const value=JSON.parse(raw);
  for(const [file,digest] of Object.entries(value.codeHashes))if(hash(fs.readFileSync(path.join(root,file)))!==digest)throw Error('independent_rule_code_changed');
  if(value.version!=='independent-rule-forward-v1'||value.automaticApplication!==false||value.usableForPrediction!==false)throw Error('independent_rule_protocol_invalid');
  return {value,digest:hash(raw)};
}
function writeOnce(file,bytes){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+crypto.randomUUID()+'.tmp';
  try{const fd=fs.openSync(tmp,'wx');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    try{fs.linkSync(tmp,file);}catch(e){if(e.code!=='EEXIST'||fs.readFileSync(file,'utf8')!==bytes)throw e;}
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
function files(root,dir,date){
  const base=path.join(root,dir);if(!fs.existsSync(base))return [];
  return fs.readdirSync(base).filter(d=>/^\d{8}$/.test(d)&&(!date||d===date)).sort()
    .flatMap(d=>fs.readdirSync(path.join(base,d)).filter(f=>f.endsWith('.json')).sort().map(f=>path.posix.join(dir,d,f)));
}
function validateSnapshot(s,p,root){
  if(s?.version!=='independent-rule-snapshot-v1'||s.protocolHash!==p.digest||
      !/^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(s.raceKey)||s.date!==s.raceKey.slice(0,8)||
      !['escape','manshu'].includes(s.kind)||!/^\d+$/.test(s.runId)||!/^\d+$/.test(s.runAttempt)||
      !/^[a-f0-9]{40}$/.test(s.workflowHead)||!/^[a-f0-9]{40}$/.test(s.codeCommit)||
      !/^[a-f0-9]{64}$/.test(s.sourceSha256)||s.sourcePath!==`data/note-drafts/${s.date}/${s.raceKey}-${s.sourceSha256}.json`||
      !(Date.parse(s.selectedAt)<=Date.parse(s.capturedAt)&&Date.parse(s.capturedAt)<Date.parse(s.deadlineAt)))throw Error('independent_rule_snapshot_invalid');
  const raw=fs.readFileSync(path.join(root,s.sourcePath));if(hash(raw)!==s.sourceSha256)throw Error('independent_rule_source_hash_mismatch');
  const b=JSON.parse(raw),shadow=buildShadow(b);
  if(!shadow||b.record.raceKey!==s.raceKey||b.record.deadlineAt!==s.deadlineAt||b.record.selectedAt!==s.selectedAt||shadow.kind!==s.kind||
      JSON.stringify(shadow)!==JSON.stringify(b.independentRuleShadow)||JSON.stringify(shadow)!==JSON.stringify(s.shadow))throw Error('independent_rule_shadow_mismatch');
  return true;
}
function validateSeal(r,p,root){
  const s=r?.snapshot,a=r?.artifact;
  validateSnapshot(s,p,root);
  if(r.version!=='independent-rule-seal-v1'||r.snapshotHash!==hash(json(s))||!Number.isSafeInteger(a?.id)||a.id<=0||
      !/^sha256:[a-f0-9]{64}$/.test(a.digest)||a.runId!==s.runId||a.workflowHead!==s.workflowHead||
      a.name!==`independent-rule-${s.runId}-${s.runAttempt}`||
      !(Date.parse(s.capturedAt)<Date.parse(a.createdAt)+1000&&Date.parse(a.createdAt)<=Date.parse(a.confirmedAt)&&Date.parse(a.confirmedAt)<Date.parse(s.deadlineAt)))throw Error('independent_rule_seal_invalid');
  return true;
}
function cohort(root,p){
  const rows=new Map(),rejected={};
  for(const file of files(root,'data/independent-rule-forward'))try{
    const raw=fs.readFileSync(path.join(root,file)),r=JSON.parse(raw);
    if(path.basename(file)!==`${r.snapshot.raceKey}-${hash(raw)}.json`)throw Error('independent_rule_receipt_hash_mismatch');
    validateSeal(r,p,root);
    const key=`${r.snapshot.raceKey}:${r.snapshot.kind}`,old=rows.get(key);
    const order=x=>`${x.artifact.confirmedAt}|${x.snapshotHash}`;
    if(!old||order(r)<order(old))rows.set(key,r);
  }catch(e){rejected[e.message]=(rejected[e.message]||0)+1;}
  return {rows:[...rows.values()].sort((a,b)=>a.artifact.confirmedAt.localeCompare(b.artifact.confirmedAt)||a.snapshotHash.localeCompare(b.snapshotHash)),rejected};
}
function capture(root,out,env=process.env,now=Date.now()){
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main')throw Error('independent_rule_capture_context_invalid');
  const p=protocol(root),c=cohort(root,p),seen=new Set(c.rows.map(r=>`${r.snapshot.raceKey}:${r.snapshot.kind}`)),staged=new Map(),skips={};
  const codeCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  fs.mkdirSync(out,{recursive:true});if(fs.readdirSync(out).length)throw Error('independent_rule_capture_directory_not_empty');
  const date=new Date(now+9*3600000).toISOString().slice(0,10).replace(/-/g,'');
  for(const file of files(root,'data/note-drafts',date))try{
    const raw=fs.readFileSync(path.join(root,file)),b=JSON.parse(raw);
    if(b.monitor?.origin!=='independent-watch')continue;
    const r=b.record,key=`${r.raceKey}:${b.monitor.kind}`;
    if(seen.has(key))continue;
    if(Date.parse(r.deadlineAt)<=now)throw Error('deadline_elapsed');
    if(!b.monitor.ruleInput)throw Error('missing_rule_input');
    const s={version:'independent-rule-snapshot-v1',protocolHash:p.digest,raceKey:r.raceKey,date:r.date,kind:b.monitor.kind,
      selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,capturedAt:new Date(now).toISOString(),
      sourcePath:file,sourceSha256:hash(raw),runId:String(env.GITHUB_RUN_ID),runAttempt:String(env.GITHUB_RUN_ATTEMPT),
      workflowHead:env.GITHUB_SHA,codeCommit,shadow:b.independentRuleShadow};
    validateSnapshot(s,p,root);
    const old=staged.get(key);
    if(!old||`${s.selectedAt}|${s.sourceSha256}`<`${old.selectedAt}|${old.sourceSha256}`)staged.set(key,s);
  }catch(e){skips[e.message]=(skips[e.message]||0)+1;}
  for(const s of staged.values())writeOnce(path.join(out,hash(json(s))+'.json'),json(s));
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`count=${staged.size}\n`);
  const result={captured:staged.size,alreadySealed:seen.size,skips};console.log(JSON.stringify(result));return result;
}
async function seal(root,out,env=process.env,fetcher=fetch){
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||!/^\d+$/.test(env.INDEPENDENT_ARTIFACT_ID||''))throw Error('independent_rule_seal_context_invalid');
  const p=protocol(root),response=await fetcher(`https://api.github.com/repos/${REPO}/actions/artifacts/${env.INDEPENDENT_ARTIFACT_ID}`,{
    signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.GH_TOKEN}`,Accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error('independent_rule_artifact_unavailable');
  const a=await response.json(),server=Date.parse(response.headers.get('date'))+1000;
  const digest='sha256:'+String(env.INDEPENDENT_ARTIFACT_DIGEST||'').replace(/^sha256:/,'');
  if(!Number.isFinite(server)||a.expired||a.id!==Number(env.INDEPENDENT_ARTIFACT_ID)||a.digest!==digest||
      a.name!==`independent-rule-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`||String(a.workflow_run?.id)!==env.GITHUB_RUN_ID||a.workflow_run?.head_sha!==env.GITHUB_SHA)throw Error('independent_rule_artifact_identity_mismatch');
  let saved=0,late=0;
  for(const file of fs.readdirSync(out).filter(f=>/^[a-f0-9]{64}\.json$/.test(f))){
    const raw=fs.readFileSync(path.join(out,file)),s=JSON.parse(raw);if(file!==hash(raw)+'.json')throw Error('independent_rule_snapshot_hash_mismatch');
    validateSnapshot(s,p,root);
    if(s.runId!==env.GITHUB_RUN_ID||s.runAttempt!==env.GITHUB_RUN_ATTEMPT||s.workflowHead!==env.GITHUB_SHA)throw Error('independent_rule_snapshot_run_mismatch');
    if(server>=Date.parse(s.deadlineAt)){late++;continue;}
    const receipt={version:'independent-rule-seal-v1',snapshot:s,snapshotHash:hash(raw),artifact:{id:a.id,digest:a.digest,name:a.name,
      runId:s.runId,workflowHead:s.workflowHead,createdAt:a.created_at,confirmedAt:new Date(server).toISOString()}};
    validateSeal(receipt,p,root);const bytes=json(receipt);
    writeOnce(path.join(root,'data/independent-rule-forward',s.date,`${s.raceKey}-${hash(bytes)}.json`),bytes);saved++;
  }
  console.log(JSON.stringify({sealed:saved,late}));return {saved,late};
}
function stats(rows,field){
  const stake=rows.reduce((n,r)=>n+r[field].length*100,0),hits=rows.filter(r=>r[field].includes(r.actual)),returned=hits.reduce((n,r)=>n+r.payout,0);
  return {races:rows.length,hits:hits.length,stake,returned,profit:returned-stake,
    hitRate:rows.length?hits.length/rows.length*100:null,recoveryRate:stake?returned/stake*100:null};
}
function report(root){
  const p=protocol(root),c=cohort(root,p),{resultOf,chooseOfficialResult}=require('./audit-escape-main.cjs'),input=require('./analysis-input-contract');
  const wanted=new Set(c.rows.map(r=>r.snapshot.raceKey)),results=new Map(),conflicts=new Set();
  const add=r=>{const key=input.raceKey(r);if(!wanted.has(key))return;
    const a=resultOf(results.get(key)),b=resultOf(r);
    if(a&&b&&JSON.stringify([a.actual,a.payout,a.excluded])!==JSON.stringify([b.actual,b.payout,b.excluded]))conflicts.add(key);
    results.set(key,chooseOfficialResult(results.get(key),r));};
  for(const date of new Set(c.rows.map(r=>r.snapshot.date))){const f=path.join(root,'data/results',date+'.json');if(fs.existsSync(f))(read(f).races||[]).forEach(add);}
  const ledger=path.join(root,'data/stats/race-review-results.json');if(fs.existsSync(ledger))Object.values(read(ledger).races||{}).forEach(add);
  const groups={};
  for(const kind of ['escape','manshu']){
    const rows=c.rows.filter(r=>r.snapshot.kind===kind).map(r=>r.snapshot),settled=[],pending=[],excluded=[],skips={};
    for(const s of rows){
      if(s.shadow.result.status==='skipped')skips[s.shadow.result.reason]=(skips[s.shadow.result.reason]||0)+1;
      const r=resultOf(results.get(s.raceKey));
      if(conflicts.has(s.raceKey))excluded.push({raceKey:s.raceKey,reason:'conflicting_official_results'});
      else if(!r)pending.push(s.raceKey);
      else if(r.excluded)excluded.push({raceKey:s.raceKey,reason:r.excluded});
      else settled.push({raceKey:s.raceKey,...r,baseline:s.shadow.baseline,candidate:s.shadow.result.selected,status:s.shadow.result.status});
    }
    const paired=settled.filter(r=>r.status==='selected');
    const gained=paired.filter(r=>!r.baseline.includes(r.actual)&&r.candidate.includes(r.actual)).length;
    const lost=paired.filter(r=>r.baseline.includes(r.actual)&&!r.candidate.includes(r.actual)).length;
    groups[kind]={sealed:rows.length,selected:rows.filter(r=>r.shadow.result.status==='selected').length,skips,pending,excluded,
      allBaseline:stats(settled,'baseline'),paired:{baseline:stats(paired,'baseline'),candidate:stats(paired,'candidate'),gained,lost,net:gained-lost},settled};
  }
  const result={version:'independent-rule-report-v1',generatedAt:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA||'',
    protocol:p.value,protocolHash:p.digest,productionChanged:false,automaticProductionChange:false,usableForPrediction:false,
    autonomousInput:false,decisionGate:{status:'INSUFFICIENT_EVIDENCE',reason:'No registered adoption gate; role annotations still require Chat'},
    sealed:c.rows.length,rejected:c.rejected,groups};
  const file=path.join(root,'data/stats/independent-rule-report.json');fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file+'.tmp',json(result));fs.renameSync(file+'.tmp',file);console.log(JSON.stringify(result));return result;
}
if(require.main===module){const [mode,out]=process.argv.slice(2);Promise.resolve().then(()=>mode==='capture'?capture(process.cwd(),out):mode==='seal'?seal(process.cwd(),out):mode==='report'?report(process.cwd()):Promise.reject(Error('invalid-mode'))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={json,protocol,writeOnce,validateSnapshot,validateSeal,cohort,capture,seal,stats,report};
