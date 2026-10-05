'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const candidate=require('./independent-autonomous-candidate.cjs'),f=require('./independent-autonomous-forward.cjs');
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
  for(const file of ['config/independent-autonomous-forward.json','scripts/independent-autonomous-candidate.cjs']){
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
