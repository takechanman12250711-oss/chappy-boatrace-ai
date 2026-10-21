'use strict';
// A dedicated contract: the partner study's fixed head-allocation contract is unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {isDeepStrictEqual:equal}=require('node:util');
const engine=require('./independent-head-forward-v2.cjs');
const candidate=require('./compare-independent-head-coverage.cjs');
const REPOSITORY='takechanman12250711-oss/chappy-boatrace-ai';
const CONFIG='config/independent-head-forward-v2.json';
const DIRECTORY='data/independent-head-forward-v2';
const API='https://api.github.com/repos/'+REPOSITORY;
const SOURCE_PATHS=Object.freeze([...engine.SOURCE_PATHS,'scripts/head-forward-contract.cjs',
  'scripts/head-forward-capture.cjs','scripts/head-forward-artifact.cjs','.github/workflows/live-note.yml']);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value)+'\n';
const blob=bytes=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
const hex=(value,size)=>typeof value==='string'&&new RegExp('^[a-f0-9]{'+size+'}$').test(value);
const digits=value=>typeof value==='string'&&/^[1-9]\d*$/.test(value);
const fail=reason=>{throw Error('head_forward_'+reason);};
function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return NaN;
  const n=Date.parse(value),normalized=value.replace(/(?:\.(\d{1,3}))?Z$/,(_,f)=>'.'+(f||'').padEnd(3,'0')+'Z');
  return Number.isFinite(n)&&new Date(n).toISOString()===normalized?n:NaN;
}
function sourceManifest(root){
  engine.freezeSourceManifest(root); // Includes the immutable original candidate SHA contract.
  return SOURCE_PATHS.map(relative=>({path:relative,sha256:hash(fs.readFileSync(path.join(root,relative)))}));
}
function createProtocol(root,registrationPullRequest){
  return {version:'independent-head-forward-protocol-v2',candidateId:engine.CANDIDATE_ID,
    registrationPullRequest,sourcePolicy:'first-eligible-all-race-note-no-replacement',
    selectionOrder:'earliest-selectedAt-then-source-sha256',targetPolicy:'all-newly-claimed-races-without-fixed-count-gate',
    maxAttemptsPerRun:6,captureBudgetMs:20000,maxSourceBytes:4*1024*1024,
    sourceManifest:sourceManifest(root),usableForPrediction:false,automaticApplication:false,adoptionGate:null};
}
function readProtocol(root){
  const raw=fs.readFileSync(path.join(root,CONFIG)),value=JSON.parse(raw);
  if(value.version!=='independent-head-forward-protocol-v2'||value.candidateId!==engine.CANDIDATE_ID||
    !Number.isSafeInteger(value.registrationPullRequest)||value.registrationPullRequest<1||
    value.sourcePolicy!=='first-eligible-all-race-note-no-replacement'||value.selectionOrder!=='earliest-selectedAt-then-source-sha256'||
    value.targetPolicy!=='all-newly-claimed-races-without-fixed-count-gate'||value.maxAttemptsPerRun!==6||
    value.captureBudgetMs!==20000||value.maxSourceBytes!==4*1024*1024||value.usableForPrediction!==false||
    value.automaticApplication!==false||value.adoptionGate!==null||!equal(value.sourceManifest,sourceManifest(root)))fail('protocol_invalid_or_source_changed');
  return {root,value,digest:hash(json(value)),rawSha256:hash(raw),configBlobSha:blob(raw),generatorProtocols:new Map()};
}
function validIdentity(value){return value&&hex(value.codeCommit,40)&&hex(value.workflowHead,40)&&digits(value.runId)&&digits(value.runAttempt);}
function validRegistration(r,p,identity){
  return Boolean(r&&r.repository===REPOSITORY&&r.pullRequest===p.value.registrationPullRequest&&
    hex(r.headSha,40)&&hex(r.mergeCommitSha,40)&&r.configSha256===p.rawSha256&&r.configBlobSha===p.configBlobSha&&
    Number.isFinite(instant(r.mergedAt))&&Number.isFinite(instant(r.verifiedAt))&&instant(r.verifiedAt)>=instant(r.mergedAt)&&
    Number.isFinite(instant(r.runCreatedAt))&&instant(r.runCreatedAt)>=instant(r.mergedAt)&&instant(r.verifiedAt)>=instant(r.runCreatedAt)&&
    r.sourceManifestVerified===true&&r.workflowRunVerified===true&&
    (!identity||(r.runId===identity.runId&&r.runAttempt===identity.runAttempt&&r.workflowHead===identity.workflowHead)));
}
function serverTime(response){
  const raw=response.headers?.get('date'),n=Date.parse(raw);
  if(!raw||!Number.isFinite(n)||new Date(n).toUTCString()!==raw)fail('server_clock_unavailable');
  return n+1000;
}
async function getJSON(relative,{token,fetcher=fetch}={}){
  if(typeof token!=='string'||!token)fail('token_unavailable');
  const response=await fetcher(API+relative,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},
    redirect:'error',signal:AbortSignal.timeout(10000)});
  if(response.status!==200)fail('github_metadata_unavailable');
  const time=serverTime(response),value=await response.json();return {value,time};
}
async function resolveRegistration(root,p,identity,options={}){
  if(!validIdentity(identity))fail('run_identity_invalid');
  const [pull,run]=await Promise.all([getJSON('/pulls/'+p.value.registrationPullRequest,options),getJSON('/actions/runs/'+identity.runId,options)]);
  const pr=pull.value,r=run.value;
  if(pr.number!==p.value.registrationPullRequest||pr.merged!==true||pr.state!=='closed'||pr.base?.ref!=='main'||pr.base?.repo?.full_name!==REPOSITORY||
    pr.head?.repo?.full_name!==REPOSITORY||!hex(pr.head?.sha,40)||!hex(pr.merge_commit_sha,40)||!Number.isFinite(instant(pr.merged_at)))fail('registration_not_merged');
  if(String(r.id)!==identity.runId||String(r.run_attempt)!==identity.runAttempt||r.head_sha!==identity.workflowHead||
    r.head_branch!=='main'||r.path!=='.github/workflows/live-note.yml'||r.repository?.full_name!==REPOSITORY||
    !['push','schedule','workflow_dispatch','workflow_run'].includes(r.event)||r.status!=='in_progress'||r.conclusion!==null||
    !Number.isFinite(instant(r.created_at))||instant(r.created_at)<instant(pr.merged_at))fail('workflow_run_invalid');
  const [config,commit]=await Promise.all([getJSON('/contents/'+CONFIG+'?ref='+pr.merge_commit_sha,options),getJSON('/git/commits/'+pr.merge_commit_sha,options)]);
  const cfg=config.value;
  if(cfg.type!=='file'||cfg.encoding!=='base64'||!Number.isSafeInteger(cfg.size)||cfg.size>64*1024||typeof cfg.content!=='string')fail('registered_config_invalid');
  const bytes=Buffer.from(cfg.content,'base64');
  if(bytes.length!==cfg.size||hash(bytes)!==p.rawSha256||cfg.sha!==p.configBlobSha||blob(bytes)!==cfg.sha)fail('registered_config_changed');
  const treeSha=commit.value.tree?.sha;if(!hex(treeSha,40))fail('registered_tree_unavailable');
  const cache=new Map();let verifiedAt=Math.max(pull.time,run.time,config.time,commit.time);
  const tree=sha=>{if(!cache.has(sha))cache.set(sha,getJSON('/git/trees/'+sha,options).then(({value,time})=>{
    verifiedAt=Math.max(verifiedAt,time);
    if(value.truncated||!Array.isArray(value.tree)||value.tree.length>10000)fail('registered_tree_invalid');return value.tree;}));return cache.get(sha);};
  await Promise.all(SOURCE_PATHS.map(async relative=>{
    let sha=treeSha;const parts=relative.split('/');
    for(let i=0;i<parts.length;i++){
      const entry=(await tree(sha)).find(e=>e.path===parts[i]);
      if(i===parts.length-1){if(entry?.type!=='blob'||entry.mode!=='100644'||entry.sha!==blob(fs.readFileSync(path.join(root,relative))))fail('registered_source_changed');}
      else {if(entry?.type!=='tree'||!hex(entry.sha,40))fail('registered_source_unavailable');sha=entry.sha;}
    }
  }));
  const result={repository:REPOSITORY,pullRequest:p.value.registrationPullRequest,headSha:pr.head.sha,
    mergeCommitSha:pr.merge_commit_sha,mergedAt:pr.merged_at,configSha256:p.rawSha256,configBlobSha:p.configBlobSha,
    verifiedAt:new Date(verifiedAt).toISOString(),
    runCreatedAt:r.created_at,runId:identity.runId,runAttempt:identity.runAttempt,workflowHead:identity.workflowHead,
    sourceManifestVerified:true,workflowRunVerified:true};
  if(!validRegistration(result,p,identity))fail('registration_invalid');return result;
}
function validTickets(tickets){return Array.isArray(tickets)&&tickets.length>0&&tickets.length<=10&&new Set(tickets).size===tickets.length&&
  tickets.every(t=>typeof t==='string'&&/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split('-')).size===3);}
