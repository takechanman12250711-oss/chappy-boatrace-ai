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
