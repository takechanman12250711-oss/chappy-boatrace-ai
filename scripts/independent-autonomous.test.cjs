'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const candidate=require('./independent-autonomous-candidate.cjs'),f=require('./independent-autonomous-forward.cjs');
const context=require('./independent-judgment-context.cjs');
const clock=Date.parse('2030-09-14T06:00:00Z');
const target={jcd:'23',raceNo:1,deadlineAt:'2030-09-14T15:20:00+09:00'};
const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),AUTONOMOUS_ARTIFACT_ID:'456',AUTONOMOUS_ARTIFACT_DIGEST:'b'.repeat(64),GH_TOKEN:'synthetic-test'};
function official(){return {ok:true,source:'boatrace-official',date:'20300914',stadiumCode:'23',raceNo:1,fetchedAt:new Date(clock-1000).toISOString(),
  entryUrl:'https://www.boatrace.jp/owpc/pc/race/racelist?hd=20300914&jcd=23&rno=1',
  beforeInfoUrl:'https://www.boatrace.jp/owpc/pc/race/beforeinfo?hd=20300914&jcd=23&rno=1',
  entries:[1,2,3,4,5,6].map(boat=>({boat,exhibition:{displayTime:6.7+boat/100}})),
  startExhibition:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:boat/100,marker:'',mappingSource:'official-start-image'}))};}
const metadata={id:456,digest:'sha256:'+env.AUTONOMOUS_ARTIFACT_DIGEST,name:'independent-autonomous-123-1',created_at:'2030-09-14T06:00:01Z',expired:false,workflow_run:{id:123,head_sha:env.GITHUB_SHA}};
const response=(date='Sat, 14 Sep 2030 06:00:02 GMT',a=metadata)=>async()=>({ok:true,headers:{get:()=>date},json:async()=>a});
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'independent-auto-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const file of ['config/independent-autonomous-forward.json','scripts/independent-autonomous-candidate.cjs',
    'config/independent-flow-study-v1.json','scripts/independent-flow-roles-v1.cjs',
    'config/independent-partner-study-v1.json','scripts/independent-partner-context-v1.cjs','scripts/independent-partner-selector-v1.cjs',
    'config/independent-route-water-study-v1.json','scripts/independent-route-water-v1.cjs','scripts/independent-partner-selector-v2.cjs',
    'config/independent-weather-study-v1.json','scripts/independent-weather-history-v1.cjs','scripts/independent-weather-context-v1.cjs']){
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(path.resolve(__dirname,'..',file),path.join(root,file));}
  return {root,out:path.join(root,'capture')};}
async function sealed(t,change=()=>{}){const x=setup(t),data=official();change(data);f.createRecorder(x.root,x.out,env,()=>clock)(data,target);await f.seal(x.root,x.out,env,response());return x;}
function result(x,ticket='1-2-3',extra={}){const file=path.join(x.root,'data/results/20300914.json');fs.mkdirSync(path.dirname(file),{recursive:true});
  const r={date:'20300914',jcd:'23',raceNo:1,raceKey:'20300914-23-1',resultSource:'boatrace-official',resultAvailable:true,trifecta:{combination:ticket,payout:1200},...extra};
  fs.writeFileSync(file,JSON.stringify({date:r.date,races:[r]}));return r;}
