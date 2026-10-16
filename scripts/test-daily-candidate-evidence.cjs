'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const selector = require('../js/practical-selection');
const collector = require('./collect-predictions');
const source = fs.readFileSync(path.join(__dirname, 'test-practical-selection.js'), 'utf8');
const builders = new Function('require', source.slice(0, source.indexOf('const standard =')) +
  '\nreturn {fixture:createFixture,branch:canonicalBranch,candidate};')(createRequire(path.join(__dirname, 'test-practical-selection.js')));
const prediction = builders.fixture();
// Unselected candidates beyond the UI preview still need their own branch roles.
for (const second of [2,3,4,5]) for (const third of [2,3,4,5,6]) {
  if (second === third) continue;
  const branch = builders.branch({id:`extra-${second}-${third}`,ticket:`1-${second}-${third}`,
    group:'flow',roleBoatNo:third,position:3,role:'pickup',priorityScore:75,scenarioId:'canonical:1'});
  prediction.aiCore.formations.evidence.branches.push(branch);
  prediction.ticketSheets.possibility.push(builders.candidate(branch));
}
const selection = selector.select(prediction);
const before = JSON.stringify(selection);
const compact = collector.compactPracticalSelection(selection, selection.tickets);
const {candidateValidationEvidence: evidence, ...oldFields} = compact;
assert.deepEqual(oldFields, selector.compactAudit(selection));
assert.deepEqual(evidence, selection.candidateValidationEvidence);
assert.equal(evidence.status, 'captured');
assert.equal(JSON.stringify(selection), before);
const preview = new Set(compact.targetDecisions.flatMap(t=>t.candidateDecisions.map(d=>d.ticket)));
const outside = evidence.poolTickets.filter(t=>!preview.has(t));
assert.ok(outside.length > 0, 'fixture must exercise candidates absent from every target preview');
for (const ticket of outside) assert.ok(evidence.observations.some(o=>o.ticket===ticket));
const stored = {prediction:{practicalTickets:selection.tickets, practicalSelection:compact}};
const twice = collector.compactStoredVerification(stored);
assert.deepEqual(twice.prediction.practicalSelection.candidateValidationEvidence, evidence,
  'subsequent daily compaction must retain the existing snapshot without full selection.tickets');
assert.deepEqual(collector.compactStoredVerification(twice), twice);
const bad = collector.compactPracticalSelection(selection, ['6-5-4']);
assert.equal(bad.candidateValidationEvidence.status,'invalid-or-unavailable');
assert.deepEqual(bad.targetDecisions, compact.targetDecisions);
const legacy = {...selection}; delete legacy.candidateValidationEvidence;
assert.equal(collector.compactPracticalSelection(legacy).candidateValidationEvidence, undefined);
assert.equal(collector.compactPracticalSelection(null), null);
selection.candidateValidationEvidence.branches[0].roles.push({boatNo:99});
assert.ok(!evidence.branches[0].roles.some(r=>r.boatNo===99), 'saved roles are detached');
assert.ok(Buffer.byteLength(JSON.stringify(evidence))<150000);
console.log(JSON.stringify({outsidePreview:outside.length,bytes:Buffer.byteLength(JSON.stringify(evidence)),
  predictionUnchanged:true,roundTrip:true,legacyPreserved:true}));

