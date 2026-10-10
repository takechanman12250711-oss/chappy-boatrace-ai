'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const selector = require('../js/practical-selection');
const { capture } = require('./practical-selection-evidence');
const plain = value => JSON.parse(JSON.stringify(value));
const root = path.resolve(__dirname, '..');
const base = process.env.CANDIDATE_VALIDATION_BASE || '429663f3a86cfc8cd345258f47412c6787806fe8';
assert.match(base, /^[a-f0-9]{40}$/);
const context = { module: { exports: {} }, console };
vm.runInNewContext(cp.execFileSync('git', ['show', `${base}:js/practical-selection.js`], {cwd:root, encoding:'utf8'}), context);
const original = context.module.exports;
const record = {raceKey:'20301010-24-1', selectedAt:'2030-10-10T00:00:00Z', deadlineAt:'2030-10-10T01:00:00Z'};
let comparisons = 0, largest = 0;
const proxy = {...selector, select(prediction, options) {
  const before = JSON.stringify(prediction);
  const actual = selector.select(prediction, options);
  const expected = original.select(plain(prediction), options);
  const {candidateValidationEvidence:evidence, ...unchanged} = actual;
  assert.deepEqual(plain(unchanged), plain(expected), 'entire original selection, not just ticket count, must be unchanged');
  assert.equal(JSON.stringify(prediction), before);
  assert.equal(evidence.status, 'captured');
  assert.deepEqual(evidence.finalSelectedTickets, actual.tickets.map(row => row.ticket));
  assert.ok(evidence.poolTickets.length <= 120);
  for (const ticket of evidence.poolTickets) assert.ok(evidence.observations.some(row => row.ticket === ticket));
  for (const row of require('../js/note-generator').createDisplayCandidates(prediction, actual.tickets))
    assert.ok(evidence.poolTickets.includes(row.ticket), 'every displayed candidate must be covered');
  for (const observation of evidence.observations) {
    assert.equal(typeof observation.purchaseEligible, 'boolean');
    assert.equal(typeof observation.expansionEligible, 'boolean');
    assert.ok(['selection','pool-audit'].includes(observation.stage));
    assert.equal(observation.odds, undefined);
    assert.equal(observation.result, undefined);
  }
  if (actual.tickets.length) {
    const saved = capture(record, actual.tickets, actual);
    assert.equal(saved.candidateValidationEvidence.status, 'captured');
    assert.deepEqual(saved.candidateValidationEvidence, plain(evidence));
  }
  largest = Math.max(largest, Buffer.byteLength(JSON.stringify(evidence)));
  comparisons++;
  return actual;
}};
// Exercise the existing varied flow/threshold/category/skip fixtures against
// the actual pre-change module; don't duplicate the selector in a test oracle.
const fixturePath = path.join(__dirname, 'test-practical-selection.js');
const fixtureRequire = createRequire(fixturePath);
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
const fixtures = {require:name => name === '../js/practical-selection' ? proxy : fixtureRequire(name),
  global, console:{log(){}}, process, __dirname, __filename:fixturePath};
new Function('require','console',fixtureSource)(fixtures.require,fixtures.console);
assert.ok(comparisons >= 20);

// Reuse fixture builders without re-running their assertions.
const builders = new Function('require',fixtureSource.slice(0, fixtureSource.indexOf('const standard =')) +
  '\nreturn {makeFixture:createFixture,makeCanonical:canonicalBranch,makeCandidate:candidate};')(fixtureRequire);
const p = builders.makeFixture();
const branch = builders.makeCanonical({id:'unselected-flow',ticket:'1-4-6',group:'flow',roleBoatNo:6,position:3,role:'pickup',priorityScore:75,scenarioId:'canonical:1'});
p.aiCore.formations.evidence.branches.push(branch);
p.ticketSheets.possibility.push(builders.makeCandidate(branch));
const result = proxy.select(p);
const e = result.candidateValidationEvidence;
const candidateOnly = result.candidateDecisions.find(row=>row.ticket==='1-4-6');
assert.equal(candidateOnly.reasonCode,'CANDIDATE_ONLY_EVALUATION');
const observation = e.observations.find(row=>row.ticket==='1-4-6' && row.sourceCategory==='possibility');
assert.equal(observation.purchaseEligible,true);
assert.equal(observation.expansionEligible,false);
assert.deepEqual(observation.validScenarioIds,['canonical:1']);
assert.equal(e.branches.find(row=>row.id==='unselected-flow').scenarioId,'canonical:1');
assert.equal(e.branches.find(row=>row.id==='unselected-flow').ticket,'1-4-6');
assert.ok(!e.finalSelectedTickets.includes('1-4-6'));
assert.ok(e.observations.some(row=>row.stage==='pool-audit'), 'unvisited normal rows must have explicit audit stage');

const copy = plain(p);
copy.result={ticket:'6-5-4',payout:999999};
for (const list of [copy.mainSheet.tickets,copy.mainSheet.coverTickets,copy.mainSheet.flowTickets,copy.ticketSheets.possibility]) {
  list.forEach(row=>{row.odds=9999;row.result={ticket:'6-5-4'};});
}
assert.deepEqual(selector.select(copy).candidateValidationEvidence,e, 'outcome/odds must not affect evidence');
const saved = capture(record,result.tickets,result);
result.candidateValidationEvidence.observations[0].validScenarioIds.push('mutated');
assert.ok(!saved.candidateValidationEvidence.observations[0].validScenarioIds.includes('mutated'));
const mismatch = plain(result);
mismatch.candidateValidationEvidence.finalSelectedTickets=['6-5-4'];
const rejected = capture(record,result.tickets,mismatch);
assert.equal(rejected.status,'captured', 'bad diagnostics must not erase the forecast');
assert.equal(rejected.candidateValidationEvidence.status,'invalid-or-unavailable');
const legacy = capture(record,result.tickets,{tickets:result.tickets});
assert.equal(legacy.candidateValidationEvidence,undefined,'never backfill legacy evidence');

// Maximum distinct trifecta pool: bounded structure, no branch trees copied.
const many=builders.makeFixture();
many.ticketSheets.possibility=[];
for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++)if(new Set([a,b,c]).size===3)
  many.ticketSheets.possibility.push({ticket:`${a}-${b}-${c}`,branchIds:['missing'],hugeTree:'x'.repeat(100000)});
const large=proxy.select(many).candidateValidationEvidence;
assert.equal(large.poolTickets.length,120);
assert.ok(Buffer.byteLength(JSON.stringify(large)) < 150000, 'compact evidence must not duplicate full source trees');
assert.ok(large.observations.some(row=>row.purchaseEligible===false && row.invalidReasons.includes('UNKNOWN_BRANCH:missing')));
console.log(JSON.stringify({comparisons,largestEvidenceBytes:largest,base,unchangedSelection:true,legacyPreserved:true}));
