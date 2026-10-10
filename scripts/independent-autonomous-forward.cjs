'use strict';
const fs=require('node:fs'), path=require('node:path');
const {VERSION,hash,officialInput,select}=require('./independent-autonomous-candidate.cjs');
const {writeOnce,stats}=require('./independent-rule-forward.cjs');
const judgmentContext=require('./independent-judgment-context.cjs');
const flowJudgment=require('./independent-flow-roles-v1.cjs');
const partnerContext=require('./independent-partner-context-v1.cjs'),partnerJudgment=require('./independent-partner-selector-v1.cjs');
const routeWater=require('./independent-route-water-v1.cjs'),waterSelector=require('./independent-partner-selector-v2.cjs');
const weatherHistory=require('./independent-weather-context-v1.cjs');
const weatherHistoryV2=require('./independent-weather-context-v2.cjs');
const pairDiagnostic=require('./independent-pair-route-diagnostic-v1.cjs');
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
  const partnerRaw=fs.readFileSync(path.join(root,'config/independent-partner-study-v1.json')),partner=JSON.parse(partnerRaw);
  const dependencies=['scripts/independent-partner-context-v1.cjs','scripts/independent-partner-selector-v1.cjs'];
  if(partner.version!=='independent-partner-study-v1'||partner.method!==partnerJudgment.VERSION||partner.maximumTickets!==7||
    partner.selectionImplemented!==true||partner.fullJudgmentImplemented!==false||partner.usableForPrediction!==false||
    partner.automaticApplication!==false||partner.adoptionGate!==null||Object.keys(partner.codeHashes||{}).length!==dependencies.length||
    dependencies.some(file=>partner.codeHashes[file]!==hash(fs.readFileSync(path.join(root,file)))))fail('partner_protocol_invalid');
  const waterRaw=fs.readFileSync(path.join(root,'config/independent-route-water-study-v1.json')),water=JSON.parse(waterRaw);
  const waterDependencies=['scripts/independent-route-water-v1.cjs','scripts/independent-partner-selector-v2.cjs'];
  if(water.version!=='independent-route-water-study-v1'||water.method!==waterSelector.VERSION||water.maximumTickets!==7||
    water.baselineMethod!==partnerJudgment.VERSION||water.selectionImplemented!==true||water.fullJudgmentImplemented!==false||
    water.usableForPrediction!==false||water.automaticApplication!==false||water.adoptionGate!==null||
    Object.keys(water.codeHashes||{}).length!==waterDependencies.length||
    waterDependencies.some(file=>water.codeHashes[file]!==hash(fs.readFileSync(path.join(root,file)))))fail('water_protocol_invalid');
  const weatherRaw=fs.readFileSync(path.join(root,'config/independent-weather-study-v1.json')),weather=JSON.parse(weatherRaw);
  const weatherDependencies=['scripts/independent-weather-history-v1.cjs','scripts/independent-weather-context-v1.cjs'];
  if(weather.version!=='independent-weather-study-v1'||weather.method!==weatherHistory.VERSION||weather.selectionImplemented!==false||
    weather.usableForPrediction!==false||weather.automaticApplication!==false||weather.adoptionGate!==null||
    Object.keys(weather.codeHashes||{}).length!==weatherDependencies.length||
    weatherDependencies.some(file=>weather.codeHashes[file]!==hash(fs.readFileSync(path.join(root,file)))))fail('weather_protocol_invalid');
  const weatherV2Raw=fs.readFileSync(path.join(root,'config/independent-weather-study-v2.json')),weatherV2=JSON.parse(weatherV2Raw);
  const weatherV2Dependencies=['scripts/independent-weather-history-v1.cjs','scripts/independent-weather-history-v2.cjs','scripts/independent-weather-context-v2.cjs'];
  if(weatherV2.version!=='independent-weather-study-v2'||weatherV2.method!==weatherHistoryV2.VERSION||weatherV2.selectionImplemented!==false||
    weatherV2.fullJudgmentImplemented!==false||weatherV2.usableForPrediction!==false||weatherV2.automaticApplication!==false||weatherV2.adoptionGate!==null||
    Object.keys(weatherV2.codeHashes||{}).length!==weatherV2Dependencies.length||
    weatherV2Dependencies.some(file=>weatherV2.codeHashes[file]!==hash(fs.readFileSync(path.join(root,file)))))fail('weather_v2_protocol_invalid');
  const pairRaw=fs.readFileSync(path.join(root,'config/independent-pair-route-diagnostic-v1.json')),pair=JSON.parse(pairRaw);
  const pairDependencies=['scripts/independent-pair-route-diagnostic-v1.cjs','scripts/independent-pair-route-report.cjs',
    'scripts/independent-route-water-v1.cjs','scripts/independent-partner-selector-v2.cjs'];
  if(pair.version!==pairDiagnostic.VERSION||pair.cohort!=='first-remote-seal-per-race-and-pair-diagnostic-protocol'||
    Object.entries(pairDiagnostic.SAFETY).some(([k,v])=>pair[k]!==v)||
    json(pair.sourceProtocolHashes)!==json({flow:hash(studyRaw),partner:hash(partnerRaw),routeWater:hash(waterRaw)})||
    Object.keys(pair.codeHashes||{}).length!==pairDependencies.length||
    pairDependencies.some(file=>pair.codeHashes[file]!==hash(fs.readFileSync(path.join(root,file)))))fail('pair_protocol_invalid');
  return {value:p,hash:hash(raw),pair:{value:pair,hash:hash(pairRaw)},weatherV2:{value:weatherV2,hash:hash(weatherV2Raw)},weather:{value:weather,hash:hash(weatherRaw)},water:{value:water,hash:hash(waterRaw)},study:{value:study,hash:hash(studyRaw)},partner:{value:partner,hash:hash(partnerRaw)}};
}
function context(env){
  if(env.GITHUB_REPOSITORY!==REPO || env.GITHUB_REF!=='refs/heads/main' || !/^\d+$/.test(env.GITHUB_RUN_ID||'') ||
      !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT||'') || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))fail('context_invalid');
}
function validate(s,p){
  const i=s?.input;
  if(!['independent-autonomous-snapshot-v1','independent-autonomous-snapshot-v2','independent-autonomous-snapshot-v3','independent-autonomous-snapshot-v4','independent-autonomous-snapshot-v5','independent-autonomous-snapshot-v6','independent-autonomous-snapshot-v7','independent-autonomous-snapshot-v8'].includes(s?.version) || s.protocolHash!==p.hash ||
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
  if(['independent-autonomous-snapshot-v3','independent-autonomous-snapshot-v4','independent-autonomous-snapshot-v5','independent-autonomous-snapshot-v6','independent-autonomous-snapshot-v7','independent-autonomous-snapshot-v8'].includes(s.version)){
    if(s.flowStudy?.protocolHash!==p.study.hash)fail('flow_protocol_mismatch');
    flowJudgment.validate(s.flowStudy.judgment,i,s.judgmentContext);
  }else if(s.flowStudy!==undefined)fail('legacy_flow_unexpected');
  if(['independent-autonomous-snapshot-v4','independent-autonomous-snapshot-v5','independent-autonomous-snapshot-v6','independent-autonomous-snapshot-v7','independent-autonomous-snapshot-v8'].includes(s.version)){
    if(s.partnerStudy?.protocolHash!==p.partner.hash)fail('partner_protocol_mismatch');
    partnerJudgment.validate(s.partnerStudy.judgment,i,s.judgmentContext,s.flowStudy.judgment,s.partnerStudy.context);
  }else if(s.partnerStudy!==undefined)fail('legacy_partner_unexpected');
  if(['independent-autonomous-snapshot-v5','independent-autonomous-snapshot-v6','independent-autonomous-snapshot-v7','independent-autonomous-snapshot-v8'].includes(s.version)){
    if(s.routeWaterStudy?.protocolHash!==p.water.hash)fail('water_protocol_mismatch');
    waterSelector.validate(s.routeWaterStudy.judgment,i,s.judgmentContext,s.flowStudy.judgment,s.partnerStudy.context,s.routeWaterStudy.context);
  }else if(s.routeWaterStudy!==undefined)fail('legacy_water_unexpected');
  if(s.version==='independent-autonomous-snapshot-v6'){
    if(s.weatherHistoryStudy?.protocolHash!==p.weather.hash)fail('weather_protocol_mismatch');
    weatherHistory.validate(s.weatherHistoryStudy.context,i,s.judgmentContext);
  }else if(['independent-autonomous-snapshot-v7','independent-autonomous-snapshot-v8'].includes(s.version)){
    if(s.weatherHistoryStudy?.protocolHash!==p.weatherV2.hash)fail('weather_v2_protocol_mismatch');
    weatherHistoryV2.validate(s.weatherHistoryStudy.context,i,s.judgmentContext);
  }else if(s.weatherHistoryStudy!==undefined)fail('legacy_weather_unexpected');
  if(s.version==='independent-autonomous-snapshot-v8'){
    if(s.pairRouteDiagnosticStudy?.protocolHash!==p.pair.hash)fail('pair_protocol_mismatch');
    pairDiagnostic.validate(s.pairRouteDiagnosticStudy.diagnostic,i,s.judgmentContext,s.flowStudy.judgment,
      s.partnerStudy.context,s.routeWaterStudy.context,s.routeWaterStudy.judgment);
  }else if(s.pairRouteDiagnosticStudy!==undefined)fail('legacy_pair_unexpected');
  return true;
}
function files(root,date){
  const base=path.join(root,'data/independent-autonomous-forward');
  return fs.existsSync(base)?fs.readdirSync(base).filter(d=>/^\d{8}$/.test(d)&&(!date||date===d)).sort()
    .flatMap(d=>fs.readdirSync(path.join(base,d)).filter(f=>f.endsWith('.json')).sort().map(f=>path.join(base,d,f))):[];
}
function cohort(root,p,date,{studyOnly=false,partnerOnly=false,waterOnly=false,weatherOnly=false,weatherV2Only=false,pairOnly=false}={}){
  const byRace=new Map(),rejected={};
  for(const file of files(root,date))try{
    const raw=fs.readFileSync(file),r=JSON.parse(raw),s=r.snapshot,a=r.artifact;
    validate(s,p);
    if(r.version!=='independent-autonomous-seal-v1' || path.basename(file)!==`${s.input.raceKey}-${hash(raw)}.json` ||
        r.snapshotHash!==hash(json(s)) || !Number.isSafeInteger(a?.id) || a.id<=0 || !/^sha256:[a-f0-9]{64}$/.test(a.digest||'') ||
        a.name!==`independent-autonomous-${s.runId}-${s.runAttempt}` || a.runId!==s.runId || a.workflowHead!==s.workflowHead ||
        !(Date.parse(s.selectedAt)<Date.parse(a.createdAt)+1000 && Date.parse(a.createdAt)<=Date.parse(a.confirmedAt) &&
          Date.parse(a.confirmedAt)<Date.parse(s.input.deadlineAt)))fail('seal_invalid');
    if(studyOnly&&!['independent-autonomous-snapshot-v3','independent-autonomous-snapshot-v4','independent-autonomous-snapshot-v5','independent-autonomous-snapshot-v6','independent-autonomous-snapshot-v7','independent-autonomous-snapshot-v8'].includes(s.version))continue;
    if(partnerOnly&&!['independent-autonomous-snapshot-v4','independent-autonomous-snapshot-v5','independent-autonomous-snapshot-v6','independent-autonomous-snapshot-v7','independent-autonomous-snapshot-v8'].includes(s.version))continue;
    if(waterOnly&&!['independent-autonomous-snapshot-v5','independent-autonomous-snapshot-v6','independent-autonomous-snapshot-v7','independent-autonomous-snapshot-v8'].includes(s.version))continue;
    if(weatherOnly&&s.version!=='independent-autonomous-snapshot-v6')continue;
    if(weatherV2Only&&!['independent-autonomous-snapshot-v7','independent-autonomous-snapshot-v8'].includes(s.version))continue;
    if(pairOnly&&s.version!=='independent-autonomous-snapshot-v8')continue;
    const key=pairOnly?`${s.input.raceKey}|${s.pairRouteDiagnosticStudy.protocolHash}`:s.input.raceKey;
    const old=byRace.get(key),order=x=>`${x.artifact.confirmedAt}|${x.snapshotHash}`;
    if(!old || order(r)<order(old))byRace.set(key,r);
  }catch(e){rejected[e.message]=(rejected[e.message]||0)+1;}
  return {rows:[...byRace.values()].sort((a,b)=>a.snapshot.input.raceKey.localeCompare(b.snapshot.input.raceKey)),rejected};
}
function createRecorder(root,out,env=process.env,now=Date.now){
  context(env);const p=protocol(root),date=new Date(now()+9*3600000).toISOString().slice(0,10).replaceAll('-','');
  const seen=new Set(cohort(root,p,date,{pairOnly:true}).rows.map(r=>r.snapshot.input.raceKey));
  const skillSource=partnerContext.load(root),weatherSource=weatherHistoryV2.load(root);
  fs.mkdirSync(out,{recursive:true});if(fs.readdirSync(out).length)fail('capture_directory_not_empty');
  return (data,target)=>{
    const clock=now();
    if(Date.parse(target.deadlineAt)-clock<=120000)return {status:'closed-or-too-close'};
    const i=officialInput(data,target,clock);
    if(!i)return {status:'waiting-exhibition'};
    if(seen.has(i.raceKey))return {status:'already-captured'};
    const contextValue=judgmentContext.capture(data,i);
    const flow=flowJudgment.judge(i,contextValue),support=partnerContext.capture(data,i,contextValue,skillSource);
    const waterContext=routeWater.judge(i,contextValue,flow);
    const waterSelection=waterSelector.judge(i,contextValue,flow,support,waterContext);
    const s={version:'independent-autonomous-snapshot-v8',protocolHash:p.hash,input:i,inputHash:hash(json(i)),
      selectedAt:new Date(clock).toISOString(),runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
      workflowHead:env.GITHUB_SHA,candidate:select(i),judgmentContext:contextValue,
      flowStudy:{protocolHash:p.study.hash,judgment:flow},
      partnerStudy:{protocolHash:p.partner.hash,context:support,judgment:partnerJudgment.judge(i,contextValue,flow,support)},
      routeWaterStudy:{protocolHash:p.water.hash,context:waterContext,judgment:waterSelection},
      weatherHistoryStudy:{protocolHash:p.weatherV2.hash,context:weatherHistoryV2.capture(i,contextValue,weatherSource)},
      pairRouteDiagnosticStudy:{protocolHash:p.pair.hash,diagnostic:pairDiagnostic.judge(i,contextValue,flow,support,waterContext,waterSelection)}};
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
  const partnerCohort=cohort(root,p,null,{partnerOnly:true}),waterCohort=cohort(root,p,null,{waterOnly:true});
  const weatherCohort=cohort(root,p,null,{weatherOnly:true}),weatherV2Cohort=cohort(root,p,null,{weatherV2Only:true});
  const pairCohort=cohort(root,p,null,{pairOnly:true});
  const allRows=[...c.rows,...flowCohort.rows,...partnerCohort.rows,...waterCohort.rows,...weatherCohort.rows,...weatherV2Cohort.rows];
  const wanted=new Set(allRows.map(r=>r.snapshot.input.raceKey)),results=new Map(),conflicts=new Set();
  const add=r=>{const key=contract.raceKey(r);if(!wanted.has(key))return;
    const a=resultOf(results.get(key)),b=resultOf(r);
    if(a&&b&&json([a.actual,a.payout,a.excluded])!==json([b.actual,b.payout,b.excluded]))conflicts.add(key);
    results.set(key,chooseOfficialResult(results.get(key),r));};
  for(const date of new Set(allRows.map(r=>r.snapshot.input.date))){const file=path.join(root,'data/results',date+'.json');if(fs.existsSync(file))(read(file).races||[]).forEach(add);}
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
    flowStudy:require('./independent-flow-study-report.cjs').build(flowCohort,p.study,results,conflicts,resultOf),
    partnerStudy:require('./independent-partner-study-report.cjs').build(partnerCohort,p.partner,results,conflicts,resultOf),
    routeWaterStudy:require('./independent-route-water-report.cjs').build(waterCohort,p.water,results,conflicts,resultOf),
    weatherHistoryStudy:weatherHistory.report(weatherCohort),
    weatherHistoryStudyV2:weatherHistoryV2.report(weatherV2Cohort),
    pairRouteDiagnosticStudy:require('./independent-pair-route-report.cjs').build(pairCohort,p.pair)};
  const file=path.join(root,'data/stats/independent-autonomous-report.json');fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file+'.tmp',json(r));fs.renameSync(file+'.tmp',file);
  console.log(JSON.stringify({sealed:r.sealed,skipped,groups,usableForPrediction:false}));return r;
}
if(require.main===module){const [mode,out]=process.argv.slice(2);Promise.resolve().then(()=>mode==='prepare'?prepare(process.cwd(),out):mode==='seal'?seal(process.cwd(),out):mode==='report'?report(process.cwd()):fail('mode_invalid')).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={json,protocol,validate,cohort,createRecorder,prepare,seal,report};
