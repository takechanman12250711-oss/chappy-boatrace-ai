'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const contract=require('./head-forward-contract.cjs'),capture=require('./head-forward-capture.cjs');
const f=require('./fixtures/head-forward-v2.cjs');

test('protocol pins generation, wrapper and evidence code and rejects missing registration or any source change',t=>{
  const {root,p}=f.setup(t);assert.equal(p.value.candidateId,'qualified-unrepresented-head-one-swap-v2-options-forwarded');
  assert.equal(p.value.adoptionGate,null);assert(p.value.sourceManifest.some(x=>x.path==='scripts/head-forward-artifact.cjs'));
  assert(p.value.sourceManifest.some(x=>x.path==='.github/workflows/live-note.yml'));
  const file=path.join(root,contract.CONFIG),raw=fs.readFileSync(file);
  const value=JSON.parse(raw);value.registrationPullRequest=null;fs.writeFileSync(file,JSON.stringify(value));
  assert.throws(()=>contract.readProtocol(root),/protocol_invalid/);fs.writeFileSync(file,raw);
  fs.appendFileSync(path.join(root,'js/four-kado-escape-rescue-fixed5.js'),'\n// changed');
  assert.throws(()=>contract.readProtocol(root),/source_changed/);
});

test('GitHub merge time and exact registered config/source trees establish the definition anchor',async t=>{
  const {root,p}=f.setup(t),remote=f.githubFixture(root,p);
  const value=await contract.resolveRegistration(root,p,f.identity,{token:'synthetic-token',fetcher:remote.fetcher});
  assert.equal(value.mergedAt,f.DEFINED);assert.equal(value.pullRequest,1234);
  assert.equal(value.sourceManifestVerified,true);assert.equal(value.workflowRunVerified,true);
  assert.equal(contract.validRegistration(value,p,f.identity),true);
  assert(remote.calls.some(x=>x.relative.includes('/git/trees/')));
  assert(remote.calls.every(x=>!x.relative.includes('/results')&&!x.relative.includes('/predictions')));
});

test('unmerged/wrong registration, different config and different source blobs are rejected',async t=>{
  const {root,p}=f.setup(t);
  for(const mutate of [
    (url,v)=>{if(url==='/pulls/1234')v.merged=false;},
    (url,v)=>{if(url==='/pulls/1234')v.number=1235;},
    (url,v)=>{if(url==='/pulls/1234')v.base.ref='other';},
    (url,v)=>{if(url.startsWith('/contents/'))v.content=Buffer.from('{}').toString('base64');},
    (url,v)=>{if(url.startsWith('/git/trees/')){const entry=v.tree.find(x=>x.path==='practical-selection.js');if(entry)entry.sha='0'.repeat(40);}}
  ]){
    const remote=f.githubFixture(root,p,{mutate});
    await assert.rejects(contract.resolveRegistration(root,p,f.identity,{token:'synthetic-token',fetcher:remote.fetcher}),/head_forward_/);
  }
});

test('run identity, event, branch and remote server date cannot be substituted',async t=>{
  const {root,p}=f.setup(t);
  for(const change of [v=>{v.head_sha='c'.repeat(40);},v=>{v.event='pull_request';},v=>{v.head_branch='other';},
    v=>{v.path='.github/workflows/other.yml';},v=>{v.run_attempt=2;},v=>{v.created_at='2029-01-01T00:00:00Z';}]){
    const remote=f.githubFixture(root,p,{mutate:(url,v)=>{if(url==='/actions/runs/123')change(v);}});
    await assert.rejects(contract.resolveRegistration(root,p,f.identity,{token:'synthetic-token',fetcher:remote.fetcher}),/workflow_run_invalid/);
  }
  const remote=f.githubFixture(root,p);
  await assert.rejects(contract.resolveRegistration(root,p,f.identity,{token:'synthetic-token',fetcher:async(...args)=>{
    const response=await remote.fetcher(...args);response.headers.delete('date');return response;
  }}),/server_clock/);
});

test('a real four-VM generated attempt is bound to its stored claim, source, run and observer checks',async t=>{
  const {root,p,env}=f.setup(t);f.saveNote(root,f.syntheticRecord(root));
  const out=path.join(f.temporary(t),'batch'),remote=f.githubFixture(root,p);
  const {batch}=await capture.capture(root,out,{env,now:()=>f.NOW,fetcher:remote.fetcher,identityFor:()=>f.identity});
  const a=batch.attempts[0];assert.equal(a.outcome.status,'generated',a.outcome.reason);
  assert.equal(contract.validAttempt(a,p),true);assert.equal(contract.validAttempt(contract.startedRecord(a),p),true);
  for(const change of [
    v=>{v.startedHash='0'.repeat(64);},v=>{v.source.recordJsonSha256='0'.repeat(64);},
    v=>{v.outcome.snapshot.runnerMode='injected-test';},v=>{v.outcome.snapshot.observations.candidateInjectionEntered=false;},
    v=>{v.outcome.snapshot.protocolFingerprint='0'.repeat(64);},v=>{v.outcome.snapshot.candidate.tickets.pop();},
    v=>{v.startedAt='2029-01-01T00:00:00.000Z';}
  ]){const changed=f.clone(a);change(changed);assert.equal(contract.validAttempt(changed,p),false);}
});

test('late remote confirmation is stored as late and never treated as eligible forward evidence',async t=>{
  const {root,p,env}=f.setup(t);f.saveNote(root,f.syntheticRecord(root));
  const out=path.join(f.temporary(t),'batch'),remote=f.githubFixture(root,p);
  await capture.capture(root,out,{env,now:()=>f.NOW,fetcher:remote.fetcher,identityFor:()=>f.identity});
  const artifact=f.artifactFixture(fs.readFileSync(path.join(out,'batch.json')),{confirmed:Date.parse(f.DEADLINE)});
  const result=await capture.seal(root,out,{env:{...env,HEAD_FORWARD_ARTIFACT_ID:'987',HEAD_FORWARD_ARTIFACT_DIGEST:artifact.digest},fetcher:artifact.fetcher});
  assert.equal(result.statuses.late,1);
  const receipt=contract.recordFiles(root).map(p=>JSON.parse(fs.readFileSync(path.join(root,p)))).find(r=>r.version==='independent-head-forward-seal-v2');
  assert.equal(contract.validSeal(receipt,p),true);assert.equal(receipt.forwardEligible,false);
  const forged=f.clone(receipt);forged.status='eligible';forged.forwardEligible=true;assert.equal(contract.validSeal(forged,p),false);
  const future=f.clone(receipt);future.attempt.registration.verifiedAt='2031-01-01T00:00:00.000Z';
  future.attemptHash=contract.hash(contract.json(future.attempt));assert.equal(contract.validSeal(future,p),false);
});

test('immutable writing preserves an existing attempt instead of replacing it',t=>{
  const root=f.temporary(t),file=path.join(root,'record.json');
  contract.writeOnce(file,'first\n');contract.writeOnce(file,'first\n');
  assert.throws(()=>contract.writeOnce(file,'replacement\n'));assert.equal(fs.readFileSync(file,'utf8'),'first\n');
});
