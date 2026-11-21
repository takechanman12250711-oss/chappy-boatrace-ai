'use strict';
// B1 research only. Sources and sealed artifacts are immutable; no selector runs here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const REPO='takechanman12250711-oss/chappy-boatrace-ai';
const CONFIG='config/promotion-head-priority-forward-v1.json', BASE='data/promotion-head-priority-forward';
const METHOD='50b3ddcc4406fd549d0bd6016b41a8afa7c7714265a93e2845f2ccdfea7d0e11';
const EXECUTION='12c4a1b75ab69be37a063c6893898c711308d9c83ae3c27cd3d6e74c568bc11c';
const CODE_PATHS=['scripts/promotion-head-priority-comparison.cjs','scripts/promotion-role-priority-diagnostic.cjs',
  'scripts/promotion-head-priority-forward.cjs','scripts/candidate-promotion-execution-evidence.cjs'];
const FLAGS={adoptionGate:null,usableForPrediction:false,automaticApplication:false};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=x=>JSON.stringify(x)+'\n';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hex64=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const clock=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const ticket=t=>typeof t==='string'&&/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split('-')).size===3;
const validTickets=a=>Array.isArray(a)&&a.length>0&&a.length<=10&&a.every(ticket)&&new Set(a).size===a.length;
const value=t=>typeof t==='string'?t:t?.ticket;
const rawTickets=a=>Array.isArray(a)?a.map(value):null;
const count=(o,k)=>{o[k]=(o[k]||0)+1;};
function codeHash(root) {
  const h=crypto.createHash('sha256');
  for(const file of CODE_PATHS)h.update(file+'\0').update(fs.readFileSync(path.join(root,file))).update('\0');
  return h.digest('hex');
}

