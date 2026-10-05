'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sample}=require('./independent-role-fixture.cjs');
const {select,STAGES}=require('./independent-role-selector.cjs');
const {buildShadow}=require('./independent-rule-shadow.cjs');
const {saveIndependentMonitorNote}=require('./save-independent-monitor-note');
const run=b=>select(b.monitor.ruleInput,{sources:b.monitor.sources,courses:b.record.exhibitionSnapshot.startExhibition});
test('generates tickets from separate role inputs and preserves originals',()=>{
  const b=sample(),before=JSON.stringify(b),r=run(b);
  assert.deepEqual(r.candidates,['1-2-3','1-2-4','1-2-5']);assert.deepEqual(r.selected,['1-2-3','1-2-4']);
  assert.equal(r.automaticReady,false);assert.equal(r.usableForPrediction,false);assert.equal(JSON.stringify(b),before);
});
test('later motor/skill ranks cannot overturn the earlier flow decision',()=>{
  const b=sample();for(const s of b.monitor.ruleInput.stages.slice(1))s.roles.forEach(r=>{r.groups=[[6],[5],[4],[3],[2],[1]];});
  assert.deepEqual(run(b).selected,['1-2-3','1-2-4']);
});
test('only a genuine earlier tie reaches the next priority',()=>{
  const b=sample();b.monitor.ruleInput.stages[0].roles.forEach(r=>{r.groups=[[1,2,3,4,5,6]];});
  b.monitor.ruleInput.stages[1].roles[2].groups=[[5],[4],[3],[2],[1],[6]];
  assert.deepEqual(run(b).selected,['1-2-5','1-2-4']);
});
test('an ambiguous cutoff skips the whole selection without a boat-number tiebreak',()=>{
  const b=sample();b.monitor.ruleInput.stages.forEach(s=>s.roles.forEach(r=>{r.groups=[[1,2,3,4,5,6]];}));
  assert.equal(run(b).reason,'ambiguous_cutoff');assert.deepEqual(run(b).selected,[]);
  b.monitor.ruleInput.limit=3;assert.equal(run(b).status,'selected');
});
test('cross-position tradeoffs cannot silently prioritize second over third',()=>{
  const b=sample();b.monitor.ruleInput.roles[1].boats.forEach(r=>{r.eligible=[2,3].includes(r.boat);});
  b.monitor.ruleInput.roles[2].boats.forEach(r=>{r.eligible=[2,3].includes(r.boat);});b.monitor.ruleInput.limit=1;
  assert.equal(run(b).reason,'ambiguous_cutoff');
});
test('unknown stages and roles are explicit skips, never favorable defaults',()=>{
  const b=sample();b.monitor.ruleInput.stages[7]={stage:'motor',status:'unknown',reason:'not recorded',references:[],roles:null};
  assert.equal(run(b).reason,'incomplete_role_evidence');assert.deepEqual(run(b).unknownStages,['motor']);
  const c=sample();c.monitor.ruleInput.roles[2].boats[5].eligible=null;c.monitor.ruleInput.roles[2].boats[5].references=[];
  assert.equal(run(c).reason,'incomplete_role_evidence');
});
test('official course identity is used rather than assuming boat 1',()=>{
  const b=sample();b.record.exhibitionSnapshot.startExhibition[0].course=2;b.record.exhibitionSnapshot.startExhibition[1].course=1;
  assert.throws(()=>run(b),/escape_course_invalid/);
  b.monitor.ruleInput.scenario.primaryActor=2;b.monitor.ruleInput.roles[0].boats.forEach(r=>{r.eligible=r.boat===2;});
  b.monitor.ruleInput.roles[1].boats.forEach(r=>{r.eligible=r.boat===1;});
  assert.deepEqual(run(b).selected,['2-1-3','2-1-4']);
});
test('manshu branch uses its declared actor and requires the inner-break explanation',()=>{
  const b=sample();b.monitor.ruleInput.kind='manshu';b.monitor.ruleInput.scenario.type='upset';b.monitor.ruleInput.scenario.primaryActor=4;
  b.monitor.ruleInput.roles[0].boats.forEach(r=>{r.eligible=r.boat===4;});
  assert.throws(()=>run(b),/upset_reason_missing/);b.monitor.ruleInput.scenario.innerBreakReason='synthetic flow opens outside route';
  assert.deepEqual(run(b).selected,['4-2-3','4-2-5']);
});
for(const [name,change] of [
  ['missing stage',b=>b.monitor.ruleInput.stages.pop()],
  ['wrong stage order',b=>b.monitor.ruleInput.stages.reverse()],
  ['duplicate ranked boat',b=>{b.monitor.ruleInput.stages[0].roles[0].groups=[[1,1,2,3,4,5]];}],
  ['incomplete role assessment',b=>b.monitor.ruleInput.roles[2].boats.pop()],
  ['unlimited ticket budget',b=>{b.monitor.ruleInput.limit=8;}],
  ['forged quote',b=>{b.monitor.ruleInput.roles[0].boats[0].references=[{sourceSha256:b.monitor.sources[0].sha256,quote:'invented'}];}],
  ['odds used as evidence',b=>{b.monitor.sources[0].role='odds';}],
  ['changed source bytes',b=>{b.monitor.sources[0].text+='tampered';}]
])test(name+' is rejected',()=>{const b=sample();change(b);assert.throws(()=>run(b),/independent_role_/);});
test('candidate shortfall and multiple heads do not cause arbitrary fallback',()=>{
  const b=sample();b.monitor.ruleInput.limit=7;assert.equal(run(b).reason,'candidate_shortfall');
  b.monitor.ruleInput.roles[0].boats[1].eligible=true;assert.equal(run(b).reason,'single_main_branch_required');
});
test('selector does not read baseline tickets, candidate priorities, odds or results',()=>{
  const b=sample(),expected=run(b);b.monitor.tickets=[{ticket:'6-5-4',odds:9999}];
  b.record.prediction={practicalTickets:['6-5-4'],result:'6-5-4'};b.monitor.decisionEvidence.candidates.reverse();
  assert.deepEqual(run(b),expected);
});
test('same-count comparison and independent decision identity are mandatory in adapter',()=>{
  const b=sample();b.monitor.ruleInput.limit=1;assert.throws(()=>buildShadow(b),/identity_mismatch/);
});
test('save path writes research separately, keeps article unchanged and rejects tampering/late save',()=>{
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'independent-role-'));
  try {
    const b=sample(),before=JSON.stringify(b),now=Date.parse('2026-09-28T16:01:00+09:00');
    const saved=saveIndependentMonitorNote(b,{rootDir,now});const stored=JSON.parse(fs.readFileSync(path.join(rootDir,saved.sourcePath)));
    assert.deepEqual(stored.article,b.article);assert.deepEqual(stored.record,b.record);assert.deepEqual(stored.monitor,b.monitor);
    assert.equal(stored.independentRuleShadow.forwardEligible,false);assert.deepEqual(stored.independentRuleShadow.result.selected,['1-2-3','1-2-4']);
    assert.equal(JSON.stringify(b),before);assert.equal(saveIndependentMonitorNote(stored,{rootDir,now}).changed,false);
    stored.independentRuleShadow.result.selected=['6-5-4'];assert.throws(()=>saveIndependentMonitorNote(stored,{rootDir,now}),/shadow_mismatch/);
    assert.throws(()=>saveIndependentMonitorNote(b,{rootDir,now:Date.parse(b.record.deadlineAt)}),/audit_blocked/);
  }finally{fs.rmSync(rootDir,{recursive:true,force:true});}
});
test('fixed priorities match the existing decision contract',()=>{
  assert.deepEqual(STAGES,require('./independent-monitor-decision.cjs').STAGES);
});
