'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const helper = require('../js/research-selected-escape-partners');
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const context = { console: { log() {}, warn() {}, error() {} } };
context.window = context;
vm.createContext(context);
for (const name of ['evaluated-scenario-candidates', 'ai-core', 'research-selected-escape-partners']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context);
}
assert.equal(context.ChappyResearchSelectedEscapePartners.CANDIDATE_ID, helper.CANDIDATE_ID);

function fixture(courseBoats = [1, 2, 3, 4, 5, 6]) {
  const at = course => courseBoats[course - 1];
  const entries = courseBoats.map((boat, i) => ({ boat, avgSt: 0.15, nationalWinRate: 6,
    localWinRate: 6, motor2Rate: 40,
    startExhibition: { boat, course: i + 1, st: 0.1, isOfficialCourse: true } }));
  const analyses = courseBoats.map((boatNo, i) => ({ boatNo, course: i + 1, playerName: String(boatNo),
    indexes: { total: i === 2 ? 90 : 80, raceFlow: 82, attack: 80, turn: 70, local: 70 },
    roleScores: { attack: 80, hold: 86, pickup: 80, road: 70 } }));
  const role = course => ({ boatNo: at(course), course, score: 80, reason: '保存済み正式役割' });
  const main = { type: 'threeAttack', label: '3コース攻め', score: 90,
    attacker: 3, attackerCourse: 3, attackerBoatNo: at(3), headBoatNo: at(3), blockedBoats: [],
    outcome: { firstCandidates: [role(3)], secondCandidates: [role(1), role(2)],
      thirdCandidates: [role(5), role(6)], boats: [] } };
  const escape = { type: 'escape', label: '1コース逃げ', score: 80,
    attacker: 1, attackerCourse: 1, attackerBoatNo: at(1), headBoatNo: at(1), blockedBoats: [] };
  const raceScenarios = { mainScenario: main, subScenario: escape, scenarios: [main, escape], attacker: at(3),
    confidence: 90, blockedBoats: [], preservations: [], holdPickupTheory: { isFormal: true }, evidence: { mainGap: 10 } };
  const formation = clone(context.ChappyAICore.buildFormations(analyses, raceScenarios, entries, {},
    { researchAlternateEscapePartnerRoles: true }));
  assert.equal(formation.researchAlternateEscapePartnerRoles.length, 1);
  const ticket = (...courses) => courses.map(at).join('-');
  const rows = [
    { ticket: ticket(3, 1, 5), category: '本線', sourceCategory: 'main', odds: 11 },
    { ticket: ticket(1, 4, 6), category: '押さえ', displayCategory: '押さえ', sourceCategory: 'cover', odds: 99,
      amount: 900, branchIds: ['must-not-copy-branch'] },
    { ticket: ticket(3, 2, 5), category: '本線', sourceCategory: 'main', odds: 12 },
    { ticket: ticket(1, 3, 6), category: '押さえ', sourceCategory: 'cover', odds: 88, amount: 800 },
    { ticket: ticket(3, 2, 6), category: '流し', sourceCategory: 'flow', odds: 13 },
    { ticket: ticket(4, 2, 5), category: '万舟・穴', sourceCategory: 'hole', odds: 14 }
  ];
  const branches = rows.map((row, i) => ({
    id: `saved-branch:${i}`, ticket: row.ticket, scenarioId: `canonical:${at(3)}`,
    kind: 'canonical-formation', source: `base-formation:${row.sourceCategory}`, qualified: true,
    priorityScore: 80, roles: [{ evaluationId: `saved-head:${row.ticket[0]}`, boatNo: Number(row.ticket[0]),
      role: 'alternate-head', eligiblePositions: [1] }]
  }));
  const observations = rows.map((row, i) => ({
    ticket: row.ticket, sourceCategory: row.sourceCategory, valid: true, purchaseEligible: true,
    inputBranchIds: [branches[i].id], validPurchaseBranchIds: [branches[i].id],
    coverage: [{ evaluationId: branches[i].roles[0].evaluationId, boatNo: Number(row.ticket[0]),
      role: 'alternate-head', position: 1, branchId: branches[i].id }]
  }));
  const baseline = { tickets: rows, candidateValidationEvidence: {
    version: 'candidate-validation-evidence-v1', status: 'captured', resultUsedForGeneration: false,
    poolTickets: rows.map(row => row.ticket), finalSelectedTickets: rows.map(row => row.ticket), branches, observations
  } };
  const prediction = { aiCore: { courseMapping: { formal: true,
    byBoat: Object.fromEntries(entries.map(row => [row.boat, row.startExhibition.course])) },
    analyses, raceScenarios } };
  return { prediction, baseline, formation, at, ticket };
}
function headCounts(rows) {
  const counts = {};
  rows.forEach(row => { const head = row.ticket.split('-')[0]; counts[head] = (counts[head] || 0) + 1; });
  return counts;
}
function assertUnchanged(f, reason) {
  const before = JSON.stringify([f.prediction, f.baseline, f.formation]);
  const result = helper.select(f.prediction, f.baseline, f.formation);
  assert.equal(result.changed, false, reason);
  assert.strictEqual(result.tickets, f.baseline.tickets, 'negative paths preserve the complete original rows');
  assert.deepEqual(result.tickets, f.baseline.tickets);
  assert.equal(JSON.stringify([f.prediction, f.baseline, f.formation]), before);
  return result;
}