// Synthetic post-generator fixtures. These are contract tests, never race evidence.
const {capture} = require('./practical-selection-evidence');
for (const [moduleName, label, replacement, key] of [
  ['three-course-escape-rescue-fixed5','3コース攻め','1-3-4','threeCourseEscapeRescueFixed5'],
  ['four-kado-escape-rescue-fixed5','4カド攻め','1-2-4','fourKadoEscapeRescueFixed5']
]) {
  const originalTickets = ['3-1-5','3-2-5','1-2-5'];
  const pool = [...originalTickets, replacement];
  const original = {status:'selected', reason:'original-generator-reason', tickets:originalTickets,
    candidateDecisions:[{ticket:replacement,selected:false,reasonCode:'ORIGINAL_REJECTION'}],
    excludedCandidates:[{ticket:replacement,selected:false,reason:'No structured role'}],
    targetDecisions:[], verificationEvidence:{mainScenario:{label}},
    candidateValidationEvidence:{version:'candidate-validation-evidence-v1',status:'captured',
      resultUsedForGeneration:false,poolTickets:pool,finalSelectedTickets:originalTickets.slice(),
      branches:[],observations:pool.map(ticket=>({ticket,sourceCategory:'possibility',stage:'selection',
        valid:ticket!==replacement,purchaseEligible:ticket!==replacement,expansionEligible:false,
        validBranchIds:[],validPurchaseBranchIds:[],validIndependentBranchIds:[],validScenarioIds:[],
        invalidReasons:ticket===replacement?['NO_STRUCTURED_ROLE']:[],coverage:[],physicalCoverage:[]}))}};
  const originalBefore = JSON.stringify(original);
  const rescued = require(`../js/${moduleName}`).apply({}, original);
  const rescuedBefore = JSON.stringify(rescued);
  const result = capture({},rescued.tickets,rescued);
  const sidecar = result.candidateValidationEvidence, diagnostic = sidecar.diagnostic;
  assert.equal(sidecar.status,'invalid-or-unavailable');
  assert.ok(diagnostic, `${moduleName} preserves a diagnostic without validating the final evidence`);
  assert.equal(diagnostic.purpose,'diagnostic-only');
  assert.equal(diagnostic.usableForPrediction,false);
  assert.deepEqual(diagnostic.originalGeneratorSnapshot,original.candidateValidationEvidence);
  assert.deepEqual(diagnostic.observedFinalTickets,rescued.tickets.map(t=>typeof t==='string'?t:t.ticket));
  assert.deepEqual(diagnostic.transformations,[{kind:key,...rescued.expansionSummary[key]}]);
  assert.deepEqual(result.candidateDecisions,original.candidateDecisions);
  assert.deepEqual(result.excludedCandidates,original.excludedCandidates);
  assert.equal(diagnostic.originalGeneratorSnapshot.observations.find(o=>o.ticket===replacement).purchaseEligible,false);
  assert.deepEqual(diagnostic.originalGeneratorSnapshot.branches,[]);
  assert.equal(JSON.stringify(original),originalBefore);
  assert.equal(JSON.stringify(rescued),rescuedBefore);
  const compactRescued = collector.compactPracticalSelection(rescued,rescued.tickets);
  assert.deepEqual(compactRescued.candidateValidationEvidence,sidecar);
  const row = {prediction:{practicalTickets:rescued.tickets,practicalSelection:compactRescued}};
  const roundTrip = collector.compactStoredVerification(row);
  assert.deepEqual(roundTrip.prediction.practicalSelection.candidateValidationEvidence,sidecar);
  assert.deepEqual(collector.compactStoredVerification(roundTrip),roundTrip);
  for (const mutate of [
    s=>{s.expansionSummary[key].version='unknown';},
    s=>{s.expansionSummary[key].index=0;},
    s=>{s.expansionSummary[key].replacedTicket='6-5-4';},
    s=>{s.expansionSummary[key].ticket='6-5-4';},
    s=>{s.expansionSummary[key].reason='changed';},
    s=>{s.expansionSummary[key].targetLabel='unknown';},
    s=>{s.expansionSummary[key].applied=false;},
    s=>{s.tickets.reverse();},
    s=>{s.candidateValidationEvidence.status='invalid-or-unavailable';},
    s=>{s.candidateValidationEvidence.version='unknown';},
    s=>{s.candidateValidationEvidence.resultUsedForGeneration=true;},
    s=>{s.candidateValidationEvidence.observations.pop();},
    s=>{s.candidateValidationEvidence.finalSelectedTickets=['1-2-5','1-2-5'];},
    s=>{s.candidateValidationEvidence.diagnostic={};},
    s=>{s.candidateValidationEvidence.extra='x'.repeat(1024*1024);},
    s=>{s.candidateValidationEvidence.loop=s.candidateValidationEvidence;},
    s=>{s.candidateValidationEvidence.extra=Array(2049).fill(0);},
    s=>{let x={};s.candidateValidationEvidence.extra=x;for(let i=0;i<13;i++)x=x.child={};},
    s=>{Object.defineProperty(s.candidateValidationEvidence,'extra',{get(){throw Error('getter must not execute');},enumerable:true});},
    s=>{Object.defineProperty(s.candidateValidationEvidence,'__proto__',{value:{polluted:true},enumerable:true});},
    s=>{s.expansionSummary[key==='threeCourseEscapeRescueFixed5'?'fourKadoEscapeRescueFixed5':'threeCourseEscapeRescueFixed5']={applied:true};}
  ]) {
    const broken=structuredClone(rescued);mutate(broken);
    assert.deepEqual(capture({},broken.tickets,broken).candidateValidationEvidence,
      {version:'candidate-validation-evidence-v1',status:'invalid-or-unavailable'});
  }
  for (const mutate of [
    d=>{d.usableForPrediction=true;},
    d=>{d.observedFinalTickets.reverse();},
    d=>{d.transformations[0].index=0;},
    d=>{d.originalGeneratorSnapshot.diagnostic=d;}
  ]) {
    const broken=structuredClone(compactRescued);mutate(broken.candidateValidationEvidence.diagnostic);
    assert.deepEqual(collector.compactPracticalSelection(broken,rescued.tickets).candidateValidationEvidence,
      {version:'candidate-validation-evidence-v1',status:'invalid-or-unavailable'});
  }
  const oldInvalid={...rescued,candidateValidationEvidence:{version:'candidate-validation-evidence-v1',status:'invalid-or-unavailable'}};
  assert.deepEqual(capture({},oldInvalid.tickets,oldInvalid).candidateValidationEvidence,oldInvalid.candidateValidationEvidence);
  // Detached output cannot rewrite the generator or the rejection rationale.
  diagnostic.originalGeneratorSnapshot.observations[0].purchaseEligible=false;
  assert.equal(JSON.stringify(original),originalBefore);
}
console.log('Rescue mismatch diagnostics: both wrappers, unchanged invalid status, original decisions, round trips and negative cases passed');
