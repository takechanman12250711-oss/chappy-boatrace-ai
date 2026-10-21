'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const contract=require('./head-forward-contract.cjs'),capture=require('./head-forward-capture.cjs'),report=require('./head-forward-report.cjs');
const f=require('./fixtures/head-forward-v2.cjs');
function options(root,p,env,extra={}){return {env,now:()=>f.NOW,fetcher:f.githubFixture(root,p).fetcher,identityFor:()=>f.identity,...extra};}
const records=root=>contract.recordFiles(root).map(file=>JSON.parse(fs.readFileSync(path.join(root,file))));

test('same original bytes pass capture, real four VMs, ZIP verification, receipt and offline equal-budget report',async t=>{
  const {root,p,env}=f.setup(t),record=f.syntheticRecord(root),source=f.saveNote(root,record),out=path.join(f.temporary(t),'out');
  const {batch}=await capture.capture(root,out,options(root,p,env));
  assert.equal(batch.attempts.length,1);assert.equal(batch.attempts[0].outcome.status,'generated');
  assert.equal(records(root).length,2);assert.equal(fs.readFileSync(path.join(root,source.relative),'utf8'),source.bytes);
  const artifact=f.artifactFixture(fs.readFileSync(path.join(out,'batch.json')));
  const sealed=await capture.seal(root,out,{env:{...env,HEAD_FORWARD_ARTIFACT_ID:'987',HEAD_FORWARD_ARTIFACT_DIGEST:artifact.digest},fetcher:artifact.fetcher});
  assert.equal(sealed.statuses.eligible,1);assert.equal(records(root).length,3);
  const actual=batch.attempts[0].outcome.snapshot.baseline.tickets[0],resultFile=path.join(root,'data/results/20301021.json');
  fs.mkdirSync(path.dirname(resultFile),{recursive:true});fs.writeFileSync(resultFile,JSON.stringify({races:[{raceKey:record.raceKey,
    resultSource:'boatrace-official',resultAvailable:true,actualTicket:actual,trifecta:{combination:actual,payout:1000}}]}));
  const data=report.report(root);assert.equal(data.coverage.startedRaces,1);assert.equal(data.coverage.eligibleSealedRaces,1);
  assert.equal(data.comparison.evaluatedRaces,1);assert.equal(data.comparison.netHits,0);
  assert.equal(data.stats.baseline.stake,data.stats.candidate.stake);assert.equal(data.usableForPrediction,false);
  assert.equal(fs.readFileSync(path.join(root,source.relative),'utf8'),source.bytes);
});

test('earliest eligible source is fixed, and a later source never replaces a failed first attempt',async t=>{
  const {root,p,env}=f.setup(t),first=f.saveNote(root,f.syntheticRecord(root)),later=f.syntheticRecord(root,{selectedAt:'2030-10-21T00:01:10.000Z'});
  f.saveNote(root,later);
  const out=path.join(f.temporary(t),'first');
  const result=await capture.capture(root,out,options(root,p,env,{generate:async()=>{throw Error('synthetic failure');}}));
  assert.equal(result.batch.attempts[0].source.path,first.relative);assert.equal(result.batch.attempts[0].outcome.status,'failed');
  const next=await capture.capture(root,path.join(f.temporary(t),'second'),options(root,p,env));
  assert.equal(next.batch.attempts.length,0);assert.equal(next.summary.alreadyClaimed,1);assert.equal(records(root).length,2);
});

test('an interrupted generation leaves a durable pending start and cannot silently reselect',async t=>{
  const {root,p,env}=f.setup(t);f.saveNote(root,f.syntheticRecord(root));let calls=0;
  await assert.rejects(capture.capture(root,path.join(f.temporary(t),'out'),options(root,p,env,{
    now:()=>{if(++calls===4)throw Error('synthetic interruption');return f.NOW;},
    generate:async()=>({status:'missing',reason:'SYNTHETIC_MISSING',snapshot:null})})),/interruption/);
  assert.equal(records(root).length,1);assert.equal(records(root)[0].stage,'started');
  const next=await capture.capture(root,path.join(f.temporary(t),'retry'),options(root,p,env));
  assert.equal(next.batch.attempts.length,0);assert.equal(report.report(root).coverage.states['generation-pending'],1);
});

test('before-registration, closed and malformed sources are explicit, not backfilled',async t=>{
  const {root,p,env}=f.setup(t),old=f.syntheticRecord(root,{selectedAt:'2030-10-20T23:59:59.000Z'});
  f.saveNote(root,old);f.saveNote(root,f.syntheticRecord(root,{raceNo:2,deadlineAt:'2030-10-21T00:01:30.000Z'}));
  const dir=path.join(root,'data/note-drafts/20301021');fs.writeFileSync(path.join(dir,'broken.json'),'not json');
  const value=await capture.capture(root,path.join(f.temporary(t),'out'),options(root,p,env));
  assert.equal(value.batch.attempts.length,0);assert.equal(value.batch.coverage.skips.beforeRegistration,1);
  assert.equal(value.batch.coverage.skips.closed,1);assert.equal(value.batch.coverage.excludedSources.length,1);
});

test('per-run capacity defers inputs without fabricating failed forecasts or changing old predictions',async t=>{
  const {root,p,env}=f.setup(t);
  for(let raceNo=1;raceNo<=8;raceNo++)f.saveNote(root,f.syntheticRecord(root,{raceNo}));
  const value=await capture.capture(root,path.join(f.temporary(t),'out'),options(root,p,env,{
    generate:async()=>({status:'missing',reason:'SYNTHETIC_MISSING',snapshot:null})}));
  assert.equal(value.batch.attempts.length,6);assert.equal(value.batch.coverage.deferredRaces.length,2);
  assert.equal(records(root).length,12);assert.equal(value.summary.outcomes.missing,6);
});

test('original source changes and local batch changes after upload both prevent sealing',async t=>{
  const {root,p,env}=f.setup(t),source=f.saveNote(root,f.syntheticRecord(root)),out=path.join(f.temporary(t),'out');
  await capture.capture(root,out,options(root,p,env));
  const bytes=fs.readFileSync(path.join(out,'batch.json')),artifact=f.artifactFixture(bytes);
  const sealOptions={env:{...env,HEAD_FORWARD_ARTIFACT_ID:'987',HEAD_FORWARD_ARTIFACT_DIGEST:artifact.digest},fetcher:artifact.fetcher};
  fs.appendFileSync(path.join(root,source.relative),' ');
  await assert.rejects(capture.seal(root,out,sealOptions),/source_identity|source_changed/);
  fs.writeFileSync(path.join(root,source.relative),source.bytes);fs.appendFileSync(path.join(out,'batch.json'),' ');
  await assert.rejects(capture.seal(root,out,sealOptions),/batch_bytes_mismatch/);
  assert.equal(records(root).length,2);
});

test('capture refuses non-main contexts and code bytes not committed in its checkout',t=>{
  const {root,p,env}=f.setup(t);
  assert.throws(()=>capture.context({...env,GITHUB_REF:'refs/heads/other'}),/context_invalid/);
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git(['init','-q']);git(['add','.']);git(['-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','-qm','synthetic code fixture']);
  const id=capture.checkoutIdentity(root,env,p);assert.match(id.codeCommit,/^[a-f0-9]{40}$/);
  fs.appendFileSync(path.join(root,'scripts/head-forward-capture.cjs'),'\n// modified');
  assert.throws(()=>capture.checkoutIdentity(root,env,p),/uncommitted_code/);
});
