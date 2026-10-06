'use strict';
const fs=require('node:fs'), path=require('node:path');
const {VERSION,hash,officialInput,select}=require('./independent-autonomous-candidate.cjs');
const {writeOnce,stats}=require('./independent-rule-forward.cjs');
const judgmentContext=require('./independent-judgment-context.cjs');
const flowJudgment=require('./independent-flow-roles-v1.cjs');
const REPO='takechanman12250711-oss/chappy-boatrace-ai';
const json=x=>JSON.stringify(x)+'\n';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const fail=reason=>{throw Error('autonomous_'+reason);};
function protocol(root){
  const raw=fs.readFileSync(path.join(root,'config/independent-autonomous-forward.json')),p=JSON.parse(raw);
  if(p.method!==VERSION || p.usableForPrediction!==false || p.automaticApplication!==false || p.adoptionGate!==null ||
      p.codeHash!==hash(fs.readFileSync(path.join(root,'scripts/independent-autonomous-candidate.cjs'))))fail('protocol_invalid');
  const studyRaw=fs.readFileSync(path.join(root,'config/independent-flow-study-v1.json')),study=JSON.parse(studyRaw);
  if(study.version!=='independent-flow-study-v1'||study.method!==flowJudgment.VERSION||study.usableForPrediction!==false||
    study.automaticApplication!==false||study.selectionImplemented!==false||study.adoptionGate!==null||
    study.codeHash!==hash(fs.readFileSync(path.join(root,'scripts/independent-flow-roles-v1.cjs'))))fail('flow_protocol_invalid');
  return {value:p,hash:hash(raw),study:{value:study,hash:hash(studyRaw)}};
}
function context(env){
  if(env.GITHUB_REPOSITORY!==REPO || env.GITHUB_REF!=='refs/heads/main' || !/^\d+$/.test(env.GITHUB_RUN_ID||'') ||
      !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT||'') || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))fail('context_invalid');
}
function validate(s,p){
  const i=s?.input;
  if(!['independent-autonomous-snapshot-v1','independent-autonomous-snapshot-v2','independent-autonomous-snapshot-v3'].includes(s?.version) || s.protocolHash!==p.hash ||
      !/^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(i?.raceKey||'') ||
      i.raceKey!==`${i.date}-${i.jcd}-${i.raceNo}` || i.provenance!=='parsed-official-response' ||
      !/^\d+$/.test(s.runId||'') || !/^\d+$/.test(s.runAttempt||'') || !/^[a-f0-9]{40}$/.test(s.workflowHead||'') ||
      s.inputHash!==hash(json(i)) || !(Date.parse(i.observedAt)<=Date.parse(s.selectedAt) && Date.parse(s.selectedAt)<Date.parse(i.deadlineAt)-120000)) fail('snapshot_invalid');
  // Replay the input contract as well as the fixed selector, including URLs/date.
  const again=officialInput({ok:true,source:'boatrace-official',date:i.date,stadiumCode:i.jcd,raceNo:i.raceNo,fetchedAt:i.observedAt,
    entryUrl:i.urls?.[0],beforeInfoUrl:i.urls?.[1],entries:i.rows.map(r=>({boat:r.boat,exhibition:{displayTime:r.displayTime}})),
    startExhibition:i.rows.map(r=>({...r,mappingSource:'official-start-image'}))},i,Date.parse(s.selectedAt));
  if(json(again)!==json(i) || json(select(i))!==json(s.candidate))fail('replay_mismatch');
  if(s.version!=='independent-autonomous-snapshot-v1')judgmentContext.validate(s.judgmentContext,i);
  else if(s.judgmentContext!==undefined)fail('legacy_context_unexpected');
  if(s.version==='independent-autonomous-snapshot-v3'){
    if(s.flowStudy?.protocolHash!==p.study.hash)fail('flow_protocol_mismatch');
    flowJudgment.validate(s.flowStudy.judgment,i,s.judgmentContext);
  }else if(s.flowStudy!==undefined)fail('legacy_flow_unexpected');
  return true;
}
function files(root,date){
  const base=path.join(root,'data/independent-autonomous-forward');
  return fs.existsSync(base)?fs.readdirSync(base).filter(d=>/^\d{8}$/.test(d)&&(!date||date===d)).sort()
    .flatMap(d=>fs.readdirSync(path.join(base,d)).filter(f=>f.endsWith('.json')).sort().map(f=>path.join(base,d,f))):[];
}
function cohort(root,p,date,{studyOnly=false}={}){
  const byRace=new Map(),rejected={};
  for(const file of files(root,date))try{
    const raw=fs.readFileSync(file),r=JSON.parse(raw),s=r.snapshot,a=r.artifact;
    validate(s,p);
    if(r.version!=='independent-autonomous-seal-v1' || path.basename(file)!==`${s.input.raceKey}-${hash(raw)}.json` ||
        r.snapshotHash!==hash(json(s)) || !Number.isSafeInteger(a?.id) || a.id<=0 || !/^sha256:[a-f0-9]{64}$/.test(a.digest||'') ||
        a.name!==`independent-autonomous-${s.runId}-${s.runAttempt}` || a.runId!==s.runId || a.workflowHead!==s.workflowHead ||
        !(Date.parse(s.selectedAt)<Date.parse(a.createdAt)+1000 && Date.parse(a.createdAt)<=Date.parse(a.confirmedAt) &&
          Date.parse(a.confirmedAt)<Date.parse(s.input.deadlineAt)))fail('seal_invalid');
    if(studyOnly&&s.version!=='independent-autonomous-snapshot-v3')continue;
    const old=byRace.get(s.input.raceKey),order=x=>`${x.artifact.confirmedAt}|${x.snapshotHash}`;
    if(!old || order(r)<order(old))byRace.set(s.input.raceKey,r);
  }catch(e){rejected[e.message]=(rejected[e.message]||0)+1;}
  return {rows:[...byRace.values()].sort((a,b)=>a.snapshot.input.raceKey.localeCompare(b.snapshot.input.raceKey)),rejected};
}
function createRecorder(root,out,env=process.env,now=Date.now){
  context(env);const p=protocol(root),date=new Date(now()+9*3600000).toISOString().slice(0,10).replaceAll('-','');
  const seen=new Set(cohort(root,p,date,{studyOnly:true}).rows.map(r=>r.snapshot.input.raceKey));
  fs.mkdirSync(out,{recursive:true});if(fs.readdirSync(out).length)fail('capture_directory_not_empty');
  return (data,target)=>{
    const clock=now();
    if(Date.parse(target.deadlineAt)-clock<=120000)return {status:'closed-or-too-close'};
    const i=officialInput(data,target,clock);
    if(!i)return {status:'waiting-exhibition'};
    if(seen.has(i.raceKey))return {status:'already-captured'};
    const contextValue=judgmentContext.capture(data,i);
    const s={version:'independent-autonomous-snapshot-v3',protocolHash:p.hash,input:i,inputHash:hash(json(i)),
      selectedAt:new Date(clock).toISOString(),runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
      workflowHead:env.GITHUB_SHA,candidate:select(i),judgmentContext:contextValue,
      flowStudy:{protocolHash:p.study.hash,judgment:flowJudgment.judge(i,contextValue)}};
    validate(s,p);const bytes=json(s);writeOnce(path.join(out,hash(bytes)+'.json'),bytes);seen.add(i.raceKey);
    return {status:s.candidate.status,raceKey:i.raceKey,reason:s.candidate.reason};
  };
}
function prepare(root,out,env=process.env){
  context(env);const p=protocol(root);let count=0;
  for(const file of fs.existsSync(out)?fs.readdirSync(out):[]){
    if(!/^[a-f0-9]{64}\.json$/.test(file))fail('capture_file_invalid');
    const raw=fs.readFileSync(path.join(out,file)),s=JSON.parse(raw);validate(s,p);
    if(file!==hash(raw)+'.json' || s.runId!==env.GITHUB_RUN_ID || s.runAttempt!==env.GITHUB_RUN_ATTEMPT || s.workflowHead!==env.GITHUB_SHA)fail('capture_identity_invalid');
    count++;
  }
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`count=${count}\n`);
  console.log(JSON.stringify({captured:count,usableForPrediction:false}));return count;
}
async function seal(root,out,env=process.env,fetcher=fetch){
  context(env);const p=protocol(root);
  if(!/^\d+$/.test(env.AUTONOMOUS_ARTIFACT_ID||'') || !/^(sha256:)?[a-f0-9]{64}$/.test(env.AUTONOMOUS_ARTIFACT_DIGEST||''))fail('artifact_input_invalid');
  prepare(root,out,env);
  const response=await fetcher(`https://api.github.com/repos/${REPO}/actions/artifacts/${env.AUTONOMOUS_ARTIFACT_ID}`,{
    signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.GH_TOKEN}`,Accept:'application/vnd.github+json'}});
  if(!response.ok)fail('artifact_unavailable');
  const a=await response.json(),server=Date.parse(response.headers.get('date'))+1000;
  if(!Number.isFinite(server) || a.expired!==false || a.id!==Number(env.AUTONOMOUS_ARTIFACT_ID) ||
      a.digest!=='sha256:'+env.AUTONOMOUS_ARTIFACT_DIGEST.replace(/^sha256:/,'') ||
      a.name!==`independent-autonomous-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}` ||
      String(a.workflow_run?.id)!==env.GITHUB_RUN_ID || a.workflow_run?.head_sha!==env.GITHUB_SHA)fail('artifact_identity_invalid');
  let saved=0,late=0;
  for(const file of fs.readdirSync(out)){
    const raw=fs.readFileSync(path.join(out,file)),s=JSON.parse(raw);validate(s,p);
    if(!(Date.parse(s.selectedAt)<Date.parse(a.created_at)+1000 && Date.parse(a.created_at)<=server))fail('artifact_time_invalid');
    if(server>=Date.parse(s.input.deadlineAt)){late++;continue;}
    const r={version:'independent-autonomous-seal-v1',snapshot:s,snapshotHash:hash(raw),artifact:{id:a.id,digest:a.digest,name:a.name,
      runId:s.runId,workflowHead:s.workflowHead,createdAt:a.created_at,confirmedAt:new Date(server).toISOString()}};
    const bytes=json(r);writeOnce(path.join(root,'data/independent-autonomous-forward',s.input.date,`${s.input.raceKey}-${hash(bytes)}.json`),bytes);saved++;
  }
  console.log(JSON.stringify({saved,late}));return {saved,late};
}
function report(root){
  const p=protocol(root),c=cohort(root,p),{resultOf,chooseOfficialResult}=require('./audit-escape-main.cjs'),contract=require('./analysis-input-contract');
  const flowCohort=cohort(root,p,null,{studyOnly:true});
  const wanted=new Set([...c.rows,...flowCohort.rows].map(r=>r.snapshot.input.raceKey)),results=new Map(),conflicts=new Set();
  const add=r=>{const key=contract.raceKey(r);if(!wanted.has(key))return;
    const a=resultOf(results.get(key)),b=resultOf(r);
    if(a&&b&&json([a.actual,a.payout,a.excluded])!==json([b.actual,b.payout,b.excluded]))conflicts.add(key);
    results.set(key,chooseOfficialResult(results.get(key),r));};
  for(const date of new Set([...c.rows,...flowCohort.rows].map(r=>r.snapshot.input.date))){const file=path.join(root,'data/results',date+'.json');if(fs.existsSync(file))(read(file).races||[]).forEach(add);}
  const ledger=path.join(root,'data/stats/race-review-results.json');if(fs.existsSync(ledger))Object.values(read(ledger).races||{}).forEach(add);
  const skipped={},groups={};
  for(const r of c.rows)if(r.snapshot.candidate.status==='skipped'){
    const reason=r.snapshot.candidate.reason;skipped[reason]=(skipped[reason]||0)+1;
  }
  for(const kind of ['escape','upset']){
    const rows=c.rows.map(r=>r.snapshot).filter(s=>s.candidate.status==='selected'&&s.candidate.kind===kind),settled=[],pending=[],excluded=[];
    for(const s of rows){const key=s.input.raceKey,r=resultOf(results.get(key));
      if(conflicts.has(key))excluded.push({raceKey:key,reason:'conflicting_official_results'});
      else if(!r)pending.push(key);
      else if(r.excluded)excluded.push({raceKey:key,reason:r.excluded});
      else settled.push({raceKey:key,...r,tickets:s.candidate.tickets});
    }
    groups[kind]={selected:rows.length,pending,excluded,performance:stats(settled,'tickets'),settled};
  }
  const r={version:'independent-autonomous-report-v1',generatedAt:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA||'',
    protocol:p.value,protocolHash:p.hash,autonomousInput:true,chatEquivalent:false,productionChanged:false,
    usableForPrediction:false,automaticApplication:false,decisionGate:{status:'INSUFFICIENT_EVIDENCE',reason:'No registered adoption gate'},
    coverage:'first remote-sealed complete official input among existing live-note fetches; not all races',
    sealed:c.rows.length,rejected:c.rejected,skipped,groups,
    judgmentContext:{captured:c.rows.filter(r=>r.snapshot.version!=='independent-autonomous-snapshot-v1').length,
      legacyWithoutContext:c.rows.filter(r=>r.snapshot.version==='independent-autonomous-snapshot-v1').length,
      judgmentImplemented:false,usedForCandidateSelection:false},
    flowStudy:require('./independent-flow-study-report.cjs').build(flowCohort,p.study,results,conflicts,resultOf)};
  const file=path.join(root,'data/stats/independent-autonomous-report.json');fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file+'.tmp',json(r));fs.renameSync(file+'.tmp',file);
  console.log(JSON.stringify({sealed:r.sealed,skipped,groups,usableForPrediction:false}));return r;
}
if(require.main===module){const [mode,out]=process.argv.slice(2);Promise.resolve().then(()=>mode==='prepare'?prepare(process.cwd(),out):mode==='seal'?seal(process.cwd(),out):mode==='report'?report(process.cwd()):fail('mode_invalid')).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={json,protocol,validate,cohort,createRecorder,prepare,seal,report};
