'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const selector=require('../js/practical-selection');
const {capture}=require('../scripts/practical-selection-evidence');
const clone=x=>JSON.parse(JSON.stringify(x));
const fixturePath=path.resolve(__dirname,'../scripts/test-practical-selection.js');
const fixtureSource=fs.readFileSync(fixturePath,'utf8');
const builders=new Function('require',fixtureSource.slice(0,fixtureSource.indexOf('const standard ='))+
  '\nreturn {createFixture,canonicalBranch,candidate,alternateHeadBranch};')(createRequire(fixturePath));
function fixture(items=[['1-4-6',95],['2-4-6',95],['3-4-6',95],['4-2-6',95]]) {
  const p=builders.createFixture();
  for(const [index,[ticket,priorityScore]] of items.entries()) {
    const branch=builders.canonicalBranch({id:'promotion-fixture:'+index,ticket,group:'cover',roleBoatNo:Number(ticket[4]),
      position:3,role:'pickup',priorityScore});
    p.aiCore.formations.evidence.branches.push(branch);
    p.ticketSheets.possibility.push(builders.candidate(branch,{physicalCoverage:ticket.split('-').map((v,i)=>({
      evaluationId:'target:'+v,boatNo:Number(v),position:i+1}))}));
  }
  return p;
}
const record={raceKey:'20300914-23-1',selectedAt:'2030-09-14T06:00:00Z',deadlineAt:'2030-09-14T07:00:00Z',
  reviewEvidence:{version:'race-review-evidence-v1',method:'a'.repeat(64),predictionMode:'server_pre_deadline',officialResultUsedForPrediction:false}};
