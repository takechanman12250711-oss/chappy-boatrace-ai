'use strict';

// Research wiring only. Results and odds never participate in these fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { console: { log() {}, warn() {}, error() {} } };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const name of ['evaluated-scenario-candidates', 'ai-core', 'practical-selection']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'), context);
}
const core = context.ChappyAICore;
const candidates = context.ChappyEvaluatedScenarioCandidates;
const practical = context.ChappyPracticalSelection;
const option = { researchAlternateEscapePartnerRoles: true };
const source = 'research-alternate-escape-partner-roles-v1';
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function fixture(mainCourse = 3, courseBoats = [1, 2, 3, 4, 5, 6]) {
  const entries = courseBoats.map((boatNo, i) => ({
    boat: boatNo,
    avgSt: 0.15,
    nationalWinRate: 6,
    localWinRate: 6,
    motor2Rate: 40,
    startExhibition: { boat: boatNo, course: i + 1, st: 0.1, isOfficialCourse: true }
  }));
  const at = course => courseBoats[course - 1];
  const analyses = courseBoats.map((boatNo, i) => ({
    boatNo,
    course: i + 1,
    playerName: `${boatNo}号艇`,
    indexes: { total: i + 1 === mainCourse ? 90 : 80, raceFlow: 82, attack: 80, turn: 70, local: 70 },
    roleScores: { attack: 80, hold: 86, pickup: 80, road: 70 }
  }));
  const role = (course, score = 80) => ({
    boatNo: at(course), course, score, reason: '既存の正式役割', status: '正式採用'
  });
  const escape = {
    type: 'escape', label: '1コース逃げ', score: 80,
    attacker: 1, attackerCourse: 1, attackerBoatNo: at(1), headBoatNo: at(1), blockedBoats: []
  };
  const main = {
    type: mainCourse === 3 ? 'threeAttack' : 'fourAttack',
    label: `${mainCourse}コース攻め`, score: 90,
    attacker: mainCourse, attackerCourse: mainCourse,
    attackerBoatNo: at(mainCourse), headBoatNo: at(mainCourse), blockedBoats: [],
    outcome: { firstCandidates: [role(mainCourse)], secondCandidates: [role(1), role(2)],
      thirdCandidates: [role(5), role(6)], boats: [] }
  };
  const raceScenarios = {
    mainScenario: main, subScenario: escape, scenarios: [main, escape], attacker: at(mainCourse),
    confidence: 90, blockedBoats: [], preservations: [],
    holdPickupTheory: { isFormal: true }, evidence: { mainGap: 10 }
  };
  return { entries, analyses, raceScenarios, at, role };
}

