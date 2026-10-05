'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fixture } = require('./note-independent-monitor-fixture');
const { saveIndependentMonitorNote } = require('./save-independent-monitor-note');
const { VERSION, STAGES, validateDecisionEvidence } = require('./independent-monitor-decision.cjs');
function sample() {
  const b = fixture();
  const references = [{ sourceSha256: b.monitor.sources[0].sha256, quote: b.monitor.sources[0].text }];
  const candidate = (ticket, priority, decision) => ({ ticket, priority, decision, reason: 'synthetic decision', references,
    roles: ticket.split('-').map((boat,i) => ({boat:Number(boat),position:i+1,reason:'synthetic role',references})) });
  b.monitor.decisionEvidence = { version:VERSION, origin:'independent-human', raceKey:b.record.raceKey,
    kind:b.monitor.kind, decidedAt:b.monitor.confirmedAt,
    stages:STAGES.map(stage => ({stage,status:'observed',reason:'synthetic evidence',references})),
    scenario:{type:'escape',primaryActor:1,reason:'synthetic flow',references},
    candidates:[candidate('1-2-3',1,'selected'),candidate('1-2-4',2,'selected'),candidate('1-3-2',3,'rejected')] };
  return b;
}
test('legacy originals remain valid but are not automatically reproducible', () => {
  const b=fixture(), before=JSON.stringify(b);
  assert.equal(validateDecisionEvidence(b).status,'legacy_unstructured');
  assert.equal(JSON.stringify(b),before);
});
test('records ordered selections and rejected alternatives without changing the original', () => {
  const b=sample(), before=JSON.stringify(b), result=validateDecisionEvidence(b);
  assert.equal(result.selectedCount,2); assert.equal(result.rejectedCount,1);
  assert.equal(result.automaticReady,false); assert.equal(JSON.stringify(b),before);
});
for (const [name,change] of [
  ['missing stages',d=>d.stages.pop()],
  ['wrong stage order',d=>d.stages.reverse()],
  ['invented quote',d=>d.scenario.references=[{sourceSha256:'0'.repeat(64),quote:'invented'}]],
  ['wrong role boat',d=>d.candidates[0].roles[2].boat=6],
  ['changed selected order',d=>{d.candidates[0].priority=4;}],
  ['incomplete selected set',d=>{d.candidates[1].decision='rejected';}],
  ['wrong race',d=>{d.raceKey='20260928-15-5';}],
  ['unrecorded decision time',d=>{d.decidedAt='2026-09-28T16:02:00+09:00';}],
  ['escape wrong actual course',d=>{d.scenario.primaryActor=2;}]
]) test(name+' is rejected',()=>{const b=sample();change(b.monitor.decisionEvidence);assert.throws(()=>validateDecisionEvidence(b),/independent_decision_/);});
test('unknown evidence is explicit and never turns into an automated decision',()=>{
 const b=sample();b.monitor.decisionEvidence.stages[7]={stage:'motor',status:'unknown',reason:'not observed',references:[]};
 assert.deepEqual(validateDecisionEvidence(b).unknownStages,['motor']);
});
test('existing save path enforces the optional evidence contract',()=>{
 const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'decision-test-'));
 try{const b=sample();b.monitor.decisionEvidence.candidates[0].roles=[];
 assert.throws(()=>saveIndependentMonitorNote(b,{rootDir,now:Date.parse('2026-09-28T16:01:00+09:00')}),/ticket_roles_invalid/);
 assert.deepEqual(fs.readdirSync(rootDir),[]);
 const valid=sample();const saved=saveIndependentMonitorNote(valid,{rootDir,now:Date.parse('2026-09-28T16:01:00+09:00')});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(rootDir,saved.sourcePath))).monitor.decisionEvidence,valid.monitor.decisionEvidence);
 }finally{fs.rmSync(rootDir,{recursive:true,force:true});}
});
test('odds evidence cannot select tickets, and actual course overrides boat number',()=>{
 const b=sample();b.monitor.sources[0].role='odds';
 assert.throws(()=>validateDecisionEvidence(b));
 const moved=sample();moved.record.exhibitionSnapshot.startExhibition[0].course=2;
 moved.record.exhibitionSnapshot.startExhibition[1].course=1;
 assert.throws(()=>validateDecisionEvidence(moved),/escape_course_invalid/);
 moved.monitor.decisionEvidence.scenario.primaryActor=2;
 assert.equal(validateDecisionEvidence(moved).recorded,true);
});
test('explicit-file audit rejects tampered source bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'decision-audit-'));
 try{const b=sample();const saved=saveIndependentMonitorNote(b,{rootDir:root,now:Date.parse('2026-09-28T16:01:00+09:00')});
 const {auditFiles}=require('./audit-independent-monitor-decisions.cjs');
 assert.equal(auditFiles([saved.sourcePath,saved.sourcePath],root).structured,1);
 fs.appendFileSync(path.join(root,saved.sourcePath),' ');
 const report=auditFiles([saved.sourcePath],root);assert.equal(report.invalid,1);
 assert.equal(report.rows[0].reason,'source_hash_mismatch');assert.equal(report.usableForPrediction,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
