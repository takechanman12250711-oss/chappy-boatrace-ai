'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const h=require('./independent-weather-history-v1.cjs'),v=require('./independent-weather-history-v2.cjs');
const date='20300913',now=new Date('2030-09-14T00:00:00Z'),sourceCommit='a'.repeat(40);
function fixture(){
  const record={date,jcd:'23',raceNo:1,raceKey:`${date}-23-1`,selectedAt:'2030-09-13T01:00:00Z',deadlineAt:'2030-09-13T01:10:00Z',prediction:{preRaceConditions:{schemaVersion:4,source:'boatrace-official',sourceTiming:'pre_deadline',officialResultUsed:false,sourceFetchedAt:'2030-09-13T00:59:00Z',
    weather:{windDirection:'向かい風',windSpeed:3,waveHeight:2,liveTideAvailable:false},boats:[1,2,3,4,5,6].map(boat=>({boatNo:boat,registerNo:String(5100+boat),course:boat,courseOfficial:true,courseMappingSource:'official-start-image'}))}}};
  const b={version:'note-draft-bundle-v1',capturedAt:record.selectedAt,sourceCommit,record,generationAudit:{version:'note-publication-audit-v1',contentReady:true,raceKey:record.raceKey,auditedAt:'2030-09-13T01:00:01Z'}};
  const r={date,jcd:'23',raceNo:1,raceKey:record.raceKey,source:'boatrace-official',checkedAt:'2030-09-13T01:20:00Z',resultAvailable:true,status:'finished',void:false,
    starts:[1,2,3,4,5,6].map(boat=>({boat,course:boat})),finishers:[1,2,3,4,5,6].map(boat=>({boat,rank:boat,registerNo:String(5100+boat)})),trifecta:{combination:'1-2-3'}};
  return {b,r};
}
function note(b){const raw=JSON.stringify(b,null,2)+'\n';return {raw,file:`data/note-drafts/${date}/${b.record.raceKey}-${h.hash(raw)}.json`};}
function output(){const out=h.create({asOfDate:'20300914',generatedAt:now.toISOString(),sourceCommit});out.noteSupplement={examined:0,eligible:0,dailyOverlap:0,duplicateBundles:0,canonicalRaces:0,acceptedRaces:0,rejected:{}};return out;}
function run(b,r,blocked=new Set()){const out=output();v.supplement(out,date,[note(b)],{races:[r]},blocked);return out;}
test('note official facts join registration and preserve raw SHA, clocks and actual result course',()=>{
  const {b,r}=fixture(),original=structuredClone(b);[r.starts[0].course,r.starts[2].course]=[3,1];const out=run(b,r);
  assert.equal(out.noteSupplement.acceptedRaces,1);assert.equal(out.coverage.acceptedBoats,6);
  assert.equal(out.racers['5101'].groups['23|3'].allWeather.first,1);assert.equal(out.evidence[0].noteSource.sha256,h.hash(note(b).raw));
  assert.equal(out.evidence[0].predictionKind,'note-draft-bundle');assert.deepEqual(b,original);
});
for(const [name,change] of Object.entries({lateAudit:b=>b.generationAudit.auditedAt=b.record.deadlineAt,earlyAudit:b=>b.generationAudit.auditedAt='2030-09-13T00:00:00Z',
  wrongCapture:b=>b.capturedAt='2030-09-13T01:01:00Z',lateCapture:b=>{b.capturedAt=b.record.selectedAt=b.record.deadlineAt;},
  lateFetch:b=>b.record.prediction.preRaceConditions.sourceFetchedAt=b.record.deadlineAt,afterCaptureFetch:b=>b.record.prediction.preRaceConditions.sourceFetchedAt='2030-09-13T01:00:01Z',
  missing:b=>delete b.record.prediction.preRaceConditions,identity:b=>b.record.jcd='24',auditIdentity:b=>b.generationAudit.raceKey='other',auditNotReady:b=>b.generationAudit.contentReady=false,
  resultUsed:b=>b.record.reviewEvidence={officialResultUsedForPrediction:true},missingCommit:b=>delete b.sourceCommit}))test(`reject ${name}`,()=>{const {b,r}=fixture();change(b);assert.equal(run(b,r).coverage.acceptedRaces,0);});