for (const order of [[1, 2, 3, 4, 5, 6], [6, 2, 3, 4, 5, 1]]) {
  const f = fixture(order);
  const before = JSON.stringify([f.prediction, f.baseline, f.formation]);
  freeze(f.prediction); freeze(f.baseline); freeze(f.formation);
  const result = helper.select(f.prediction, f.baseline, f.formation);
  assert.equal(result.changed, true);
  assert.equal(result.targetHead, f.at(1));
  const profile = f.formation.researchAlternateEscapePartnerRoles[0];
  const expected = f.formation.safety.filter(value => value.startsWith(`${f.at(1)}-`) &&
    profile.secondCandidates.some(row => row.boatNo === Number(value.split('-')[1])) &&
    profile.thirdCandidates.some(row => row.boatNo === Number(value.split('-')[2]))).slice(0, 2);
  assert.deepEqual([result.tickets[1].ticket, result.tickets[3].ticket], expected,
    'use existing safety order without scoring or result-based rescue');
  assert.equal(result.tickets.length, f.baseline.tickets.length);
  assert.equal(new Set(result.tickets.map(row => row.ticket)).size, result.tickets.length);
  assert.deepEqual(headCounts(result.tickets), headCounts(f.baseline.tickets));
  for (const i of [0, 2, 4, 5]) assert.strictEqual(result.tickets[i], f.baseline.tickets[i],
    'other heads and protected categories keep their exact rows');
  for (const i of [1, 3]) {
    const row = result.tickets[i];
    assert.equal(row.researchOnly, true);
    for (const field of ['odds', 'amount', 'branchIds', 'purchaseEligible', 'priorityScore']) {
      assert.equal(Object.hasOwn(row, field), false, `new ticket does not inherit ${field}`);
    }
    assert.equal(row.researchEvidence.sameOriginalBranch, false);
    assert.equal(row.researchEvidence.v1IndependentBranchesPromoted, false);
    assert.equal(row.researchEvidence.headEvidenceOrigin, 'baseline-selected-canonical-branch');
    assert.equal(row.researchEvidence.partnerEvidenceOrigin, 'head-specific-safety-hold-pickup-theory');
    assert.notEqual(row.researchEvidence.headProof.source, row.researchEvidence.partnerSource);
  }
  assert.equal(JSON.stringify([f.prediction, f.baseline, f.formation]), before);
  const browserResult = context.ChappyResearchSelectedEscapePartners.select(f.prediction, f.baseline, f.formation);
  assert.deepEqual(clone(browserResult), clone(result), 'UMD and CommonJS agree');

  const polluted = clone({ prediction: f.prediction, baseline: f.baseline, formation: f.formation });
  polluted.prediction.result = { trifecta: f.ticket(1, 4, 6), payout: 99999 };
  polluted.prediction.odds = { byTicket: { [f.ticket(1, 4, 6)]: 99999 } };
  polluted.baseline.tickets.forEach(row => { row.odds = 99999; row.isManshu = true; });
  const contaminatedResult = helper.select(polluted.prediction, polluted.baseline, polluted.formation);
  assert.deepEqual(contaminatedResult.tickets.map(row => row.ticket), result.tickets.map(row => row.ticket));
  assert.deepEqual(contaminatedResult.added, result.added);
  assert.deepEqual(contaminatedResult.removed, result.removed);

  const already = clone({ prediction: f.prediction, baseline: f.baseline, formation: f.formation });
  already.formation.safety = [f.baseline.tickets[3].ticket, f.baseline.tickets[1].ticket];
  assert.equal(assertUnchanged(already).reasonCode, 'ALREADY_TOP_K_HEAD_PARTNERS');
}