const saved=s=>capture(record,s.tickets,s).candidatePromotionExecutionEvidence;
test('real queue preserves tie order, candidate identity, consumed observations and actual dispositions',()=>{
  const p=fixture([['4-2-6',95],['3-4-6',95],['2-4-6',95],['1-4-6',95],['2-4-6',95]]),before=JSON.stringify(p);
  const selection=selector.select(p),q=selection.candidatePromotionExecution;
  assert.equal(q.status,'captured');
  assert.deepEqual(q.queue.map(r=>r.ticket),['1-4-6','2-4-6','2-4-6','3-4-6','4-2-6']);
  assert.deepEqual(q.queue.map(r=>r.candidateIndex),[3,2,4,1,0]);
  assert.deepEqual(q.queue.map(r=>r.disposition),['adopted','course-excluded','course-excluded','adopted','course-excluded']);
  assert.deepEqual(q.queue.map(r=>r.remainingSlotsBefore),[5,4,4,4,3]);
  for(const row of q.queue) {
    const obs=selection.candidateValidationEvidence.observations[row.validationRef.index];
    assert.equal(obs.ticket,row.ticket);assert.equal(obs.sourceCategory,row.sourceCategory);assert.equal(obs.priorityScore,row.priorityScore);
    assert.equal(obs.stage,'selection');assert.equal(row.courseSource,'boat-number-fallback');
    assert.equal(Object.hasOwn(row,'coverage'),false);assert.equal(Object.hasOwn(row,'roles'),false);
  }
  // Equal duplicate candidates remain two queue events, even if an observation deduplicates.
  assert.equal(q.queue.length,5);
  const e=saved(selection);assert.equal(e.status,'captured');assert(e.queue.every(row=>row.bindingStatus==='bound'));
  assert.deepEqual(e.observedFinalTickets,selection.tickets.map(r=>r.ticket));
  assert.equal(e.action,'KEEP_A');assert.equal(e.alternativeTickets,null);assert.equal(e.automaticApplication,false);
  assert.equal(e.rankingProposed,false);assert.equal(e.usableForPrediction,false);assert.equal(e.resultUsedForGeneration,false);
  assert.match(e.executionCodeSha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(p),before);
  e.before.selectedTickets.push('6-5-4');assert.equal(q.before.selectedTickets.length,5);
});
test('maximum slots are observed before course checks, without inventing an unexecuted course exclusion',()=>{
  const p=fixture([['1-2-4',95],['1-2-5',95],['1-2-6',95],['1-3-4',95],['1-3-5',95],['4-2-6',90]]);
  const selection=selector.select(p),q=selection.candidatePromotionExecution;
  assert.equal(q.queue.length,6);assert.deepEqual(q.queue.map(r=>r.disposition),Array(5).fill('adopted').concat('maximum-reached'));
  const last=q.queue.at(-1);assert.equal(last.reasonCode,'MAXIMUM_REACHED');assert.equal(last.courseEvaluated,false);
  assert.equal(last.remainingSlotsBefore,0);assert.equal(Object.hasOwn(last,'effectiveCourse'),false);
  assert.equal(saved(selection).status,'captured');assert.equal(selection.tickets.length,10);
});
test('formal course lookup is recorded separately from boat-number fallback',()=>{
  const p=fixture([['1-4-6',95]]);p.aiCore.courseMapping={formal:true,byBoat:{1:2,2:1,3:3,4:4,5:5,6:6}};
  const s=selector.select(p),row=s.candidatePromotionExecution.queue[0];
  assert.equal(row.courseMappingFormal,true);assert.equal(row.mappedCourse,2);assert.equal(row.courseOfResult,2);
  assert.equal(row.effectiveCourse,2);assert.equal(row.courseSource,'saved-course-lookup');assert.equal(row.disposition,'course-excluded');
  assert.equal(saved(s).status,'captured');
});
test('consumed observation index is resolved after output pool filtering',()=>{
  const p=fixture();
  p.ticketSheets.possibility.unshift({ticket:'1-1-2',branchIds:['unknown-invalid-ticket']});
  const s=selector.select(p);
  assert.equal(s.candidatePromotionExecution.queue[0].validationRef.index,0);
  assert.equal(s.candidateValidationEvidence.observations.some(row=>row.ticket==='1-1-2'),false);
  for(const row of s.candidatePromotionExecution.queue) {
    const obs=s.candidateValidationEvidence.observations[row.validationRef.index];
    assert.deepEqual([obs.ticket,obs.sourceCategory,obs.priorityScore],[row.ticket,row.sourceCategory,row.priorityScore]);
  }
  // A candidate-only path lacking valid purchase qualification stays unknown;
  // neither the capture nor this snapshot repairs it from the physical preview.
  const index=s.candidatePromotionExecution.queue[0].validationRef.index;
  s.candidateValidationEvidence.observations[index].valid=false;
  const e=saved(s);assert.equal(e.status,'unknown');assert.equal(e.reasonCode,'NON_VALID_PURCHASE_PATH');
  assert.equal(e.queue[0].bindingStatus,'unknown');assert.equal(e.queue[0].disposition,'adopted');
});
test('post-promotion trim history is captured at its execution boundary and matched to existing metadata',()=>{
  const p=fixture(),main={type:'escape',score:90};
  p.aiCore.raceScenarios={mainScenario:main,scenarios:[main,{type:'sashi',score:60}]};
  const selection=selector.select(p),e=saved(selection);
  assert.equal(e.status,'captured');assert.equal(e.transitions.length,1);assert.equal(e.transitions[0].kind,'strongEscapeTrim');
  assert.deepEqual(e.transitions[0].beforeTickets,e.afterPromotionTickets);
  assert.deepEqual(e.transitions[0].afterTickets,e.selectorFinalTickets);
  assert.notDeepEqual(e.afterPromotionTickets,e.selectorFinalTickets);
  const changed=clone(selection);changed.expansionSummary.strongEscapeTrim.removedTickets=[];
  assert.equal(saved(changed).reasonCode,'SELECTOR_TRANSFORMATION_REFERENCE_INVALID');
});
test('existing post-selector rescue is a strict transformation reference, never final qualification',()=>{
  for(const [moduleName,label] of [['three-course-escape-rescue-fixed5','3コース攻め'],['four-kado-escape-rescue-fixed5','4カド攻め']]) {
    const s=selector.select(fixture());s.verificationEvidence.mainScenario.label=label;
    const rescued=require('../js/'+moduleName).apply({},s),before=JSON.stringify(rescued),stored=capture(record,rescued.tickets,rescued);
    assert.equal(stored.candidateValidationEvidence.status,'invalid-or-unavailable');
    const e=stored.candidatePromotionExecutionEvidence;assert.equal(e.status,'captured');
    assert.equal(e.postSelectorTransformations.length,1);assert.equal(e.postSelectorTransformations[0].kind,
      moduleName.startsWith('three')?'threeCourseEscapeRescueFixed5':'fourKadoEscapeRescueFixed5');
    assert.deepEqual(e.selectorFinalTickets,s.tickets.map(r=>r.ticket));assert.deepEqual(e.observedFinalTickets,rescued.tickets.map(r=>r.ticket));
    assert.equal(e.usableForPrediction,false);assert.equal(JSON.stringify(rescued),before);
    const bad=clone(rescued),kind=e.postSelectorTransformations[0].kind;bad.expansionSummary[kind].version='unknown';
    assert.equal(saved(bad).status,'unknown');
  }
});
test('missing legacy execution is not backfilled; broken snapshots never block A or silently infer history',()=>{
  const original=selector.select(fixture()),before=JSON.stringify(original),final=original.tickets.map(r=>r.ticket);
  const mutations=[s=>delete s.candidatePromotionExecution,
    s=>{s.candidatePromotionExecution.queue.reverse();},s=>{s.candidatePromotionExecution.queue[0].priorityScore++;},
    s=>{s.candidatePromotionExecution.queue[0].validationRef.index=9999;},s=>{s.candidatePromotionExecution.afterPromotionTickets.reverse();},
    s=>{s.candidatePromotionExecution.before.remainingSlots=0;},s=>{s.candidatePromotionExecution.queue[0].disposition='maximum-reached';},
    s=>{s.candidatePromotionExecution.selectorFinalTickets.reverse();},s=>{s.candidatePromotionExecution.automaticApplication=true;},
    s=>{s.candidatePromotionExecution.queue[0].candidateIndex=-1;}];
  for(const mutate of mutations) {
    const s=clone(original);mutate(s);const data=JSON.stringify(s),e=capture(record,s.tickets,s);
    assert.equal(e.status,'captured');assert.deepEqual(e.practicalTickets,final);assert.equal(JSON.stringify(s),data);
    if(Object.hasOwn(s,'candidatePromotionExecution')) {assert.equal(e.candidatePromotionExecutionEvidence.status,'unknown');
      assert.equal(e.candidatePromotionExecutionEvidence.action,'KEEP_A');assert.equal(e.candidatePromotionExecutionEvidence.automaticApplication,false);}
    else assert.equal(Object.hasOwn(e,'candidatePromotionExecutionEvidence'),false);
  }
  const reversed=capture(record,[...original.tickets].reverse(),original);
  assert.equal(reversed.status,'captured');assert.equal(reversed.candidatePromotionExecutionEvidence.reasonCode,'FINAL_ORDER_MISMATCH');
  assert.equal(JSON.stringify(original),before);
});
test('snapshot observation failure is isolated from the whole selector result and purchase decision',()=>{
  const p=fixture(),source=fs.readFileSync(path.resolve(__dirname,'../js/practical-selection.js'),'utf8');
  class BrokenReferenceMap extends WeakMap {set(){throw Error('sidecar unavailable');}}
  const context={module:{exports:{}},WeakMap:BrokenReferenceMap};vm.runInNewContext(source,context);
  const failed=context.module.exports.select(clone(p)),ordinary=selector.select(p);
  const {candidatePromotionExecution:bad,...a}=clone(failed),{candidatePromotionExecution:good,...b}=clone(ordinary);
  assert.equal(bad.status,'unknown');assert.deepEqual(a,b);assert.equal(saved(failed).status,'unknown');
});
test('result and odds cannot change the execution snapshot, and selector code starts a distinct method cohort',()=>{
  const p=fixture(),ordinary=selector.select(p),copy=clone(p);copy.result={ticket:'6-5-4',payout:999999};
  copy.ticketSheets.possibility.forEach(row=>{row.odds=10000;row.result={ticket:'6-5-4'};});
  assert.deepEqual(selector.select(copy).candidatePromotionExecution,ordinary.candidatePromotionExecution);
  const method=require('../scripts/race-review-evidence').methodFingerprint();
  assert.match(method,/^[a-f0-9]{64}$/);assert.notEqual(method,'b36ecb0212d212af85ce977322a0a799774265c4bc6152ef82d4d1123c7586b5');
});