test('strict official projection ignores model tickets, odds, results and arbitrary evaluation fields',()=>{
  const raw=official(),before=structuredClone(raw),input=candidate.officialInput(raw,target,clock);
  Object.assign(raw,{prediction:{practicalTickets:['6-5-4']},odds:{'1-2-3':1},result:{actual:'6-5-4'},historyContext:{head:6}});
  raw.entries.forEach(e=>{e.score=999;e.nationalWinRate=99;});
  assert.deepEqual(candidate.officialInput(raw,target,clock),input);assert.deepEqual(candidate.select(input).tickets,['1-2-3','1-3-2']);
  assert.deepEqual(before,official());assert.equal(candidate.select(input).usableForPrediction,false);
  assert.equal(candidate.select(input).chatEquivalent,false);
});
test('official judgment facts keep unknowns and isolate model outputs from pre-race context',()=>{
  const raw=official();raw.entries[0]={...raw.entries[0],registerNo:'5280',className:'A1',avgSt:.16,
    currentRace:{stList:[.14,.12]},nationalWinRate:6.8,localWinRate:5.2,motorNo:44,motor2Rate:35.7,
    exhibition:{...raw.entries[0].exhibition,tilt:-.5,propeller:'',partsExchange:'ピストン'}};
  raw.weather={windSpeed:0,waveHeight:1,windDirection:'横風',liveTideAvailable:false};
  const input=candidate.officialInput(raw,target,clock),before=structuredClone(raw),c=context.capture(raw,input);
  assert.equal(c.coverage.registeredRacers,1);assert.equal(c.coverage.averageST,1);assert.equal(c.weather.windSpeed,0);
  assert.equal(c.weather.tideLevel,null);assert.equal(c.officialEntries[1].avgSt,null);assert.equal(c.judgmentImplemented,false);
  assert.equal(c.usedForCandidateSelection,false);assert.equal(context.validate(c,input),true);assert.deepEqual(raw,before);
  Object.assign(raw,{prediction:{head:6},odds:{x:100},results:{actual:'6-5-4'},historyContext:{generatedAt:'future',head:6}});
  raw.entries[0].score=999;assert.deepEqual(context.capture(raw,input),c);assert.deepEqual(candidate.select(input).tickets,['1-2-3','1-3-2']);
  const tampered=structuredClone(c);tampered.weather.windSpeed=9;assert.throws(()=>context.validate(tampered,input),/judgment_context/);
  raw.entries[0].avgSt='0.16';assert.equal(context.capture(raw,input).officialEntries[0].avgSt,null);
});
test('course-rank context preserves source identity and the unconfirmed general-race limitation',()=>{
  const raw=official();raw.entries[0].registerNo='5280';raw.entries[0].officialStartRank={version:'official-course-start-rank-v1',status:'available',
    source:'boatrace-official-course',registerNo:'5280',sourceUrl:'https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=5280',
    sourceSha256:'a'.repeat(64),fetchedAt:new Date(clock-2000).toISOString(),referenceOnly:true,population:'general-only-unconfirmed',
    byCourse:{1:2.1,2:3,3:2.5,4:3.3,5:null,6:4}};
  const input=candidate.officialInput(raw,target,clock),c=context.capture(raw,input);
  assert.equal(c.coverage.courseStartRank,1);assert.equal(c.officialEntries[0].officialStartRank.byCourse[5],null);assert.equal(context.validate(c,input),true);
  raw.entries[0].officialStartRank.registerNo='9999';assert.equal(context.capture(raw,input).coverage.courseStartRank,0);
  raw.entries[0].officialStartRank.registerNo='5280';raw.entries[0].officialStartRank.fetchedAt=new Date(clock+1).toISOString();assert.equal(context.capture(raw,input).coverage.courseStartRank,0);
});
test('actual course decides group; ties, cross-position tradeoffs and markers never gain invented tie-breaks',()=>{
  let raw=official();[raw.startExhibition[0].course,raw.startExhibition[3].course]=[4,1];
  assert.equal(candidate.select(candidate.officialInput(raw,target,clock)).kind,'upset');
  raw=official();raw.startExhibition[0].marker='F';assert.equal(candidate.select(candidate.officialInput(raw,target,clock)).reason,'start_marker_present');
  raw=official();raw.startExhibition[1].st=.01;assert.equal(candidate.select(candidate.officialInput(raw,target,clock)).reason,'no_unique_exhibition_dominance');
  raw=official();raw.startExhibition.slice(1).forEach(r=>{r.st=.02;});raw.entries.slice(1).forEach(e=>{e.exhibition.displayTime=6.8;});
  assert.equal(candidate.select(candidate.officialInput(raw,target,clock)).reason,'ambiguous_ticket_front');
  raw=official();raw.entries[1].exhibition.displayTime=6.6;assert.equal(candidate.select(candidate.officialInput(raw,target,clock)).status,'skipped');
});
test('missing exhibition waits; identities, late/future clocks, bad URLs and string numbers fail closed',()=>{
  for(const change of [r=>r.entries[0].exhibition.displayTime=null,r=>r.startExhibition[0].st='',r=>r.startExhibition[0].mappingSource='inferred',r=>r.startExhibition[1].course=1]){
    const raw=official();change(raw);assert.equal(candidate.officialInput(raw,target,clock),null);}
  for(const change of [r=>r.stadiumCode='24',r=>r.fetchedAt=new Date(clock+1).toISOString(),r=>r.entryUrl=r.entryUrl.replace('boatrace.jp','example.invalid')]){
    const raw=official();change(raw);assert.throws(()=>candidate.officialInput(raw,target,clock));}
  assert.throws(()=>candidate.officialInput(official(),target,Date.parse(target.deadlineAt)-120000));
  assert.throws(()=>candidate.officialInput(official(),target,clock+86400000));
});
test('only remote-confirmed snapshots enter cohort, with immutable bytes and exact artifact identity',async t=>{
  const x=setup(t),record=f.createRecorder(x.root,x.out,env,()=>clock);
  assert.equal(record(official(),target).status,'selected');assert.equal(record(official(),target).status,'already-captured');
  assert.equal(f.cohort(x.root,f.protocol(x.root)).rows.length,0);assert.equal(f.prepare(x.root,x.out,env),1);
  assert.deepEqual(await f.seal(x.root,x.out,env,response()),{saved:1,late:0});
  assert.equal(f.cohort(x.root,f.protocol(x.root)).rows.length,1);
  assert.deepEqual(await f.seal(x.root,x.out,env,response('Sat, 14 Sep 2030 06:19:59 GMT')),{saved:0,late:1});
  for(const a of [{...metadata,digest:'sha256:'+'c'.repeat(64)},{...metadata,expired:true},{...metadata,workflow_run:{id:124,head_sha:env.GITHUB_SHA}}])await assert.rejects(f.seal(x.root,x.out,env,response(undefined,a)),/artifact_identity/);
  await assert.rejects(f.seal(x.root,x.out,env,response('invalid')),/artifact_identity/);
  assert.throws(()=>f.createRecorder(x.root,path.join(x.root,'pr'),{...env,GITHUB_REF:'refs/pull/1/merge'},()=>clock),/context/);
});
test('new captures bind judgment facts into the seal while legacy snapshots remain valid',async t=>{
  const x=setup(t),raw=official();raw.entries[0].avgSt=.15;
  f.createRecorder(x.root,x.out,env,()=>clock)(raw,target);
  const file=path.join(x.out,fs.readdirSync(x.out)[0]),s=JSON.parse(fs.readFileSync(file));
  assert.equal(s.version,'independent-autonomous-snapshot-v6');assert.equal(s.judgmentContext.officialEntries[0].avgSt,.15);
  assert.equal(s.judgmentContext.inputHash,s.inputHash);assert.deepEqual(s.candidate,candidate.select(s.input));
  const p=f.protocol(x.root);assert.equal(f.validate(s,p),true);
  const missing=structuredClone(s);delete missing.judgmentContext;assert.throws(()=>f.validate(missing,p),/judgment_context/);
  missing.version='independent-autonomous-snapshot-v1';delete missing.flowStudy;delete missing.partnerStudy;delete missing.routeWaterStudy;delete missing.weatherHistoryStudy;assert.equal(f.validate(missing,p),true);
  const legacy=structuredClone(s);legacy.version='independent-autonomous-snapshot-v2';delete legacy.flowStudy;delete legacy.partnerStudy;delete legacy.routeWaterStudy;delete legacy.weatherHistoryStudy;assert.equal(f.validate(legacy,p),true);
  const altered=structuredClone(s);altered.flowStudy.judgment.decision.actor=6;assert.throws(()=>f.validate(altered,p),/flow_judgment/);
  await f.seal(x.root,x.out,env,response());const report=f.report(x.root);
  assert.equal(report.judgmentContext.captured,1);assert.equal(report.judgmentContext.legacyWithoutContext,0);
  assert.equal(report.judgmentContext.judgmentImplemented,false);assert.equal(report.usableForPrediction,false);
  assert.equal(report.flowStudy.sealed,1);assert.equal(report.flowStudy.ticketPerformanceAvailable,false);
});
test('v5 captures source histories and selected tickets through sealing and official accounting',async t=>{
  const x=setup(t),raw=official(),history={schemaVersion:1,source:'boatrace-official',generatedAt:'2030-09-13T01:00:00Z',
    firstDate:'20270914',lastDate:'20300913',analysisWindow:{latestDate:'20300913'},thresholds:{minimumSamples:12},racers:{}};
  raw.weather={windSpeed:2,waveHeight:2,windDirection:'横風'};
  for(const e of raw.entries){e.local2Rate=30;e.local3Rate=50;e.registerNo=String(5100+e.boat);e.officialStartRank={version:'official-course-start-rank-v1',status:'available',
    source:'boatrace-official-course',registerNo:e.registerNo,sourceUrl:`https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=${e.registerNo}`,
    sourceSha256:'a'.repeat(64),fetchedAt:new Date(clock-2000).toISOString(),referenceOnly:true,population:'general-only-unconfirmed',byCourse:{1:3,2:3,3:3,4:3,5:3,6:3}};
    const byCourse=Object.fromEntries([1,2,3,4,5,6].map(course=>[course,{course,starts:30,wins:5,top3:18,winningMethods:[{key:'差し',count:5}]}]));
    history.racers[e.registerNo]={registerNo:e.registerNo,windows:{recent1Year:{byCourse},previous2Years:{byCourse}}};}
  fs.mkdirSync(path.join(x.root,'data/stats'),{recursive:true});const bytes=JSON.stringify(history)+'\n';
  fs.writeFileSync(path.join(x.root,'data/stats/racer-skill-patterns.json'),bytes);
  f.createRecorder(x.root,x.out,env,()=>clock)(raw,target);await f.seal(x.root,x.out,env,response());
  const s=f.cohort(x.root,f.protocol(x.root),null,{partnerOnly:true}).rows[0].snapshot;
  assert.equal(s.partnerStudy.context.history.sha256,candidate.hash(bytes));assert.deepEqual(s.partnerStudy.judgment.tickets,['1-2-3','1-3-2']);
  result(x);const r=f.report(x.root);assert.equal(r.partnerStudy.allCandidate.hits,1);assert.equal(r.partnerStudy.paired.count,1);
  assert.equal(r.partnerStudy.allCandidate.stake,200);assert.equal(r.partnerStudy.allCandidate.returned,1200);assert.equal(r.partnerStudy.actualPurchase,false);
  assert.equal(r.routeWaterStudy.sealed,1);assert.equal(r.routeWaterStudy.allCandidate.hits,1);assert.equal(r.routeWaterStudy.paired.count,1);
  assert.equal(r.routeWaterStudy.baselineMethod,'independent-partner-selector-v1');assert.equal(r.routeWaterStudy.coverage.weatherAvailableRaces,1);
});
test('first seal including a skip stays fixed; modified source or method is rejected',async t=>{
  const x=await sealed(t,r=>{r.startExhibition[0].marker='F';});
  const again=f.createRecorder(x.root,path.join(x.root,'again'),env,()=>clock+10000);
  assert.equal(again(official(),target).status,'already-captured');
  assert.equal(f.report(x.root).skipped.start_marker_present,1);
  const dir=path.join(x.root,'data/independent-autonomous-forward/20300914'),file=path.join(dir,fs.readdirSync(dir)[0]);
  const r=JSON.parse(fs.readFileSync(file));r.snapshot.candidate.tickets=['6-5-4'];
  const raw=f.json(r);fs.unlinkSync(file);fs.writeFileSync(path.join(dir,`20300914-23-1-${candidate.hash(raw)}.json`),raw);
  assert.equal(f.cohort(x.root,f.protocol(x.root)).rows.length,0);
  fs.appendFileSync(path.join(x.root,'scripts/independent-autonomous-candidate.cjs'),'\n');assert.throws(()=>f.protocol(x.root),/protocol/);
});
test('new studies start their first-seal cohort without replacing the earlier v2 baseline',async t=>{
  const x=await sealed(t,r=>{r.startExhibition[0].marker='F';});
  const dir=path.join(x.root,'data/independent-autonomous-forward/20300914'),first=path.join(dir,fs.readdirSync(dir)[0]);
  const legacy=JSON.parse(fs.readFileSync(first));legacy.snapshot.version='independent-autonomous-snapshot-v2';
  delete legacy.snapshot.flowStudy;delete legacy.snapshot.partnerStudy;delete legacy.snapshot.routeWaterStudy;delete legacy.snapshot.weatherHistoryStudy;legacy.snapshotHash=candidate.hash(f.json(legacy.snapshot));
  const bytes=f.json(legacy);fs.unlinkSync(first);fs.writeFileSync(path.join(dir,`20300914-23-1-${candidate.hash(bytes)}.json`),bytes);
  const out=path.join(x.root,'v3'),p=f.protocol(x.root);
  assert.equal(f.cohort(x.root,p,null,{studyOnly:true}).rows.length,0);
  assert.equal(f.createRecorder(x.root,out,env,()=>clock+10000)(official(),target).status,'selected');
  await f.seal(x.root,out,env,response('Sat, 14 Sep 2030 06:00:12 GMT',{...metadata,created_at:'2030-09-14T06:00:11Z'}));
  assert.equal(f.cohort(x.root,p).rows[0].snapshot.version,'independent-autonomous-snapshot-v2');
  assert.equal(f.cohort(x.root,p).rows[0].snapshot.candidate.status,'skipped');
  assert.equal(f.cohort(x.root,p,null,{studyOnly:true}).rows[0].snapshot.candidate.status,'selected');
  assert.equal(f.createRecorder(x.root,path.join(x.root,'again-v3'),env,()=>clock+20000)(official(),target).status,'already-captured');
  const report=f.report(x.root);assert.equal(report.skipped.start_marker_present,1);assert.equal(report.flowStudy.sealed,1);
  fs.appendFileSync(path.join(x.root,'scripts/independent-flow-roles-v1.cjs'),'\n');assert.throws(()=>f.protocol(x.root),/flow_protocol/);
});
test('v5 preserves an earlier v3 flow judgment while starting a separate partner cohort',async t=>{
  const x=await sealed(t,r=>{r.startExhibition[0].marker='F';});
  const dir=path.join(x.root,'data/independent-autonomous-forward/20300914'),first=path.join(dir,fs.readdirSync(dir)[0]);
  const legacy=JSON.parse(fs.readFileSync(first));legacy.snapshot.version='independent-autonomous-snapshot-v3';delete legacy.snapshot.partnerStudy;delete legacy.snapshot.routeWaterStudy;delete legacy.snapshot.weatherHistoryStudy;
  legacy.snapshotHash=candidate.hash(f.json(legacy.snapshot));const bytes=f.json(legacy);
  fs.unlinkSync(first);fs.writeFileSync(path.join(dir,`20300914-23-1-${candidate.hash(bytes)}.json`),bytes);
  const out=path.join(x.root,'v4'),p=f.protocol(x.root);
  assert.equal(f.cohort(x.root,p,null,{partnerOnly:true}).rows.length,0);
  f.createRecorder(x.root,out,env,()=>clock+10000)(official(),target);
  await f.seal(x.root,out,env,response('Sat, 14 Sep 2030 06:00:12 GMT',{...metadata,created_at:'2030-09-14T06:00:11Z'}));
  assert.equal(f.cohort(x.root,p,null,{studyOnly:true}).rows[0].snapshot.version,'independent-autonomous-snapshot-v3');
  assert.equal(f.cohort(x.root,p,null,{partnerOnly:true}).rows[0].snapshot.version,'independent-autonomous-snapshot-v6');
  const report=f.report(x.root);assert.equal(report.flowStudy.unresolved['exhibition-start-marker'],1);
  assert.equal(report.partnerStudy.sealed,1);assert.equal(report.partnerStudy.skipped['course-history-insufficient'],1);
  fs.appendFileSync(path.join(x.root,'scripts/independent-partner-selector-v1.cjs'),'\n');assert.throws(()=>f.protocol(x.root),/partner_protocol/);
});
test('official settlement separates pending, losses, unknown payout, refund and conflicting evidence',async t=>{
  const x=await sealed(t);let r=f.report(x.root);assert.equal(r.groups.escape.pending.length,1);assert.equal(r.groups.escape.performance.hitRate,null);
  result(x);r=f.report(x.root);assert.equal(r.groups.escape.performance.hits,1);assert.equal(r.groups.escape.performance.stake,200);assert.equal(r.groups.escape.performance.returned,1200);
  result(x,'6-5-4');assert.equal(f.report(x.root).groups.escape.performance.hits,0);
  result(x,'1-2-3',{trifecta:{combination:'1-2-3',payout:null}});assert.equal(f.report(x.root).groups.escape.excluded[0].reason,'unknown-payout');
  result(x,'1-2-3',{void:true});assert.equal(f.report(x.root).groups.escape.excluded[0].reason,'refund-or-void');
  result(x,'1-2-3',{resultSource:'unverified'});assert.equal(f.report(x.root).groups.escape.pending.length,1);
  result(x);const ledger=path.join(x.root,'data/stats/race-review-results.json');
  fs.writeFileSync(ledger,JSON.stringify({races:{other:{date:'20300914',jcd:'23',raceNo:1,resultSource:'boatrace-official',resultAvailable:true,trifecta:{combination:'6-5-4',payout:2000}}}}));
  r=f.report(x.root);assert.equal(r.groups.escape.excluded[0].reason,'conflicting_official_results');
  assert.equal(r.decisionGate.status,'INSUFFICIENT_EVIDENCE');assert.equal(r.usableForPrediction,false);
});
test('existing writer permits only immutable receipts; publication is ahead of research sealing',()=>{
  const file='data/independent-autonomous-forward/20300914/20300914-23-1-'+'a'.repeat(64)+'.json',calls=[];
  require('./save-live-verification-sources').save({env,git:args=>{calls.push(args);return args[0]==='ls-files'?file:'';}});
  assert.ok(calls.some(a=>a[0]==='add'&&a.includes(file)));
  assert.throws(()=>require('./save-live-verification-sources').save({env,git:args=>args[0]==='ls-files'?'data/stats/unrelated.json':''}),/unrelated/);
  const w=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/live-note.yml'),'utf8');
  assert.ok(w.indexOf('run: node scripts/dispatch-ready-note.js')<w.indexOf('id: autonomous-prepare'));
  assert.equal((w.match(/- cron:/g)||[]).length,2);
  assert.ok(w.includes('node scripts/independent-autonomous-forward.cjs seal'));
});
test('collector captures official evidence before normal evaluation, even if that evaluation fails',async t=>{
  const x=setup(t),apiFile=require.resolve('../api/race'),previous=require.cache[apiFile];
  require.cache[apiFile]={id:apiFile,filename:apiFile,loaded:true,exports:async(req,res)=>res.status(200).json(official())};
  t.after(()=>{if(previous)require.cache[apiFile]=previous;else delete require.cache[apiFile];});
  const collector=require('./collect-predictions');
  const original=global.ChappyAICore.buildRaceTrendEvaluation;
  global.ChappyAICore.buildRaceTrendEvaluation=()=>{throw Error('synthetic_normal_model_failure');};
  t.after(()=>{global.ChappyAICore.buildRaceTrendEvaluation=original;});
  const record=f.createRecorder(x.root,x.out,env,()=>clock);
  const r=await collector.evaluateTargets('20300914',[target],{allRaces:true,onOfficialRace:record});
  assert.equal(r.comparison.length,0);assert.equal(f.prepare(x.root,x.out,env),1);
});