const negativeCases = [
  ['uncaptured proof', f => { f.baseline.candidateValidationEvidence.status = 'capture-error'; }],
  ['post-result proof', f => { f.baseline.candidateValidationEvidence.resultUsedForGeneration = true; }],
  ['different final set', f => { f.baseline.candidateValidationEvidence.finalSelectedTickets.reverse(); }],
  ['missing head claim', f => { f.baseline.candidateValidationEvidence.observations[1].coverage = []; }],
  ['wrong head claim', f => { f.baseline.candidateValidationEvidence.observations[1].coverage[0].boatNo = 2; }],
  ['wrong position', f => { f.baseline.candidateValidationEvidence.observations[1].coverage[0].position = 2; }],
  ['mismatched branch role', f => { f.baseline.candidateValidationEvidence.branches[1].roles[0].evaluationId = 'other'; }],
  ['unknown branch', f => { f.baseline.candidateValidationEvidence.observations[1].validPurchaseBranchIds = ['unknown']; }],
  ['rejected original branch', f => { f.baseline.candidateValidationEvidence.branches[1].qualified = false; }],
  ['v1 branch never promoted', f => { f.baseline.candidateValidationEvidence.branches[1].source =
    'research-alternate-escape-partner-roles-v1'; }],
  ['original ticket not purchasable', f => { f.baseline.candidateValidationEvidence.observations[1].purchaseEligible = false; }],
  ['duplicate branch ID', f => { f.baseline.candidateValidationEvidence.branches.push(f.baseline.candidateValidationEvidence.branches[0]); }],
  ['no existing head slots', f => { f.baseline.tickets[1].category = f.baseline.tickets[3].category = '本線'; }],
  ['unformal mapping', f => { f.prediction.aiCore.courseMapping.formal = false; }],
  ['incomplete mapping', f => { delete f.prediction.aiCore.courseMapping.byBoat[6]; }],
  ['duplicate mapping', f => { f.prediction.aiCore.courseMapping.byBoat[6] = 5; }],
  ['different main scenario', f => { f.prediction.aiCore.raceScenarios.mainScenario.type = 'sashi'; }],
  ['missing profile', f => { f.formation.researchAlternateEscapePartnerRoles = []; }],
  ['mixed profiles', f => { f.formation.researchAlternateEscapePartnerRoles.push(clone(f.formation.researchAlternateEscapePartnerRoles[0])); }],
  ['different profile head', f => { f.formation.researchAlternateEscapePartnerRoles[0].attackerBoatNo = 2; }],
  ['different profile scenario', f => { f.formation.researchAlternateEscapePartnerRoles[0].scenarioId = 'other'; }],
  ['different profile source', f => { f.formation.researchAlternateEscapePartnerRoles[0].source = 'other'; }],
  ['provisional profile', f => { f.formation.researchAlternateEscapePartnerRoles[0].isProvisional = true; }],
  ['profile mapping mismatch', f => { f.formation.researchAlternateEscapePartnerRoles[0].courses[0].course = 2; }],
  ['missing hold evidence', f => { f.formation.researchAlternateEscapePartnerRoles[0].secondCandidates = []; }],
  ['under-threshold pickup', f => { f.formation.researchAlternateEscapePartnerRoles[0].thirdCandidates[0].score = 64; }],
  ['mixed role source', f => { f.formation.researchAlternateEscapePartnerRoles[0].secondCandidates[0].source = 'other'; }],
  ['mixed role scenario', f => { f.formation.researchAlternateEscapePartnerRoles[0].thirdCandidates[0].scenarioId = 'other'; }],
  ['mixed role head', f => { f.formation.researchAlternateEscapePartnerRoles[0].thirdCandidates[0].attackerBoatNo = 2; }],
  ['rejected role', f => { f.formation.researchAlternateEscapePartnerRoles[0].secondCandidates[0].isAdopted = false; }],
  ['insufficient safety', f => { f.formation.safety = [f.formation.safety.find(ticket => ticket.startsWith('1-'))]; }],
  ['invalid safety', f => { f.formation.safety = ['1-1-2']; }]
];
for (const [name, mutate] of negativeCases) {
  const f = fixture();
  mutate(f);
  assertUnchanged(f, name);
}