const MANIFEST_VERSION='promotion-head-priority-snapshot-manifest-v1';
function canonicalManifest(entries,protocolHash,runId,runAttempt) {
  if(!Array.isArray(entries)||!hex64(protocolHash)||!/^\d+$/.test(runId||'')||!/^\d+$/.test(runAttempt||''))throw Error('manifest_identity_invalid');
  const sorted=entries.map(e=>{
    if(!e||!same(Object.keys(e).sort(),['name','sha256'])||!hex64(e.sha256)||e.name!==e.sha256+'.json')throw Error('manifest_entry_invalid');
    return {name:e.name,sha256:e.sha256};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  if(new Set(sorted.map(e=>e.name)).size!==sorted.length)throw Error('manifest_duplicate');
  return {version:MANIFEST_VERSION,domain:'chappy-promotion-head-priority-snapshot-bytes',
    protocolHash,runId,runAttempt,entries:sorted};
}
function stageManifest(out,p,env) {
  const entries=fs.readdirSync(out,{withFileTypes:true}).map(e=>{
    if(!e.isFile()||!/^[a-f0-9]{64}\.json$/.test(e.name))throw Error('manifest_unexpected_file');
    const sha256=hash(fs.readFileSync(path.join(out,e.name)));
    if(e.name!==sha256+'.json')throw Error('manifest_snapshot_filename_mismatch');
    return {name:e.name,sha256};
  });
  const manifest=canonicalManifest(entries,p.digest,env.GITHUB_RUN_ID,env.GITHUB_RUN_ATTEMPT);
  return {manifest,sha256:entries.length?hash(json(manifest)):''};
}
function commitment(manifest,snapshotHash) {
  return {version:'promotion-head-priority-hash-commitment-v1',manifest,manifestSha256:hash(json(manifest)),
    snapshotName:snapshotHash+'.json',snapshotSha256:snapshotHash,
    evidence:'immutable-artifact-name-hash-commitment',archiveContentsVerified:false};
}
function validCommitment(c,s,snapshotHash) {
  try {
    if(c?.version!=='promotion-head-priority-hash-commitment-v1'||c.evidence!=='immutable-artifact-name-hash-commitment'||
        c.archiveContentsVerified!==false||c.snapshotName!==snapshotHash+'.json'||c.snapshotSha256!==snapshotHash||
        !hex64(c.manifestSha256))return false;
    const m=canonicalManifest(c.manifest?.entries,s.protocolHash,s.runId,s.runAttempt);
    return m.entries.length>0&&same(c.manifest,m)&&hash(json(m))===c.manifestSha256&&
      m.entries.some(e=>e.name===c.snapshotName&&e.sha256===snapshotHash);
  }catch{return false;}
}

function protocol(root) {
  const raw=fs.readFileSync(path.join(root,CONFIG)),p=JSON.parse(raw);
  const keys=['version','rule','method','executionCodeSha256','comparisonCodeSha256','startAt','endAt','unitStakeYen',
    'tieBreak','denominator','variants','adoptionGate','usableForPrediction','automaticApplication'];
  if(!same(Object.keys(p).sort(),keys.sort())||p.version!=='promotion-head-priority-forward-v1'||
      p.rule!=='head-role-priority-desc-queue-index-v1'||p.method!==METHOD||p.executionCodeSha256!==EXECUTION||
      p.comparisonCodeSha256!==codeHash(root)||p.startAt!=='2026-11-19T00:00:00+09:00'||
      p.endAt!=='2026-12-03T00:00:00+09:00'||p.unitStakeYen!==100||p.tieBreak!=='queueIndex'||
      p.denominator!=='all-sealed-valid-A-including-unknown'||!same(p.variants,['A','B'])||
      Object.entries(FLAGS).some(([k,v])=>p[k]!==v))throw Error('protocol_invalid_or_code_changed');
  return {value:p,digest:hash(raw)};
}
function context(env) {
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
      !/^\d+$/.test(env.GITHUB_RUN_ID||'')||!/^\d+$/.test(env.GITHUB_RUN_ATTEMPT||'')||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw Error('main_repository_context_required');
}
function files(root,relative) {
  const dir=path.join(root,relative);
  return !fs.existsSync(dir)?[]:fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))
    .flatMap(e=>e.isDirectory()?files(root,path.posix.join(relative,e.name)):e.isFile()&&e.name.endsWith('.json')?[path.posix.join(relative,e.name)]:[]);
}
function writeOnce(file,bytes) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file)){if(!fs.readFileSync(file).equals(Buffer.from(bytes)))throw Error('immutable_path_conflict');return;}
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try {
    fs.writeFileSync(temp,bytes,{flag:'wx'});
    try{fs.linkSync(temp,file);}catch(e){if(e.code!=='EEXIST'||!fs.readFileSync(file).equals(Buffer.from(bytes)))throw e;}
  } finally {fs.rmSync(temp,{force:true});}
}
function source(root,sourcePath,sourceSha256,p,at) {
  if(!hex64(sourceSha256)||!/^data\/note-drafts\/\d{8}\/\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])-[a-f0-9]{64}\.json$/.test(sourcePath||''))throw Error('source_reference_invalid');
  const bytes=fs.readFileSync(path.join(root,sourcePath));
  if(hash(bytes)!==sourceSha256)throw Error('source_sha_mismatch');
  const b=JSON.parse(bytes),r=b?.record,e=r?.practicalSelectionEvidence,review=r?.reviewEvidence;
  if(b.version!=='note-draft-bundle-v1'||r?.publicationPolicy!=='all-races-v1'||
      r.raceKey!==r.date+'-'+r.jcd+'-'+r.raceNo||!/^([0-9]{8})-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(r.raceKey||'')||
      sourcePath!=='data/note-drafts/'+r.date+'/'+r.raceKey+'-'+sourceSha256+'.json'||
      !/^[a-f0-9]{40}$/.test(b.sourceCommit||''))throw Error('source_identity_invalid');
  if(!clock(r.selectedAt)||!clock(r.deadlineAt)||Date.parse(r.selectedAt)>=Date.parse(r.deadlineAt)||
      Date.parse(r.selectedAt)>at||Date.parse(r.selectedAt)<Date.parse(p.value.startAt)||
      Date.parse(r.selectedAt)>=Date.parse(p.value.endAt)||Date.parse(r.deadlineAt)>Date.parse(p.value.endAt))throw Error('source_outside_period_or_clock');
  if(review?.version!=='race-review-evidence-v1'||review.method!==p.value.method||
      review.predictionMode!=='server_pre_deadline'||review.officialResultUsedForPrediction!==false||
      r.prediction?.officialResultUsedForPrediction===true)throw Error('source_method_or_result_flag_invalid');
  require('./note-exhibition').requireExhibition(r);
  const audit=b.generationAudit;
  if(audit?.contentReady!==true||audit.raceKey!==r.raceKey||!clock(audit.auditedAt)||
      Date.parse(audit.auditedAt)>=Date.parse(r.deadlineAt)||Date.parse(audit.auditedAt)>at)throw Error('source_audit_invalid');
  const A=rawTickets(b.baselinePracticalTickets),practical=rawTickets(r.prediction?.practicalTickets);
  if(!validTickets(A)||!validTickets(practical)||!same(A,practical)||e?.version!=='practical-selection-evidence-v1'||
      e.status!=='captured'||e.selectionStatus!=='selected'||e.productionChanged!==false||e.resultUsedForGeneration!==false||
      !validTickets(e.practicalTickets)||!same(A,e.practicalTickets)||!same(e.reviewEvidence,review)||
      ['raceKey','selectedAt','deadlineAt'].some(k=>e[k]!==r[k]))throw Error('source_baseline_or_selection_identity_invalid');
  return {bundle:b,record:r,A,input:{identity:{raceKey:r.raceKey,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,
    method:review.method,predictionMode:review.predictionMode,officialResultUsedForPrediction:false},
    sourceRef:{path:sourcePath,sha256:sourceSha256},execution:e.candidatePromotionExecutionEvidence,
    validation:e.candidateValidationEvidence,officialCourses:r.prediction?.preRaceConditions?.boats,baselineA:A}};
}
function validComparison(c,A) {
  return c?.version==='promotion-head-priority-comparison-v1'&&c.variant==='B1-first-position-saved-priority'&&c.purpose==='shadow-comparison'&&
    ['compared','not-applicable','unknown'].includes(c.status)&&same(c.A,A)&&validTickets(c.B)&&c.B.length===A.length&&
    Array.isArray(c.reasons)&&c.reasons.every(r=>typeof r==='string')&&
    (c.status==='compared'||same(c.B,A))&&c.changed===!same(A,c.B)&&
    c.productionAction==='KEEP_A'&&c.automaticAdoption===false&&c.automaticApplication===false&&
    c.usableForPrediction===false&&c.resultUsedForGeneration===false&&c.productionChanged===false&&
    c.sourceReferenceVerified===false&&c.includedInDenominator===true;
}
function validSnapshot(s,p) {
  if(!s||s.protocolHash!==p.digest||!same(s.protocol,p.value)||!clock(s.capturedAt)||
      !/^\d+$/.test(s.runId||'')||!/^\d+$/.test(s.runAttempt||'')||
      !/^[a-f0-9]{40}$/.test(s.workflowHead||'')||!/^[a-f0-9]{40}$/.test(s.codeCommit||'')||
      Object.entries(FLAGS).some(([k,v])=>s[k]!==v))return false;
  const time=Date.parse(s.capturedAt);
  if(s.kind==='registration')return s.version==='promotion-head-priority-protocol-snapshot-v1'&&time<Date.parse(p.value.startAt);
  return s.kind==='race'&&s.version==='promotion-head-priority-race-snapshot-v1'&&
    time>=Date.parse(p.value.startAt)&&time<Date.parse(p.value.endAt)&&
    /^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(s.raceKey||'')&&s.date===s.raceKey.slice(0,8)&&
    clock(s.selectedAt)&&clock(s.deadlineAt)&&Date.parse(s.selectedAt)<=time&&time<Date.parse(s.deadlineAt)&&
    Date.parse(s.selectedAt)>=Date.parse(p.value.startAt)&&Date.parse(s.deadlineAt)<=Date.parse(p.value.endAt)&&
    s.method===p.value.method&&s.sourceBytesVerified===true&&hex64(s.sourceSha256)&&
    s.sourcePath==='data/note-drafts/'+s.date+'/'+s.raceKey+'-'+s.sourceSha256+'.json'&&
    hex64(s.registrationRef?.sha256)&&typeof s.registrationRef.path==='string'&&
    validTickets(s.A)&&validComparison(s.comparison,s.A)&&same(s.B,s.comparison.B)&&
    same(s.comparison.sourceRef,{path:s.sourcePath,sha256:s.sourceSha256})&&
    same(s.comparison.identity,{raceKey:s.raceKey,selectedAt:s.selectedAt,deadlineAt:s.deadlineAt,method:s.method,
      predictionMode:'server_pre_deadline',officialResultUsedForPrediction:false});
}
function validSeal(r,p) {
  const s=r?.snapshot,a=r?.artifact;
  if(r?.version!=='promotion-head-priority-receipt-v1'||!validSnapshot(s,p)||r.snapshotHash!==hash(json(s))||!validCommitment(r.commitment,s,r.snapshotHash)||
      !Number.isSafeInteger(a?.id)||a.id<=0||!/^sha256:[a-f0-9]{64}$/.test(a.digest||'')||
      a.name!=='promotion-head-priority-'+s.runId+'-'+s.runAttempt+'-'+r.commitment.manifestSha256||a.runId!==s.runId||a.runAttempt!==s.runAttempt||
      a.workflowHead!==s.workflowHead||!clock(a.createdAt)||!clock(a.confirmedAt)||
      Date.parse(s.capturedAt)>=Date.parse(a.createdAt)+1000||Date.parse(a.createdAt)>Date.parse(a.confirmedAt))return false;
  const bound=Date.parse(s.kind==='registration'?p.value.startAt:s.deadlineAt);
  return Date.parse(a.createdAt)<bound&&Date.parse(a.confirmedAt)<bound;
}
const order=r=>[Date.parse(r.receipt.artifact.confirmedAt),Date.parse(r.receipt.snapshot.capturedAt),r.receipt.snapshot.sourceSha256||r.receipt.snapshotHash];
const compareOrder=(a,b)=>{const x=order(a),y=order(b);return x[0]-y[0]||x[1]-y[1]||x[2].localeCompare(y[2]);};
function registration(root,p) {
  const valid=[],rejected={};
  for(const file of files(root,BASE+'/registrations'))try {
    const bytes=fs.readFileSync(path.join(root,file)),r=JSON.parse(bytes);
    if(!validSeal(r,p)||r.snapshot.kind!=='registration'||file!==BASE+'/registrations/'+p.digest+'-'+hash(bytes)+'.json')throw Error('registration_invalid');
    valid.push({path:file,sha256:hash(bytes),receipt:r});
  }catch(e){count(rejected,e.message);}
  valid.sort(compareOrder);return {first:valid[0]||null,rejected};
}
function sourceMatchesSnapshot(root,s,p) {
  const v=source(root,s.sourcePath,s.sourceSha256,p,Date.parse(s.capturedAt)),r=v.record;
  if(r.raceKey!==s.raceKey||r.date!==s.date||r.selectedAt!==s.selectedAt||r.deadlineAt!==s.deadlineAt||
      !same(v.A,s.A))throw Error('sealed_source_identity_mismatch');
  return v;
}
function sealed(root,p,reg=registration(root,p).first) {
  const byRace=new Map(),rejected={};
  for(const file of files(root,BASE).filter(f=>!f.startsWith(BASE+'/registrations/')))try {
    const bytes=fs.readFileSync(path.join(root,file)),r=JSON.parse(bytes),s=r?.snapshot;
    if(!validSeal(r,p)||s.kind!=='race'||file!==BASE+'/'+s.date+'/'+s.raceKey+'-'+hash(bytes)+'.json')throw Error('race_receipt_invalid');
    if(!reg||!same(s.registrationRef,{path:reg.path,sha256:reg.sha256}))throw Error('registration_reference_invalid');
    sourceMatchesSnapshot(root,s,p);
    const row={path:file,sha256:hash(bytes),receipt:r},old=byRace.get(s.raceKey);
    if(!old||compareOrder(row,old)<0)byRace.set(s.raceKey,row);
  }catch(e){count(rejected,e.message);}
  return {rows:[...byRace.values()].sort(compareOrder),rejected};
}
function output(env,result) {
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,'count='+result.count+'\nmanifest-sha256='+(result.manifestSha256||'')+'\n');
  return result;
}
function capture(root,out,env=process.env,now=Date.now(),deps={}) {
  context(env);const p=protocol(root);
  if(!Number.isFinite(now))throw Error('capture_clock_invalid');
  const currentMethod=deps.methodFingerprint?deps.methodFingerprint(root):require('./race-review-evidence').methodFingerprint(root);
  if(currentMethod!==p.value.method)throw Error('current_method_changed');
  fs.mkdirSync(out,{recursive:true});if(fs.readdirSync(out).length)throw Error('capture_directory_not_empty');
  const finish=result=>output(env,{...result,manifestSha256:result.count?stageManifest(out,p,env).sha256:''});
  const reg=registration(root,p),existing=sealed(root,p,reg.first);
  const common={protocolHash:p.digest,protocol:p.value,capturedAt:new Date(now).toISOString(),
    runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,workflowHead:env.GITHUB_SHA,
    codeCommit:deps.codeCommit||execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),...FLAGS};
  if(now<Date.parse(p.value.startAt)) {
    if(reg.first)return finish({status:'registered',count:0,registration:reg.first.path});
    const snapshot={version:'promotion-head-priority-protocol-snapshot-v1',kind:'registration',...common};
    if(!validSnapshot(snapshot,p))throw Error('registration_snapshot_invalid');
    const bytes=json(snapshot);writeOnce(path.join(out,hash(bytes)+'.json'),bytes);
    return finish({status:'registration-prepared',count:1,races:0});
  }
  if(now>=Date.parse(p.value.endAt))return finish({status:'period-ended',count:0});
  if(!reg.first)return finish({status:'blocked',reason:'PRESTART_REGISTRATION_MISSING',count:0});
  const seen=new Set(existing.rows.map(x=>x.receipt.snapshot.raceKey)),staged=new Map(),skips={};
  const compare=deps.compare||require('./promotion-head-priority-comparison.cjs').compareHeadPriority;
  const captureDate=new Date(now+9*3600000).toISOString().slice(0,10).replace(/-/g,'');
  for(const file of files(root,'data/note-drafts/'+captureDate))try {
    const sha=path.basename(file).match(/-([a-f0-9]{64})\.json$/)?.[1];
    const v=source(root,file,sha,p,now),r=v.record;
    if(Date.parse(r.deadlineAt)<=now)throw Error('source_deadline_closed');
    if(seen.has(r.raceKey)){count(skips,'already-sealed');continue;}
    const comparison=compare(v.input);
    if(!validComparison(comparison,v.A))throw Error('comparison_ineligible_or_invalid');
    const s={version:'promotion-head-priority-race-snapshot-v1',kind:'race',...common,
      raceKey:r.raceKey,date:r.date,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,method:p.value.method,
      sourcePath:file,sourceSha256:sha,sourceBytesVerified:true,
      registrationRef:{path:reg.first.path,sha256:reg.first.sha256},A:v.A,B:comparison.B,comparison};
    if(!validSnapshot(s,p))throw Error('race_snapshot_invalid');
    const old=staged.get(r.raceKey);
    if(!old||Date.parse(s.selectedAt)>Date.parse(old.selectedAt)||(Date.parse(s.selectedAt)===Date.parse(old.selectedAt)&&s.sourceSha256<old.sourceSha256))staged.set(r.raceKey,s);
  }catch(e){count(skips,e.code==='ENOENT'?'source_missing':e.message);}
  for(const s of staged.values()){const bytes=json(s);writeOnce(path.join(out,hash(bytes)+'.json'),bytes);}
  return finish({status:'captured',count:staged.size,races:staged.size,alreadySealed:seen.size,skips,rejectedReceipts:existing.rejected});
}
async function seal(root,out,env=process.env,fetcher=fetch) {
  context(env);const p=protocol(root);
  if(!/^\d+$/.test(env.PROMOTION_HEAD_ARTIFACT_ID||'')||!env.GH_TOKEN)throw Error('artifact_context_invalid');
  const stage=stageManifest(out,p,env);if(!stage.manifest.entries.length)throw Error('empty_snapshot_manifest');
  const response=await fetcher('https://api.github.com/repos/'+REPO+'/actions/artifacts/'+env.PROMOTION_HEAD_ARTIFACT_ID,
    {signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error('artifact_metadata_unavailable');
  const a=await response.json(),confirmedAt=Date.parse(response.headers.get('date'))+1000;
  const digest='sha256:'+String(env.PROMOTION_HEAD_ARTIFACT_DIGEST||'').replace(/^sha256:/,'');
  if(!Number.isFinite(confirmedAt)||a.expired||a.id!==Number(env.PROMOTION_HEAD_ARTIFACT_ID)||a.digest!==digest||
      a.name!=='promotion-head-priority-'+env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT+'-'+stage.sha256||
      String(a.workflow_run?.id)!==env.GITHUB_RUN_ID||a.workflow_run?.head_sha!==env.GITHUB_SHA)throw Error('artifact_identity_mismatch');
  // The immutable remote NAME commits to this complete byte-hash manifest.
  // This is not a proof that the artifact ZIP contains these files.
  if(!same(stageManifest(out,p,env),stage))throw Error('manifest_changed_during_metadata_request');
  const reg=registration(root,p).first;let saved=0,late=0;const rejected={};
  for(const entry of stage.manifest.entries)try {
    const file=entry.name;
    const bytes=fs.readFileSync(path.join(out,file)),s=JSON.parse(bytes);
    if(file!==hash(bytes)+'.json'||!validSnapshot(s,p)||s.runId!==env.GITHUB_RUN_ID||
        s.runAttempt!==env.GITHUB_RUN_ATTEMPT||s.workflowHead!==env.GITHUB_SHA)throw Error('snapshot_identity_invalid');
    if(s.kind==='race') {
      if(!reg||!same(s.registrationRef,{path:reg.path,sha256:reg.sha256}))throw Error('registration_reference_invalid');
      sourceMatchesSnapshot(root,s,p);
    }
    const receipt={version:'promotion-head-priority-receipt-v1',snapshotHash:hash(bytes),snapshot:s,
      commitment:commitment(stage.manifest,hash(bytes)),
      artifact:{id:a.id,digest:a.digest,name:a.name,runId:s.runId,runAttempt:s.runAttempt,workflowHead:s.workflowHead,
        createdAt:a.created_at,confirmedAt:new Date(confirmedAt).toISOString()}};
    if(confirmedAt>=Date.parse(s.kind==='registration'?p.value.startAt:s.deadlineAt)){late++;continue;}
    if(!validSeal(receipt,p))throw Error('artifact_time_invalid');
    const raw=json(receipt),fileName=s.kind==='registration'?'registrations/'+p.digest+'-'+hash(raw)+'.json':
      s.date+'/'+s.raceKey+'-'+hash(raw)+'.json';
    writeOnce(path.join(root,BASE,fileName),raw);saved++;
  }catch(e){count(rejected,e.code==='ENOENT'?'source_missing':e.message);}
  return {sealed:saved,late,rejected};
}
function loadResults(root,rows) {
  const {chooseOfficialResult}=require('./audit-escape-main.cjs'),input=require('./analysis-input-contract');
  const wanted=new Set(rows.map(x=>x.receipt.snapshot.raceKey)),results=new Map();
  for(const date of new Set(rows.map(x=>x.receipt.snapshot.date))) {
    const file=path.join(root,'data/results',date+'.json');
    if(fs.existsSync(file))for(const r of read(file).races||[]){const key=input.raceKey(r);if(wanted.has(key))results.set(key,chooseOfficialResult(results.get(key),r));}
  }
  const ledger=path.join(root,'data/stats/race-review-results.json');
  if(fs.existsSync(ledger))for(const r of Object.values(read(ledger).races||{})){const key=input.raceKey(r);if(wanted.has(key))results.set(key,chooseOfficialResult(results.get(key),r));}
  return results;
}
function summarize(rows,unit) {
  const stats={};
  for(const k of ['A','B']) {
    const hits=rows.filter(r=>r[k].includes(r.actual)),stake=rows.reduce((n,r)=>n+r[k].length*unit,0),returned=hits.reduce((n,r)=>n+r.payout,0);
    stats[k]={races:rows.length,hits:hits.length,stake,returned,hitRate:rows.length?hits.length/rows.length*100:null,recoveryRate:stake?returned/stake*100:null};
  }
  const gains=rows.filter(r=>!r.A.includes(r.actual)&&r.B.includes(r.actual)),losses=rows.filter(r=>r.A.includes(r.actual)&&!r.B.includes(r.actual));
  const contributions=rows.map(r=>({raceKey:r.raceKey,date:r.date,payout:r.payout,
    hitA:r.A.includes(r.actual),hitB:r.B.includes(r.actual),
    delta:(Number(r.B.includes(r.actual))-Number(r.A.includes(r.actual)))*r.payout}));
  const largestGain=contributions.filter(r=>r.delta>0).sort((a,b)=>b.delta-a.delta||a.raceKey.localeCompare(b.raceKey))[0]||null;
  return {stats,addedHits:gains.map(r=>r.raceKey),lostHits:losses.map(r=>r.raceKey),returnDelta:stats.B.returned-stats.A.returned,
    largestGain,returnDeltaWithoutLargestGain:stats.B.returned-stats.A.returned-(largestGain?.delta||0),
    largestWinningPayout:contributions.filter(r=>r.hitA||r.hitB).sort((a,b)=>b.payout-a.payout||a.raceKey.localeCompare(b.raceKey))[0]||null};
}
function report(root,{now=Date.now(),resultsLoader=loadResults}={}) {
  const p=protocol(root),reg=registration(root,p),all=sealed(root,p,reg.first);
  const statusCounts={},unknownReasons={},reasonCounts={};
  for(const row of all.rows){const c=row.receipt.snapshot.comparison;count(statusCounts,c.status);for(const reason of c.reasons){count(reasonCounts,reason);if(c.status==='unknown')count(unknownReasons,reason);}}
  const result={version:'promotion-head-priority-report-v1',generatedAt:new Date(now).toISOString(),protocolHash:p.digest,protocol:p.value,
    ...FLAGS,productionChanged:false,resultUsedForGeneration:false,includedInDenominator:true,sealed:all.rows.length,
    remoteEvidence:{type:'immutable-artifact-name-hash-commitment',archiveContentsVerified:false},
    coverage:{scope:p.value.denominator,allMeetings:null,allPublishedArticles:null,allRunCaptureAndSealSkipTotals:null,
      unavailableReason:'Unsealed, invalid and late counts exist only in individual run outputs; all-run totals and coverage are not aggregated and are not zero.'},
    registration:reg.first?{path:reg.first.path,sha256:reg.first.sha256}:null,statusCounts,unknownReasons,reasonCounts,
    rejected:{registrations:reg.rejected,races:all.rejected},decisionGate:{status:'INSUFFICIENT_EVIDENCE',reason:'No registered adoption gate; completion does not authorize production use.'}};
  if(now<Date.parse(p.value.endAt))return {...result,status:!reg.first&&now>=Date.parse(p.value.startAt)?'blocked':'progress-only',resultsJoined:false};
  if(!reg.first)return {...result,status:'blocked',resultsJoined:false};
  const results=resultsLoader(root,all.rows),{resultOf}=require('./audit-escape-main.cjs'),settled=[],pending=[],excluded=[];
  for(const row of all.rows) {
    const s=row.receipt.snapshot,r=resultOf(results.get(s.raceKey));
    if(!r)pending.push(s.raceKey);else if(r.excluded)excluded.push({raceKey:s.raceKey,reason:r.excluded});
    else settled.push({...s,...r});
  }
  const dates=[...new Set(all.rows.map(x=>x.receipt.snapshot.date))].sort();
  return {...result,status:reg.first?'period-ended':'blocked',resultsJoined:true,settled:settled.length,pending,excluded,
    comparison:summarize(settled,p.value.unitStakeYen),daily:dates.map(date=>({date,
      sealed:all.rows.filter(r=>r.receipt.snapshot.date===date).length,
      unknown:all.rows.filter(r=>r.receipt.snapshot.date===date&&r.receipt.snapshot.comparison.status==='unknown').length,
      pending:pending.filter(key=>key.startsWith(date+'-')).length,
      excluded:excluded.filter(r=>r.raceKey.startsWith(date+'-')).length,
      ...summarize(settled.filter(r=>r.date===date),p.value.unitStakeYen)}))};
}
if(require.main===module)(async()=>{
  const root=path.resolve(__dirname,'..'),[command,out]=process.argv.slice(2);
  let result;
  if(command==='capture'&&out)result=capture(root,path.resolve(out));
  else if(command==='seal'&&out)result=await seal(root,path.resolve(out));
  else if(command==='report'){result=report(root);const file=path.join(root,'data/stats/promotion-head-priority-report.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,json(result));}
  else throw Error('usage: capture <new-output-directory> | seal <output-directory> | report');
  console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={CONFIG,BASE,CODE_PATHS,METHOD,EXECUTION,hash,json,codeHash,protocol,source,validComparison,validSnapshot,validSeal,
  registration,sealed,capture,seal,report,summarize,writeOnce,canonicalManifest,stageManifest,commitment,validCommitment};
