'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const d=require('./partner-exchange-evidence.cjs');
function fixture() {
  const baseline=['1-2-3','1-2-6'],guarded=['1-2-5','1-2-6'];
  const record={practicalSelectionEvidence:{candidateDecisions:[...baseline,'1-2-5'].map(ticket=>({ticket,
    reasonCode:ticket==='1-2-5'?'CANDIDATE_ONLY_EVALUATION':'ALREADY_SELECTED',priorityScore:80,
    branchIds:['branch'],physicalCoverage:[{boatNo:1,position:1,role:'head'},{boatNo:2,position:2,role:'hold'},{boatNo:+ticket[4],position:3,role:'pickup'}]}))},
    prediction:{practicalTickets:baseline.map(ticket=>({ticket,purchaseEligible:true,validScenarioIds:['canonical:1']})),
      candidate24Tickets:[...baseline,'1-2-5'].map(ticket=>({ticket})),
      mainSheet:{tickets:[{ticket:'1-2-5',expansionEligible:false,evidenceReasons:['保存済みの説明']}]},
      preRaceConditions:{escapeEvaluationEvidence:{raceScenarios:{mainScenario:{type:'escape'}}}}}};
  return {record,snapshot:{raceKey:'r',baseline,guarded,sourcePath:'source',sourceSha256:'hash'}};
}
test('separates third-only swaps from pair reallocations even with an existing anchor',()=>{
  assert.equal(d.exchangeKind(['1-2-3','1-2-6'],['1-2-5','1-2-6']),'third-only');
  assert.equal(d.exchangeKind(['1-2-3','1-2-6'],['1-4-5','1-2-6']),'first-second-reallocation');
  assert.equal(d.exchangeKind(['1-2-3','1-4-5'],['1-4-5','1-2-3']),'unchanged');
  assert.equal(d.exchangeKind(['1-2-3','1-2-4','1-4-5'],['1-2-5','1-4-3','1-4-6']),'first-second-reallocation');
});
test('candidate-only and expansion false never imply purchase false',()=>{
  const {record}=fixture(),x=d.detail(record,'1-2-5');
  assert.equal(x.purchaseEligible,'unknown');assert.equal(x.expansionEligible,'false');
  assert(x.reasonCodes.includes('CANDIDATE_ONLY_EVALUATION'));assert.equal(x.hasNarrativeEvidence,true);
  record.prediction.mainSheet.tickets[0].purchaseEligible=true;
  assert.equal(d.detail(record,'1-2-5').purchaseEligible,'true');
});
test('keeps conflicting observations explicit and does not borrow another ticket fields',()=>{
  const {record}=fixture();record.prediction.mainSheet.tickets.push({ticket:'1-2-3',purchaseEligible:false});
  assert.equal(d.detail(record,'1-2-3').purchaseEligible,'conflicting');
  assert.deepEqual(d.detail(record,'1-2-5').scenarioReferences,[]);
  assert.deepEqual(d.detail(record,'1-2-3').scenarioReferences,['canonical:1']);
});
test('does not transform narrative or a manshu boat-wide number into structured third score',()=>{
  const {record}=fixture();record.prediction.manshuSheet={pickupBoats:[{boatNo:5,pickupScore:99}]};
  record.prediction.mainSheet.tickets[0].evidenceReasons=['5号艇の3着役割99点'];
  assert.equal(d.detail(record,'1-2-5').hasStructuredThirdScore,false);
});
test('missing observations stay unknown; wrong physical boat does not establish a third role',()=>{
  const {record}=fixture();record.practicalSelectionEvidence.candidateDecisions.at(-1).physicalCoverage[2].boatNo=4;
  assert.equal(d.detail(record,'1-2-5').anyThirdRole,false);
  assert.equal(d.detail(record,'2-3-4').allObservationsComplete,false);
  assert.equal(d.detail(record,'2-3-4').purchaseEligible,'unknown');
});
test('result, payout, odds and stage selected flags cannot change the projected exchange',()=>{
  const {record,snapshot}=fixture(),before=JSON.stringify(record),a=d.project(record,snapshot);
  assert.equal(JSON.stringify(record),before);
  record.prediction.officialResult='6-5-4';record.prediction.odds={'1-2-5':1000};
  record.practicalSelectionEvidence.candidateDecisions.forEach(x=>x.selected=true);
  assert.deepEqual(d.project(record,{...snapshot,actual:'1-2-3',payout:999}),a);
});
test('role completeness is not formed by unioning incomplete observations',()=>{
  const {record}=fixture(),old=record.practicalSelectionEvidence.candidateDecisions.at(-1);
  old.physicalCoverage=old.physicalCoverage.slice(0,2);
  record.practicalSelectionEvidence.candidateDecisions.push({...old,physicalCoverage:[{boatNo:5,position:3,role:'pickup'}]});
  const x=d.detail(record,'1-2-5');assert.equal(x.anyThirdRole,true);assert.equal(x.anyCompleteObservation,false);assert.equal(x.allObservationsComplete,false);
});
test('outcomes are attached after projection; gains and losses in one structural group remain visible',()=>{
  const {record,snapshot}=fixture(),a=d.project(record,snapshot),b={...a,raceKey:'s'},c={...a,raceKey:'v'};
  const comparison={rows:[{...snapshot,raceKey:'r',actual:'1-2-5'},{...snapshot,raceKey:'s',actual:'1-2-3'}],excluded:[{raceKey:'v',reason:'refund-or-void'}],pending:[]};
  const r=d.summarize([a,b,c],comparison);
  assert.equal(r.changedRaces,3);assert.equal(r.mixedGainLossProfiles,1);
  assert.deepEqual(r.profiles[0].outcomes,{gained:1,lost:1,excluded:1});
  assert.equal(r.ticketCoverage.added.purchaseEligibility.unknown,3);
  assert.throws(()=>d.summarize([{...a,raceKey:'missing'}],comparison),/comparison row missing/);
});