function startedRecord(record){return {...record,stage:'started',completedAt:null,startedHash:null,outcome:{status:'started',reason:'AWAITING_GENERATION',snapshot:null}};}
function attemptId(protocolHash,raceKey,sourceSha256){return hash(json({protocolHash,raceKey,sourceSha256}));}
function generatorProtocol(p,definedAt){
  if(!p.generatorProtocols.has(definedAt))p.generatorProtocols.set(definedAt,engine.defineProtocol(p.root,{definedAt}));
  return p.generatorProtocols.get(definedAt);
}
function validGenerated(a,p){
  try{
    const s=a.outcome.snapshot,e=generatorProtocol(p,a.registration.mergedAt);
    if(!s||s.candidateId!==p.value.candidateId||s.raceKey!==a.raceKey||s.runnerMode!=='isolated-frozen-vm'||
      s.protocolFingerprint!==e.fingerprint||!equal(s.protocol,e)||s.usableForPrediction!==false||s.automaticApplication!==false||s.adoptionGate!==null||
      !equal(s.identity,{codeCommit:a.codeCommit,workflowHead:a.workflowHead,runId:a.runId,runAttempt:a.runAttempt})||
      s.source?.kind!=='all-race-note'||s.source.recordJsonSha256!==a.source.recordJsonSha256||s.source.inputSha256!==a.source.inputSha256||
      !equal(s.source.sourcePointer,{path:a.source.path,sha256:a.source.sha256,recordJsonSha256:a.source.recordJsonSha256,recordPath:'record'})||
      s.source.recordHashVerified!==true||s.clocks?.definedAt!==a.registration.mergedAt||s.clocks.selectedAt!==a.selectedAt||s.clocks.deadlineAt!==a.deadlineAt||
      !(instant(a.selectedAt)<=instant(s.clocks.generationStartedAt)&&instant(s.clocks.generationStartedAt)<=instant(s.clocks.generationCompletedAt)&&
        instant(s.clocks.generationCompletedAt)<instant(a.deadlineAt)&&instant(s.clocks.generationCompletedAt)<=instant(a.completedAt))||
      !validTickets(s.baseline?.tickets)||!validTickets(s.candidate?.tickets)||s.baseline.tickets.length!==s.candidate.tickets.length||
      s.baseline.coreVersion!==candidate.REQUIRED_CORE_VERSION||s.candidate.coreVersion!==candidate.REQUIRED_CORE_VERSION||
      !['baselineFullParity','candidateFullParity','candidateInjectionEntered'].every(k=>s.observations?.[k]===true)||
      s.observations.baselineOptionsState!=='valid'||s.observations.candidateOptionsState!=='valid'||
      !Number.isInteger(s.observations.actualFirstNewHead)||s.observations.actualFirstNewHead< -1||
      !equal(s.observations.requestedBaselineHeads,candidate.heads(s.baseline.tickets))||typeof s.guard?.changed!=='boolean')return false;
    if(!s.guard.changed)return equal(s.baseline,s.candidate);
    const removed=s.baseline.tickets.filter(t=>!s.candidate.tickets.includes(t)),added=s.candidate.tickets.filter(t=>!s.baseline.tickets.includes(t));
    const oldHeads=candidate.heads(s.baseline.tickets),newHeads=candidate.heads(s.candidate.tickets);
    return s.guard.reason==='ONE_QUALIFIED_NEW_HEAD_SWAP'&&removed.length===1&&added.length===1&&
      equal(s.baseline.head,s.candidate.head)&&equal(s.baseline.scenarios,s.candidate.scenarios)&&equal(s.baseline.mainTickets,s.candidate.mainTickets)&&
      !oldHeads.includes(Number(added[0][0]))&&newHeads.length===oldHeads.length+1&&oldHeads.every(h=>newHeads.includes(h))&&
      s.guard.swap?.removed===removed[0]&&s.guard.swap?.added===added[0]&&s.guard.swap.removedHead===Number(removed[0][0])&&
      s.guard.swap.addedHead===Number(added[0][0])&&equal(s.guard.swap.oldHeads,oldHeads)&&equal(s.guard.swap.newHeads,newHeads);
  }catch{return false;}
}
function validAttempt(a,p){
  try{
    if(a?.version!=='independent-head-forward-attempt-v2'||a.candidateId!==p.value.candidateId||a.protocolHash!==p.digest||
      !/^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(a.raceKey)||a.date!==a.raceKey.slice(0,8)||
      !validIdentity(a)||!validRegistration(a.registration,p,a)||a.source?.fileHashVerified!==true||
      !hex(a.source.sha256,64)||!hex(a.source.recordJsonSha256,64)||!(a.source.inputSha256===null||hex(a.source.inputSha256,64))||
      a.source.path!==`data/note-drafts/${a.date}/${a.raceKey}-${a.source.sha256}.json`||
      a.attemptId!==attemptId(p.digest,a.raceKey,a.source.sha256)||
      !(instant(a.registration.mergedAt)<=instant(a.selectedAt)&&instant(a.selectedAt)<instant(a.deadlineAt))||
      !(instant(a.startedAt)>=instant(a.selectedAt)&&instant(a.startedAt)>=instant(a.registration.runCreatedAt))||
      a.usableForPrediction!==false||a.automaticApplication!==false||a.productionChanged!==false||a.adoptionGate!==null)return false;
    if(a.stage==='started')return a.completedAt===null&&a.startedHash===null&&equal(a.outcome,{status:'started',reason:'AWAITING_GENERATION',snapshot:null});
    if(a.stage!=='completed'||!Number.isFinite(instant(a.completedAt))||instant(a.completedAt)<instant(a.startedAt)||
      a.startedHash!==hash(json(startedRecord(a)))||!['generated','missing','failed'].includes(a.outcome?.status)||typeof a.outcome.reason!=='string')return false;
    return a.outcome.status==='generated'?validGenerated(a,p):a.outcome.snapshot===null;
  }catch{return false;}
}
function sealStatus(attempt,artifact){
  if(instant(artifact.confirmedAt)>=instant(attempt.deadlineAt)||instant(attempt.completedAt)>=instant(attempt.deadlineAt))return 'late';
  return attempt.outcome.status==='generated'?'eligible':'generation-'+attempt.outcome.status;
}
function validSeal(r,p){
  try{
    const a=r?.attempt,t=r?.artifact;
    if(r?.version!=='independent-head-forward-seal-v2'||r.candidateId!==p.value.candidateId||r.protocolHash!==p.digest||
      !validAttempt(a,p)||a.stage!=='completed'||r.attemptHash!==hash(json(a))||r.remoteBytesVerified!==true||
      !hex(r.batchSha256,64)||!Number.isSafeInteger(t?.id)||t.id<1||!/^sha256:[a-f0-9]{64}$/.test(t.digest)||
      t.name!==`independent-head-v2-${a.runId}-${a.runAttempt}`||t.runId!==a.runId||t.runAttempt!==a.runAttempt||t.workflowHead!==a.workflowHead||
      !Number.isFinite(instant(t.createdAt))||!Number.isFinite(instant(t.confirmedAt))||
      !(instant(a.completedAt)<instant(t.createdAt)+1000&&instant(t.createdAt)<=instant(t.confirmedAt)&&
        instant(t.confirmedAt)>=instant(a.registration.verifiedAt))||
      r.usableForPrediction!==false||r.automaticApplication!==false||r.productionChanged!==false||r.adoptionGate!==null)return false;
    const status=sealStatus(a,t);return r.status===status&&r.forwardEligible===(status==='eligible');
  }catch{return false;}
}
function writeOnce(file,bytes){
  fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{const fd=fs.openSync(temp,'wx');try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    try{fs.linkSync(temp,file);}catch(e){if(e.code!=='EEXIST'||!fs.readFileSync(file).equals(Buffer.from(bytes)))throw e;}
  }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function saveRecord(root,record){const bytes=json(record),relative=path.posix.join(DIRECTORY,record.date||record.attempt.date,`${record.raceKey||record.attempt.raceKey}-${hash(bytes)}.json`);writeOnce(path.join(root,relative),bytes);return relative;}
function recordFiles(root){const base=path.join(root,DIRECTORY);if(!fs.existsSync(base))return [];return fs.readdirSync(base).filter(d=>/^\d{8}$/.test(d)).sort()
  .flatMap(date=>fs.readdirSync(path.join(base,date)).filter(f=>/^\d{8}-\d{2}-\d{1,2}-[a-f0-9]{64}\.json$/.test(f)).sort().map(file=>path.posix.join(DIRECTORY,date,file)));}
module.exports={REPOSITORY,CONFIG,DIRECTORY,SOURCE_PATHS,hash,json,blob,instant,sourceManifest,createProtocol,readProtocol,validIdentity,
  validRegistration,resolveRegistration,generatorProtocol,validTickets,startedRecord,attemptId,validAttempt,sealStatus,validSeal,writeOnce,saveRecord,recordFiles};