test('existing immutable research source and draft bundle retain the new sidecar without collector changes',()=>{
  const os=require('node:os'),rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'promotion-execution-'));
  try {
    const selection=selector.select(fixture()),r={...record,date:'20300914',jcd:'23',raceNo:1,
      practicalSelectionEvidence:capture(record,selection.tickets,selection),prediction:{practicalTickets:selection.tickets}};
    r.exhibitionSnapshot=require('../scripts/note-exhibition').exhibitionSnapshot({
      entries:[1,2,3,4,5,6].map(boat=>({boat,exhibition:{displayTime:6.8}})),
      startExhibition:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:.15,mappingSource:'official-start-image'}))},record.selectedAt);
    r.outerAttackShadow={experimentId:'outer-attack-ticket-shadow-v1',sourceRaceKey:r.raceKey,captureAt:r.selectedAt,
      captureKey:r.raceKey+'|'+r.selectedAt,resultUsedForGeneration:false,productionChanged:false,automaticApplication:false,
      a:{entries:selection.tickets.map(({ticket})=>({ticket}))}};
    const live=require('../scripts/outer-attack-live-source').saveSource(r,selection.tickets,{rootDir,now:Date.parse(r.selectedAt)});
    const source=JSON.parse(fs.readFileSync(live,'utf8'));
    assert.deepEqual(source.record.practicalSelectionEvidence.candidatePromotionExecutionEvidence,
      r.practicalSelectionEvidence.candidatePromotionExecutionEvidence);
    const draft=require('../scripts/note-draft-bundle').saveNoteDraftBundle({record:r,
      article:{publishable:true,fullText:'Synthetic persistence fixture only'},baselinePracticalTickets:selection.tickets},{rootDir});
    const bundle=JSON.parse(fs.readFileSync(path.join(rootDir,draft.path),'utf8'));
    assert.deepEqual(bundle.record.practicalSelectionEvidence,source.record.practicalSelectionEvidence);
    assert.equal(require('../scripts/outer-attack-live-source').saveSource(r,selection.tickets,{rootDir,now:Date.parse(r.selectedAt)}),live);
    assert.equal(require('../scripts/note-draft-bundle').saveNoteDraftBundle({record:r,
      article:{publishable:true,fullText:'Synthetic persistence fixture only'},baselinePracticalTickets:selection.tickets},{rootDir}).path,draft.path);
  } finally {
    if(path.dirname(path.resolve(rootDir))!==path.resolve(os.tmpdir())||!path.basename(rootDir).startsWith('promotion-execution-')) throw Error('temporary path mismatch');
    fs.rmSync(rootDir,{recursive:true,force:true});
  }
});


