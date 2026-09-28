'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EXPECTED,verifyMetadata,verifyFiles,evaluate}=require('./settle-sealed-partner.cjs');
const meta=()=>({id:EXPECTED.id,name:EXPECTED.name,created_at:EXPECTED.createdAt,digest:EXPECTED.digest,
  workflow_run:{id:EXPECTED.run,head_sha:EXPECTED.head,repository_id:1274947506,head_repository_id:1274947506}});
test('seal must be the original GitHub artifact timestamp, identity, source and digest',()=>{
  assert.equal(verifyMetadata(meta()),EXPECTED.createdAt);
  for(const mutate of [m=>m.id++,m=>m.created_at='2026-09-28T00:00:00Z',m=>m.digest='sha256:wrong',
    m=>m.workflow_run.head_sha='new-head',m=>m.workflow_run.id++,m=>m.workflow_run.head_repository_id++]){
    const m=meta();mutate(m);assert.throws(()=>verifyMetadata(m),/provenance-mismatch/);
  }
});
test('sealed candidate mutation cannot be scored',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sealed-partner-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'snapshots.json'),'{}');assert.throws(()=>verifyFiles(dir),/sealed-file-changed/);
});
test('original sealed files settle without generation and keep the 3/19 timing split',()=>{
  const dir=process.env.SEALED_CANDIDATES||'tmp/candidates';
  const official=process.env.SEALED_OFFICIAL||'tmp/official.json';
  const before=fs.readFileSync(path.join(dir,'snapshots.json'));
  const r=evaluate(dir,official,meta());
  assert.equal(r.prospective.base.races,3);assert.equal(r.retrospective.base.races,19);
  assert.equal(r.prospective.base.hits,0);assert.equal(r.prospective.candidate.hits,0);
  assert.equal(r.retrospective.base.hits,6);assert.equal(r.retrospective.candidate.hits,8);
  assert.ok(r.prospectiveDiagnosis.every(x=>!x.mainHeadMatched&&x.actualHeadTicketsUnchanged));
  assert.equal(r.automaticAdoption,false);assert.equal(r.productionChanged,false);assert.equal(r.retrained,false);
  assert.deepEqual(fs.readFileSync(path.join(dir,'snapshots.json')),before);
});