test('v5 starts a new cohort without replacing an earlier v4 partner skip',async t=>{
  const x=await sealed(t,r=>{r.startExhibition[0].marker='F';});
  const dir=path.join(x.root,'data/independent-autonomous-forward/20300914'),first=path.join(dir,fs.readdirSync(dir)[0]);
  const legacy=JSON.parse(fs.readFileSync(first));legacy.snapshot.version='independent-autonomous-snapshot-v4';delete legacy.snapshot.routeWaterStudy;delete legacy.snapshot.weatherHistoryStudy;
  legacy.snapshotHash=candidate.hash(f.json(legacy.snapshot));const bytes=f.json(legacy);
  fs.unlinkSync(first);fs.writeFileSync(path.join(dir,`20300914-23-1-${candidate.hash(bytes)}.json`),bytes);
  const out=path.join(x.root,'v5'),p=f.protocol(x.root);
  assert.equal(f.cohort(x.root,p,null,{waterOnly:true}).rows.length,0);
  f.createRecorder(x.root,out,env,()=>clock+10000)(official(),target);
  await f.seal(x.root,out,env,response('Sat, 14 Sep 2030 06:00:12 GMT',{...metadata,created_at:'2030-09-14T06:00:11Z'}));
  assert.equal(f.cohort(x.root,p,null,{partnerOnly:true}).rows[0].snapshot.version,'independent-autonomous-snapshot-v4');
  const current=f.cohort(x.root,p,null,{waterOnly:true}).rows[0].snapshot;
  assert.equal(current.version,'independent-autonomous-snapshot-v6');
  const tampered=structuredClone(current);tampered.routeWaterStudy.context.routes[0].actualTurnObserved=true;
  assert.throws(()=>f.validate(tampered,p),/route_water_replay/);
  assert.equal(f.createRecorder(x.root,path.join(x.root,'again-v5'),env,()=>clock+20000)(official(),target).status,'already-captured');
  const report=f.report(x.root);assert.equal(report.partnerStudy.skipped['main-scenario-unresolved'],1);assert.equal(report.routeWaterStudy.sealed,1);
  fs.appendFileSync(path.join(x.root,'scripts/independent-route-water-v1.cjs'),'\n');assert.throws(()=>f.protocol(x.root),/water_protocol/);
});