function basePrediction(f, formation) {
  const evaluations = f.analyses.map(row => ({
    ...row, score: 80, total: 80, attack: 80, hold: 80, pickup: 80, expected: 80,
    comment: '保存評価'
  }));
  const mark = course => evaluations.find(row => row.boatNo === f.at(course));
  const boatEvaluation = { honmei: mark(f.raceScenarios.mainScenario.attackerCourse),
    taikou: mark(1), ana: mark(5), osae: mark(2), evaluations };
  return {
    formation, boatEvaluation, mainSheet: { ...boatEvaluation, tickets: formation.main,
      coverTickets: formation.safety, flowTickets: formation.flow },
    raceFlow: {
      title: f.raceScenarios.mainScenario.label,
      summary: '主展開の保存評価', attackBoats: [f.role(f.raceScenarios.mainScenario.attackerCourse), f.role(1)],
      holdBoats: [f.role(1), f.role(2)], pickupBoats: [f.role(5), f.role(6)],
      phases: { firstMark: { mainAttack: f.role(f.raceScenarios.mainScenario.attackerCourse) } }
    }
  };
}
const researchBranches = decision => decision.branches.filter(row => row.source === source);
function validationContext(f, base, decision, enabled = true) {
  return {
    researchAlternateEscapePartnerRoles: enabled,
    researchEscapeProfiles: base.formation.researchAlternateEscapePartnerRoles,
    mainScenarioType: f.raceScenarios.mainScenario.type,
    targetsById: new Map(decision.targets.map(row => [row.id, row])),
    branchesById: new Map(decision.branches.map(row => [row.id, row])),
    evaluationsByBoat: new Map(base.boatEvaluation.evaluations.map(row => [row.boatNo, row])),
    courseMappingFormal: true,
    courseByBoat: new Map(f.entries.map(row => [row.boat, row.startExhibition.course])),
    raceFlow: base.raceFlow,
    phases: base.raceFlow.phases,
    mainHeadBoatNo: f.at(f.raceScenarios.mainScenario.attackerCourse),
    primaryAttackerBoatNo: f.at(f.raceScenarios.mainScenario.attackerCourse)
  };
}
function selectionPrediction(f, base, decision) {
  const formations = { ...base.formation, mainEstablished: true, evidence: {
    ...base.formation.evidence,
    scenarioType: f.raceScenarios.mainScenario.type,
    evaluatedTargets: decision.targets, branches: decision.branches,
    primaryAttackerBoatNo: f.at(f.raceScenarios.mainScenario.attackerCourse)
  } };
  return { ...base, formations, formation: formations,
    aiCore: { formations, courseMapping: { formal: true,
      byBoat: Object.fromEntries(f.entries.map(row => [row.boat, row.startExhibition.course])) } },
    ticketSheets: { possibility: decision.candidatePool.map(row => ({ ...row, category: '展開候補' })) }
  };
}