test('weak trim references require exactly the saved removal decisions and original retained order',()=>{
  // Synthetic provenance guard fixture; no claim that this source was a live weak trim.
  const original=selector.select(fixture([])),removed=original.tickets.at(-1).ticket;
  const selection=clone(original),q=selection.candidatePromotionExecution;
  selection.tickets=selection.tickets.filter(row=>row.ticket!==removed);
  q.selectorFinalTickets=selection.tickets.map(row=>row.ticket);
  selection.candidateValidationEvidence.finalSelectedTickets=q.selectorFinalTickets.slice();
  q.transitions=[{kind:'weakTwoHeadTrim',reference:'candidateDecisions.WEAK_TWO_HEAD_INDEPENDENT',
    beforeTickets:q.afterPromotionTickets.slice(),afterTickets:q.selectorFinalTickets.slice()}];
  selection.candidateDecisions.push({ticket:removed,selected:false,reasonCode:'WEAK_TWO_HEAD_INDEPENDENT'});
  assert.equal(saved(selection).status,'captured');
  for(const mutate of [s=>{s.candidateDecisions=s.candidateDecisions.filter(row=>row.reasonCode!=='WEAK_TWO_HEAD_INDEPENDENT');},
    s=>{s.candidateDecisions.find(row=>row.reasonCode==='WEAK_TWO_HEAD_INDEPENDENT').selected=true;},
    s=>{s.candidateDecisions.push({ticket:'6-5-4',selected:false,reasonCode:'WEAK_TWO_HEAD_INDEPENDENT'});},
    s=>{s.candidatePromotionExecution.transitions[0].afterTickets.reverse();}]) {
    const bad=clone(selection);mutate(bad);assert.equal(saved(bad).status,'unknown');
    assert.equal(saved(bad).reasonCode,'SELECTOR_TRANSFORMATION_REFERENCE_INVALID');
  }
});
test('additional course metadata read failure remains isolated from original course selection and purchase decision',()=>{
  const p=fixture(),source=fs.readFileSync(path.resolve(__dirname,'../js/practical-selection.js'),'utf8');
  let diagnosticReadFailures=0;
  class BrokenDiagnosticMap extends Map {get(key){
    if(new Error().stack.includes('observePromotion')) {diagnosticReadFailures++;throw Error('diagnostic map read');}
    return super.get(key);
  }}
  const context={module:{exports:{}},Map:BrokenDiagnosticMap};vm.runInNewContext(source,context);
  const failed=context.module.exports.select(clone(p)),ordinary=selector.select(p);
  const {candidatePromotionExecution:bad,...a}=clone(failed),{candidatePromotionExecution:good,...b}=clone(ordinary);
  assert(diagnosticReadFailures>0);assert.equal(bad.status,'unknown');assert.deepEqual(a,b);
  assert.equal(saved(failed).status,'unknown');
});
