'use strict';
// Shadow only, after publication handoff. Never imports result collection or scoring.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {isDeepStrictEqual:equal}=require('node:util');
const contract=require('./head-forward-contract.cjs');
const engine=require('./independent-head-forward-v2.cjs');
const frozen=require('./compare-escape-frozen.cjs');
const {verifyArtifact}=require('./head-forward-artifact.cjs');
const FLAGS={usableForPrediction:false,automaticApplication:false,productionChanged:false,adoptionGate:null};
const fail=reason=>{throw Error('head_capture_'+reason);};
function context(env){
  if(env.GITHUB_REPOSITORY!==contract.REPOSITORY||env.GITHUB_REF!=='refs/heads/main'||
    !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID||'')||!/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT||'')||
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))fail('context_invalid');
}
function checkoutIdentity(root,env,p){
  const codeCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const entries=execFileSync('git',['ls-tree','-r','HEAD','--',...contract.SOURCE_PATHS,contract.CONFIG],{cwd:root,encoding:'utf8'}).trim().split('\n');
  const tree=new Map(entries.map(line=>{const m=line.match(/^100644 blob ([a-f0-9]{40})\t(.+)$/);return m?[m[2],m[1]]:[];}));
  for(const file of [...contract.SOURCE_PATHS,contract.CONFIG])if(tree.get(file)!==contract.blob(fs.readFileSync(path.join(root,file))))fail('uncommitted_code');
  const identity={codeCommit,workflowHead:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT};
  if(!contract.validIdentity(identity))fail('identity_invalid');return identity;
}
function existingAttempts(root,p){
  const seen=new Set();
  for(const file of contract.recordFiles(root)){
    const raw=fs.readFileSync(path.join(root,file));let record;
    try{record=JSON.parse(raw);}catch{fail('existing_record_invalid');}
    if(path.basename(file)!==`${record.raceKey||record.attempt?.raceKey}-${contract.hash(raw)}.json`)fail('existing_record_hash_mismatch');
    if(record.protocolHash!==p.digest)continue;
    if(record.version==='independent-head-forward-attempt-v2'){
      if(!contract.validAttempt(record,p))fail('existing_attempt_invalid');seen.add(record.raceKey);
    }else if(record.version==='independent-head-forward-seal-v2'){
      if(!contract.validSeal(record,p))fail('existing_seal_invalid');seen.add(record.attempt.raceKey);
    }else fail('existing_record_kind_invalid');
  }
  return seen;
}
function noteSource(root,relative,p){
  const full=path.join(root,relative),stat=fs.lstatSync(full);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>p.value.maxSourceBytes)fail('source_size_or_type_invalid');
  const bytes=fs.readFileSync(full),sha256=contract.hash(bytes),bundle=JSON.parse(bytes),record=bundle.record;
  if(bundle.version!=='note-draft-bundle-v1'||record?.publicationPolicy!=='all-races-v1'||
    !/^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(record.raceKey||'')||
    record.date!==record.raceKey.slice(0,8)||record.raceKey!==`${record.date}-${record.jcd}-${record.raceNo}`||
    relative!==`data/note-drafts/${record.date}/${record.raceKey}-${sha256}.json`||
    !(contract.instant(record.selectedAt)<contract.instant(record.deadlineAt)))fail('source_identity_or_timing_invalid');
  let inputSha256=null;
  try{const snap=frozen.snapshot(record,'all-race-note',{requiredCoreVersion:require('./compare-independent-head-coverage.cjs').REQUIRED_CORE_VERSION});
    if(snap.row)inputSha256=contract.hash(JSON.stringify(snap.row.conditions));}catch{}
  return {record,source:{path:relative,sha256,recordJsonSha256:contract.hash(JSON.stringify(record)),inputSha256,fileHashVerified:true}};
}
function matchesSavedBaseline(record,snapshot){
  try{
    const snap=frozen.snapshot(record,'all-race-note',{requiredCoreVersion:require('./compare-independent-head-coverage.cjs').REQUIRED_CORE_VERSION});
    const raw=record.prediction.practicalTickets;
    const tickets=Array.isArray(raw)?raw.map(require('./analysis-input-contract').normalizeTicket):[];
    return Boolean(snap.row&&contract.validTickets(tickets)&&equal(tickets,snapshot.baseline.tickets)&&
      Number(snap.row.savedHead)===Number(snapshot.baseline.head)&&equal(snap.row.savedScenarios,snapshot.baseline.scenarios));
  }catch{return false;}
}
async function capture(root,out,{env=process.env,now=Date.now,fetcher=fetch,identityFor=checkoutIdentity,generate=engine.generate}={}){
  context(env);const p=contract.readProtocol(root),identity=identityFor(root,env,p);
  const registration=await contract.resolveRegistration(root,p,identity,{token:env.GH_TOKEN,fetcher});
  fs.mkdirSync(out,{recursive:true});if(!fs.lstatSync(out).isDirectory()||fs.lstatSync(out).isSymbolicLink()||fs.readdirSync(out).length)fail('output_not_empty_directory');
  const started=now();if(!Number.isFinite(started))fail('clock_invalid');
  const date=new Date(started+9*3600000).toISOString().slice(0,10).replace(/-/g,''),base=path.join(root,'data/note-drafts',date);
  const seen=existingAttempts(root,p),chosen=new Map(),excluded=[],skips={};
  for(const file of fs.existsSync(base)?fs.readdirSync(base).filter(f=>f.endsWith('.json')).sort():[]){
    const relative=path.posix.join('data/note-drafts',date,file);
    try{
      const input=noteSource(root,relative,p),r=input.record;
      if(contract.instant(r.selectedAt)<contract.instant(registration.mergedAt)){skips.beforeRegistration=(skips.beforeRegistration||0)+1;continue;}
      if(contract.instant(r.deadlineAt)<=started){skips.closed=(skips.closed||0)+1;continue;}
      if(seen.has(r.raceKey)){skips.alreadyClaimed=(skips.alreadyClaimed||0)+1;continue;}
      const prior=chosen.get(r.raceKey),selected=contract.instant(r.selectedAt);
      if(!prior||selected<contract.instant(prior.record.selectedAt)||
        (selected===contract.instant(prior.record.selectedAt)&&input.source.sha256<prior.source.sha256))
        chosen.set(r.raceKey,{record:{raceKey:r.raceKey,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt},source:input.source});
    }catch(error){excluded.push({path:relative,reason:String(error.message).slice(0,160)});}
  }
  const ordered=[...chosen.values()].sort((a,b)=>contract.instant(a.record.deadlineAt)-contract.instant(b.record.deadlineAt)||a.record.raceKey.localeCompare(b.record.raceKey));
  const attempts=[],deferred=[];
  for(const descriptor of ordered){
    if(attempts.length>=p.value.maxAttemptsPerRun||now()-started>=p.value.captureBudgetMs){deferred.push(descriptor.record.raceKey);continue;}
    const input=noteSource(root,descriptor.source.path,p),r=input.record;
    if(!equal(input.source,descriptor.source))fail('source_changed_during_capture');
    const start={version:'independent-head-forward-attempt-v2',stage:'started',candidateId:p.value.candidateId,protocolHash:p.digest,
      raceKey:r.raceKey,date:r.date,attemptId:contract.attemptId(p.digest,r.raceKey,input.source.sha256),
      selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,startedAt:new Date(now()).toISOString(),completedAt:null,startedHash:null,
      source:input.source,registration,...identity,...FLAGS,outcome:{status:'started',reason:'AWAITING_GENERATION',snapshot:null}};
    if(!contract.validAttempt(start,p))fail('started_attempt_invalid');
    // Preserve the claim first. An interrupted generator cannot silently replace
    // this source with a later, more convenient bundle in a future run.
    contract.saveRecord(root,start);
    let generated;
    try{generated=await generate(root,{protocol:contract.generatorProtocol(p,registration.mergedAt),savedRecord:r,
      sourcePointer:{path:input.source.path,sha256:input.source.sha256,recordJsonSha256:input.source.recordJsonSha256,recordPath:'record'},
      source:'all-race-note',identity,now});}
    catch(error){generated={status:'failed',reason:'GENERATION_EXCEPTION:'+String(error.message).slice(0,120),snapshot:null};}
    let complete={...start,stage:'completed',completedAt:new Date(now()).toISOString(),startedHash:contract.hash(contract.json(start)),
      outcome:{status:generated.status,reason:generated.reason,snapshot:generated.snapshot}};
    if(complete.outcome.status==='generated'&&!matchesSavedBaseline(r,complete.outcome.snapshot))
      complete={...complete,outcome:{status:'failed',reason:'GENERATOR_SOURCE_BASELINE_MISMATCH',snapshot:null}};
    if(!contract.validAttempt(complete,p))complete={...complete,outcome:{status:'failed',reason:'GENERATOR_CONTRACT_MISMATCH',snapshot:null}};
    if(!contract.validAttempt(complete,p))fail('completed_attempt_invalid');
    contract.saveRecord(root,complete);attempts.push(complete);
  }
  const batch={version:'independent-head-forward-batch-v2',candidateId:p.value.candidateId,protocolHash:p.digest,
    identity,registration,createdAt:new Date(now()).toISOString(),attempts,coverage:{noteCandidates:ordered.length,
      alreadyClaimed:seen.size,skips,excludedSources:excluded,deferredRaces:deferred},...FLAGS};
  contract.writeOnce(path.join(out,'batch.json'),contract.json(batch));
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`count=${attempts.length}\n`);
  const summary={attempted:attempts.length,outcomes:attempts.reduce((a,r)=>(a[r.outcome.status]=(a[r.outcome.status]||0)+1,a),{}),
    deferred:deferred.length,excludedSources:excluded.length,alreadyClaimed:seen.size};
  console.log(JSON.stringify(summary));return {batch,summary};
}
async function seal(root,out,{env=process.env,fetcher=fetch,verify=verifyArtifact}={}){
  context(env);const p=contract.readProtocol(root),raw=fs.readFileSync(path.join(out,'batch.json'));
  if(raw.length>4*1024*1024)fail('batch_size_limit');const batch=JSON.parse(raw);
  if(batch.version!=='independent-head-forward-batch-v2'||batch.candidateId!==p.value.candidateId||batch.protocolHash!==p.digest||
    !Array.isArray(batch.attempts)||batch.attempts.length>p.value.maxAttemptsPerRun||batch.identity?.runId!==env.GITHUB_RUN_ID||
    batch.identity?.runAttempt!==env.GITHUB_RUN_ATTEMPT||batch.identity?.workflowHead!==env.GITHUB_SHA||
    !contract.validRegistration(batch.registration,p,batch.identity))fail('batch_identity_invalid');
  const seen=new Set();
  for(const a of batch.attempts){
    if(!contract.validAttempt(a,p)||a.stage!=='completed'||!equal(a.registration,batch.registration)||
      !equal({codeCommit:a.codeCommit,workflowHead:a.workflowHead,runId:a.runId,runAttempt:a.runAttempt},batch.identity)||seen.has(a.raceKey))fail('batch_attempt_invalid');
    seen.add(a.raceKey);
    const original=noteSource(root,a.source.path,p);
    if(!equal(original.source,a.source)||original.record.raceKey!==a.raceKey||original.record.selectedAt!==a.selectedAt||
      original.record.deadlineAt!==a.deadlineAt)fail('source_changed_before_seal');
    if(a.outcome.status==='generated'&&!matchesSavedBaseline(original.record,a.outcome.snapshot))fail('source_baseline_mismatch');
    for(const r of [contract.startedRecord(a),a]){
      const bytes=contract.json(r),file=path.join(root,contract.DIRECTORY,r.date,`${r.raceKey}-${contract.hash(bytes)}.json`);
      if(!fs.existsSync(file)||!fs.readFileSync(file).equals(Buffer.from(bytes)))fail('persisted_attempt_changed');
    }
  }
  const verified=await verify({artifactId:env.HEAD_FORWARD_ARTIFACT_ID,artifactDigest:env.HEAD_FORWARD_ARTIFACT_DIGEST,
    runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,workflowHead:env.GITHUB_SHA,batchBytes:raw,token:env.GH_TOKEN,fetcher});
  if(verified.remoteBytesVerified!==true||verified.batchSha256!==contract.hash(raw))fail('remote_bytes_not_verified');
  const statuses={};
  for(const a of batch.attempts){
    const status=contract.sealStatus(a,verified.artifact),receipt={version:'independent-head-forward-seal-v2',
      candidateId:p.value.candidateId,protocolHash:p.digest,attemptHash:contract.hash(contract.json(a)),attempt:a,
      artifact:verified.artifact,batchSha256:verified.batchSha256,remoteBytesVerified:true,status,forwardEligible:status==='eligible',...FLAGS};
    if(!contract.validSeal(receipt,p))fail('receipt_invalid');contract.saveRecord(root,receipt);statuses[status]=(statuses[status]||0)+1;
  }
  console.log(JSON.stringify({sealed:batch.attempts.length,statuses}));return {sealed:batch.attempts.length,statuses};
}
if(require.main===module){const [mode,out]=process.argv.slice(2);Promise.resolve().then(()=>mode==='capture'?capture(process.cwd(),out):
  mode==='seal'?seal(process.cwd(),out):Promise.reject(Error('head_capture_mode_invalid'))).catch(error=>{console.error(error.message);process.exitCode=1;});}
module.exports={context,checkoutIdentity,existingAttempts,noteSource,matchesSavedBaseline,capture,seal};