for (const mainCourse of [3, 4]) {
  const f = fixture(mainCourse);
  const before = JSON.stringify([f.entries, f.analyses, f.raceScenarios]);
  freeze(f.entries); freeze(f.analyses); freeze(f.raceScenarios);
  const baseline = core.buildFormations(f.analyses, f.raceScenarios, f.entries, {});
  assert.deepEqual(clone(baseline), clone(core.buildFormations(f.analyses, f.raceScenarios, f.entries, {},
    { researchAlternateEscapePartnerRoles: false })));
  assert.equal(Object.hasOwn(baseline, 'researchAlternateEscapePartnerRoles'), false);
  const formation = core.buildFormations(f.analyses, f.raceScenarios, f.entries, {}, option);
  assert.equal(JSON.stringify([f.entries, f.analyses, f.raceScenarios]), before, 'source inputs stay unchanged');
  const { researchAlternateEscapePartnerRoles: profiles, ...ordinaryFormation } = clone(formation);
  assert.deepEqual(ordinaryFormation, clone(baseline), 'research collection leaves existing formations unchanged');
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].attackerBoatNo, 1);
  assert.ok(profiles[0].secondCandidates.some(row => row.boatNo === 3));
  assert.ok(profiles[0].thirdCandidates.some(row => row.boatNo === 4));

  const base = basePrediction(f, formation);
  const savedBase = JSON.stringify(base);
  freeze(base);
  const normal = candidates.build(base);
  assert.deepEqual(clone(normal), clone(candidates.build(base, { researchAlternateEscapePartnerRoles: false })));
  assert.equal(researchBranches(normal).length, 0, 'stored profile alone never enables research');
  const decision = candidates.build(base, option);
  assert.equal(JSON.stringify(base), savedBase, 'candidate construction never mutates the saved input');
  const ticket = researchBranches(decision).find(row => row.ticket === '1-3-4');
  assert.ok(ticket, 'escape partners generate 1-3-4 even under an outer main attack');
  assert.equal(ticket.purchaseEligible, true);
  assert.equal(ticket.scenarioId, 'independent:escape:1');
  assert.deepEqual(clone(ticket.roles.map(row => [row.boatNo, row.role, row.eligiblePositions])),
    [[1, 'alternate-head', [1]], [3, 'hold', [2]], [4, 'pickup', [3]]]);
  assert.ok(ticket.evidenceChecks.find(row => row.key === 'same-escape-partner-roles')?.matched);
  assert.deepEqual(clone(ticket.phaseEvidence.goalOrder), [], 'do not reuse another scenario goal order');
  assert.equal(ticket.exactGoalOrder, false);
  assert.equal(normal.branches.some(row => row.source === source), false);
  const roleTarget = decision.targets.find(row => row.id === 'independent:escape:1:hold:3');
  assert.deepEqual(clone(roleTarget.roleIntents), ['hold']);
  assert.deepEqual(clone(roleTarget.eligiblePositions), [2]);
  assert.equal(roleTarget.source, source);
  assert.notEqual(ticket.roles[1].evaluationId, normal.targets.find(row => row.boatNo === 3)?.id,
    'escape hold evidence never reuses the main attack evaluation ID');
  const row = decision.candidatePool.find(row => row.ticket === '1-3-4');
  const validation = practical.validateCandidate({ ...row, sourceCategory: 'possibility' }, validationContext(f, base, decision));
  assert.ok(validation.validPurchaseBranchIds.includes(ticket.id), 'production validator accepts the explicitly enabled research branch');
  const disabled = practical.validateCandidate({ ...row, sourceCategory: 'possibility' }, validationContext(f, base, decision, false));
  assert.ok(!disabled.validPurchaseBranchIds.includes(ticket.id), 'default validator rejects the research source');
  const prediction = selectionPrediction(f, base, decision);
  const predictionBefore = JSON.stringify(prediction);
  const selected = practical.select(prediction, option);
  assert.equal(JSON.stringify(prediction), predictionBefore, 'selection never mutates inputs');
  assert.ok(selected.candidateValidationEvidence.observations.some(observation => observation.ticket === '1-3-4' &&
    observation.validPurchaseBranchIds?.includes(ticket.id)), 'select uses the same accepted research validation');
  assert.ok(!practical.select(prediction).candidateValidationEvidence.observations.some(observation =>
    observation.validPurchaseBranchIds?.includes(ticket.id)), 'select requires its own explicit opt-in');
  for (const candidate of normal.candidatePool) {
    if (!researchBranches(decision).some(branch => branch.ticket === candidate.ticket)) {
      const updated = decision.candidatePool.find(row => row.ticket === candidate.ticket);
      assert.deepEqual(clone(updated?.physicalCoverage), clone(candidate.physicalCoverage),
        'contextual role targets do not change non-research physical coverage');
    }
    if (!candidate.ticket.startsWith('1-')) {
      const updated = decision.candidatePool.find(row => row.ticket === candidate.ticket);
      assert.deepEqual(clone(practical.validateCandidate({ ...updated, sourceCategory: 'possibility' }, validationContext(f, base, decision))),
        clone(practical.validateCandidate({ ...candidate, sourceCategory: 'possibility' }, validationContext(f, base, normal))),
        'purchase qualification for every other head stays unchanged');
    }
  }
  for (const badKind of ['profile', 'head', 'source', 'mapping', 'role-id', 'goal-order']) {
    const badPrediction = clone(prediction);
    badPrediction.formation = badPrediction.formations = badPrediction.aiCore.formations;
    const badDecision = { ...decision, targets: badPrediction.formations.evidence.evaluatedTargets,
      branches: badPrediction.formations.evidence.branches };
    const badBranch = badDecision.branches.find(branch => branch.id === ticket.id);
    if (badKind === 'profile') badPrediction.formation.researchAlternateEscapePartnerRoles[0].secondCandidates
      .find(row => row.boatNo === 3).source = 'different-source';
    if (badKind === 'head') badPrediction.raceFlow.attackBoats = badPrediction.raceFlow.attackBoats.filter(row => row.boatNo !== 1);
    if (badKind === 'source') badBranch.qualificationSource = 'different-source';
    if (badKind === 'role-id') badBranch.roles[1].evaluationId =
      (normal.targets.find(row => row.boatNo === 3) || normal.targets[0]).id;
    if (badKind === 'goal-order') badBranch.phaseEvidence.goalOrder = [3, 1, 5];
    const badContext = validationContext(f, badPrediction, badDecision);
    if (badKind === 'mapping') badContext.courseMappingFormal = false;
    assert.ok(!practical.validateCandidate({ ...row, sourceCategory: 'possibility' }, badContext)
      .validPurchaseBranchIds.includes(ticket.id), `validator rejects tampered ${badKind}`);
    if (badKind !== 'mapping') assert.ok(!practical.select(badPrediction, option).candidateValidationEvidence.observations
      .some(observation => observation.validPurchaseBranchIds?.includes(ticket.id)), `select rejects tampered ${badKind}`);
  }

  const noHead = clone(base);
  noHead.raceFlow.attackBoats = noHead.raceFlow.attackBoats.filter(row => row.boatNo !== 1);
  assert.ok(researchBranches(candidates.build(noHead, option)).every(row => row.purchaseEligible === false),
    'partner evidence never creates first-place purchase qualification');
  const underThreshold = clone(base);
  underThreshold.raceFlow.attackBoats.find(row => row.boatNo === 1).score = 64;
  assert.ok(researchBranches(candidates.build(underThreshold, option)).every(row => row.purchaseEligible === false),
    'existing first-place score threshold is unchanged');

  for (const [field, value] of [['mappingFormal', false], ['isProvisional', true],
    ['attackerBoatNo', 2], ['scenarioType', 'sashi'], ['source', 'different-source']]) {
    const bad = clone(base);
    bad.formation.researchAlternateEscapePartnerRoles[0][field] = value;
    assert.equal(researchBranches(candidates.build(bad, option)).length, 0, `reject profile ${field}`);
  }
  for (const [field, value] of [['attackerBoatNo', 2], ['scenarioId', 'independent:escape:2'],
    ['source', 'different-source'], ['qualificationSource', 'different-source'], ['score', 64], ['course', 2]]) {
    const bad = clone(base);
    bad.formation.researchAlternateEscapePartnerRoles[0].secondCandidates.find(row => row.boatNo === 3)[field] = value;
    assert.equal(researchBranches(candidates.build(bad, option)).some(row => row.ticket === '1-3-4'), false,
      `never combine a partner with mismatched ${field}`);
  }
  const polluted = clone(base);
  polluted.odds = { byTicket: { '1-3-4': 9999 } };
  polluted.result = { trifecta: '1-3-4', payout: 999900 };
  assert.deepEqual(clone(candidates.build(polluted, option)), clone(decision), 'results and odds are unused');
  const provisional = clone(f.entries);
  provisional[0].startExhibition.isOfficialCourse = false;
  assert.equal(core.buildFormations(f.analyses, f.raceScenarios, provisional, {}, option)
    .researchAlternateEscapePartnerRoles.length, 0);
  assert.equal(core.buildFormations(f.analyses, f.raceScenarios, f.entries.slice(0, 5), {}, option)
    .researchAlternateEscapePartnerRoles.length, 0);
}

const swapped = fixture(3, [6, 2, 3, 4, 5, 1]);
const swappedFormation = core.buildFormations(swapped.analyses, swapped.raceScenarios, swapped.entries, {}, option);
assert.equal(swappedFormation.researchAlternateEscapePartnerRoles[0]?.attackerBoatNo, 6,
  'use the actual first-course boat rather than boat number 1');
assert.ok(researchBranches(candidates.build(basePrediction(swapped, swappedFormation), option))
  .some(row => row.ticket === '6-3-4' && row.scenarioId === 'independent:escape:6'));
console.log('alternate escape partner research tests passed');
