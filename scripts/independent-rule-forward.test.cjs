'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const f=require('./independent-rule-forward.cjs'),{hash}=require('./independent-role-selector.cjs');
const {sample}=require('./independent-role-fixture.cjs'),{saveIndependentMonitorNote}=require('./save-independent-monitor-note');
const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),INDEPENDENT_ARTIFACT_ID:'456',INDEPENDENT_ARTIFACT_DIGEST:'b'.repeat(64),GH_TOKEN:'test-only'};
function setup(change=()=>{}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'independent-forward-'));
  for(const file of ['config/independent-rule-forward.json','scripts/independent-role-selector.cjs','scripts/independent-rule-shadow.cjs']){
    const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.resolve(__dirname,'..',file),dest);
  }
  execFileSync('git',['init','-q'],{cwd:root});execFileSync('git',['-c','user.name=test','-c','user.email=test@example.invalid','commit','--allow-empty','-qm','synthetic fixture'],{cwd:root});
  const b=sample();change(b);const saved=saveIndependentMonitorNote(b,{rootDir:root,now:Date.parse('2026-09-28T16:01:00+09:00')});
  return {root,b,saved,out:path.join(root,'capture'),p:f.protocol(root)};
}
const metadata={id:456,digest:'sha256:'+'b'.repeat(64),name:'independent-rule-123-1',created_at:'2026-09-28T07:02:01Z',expired:false,workflow_run:{id:123,head_sha:env.GITHUB_SHA}};
const response=(date='Mon, 28 Sep 2026 07:02:02 GMT',a=metadata)=>async()=>({ok:true,headers:{get:()=>date},json:async()=>a});
const cleanup=x=>fs.rmSync(x.root,{recursive:true,force:true});
async function sealed(change){const x=setup(change);assert.equal(f.capture(x.root,x.out,env,Date.parse('2026-09-28T16:02:00+09:00')).captured,1);await f.seal(x.root,x.out,env,response());return x;}
function result(x,actual='1-2-3',extra={}){
  const file=path.join(x.root,'data/results/20260928.json');fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify({date:'20260928',races:[{date:'20260928',jcd:'15',raceNo:6,raceKey:x.b.record.raceKey,
    resultSource:'boatrace-official',resultAvailable:true,trifecta:{combination:actual,payout:1200},...extra}]}));
}
test('local snapshot is not forward evidence; remote seal binds original bytes, method, run and clock',async()=>{
  const x=setup();try{
    f.capture(x.root,x.out,env,Date.parse('2026-09-28T16:02:00+09:00'));assert.equal(f.cohort(x.root,x.p).rows.length,0);
    assert.deepEqual(await f.seal(x.root,x.out,env,response()),{saved:1,late:0});assert.equal(f.cohort(x.root,x.p).rows.length,1);
    const r=f.report(x.root);assert.equal(r.sealed,1);assert.equal(r.groups.escape.pending.length,1);assert.equal(r.groups.escape.paired.candidate.hitRate,null);
    assert.equal(r.autonomousInput,false);assert.equal(r.usableForPrediction,false);assert.equal(r.decisionGate.status,'INSUFFICIENT_EVIDENCE');
    assert.deepEqual(await f.seal(x.root,x.out,env,response('Mon, 28 Sep 2026 08:28:59 GMT')),{saved:0,late:1});
    await assert.rejects(f.seal(x.root,x.out,env,response('invalid')),/artifact_identity/);
    await assert.rejects(f.seal(x.root,x.out,env,response(undefined,{...metadata,digest:'sha256:'+'c'.repeat(64)})),/artifact_identity/);
    await assert.rejects(f.seal(x.root,x.out,env,response(undefined,{...metadata,workflow_run:{id:124,head_sha:env.GITHUB_SHA}})),/artifact_identity/);
    await assert.rejects(f.seal(x.root,x.out,{...env,GITHUB_REF:'refs/pull/1/merge'},response()),/context/);
    const before=fs.readFileSync(path.join(x.root,x.saved.sourcePath),'utf8');fs.appendFileSync(path.join(x.root,x.saved.sourcePath),' ');
    assert.equal(f.cohort(x.root,x.p).rows.length,0);fs.writeFileSync(path.join(x.root,x.saved.sourcePath),before);
  }finally{cleanup(x);}
});
test('same-race same-count official comparison includes gains/losses and excludes missing payout',async()=>{
  const x=await sealed(b=>{b.monitor.ruleInput.stages[0].roles[2].groups=[[5],[4],[3],[2],[1],[6]];});try{
    result(x,'1-2-5');let r=f.report(x.root).groups.escape;
    assert.equal(r.paired.baseline.stake,200);assert.equal(r.paired.candidate.stake,200);assert.equal(r.paired.gained,1);assert.equal(r.paired.candidate.returned,1200);
    result(x,'1-2-3');r=f.report(x.root).groups.escape;assert.equal(r.paired.lost,1);assert.equal(r.paired.net,-1);
    result(x,'1-2-5',{trifecta:{combination:'1-2-5',payout:null}});r=f.report(x.root).groups.escape;
    assert.equal(r.paired.candidate.races,0);assert.equal(r.excluded[0].reason,'unknown-payout');
    result(x,'1-2-5',{void:true});assert.equal(f.report(x.root).groups.escape.excluded[0].reason,'refund-or-void');
    result(x,'1-2-5',{resultSource:'unverified'});assert.equal(f.report(x.root).groups.escape.pending.length,1);
  }finally{cleanup(x);}
});
test('skips are sealed and counted separately, not disguised as losses or selected predictions',async()=>{
  const x=await sealed(b=>b.monitor.ruleInput.stages.forEach(s=>s.roles.forEach(r=>{r.groups=[[1,2,3,4,5,6]];})));try{
    result(x);const r=f.report(x.root).groups.escape;
    assert.equal(r.skips.ambiguous_cutoff,1);assert.equal(r.allBaseline.races,1);assert.equal(r.paired.candidate.races,0);
    assert.equal(r.paired.candidate.hitRate,null);assert.equal(r.selected,0);
  }finally{cleanup(x);}
});
test('first remote seal stays fixed; changed receipts and protocol are rejected',async()=>{
  const x=await sealed();try{
    await f.seal(x.root,x.out,env,response('Mon, 28 Sep 2026 07:03:02 GMT'));const c=f.cohort(x.root,x.p);
    assert.equal(c.rows.length,1);assert.equal(c.rows[0].artifact.confirmedAt,'2026-09-28T07:02:03.000Z');
    assert.equal(f.capture(x.root,path.join(x.root,'again'),env,Date.parse('2026-09-28T16:04:00+09:00')).captured,0);
    const dir=path.join(x.root,'data/independent-rule-forward/20260928');for(const file of fs.readdirSync(dir))fs.appendFileSync(path.join(dir,file),' ');
    assert.equal(f.cohort(x.root,x.p).rows.length,0);
    fs.appendFileSync(path.join(x.root,'scripts/independent-role-selector.cjs'),'\n');assert.throws(()=>f.protocol(x.root),/code_changed/);
  }finally{cleanup(x);}
});
test('capture never backfills expired inputs, missing annotations, tampered shadows or PR contexts',()=>{
  const x=setup();try{
    assert.equal(f.capture(x.root,x.out,env,Date.parse(x.b.record.deadlineAt)).skips.deadline_elapsed,1);
    assert.throws(()=>f.capture(x.root,path.join(x.root,'pr'),{...env,GITHUB_REF:'refs/pull/1/merge'}),/context/);
    const file=path.join(x.root,x.saved.sourcePath),b=JSON.parse(fs.readFileSync(file));b.independentRuleShadow.result.selected=['6-5-4'];
    const raw=f.json(b);fs.unlinkSync(file);fs.writeFileSync(path.join(path.dirname(file),`${b.record.raceKey}-${hash(raw)}.json`),raw);
    assert.equal(f.capture(x.root,path.join(x.root,'tampered'),env,Date.parse('2026-09-28T16:02:00+09:00')).captured,0);
  }finally{cleanup(x);}
});
test('conflicting official results do not become an arbitrary win',async()=>{
  const x=await sealed();try{
    result(x);const ledger=path.join(x.root,'data/stats/race-review-results.json');fs.mkdirSync(path.dirname(ledger),{recursive:true});
    fs.writeFileSync(ledger,JSON.stringify({races:{other:{date:'20260928',jcd:'15',raceNo:6,resultSource:'boatrace-official',resultAvailable:true,trifecta:{combination:'6-5-4',payout:2000}}}}));
    const r=f.report(x.root).groups.escape;assert.equal(r.excluded[0].reason,'conflicting_official_results');assert.equal(r.paired.candidate.races,0);
  }finally{cleanup(x);}
});
test('existing writer accepts only immutable research receipts, not unrelated changes',()=>{
  const {save}=require('./save-live-verification-sources');const calls=[];
  const file='data/independent-rule-forward/20260928/20260928-15-6-'+ 'a'.repeat(64)+'.json';
  save({env,git:args=>{calls.push(args);return args[0]==='ls-files'?file:'';}});
  assert.ok(calls.some(a=>a[0]==='add'&&a.includes(file)));
  assert.throws(()=>save({env,git:args=>args[0]==='ls-files'?'scripts/unrelated.js':''}),/unrelated_changes/);
});
test('existing publication starts before research and schedules are not added',()=>{
  const workflow=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/live-note.yml'),'utf8');
  assert.ok(workflow.indexOf('run: node scripts/dispatch-ready-note.js')<workflow.indexOf('id: independent-capture'));
  assert.equal((workflow.match(/- cron:/g)||[]).length,2);
  assert.ok(workflow.includes('data/independent-rule-forward'));
  const daily=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/escape-main-audit.yml'),'utf8');
  assert.ok(daily.includes('node scripts/independent-rule-forward.cjs report'));assert.ok(daily.includes('data/stats/independent-rule-report.json'));
});