// A selected first-course main/flow row remains protected even if another
// non-main row for the same head is eligible for research replacement.
const protectedHead = fixture();
protectedHead.baseline.tickets[1].category = '流し';
const protectedResult = helper.select(protectedHead.prediction, protectedHead.baseline, protectedHead.formation);
assert.strictEqual(protectedResult.tickets[1], protectedHead.baseline.tickets[1]);
assert.equal(protectedResult.tickets.length, protectedHead.baseline.tickets.length);
assert.deepEqual(headCounts(protectedResult.tickets), headCounts(protectedHead.baseline.tickets));

// Exercise ordinary prediction/selection before invoking the independent
// research helper. This case is eligible but already has the safety top K;
// it must report that fact rather than invent a replacement.
const ordinary = { console: { log() {}, warn() {}, error() {} },
  document: { addEventListener() {} }, addEventListener() {} };
ordinary.window = ordinary; ordinary.global = ordinary;
vm.createContext(ordinary);
for (const name of ['boat-identity', 'theory-input', 'evaluated-scenario-candidates', 'ai-core',
  'prediction-conditions', 'prediction', 'practical-selection', 'research-selected-escape-partners']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), ordinary);
}
const smoke = vm.runInContext(`(() => {
  const entries = Array.from({ length: 6 }, (_, i) => ({
    boat: i + 1, racerName: String(i + 1), className: 'A2', avgSt: 0.18,
    nationalWinRate: 5, localWinRate: 5, motor2Rate: 33,
    exhibition: { displayTime: 6.95 }, currentRace: { stList: [0.18] }
  }));
  entries[2] = { ...entries[2], className: 'A1', avgSt: 0.10,
    nationalWinRate: 7.5, localWinRate: 7, motor2Rate: 48,
    exhibition: { displayTime: 6.68 }, currentRace: { stList: [0.10] } };
  const data = { stadiumCode: '23', raceNo: 8, date: '20260803', entries,
    startExhibition: [0.13, 0.15, 0.03, 0.14, 0.18, 0.24].map((st, i) =>
      ({ boat: i + 1, course: i + 1, st, isOfficialCourse: true })),
    weather: { windSpeed: 2, waveHeight: 2, windDirection: '向かい風' }, odds: { byTicket: {} } };
  const prediction = createPrediction(data);
  const baseline = ChappyPracticalSelection.select(prediction);
  const formation = ChappyAICore.buildFormations(prediction.aiCore.analyses, prediction.aiCore.raceScenarios,
    ChappyAICore.getRaceEntries(data), data, { researchAlternateEscapePartnerRoles: true });
  const result = ChappyResearchSelectedEscapePartners.select(prediction, baseline, formation);
  return { reasonCode: result.reasonCode, changed: result.changed, head: result.targetHead,
    proofs: result.evidence.headProofs?.length, baseline: baseline.tickets.map(row => row.ticket),
    tickets: result.tickets.map(row => row.ticket), profiles: formation.researchAlternateEscapePartnerRoles.length };
})()`, ordinary);
assert.equal(smoke.profiles, 1);
assert.equal(smoke.head, 1);
assert.equal(smoke.proofs, 3, 'ordinary selector supplies accepted canonical head proofs');
assert.equal(smoke.reasonCode, 'ALREADY_TOP_K_HEAD_PARTNERS');
assert.equal(smoke.changed, false);
assert.deepEqual(smoke.tickets, smoke.baseline);
console.log('selected escape partner order v2 tests passed');