test('v6 seals available weather histories while keeping earlier v5 cohort and tickets unchanged',async t=>{
  const x=await sealed(t),p=f.protocol(x.root),h=require('./independent-weather-history-v1.cjs');
  const dir=path.join(x.root,'data/independent-autonomous-forward/20300914'),first=path.join(dir,fs.readdirSync(dir)[0]);
  const legacy=JSON.parse(fs.readFileSync(first));legacy.snapshot.version='independent-autonomous-snapshot-v5';delete legacy.snapshot.weatherHistoryStudy;
  legacy.snapshotHash=candidate.hash(f.json(legacy.snapshot));const bytes=f.json(legacy);
  fs.unlinkSync(first);fs.writeFileSync(path.join(dir,`20300914-23-1-${candidate.hash(bytes)}.json`),bytes);
  const d=h.create({asOfDate:'20300914',generatedAt:'2030-09-14T01:00:00Z',sourceCommit:'c'.repeat(40)});
  d.builderHash=h.hash(fs.readFileSync(require.resolve('./independent-weather-history-v1.cjs')));
  const stat={starts:2,first:0,second:1,third:1,other:0,firstDate:'20300912',lastDate:'20300913'};
  d.racers['5101']={registerNo:'5101',groups:{'23|1':{jcd:'23',course:1,allWeather:stat,byWeather:{'head|3|2':{condition:{direction:'head',windSpeed:3,waveHeight:2},stats:stat,byTide:{}}}}}};
  fs.mkdirSync(path.join(x.root,'data/stats'),{recursive:true});fs.writeFileSync(path.join(x.root,h.SOURCE),h.json(d));
  const raw=official();raw.entries[0].registerNo='5101';raw.weather={windDirection:'向かい風',windSpeed:3,waveHeight:2};
  const out=path.join(x.root,'v6');f.createRecorder(x.root,out,env,()=>clock+10000)(raw,target);
  await f.seal(x.root,out,env,response('Sat, 14 Sep 2030 06:00:12 GMT',{...metadata,created_at:'2030-09-14T06:00:11Z'}));
  assert.equal(f.cohort(x.root,p,null,{waterOnly:true}).rows[0].snapshot.version,'independent-autonomous-snapshot-v5');
  const current=f.cohort(x.root,p,null,{weatherOnly:true}).rows[0].snapshot;
  assert.equal(current.weatherHistoryStudy.context.rows[0].matchedWeather.second,1);
  assert.equal(current.weatherHistoryStudy.context.history.sha256,h.hash(h.json(d)));
  assert.deepEqual(current.candidate.tickets,legacy.snapshot.candidate.tickets);
  const report=f.report(x.root);assert.equal(report.weatherHistoryStudy.sealed,1);assert.equal(report.weatherHistoryStudy.historyAvailableRaces,1);
  assert.equal(report.weatherHistoryStudy.matchedSampleBoats,1);assert.equal(report.routeWaterStudy.sealed,1);
  const bad=structuredClone(current);bad.weatherHistoryStudy.context.rows[0].matchedWeather.starts=3;
  assert.throws(()=>f.validate(bad,p),/weather_context/);
  fs.appendFileSync(path.join(x.root,'scripts/independent-weather-context-v1.cjs'),'\n');assert.throws(()=>f.protocol(x.root),/weather_protocol/);
});