test('raw filename hash, path and date are checked before ingestion',()=>{
  const {b}=fixture(),n=note(b);assert.equal(v.noteProjection(n.raw+' ',n.file,date).reason,'note-source-or-identity-invalid');
  assert.ok(v.noteProjection(n.raw,n.file.replace('data/note-drafts/','other/'),date).reason);
  assert.ok(v.noteProjection(n.raw,n.file,'20300912').reason);
  assert.equal(v.noteProjection('{',n.file,date).reason,'note-json-invalid');
});
test('daily overlap is never replaced, including unresolved or mismatched daily results',()=>{
  const {b,r}=fixture(),out=run(b,r,new Set([b.record.raceKey]));assert.equal(out.noteSupplement.dailyOverlap,1);assert.equal(out.coverage.acceptedRaces,0);
});
test('canonical latest note is fixed before results; no fallback when latest registration disagrees',()=>{
  const {b,r}=fixture(),later=structuredClone(b);later.capturedAt=later.record.selectedAt='2030-09-13T01:01:00Z';later.generationAudit.auditedAt='2030-09-13T01:01:01Z';
  later.record.prediction.preRaceConditions.boats[0].registerNo='9999';
  for(const notes of [[note(b),note(later)],[note(later),note(b)]]){const out=output();v.supplement(out,date,notes,{races:[r]},new Set());
    assert.equal(out.noteSupplement.duplicateBundles,1);assert.equal(out.noteSupplement.canonicalRaces,1);assert.equal(out.coverage.acceptedRaces,0);assert.equal(out.noteSupplement.rejected['registration-mismatch'],1);}
});
test('equal-time duplicate choice is stable, ticket and score fields never enter projection',()=>{
  const {b,r}=fixture(),other=structuredClone(b);other.record.prediction.tickets=['6-5-4'];other.record.prediction.score=999;
  assert.deepEqual(v.noteProjection(note(b).raw,note(b).file,date).value,v.noteProjection(note(other).raw,note(other).file,date).value);
  const a=output(),c=output();v.supplement(a,date,[note(b),note(other)],{races:[r]},new Set());v.supplement(c,date,[note(other),note(b)],{races:[r]},new Set());assert.deepEqual(a,c);assert.equal(a.coverage.acceptedRaces,1);
});
test('invalid results, duplicate result, future checked time and out-of-window inputs stay excluded',()=>{
  for(const mutate of [r=>r.resultAvailable=false,r=>r.starts[0].marker='F',r=>r.finishers[0].registerNo='9999',r=>r.checkedAt='2031-01-01T00:00:00Z']){const {b,r}=fixture();mutate(r);assert.equal(run(b,r).coverage.acceptedRaces,0);}
  const {b,r}=fixture(),out=output();v.supplement(out,date,[note(b)],{races:[r,r]},new Set());assert.equal(out.noteSupplement.rejected['duplicate-result'],1);
  v.supplement(out,'20300914',[note(b)],{races:[r]},new Set());assert.equal(out.noteSupplement.examined,1);
});
test('build supplements fresh baseline without changing v1 bytes and rejects changed daily source',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'weather-v2-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const {b,r}=fixture();
  const write=(file,data)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),typeof data==='string'?data:JSON.stringify(data));};
  write(`data/predictions/${date}.json`,{predictions:[]});write(`data/results/${date}.json`,{races:[r]});const n=note(b);write(n.file,n.raw);
  h.build(root,{now,sourceCommit});const before=fs.readFileSync(path.join(root,h.SOURCE));
  const out=v.build(root,{now,sourceCommit});assert.equal(out.version,v.VERSION);assert.equal(out.baseline.acceptedRaces,0);assert.equal(out.noteSupplement.acceptedRaces,1);
  assert.deepEqual(fs.readFileSync(path.join(root,h.SOURCE)),before);assert.equal(out.baseline.sha256,h.hash(before));assert.ok(fs.existsSync(path.join(root,v.SOURCE)));
  write(`data/predictions/${date}.json`,{predictions:[b.record]});assert.throws(()=>v.build(root,{now,sourceCommit}),/source_changed/);
  h.build(root,{now,sourceCommit});const overlap=v.build(root,{now,sourceCommit});assert.equal(overlap.coverage.acceptedRaces,1);assert.equal(overlap.noteSupplement.dailyOverlap,1);assert.equal(overlap.noteSupplement.acceptedRaces,0);
  assert.throws(()=>v.build(root,{now:new Date('2030-09-15T00:00:00Z'),sourceCommit}),/baseline_invalid/);
});
