"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), Module = require("node:module");
const c = require("../scripts/eight-ticket-exhibition-shadow.cjs");
const report = require("../scripts/build-eight-ticket-exhibition-shadow-report.cjs");
const oldA = require("../scripts/build-eight-ticket-promotion-shadow-report.cjs");
const clone = x => JSON.parse(JSON.stringify(x));
const NOW = "2030-09-26T00:01:00.000Z", CAPTURED = "2030-09-26T00:00:00.000Z", DEADLINE = "2030-09-26T00:10:00.000Z";
function fixture() {
  const tickets = ["1-2-3", "1-4-3", "1-3-4", "1-2-4", "1-2-5", "1-2-6", "1-3-2", "1-3-5"].map((ticket, i) => ({
    ticket, category: i < 3 ? "本線" : i < 5 ? "流し" : i === 5 ? "独立展開" : "候補補完",
    selectionTier: i === 5 ? "展開追加" : i > 5 ? "候補補完" : "", priorityScore: i === 5 ? 80 : 93
  }));
  return { raceKey: "20300926-18-3", date: "20300926", jcd: "18", raceNo: 3, selectedAt: CAPTURED, deadlineAt: DEADLINE,
    practicalPriorityShadow: { capturedAt: CAPTURED, sourceCommit: "a".repeat(40) },
    prediction: { practicalTickets: tickets, practicalSelection: { status: "selected", tickets: clone(tickets),
      expansionSummary: { strongEscapeTrim: { applied: true } }, targetDecisions: [{ candidateDecisions: [{
        ticket: "1-4-2", ticketSelected: false, reasonCode: "CANDIDATE_ONLY_EVALUATION", relation: "structured", priorityScore: 93,
        roleLabels: [1, 4, 2].map((boatNo, i) => ({ boatNo, position: i + 1, structured: true }))
      }] }] }, verificationEvidence: { generation: { logicFingerprint: "evaluated-scenarios-v1",
        confidenceDefinitionVersion: "internal-score-v1", ticketPolicyVersion: c.POLICY.sourceGeneration.split("|")[2] } },
      preRaceConditions: { schemaVersion: 4, sourceTiming: "pre_deadline", officialResultUsed: false,
        source: "boatrace-official", sourceFetchedAt: CAPTURED, boats: Array.from({ length: 6 }, (_, i) => ({
          boatNo: i + 1, course: i + 1, courseOfficial: true, exhibitionST: 0.1, exhibitionTime: 6.9
        })) }, evaluatedScenarioCandidates: { candidatePool: [{ ticket: "1-4-2", evidenceQualified: true, priorityScore: 93 }] } } };
}
function captured(r = fixture()) { return c.attach(r, { now: NOW }); }
function official(actual = "1-4-2", payout = 1190) {
  return { source: "boatrace-official", status: "finished", resultAvailable: true, trifecta: { combination: actual, payout } };
}
const target = r => r.prediction.practicalSelection.targetDecisions[0].candidateDecisions[0];
function run(r = captured(), result = official()) { return report.build([r], new Map([[r.raceKey, result]])); }
test("C changes only the last promotion and leaves all source fields intact", () => {
  const r = fixture(), before = clone(r), out = c.capture(r, { now: NOW });
  assert.equal(out.eligible, true); assert.deepEqual(out.shadowTickets.slice(0, 7), out.baseTickets.slice(0, 7));
  assert.deepEqual(out.replacement, { index: 7, removed: "1-3-5", added: "1-4-2", priorityScore: 93 });
  assert.deepEqual(r, before); assert.equal(out.affectsTickets, false); assert.equal(out.usableForPrediction, false);
});
for (const n of [0, 5, 6, 7, 9, 10]) test(`${n} tickets are not changed`, () => {
  const r = fixture(); r.prediction.practicalTickets = Array.from({ length: n }, (_, i) => r.prediction.practicalTickets[i % 8]);
  const out = c.capture(r, { now: NOW }); assert.equal(out.eligible, false); assert.deepEqual(out.shadowTickets, out.baseTickets);
});
for (const [name, mutate] of Object.entries({
  "no trim": r => { r.prediction.practicalSelection.expansionSummary.strongEscapeTrim.applied = false; },
  "not selected": r => { r.prediction.practicalSelection.status = "skipped"; },
  "invalid ticket": r => { r.prediction.practicalTickets[0].ticket = "1-1-2"; },
  "duplicate": r => { r.prediction.practicalTickets[0].ticket = "1-4-3"; },
  "protected last row": r => { r.prediction.practicalTickets[7].category = "本線"; },
  "not same anchor": r => { r.prediction.practicalTickets[6].ticket = "1-5-2"; },
  "missing exhibition": r => { r.prediction.preRaceConditions.boats[0].exhibitionTime = null; },
  "missing ST": r => { r.prediction.preRaceConditions.boats[0].exhibitionST = null; },
  "exhibition F": r => { r.prediction.preRaceConditions.boats[0].exhibitionST = -0.01; },
  "unconfirmed course": r => { r.prediction.preRaceConditions.boats[0].courseOfficial = false; },
  "duplicate course": r => { r.prediction.preRaceConditions.boats[0].course = 2; },
  "not inner head": r => { r.prediction.preRaceConditions.boats[0].course = 2; r.prediction.preRaceConditions.boats[1].course = 1; },
  "no recorded pool": r => { delete r.prediction.evaluatedScenarioCandidates; },
  "pool evidence false": r => { r.prediction.evaluatedScenarioCandidates.candidatePool[0].evidenceQualified = false; },
  "different score": r => { target(r).priorityScore = 92; },
  "pool different score": r => { r.prediction.evaluatedScenarioCandidates.candidatePool[0].priorityScore = 92; },
  "unstructured position": r => { target(r).roleLabels[2].structured = false; },
  "wrong boat position": r => { target(r).roleLabels[2].boatNo = 6; },
  "already selected candidate": r => { target(r).ticketSelected = true; },
  "missing selected flag": r => { delete target(r).ticketSelected; },
  "wrong reason": r => { target(r).reasonCode = "OUTER_HEAD_CANDIDATE_PROMOTION_PRUNED"; },
  "below 90": r => { r.prediction.practicalTickets[7].priorityScore = 89; target(r).priorityScore = 89; r.prediction.evaluatedScenarioCandidates.candidatePool[0].priorityScore = 89; }
})) test(`fails closed: ${name}`, () => {
  const r = fixture(); mutate(r); const out = c.capture(r, { now: NOW });
  assert.equal(out.eligible, false); assert.deepEqual(out.shadowTickets, out.baseTickets);
});
test("C does not require the extra D dominance condition", () => {
  const r = fixture(); r.prediction.preRaceConditions.boats[3].exhibitionST = 0.3;
  r.prediction.preRaceConditions.boats[3].exhibitionTime = 7.1;
  assert.equal(c.capture(r, { now: NOW }).eligible, true);
});
test("the candidate ticket is not hard-coded to 1-4-2", () => {
  const r = fixture(); target(r).ticket = "1-5-2"; target(r).roleLabels[1].boatNo = 5;
  r.prediction.evaluatedScenarioCandidates.candidatePool[0].ticket = "1-5-2";
  assert.equal(c.capture(r, { now: NOW }).replacement.added, "1-5-2");
});
test("result, odds and payout do not select or fingerprint tickets", () => {
  const a = fixture(), b = clone(a); b.result = official("6-5-4", 999999);
  Object.assign(b.prediction, { actualTicket: "6-5-4", payout: 999999, odds: { "1-4-2": 999 } });
  for (const row of b.prediction.practicalTickets) row.odds = 999;
  assert.deepEqual(c.capture(a, { now: NOW }), c.capture(b, { now: NOW }));
});
for (const [name, mutate] of Object.entries({
  "snapshot absent": r => { delete r.eightTicketExhibitionShadow; },
  "after deadline": r => { r.eightTicketExhibitionShadow.createdAt = DEADLINE; },
  "before capture": r => { r.eightTicketExhibitionShadow.createdAt = "2030-09-25T00:00:00Z"; },
  "input changed": r => { r.prediction.preRaceConditions.boats[0].exhibitionTime = 6.8; },
  "ticket changed": r => { r.prediction.practicalTickets[7].ticket = "1-6-4"; },
  "shadow tampered": r => { r.eightTicketExhibitionShadow.shadowTickets[7] = "6-5-4"; },
  "wrong commit": r => { r.practicalPriorityShadow.sourceCommit = "main"; },
  "wrong capture": r => { r.practicalPriorityShadow.capturedAt = "2030-09-25T00:00:00Z"; },
  "generation changed": r => { r.prediction.verificationEvidence.generation.ticketPolicyVersion = "next"; },
  "official outcome used": r => { r.prediction.preRaceConditions.officialResultUsed = true; },
  "wrong fingerprint": r => { r.eightTicketExhibitionShadow.logicFingerprint = "other"; },
  "purchase flag": r => { r.eightTicketExhibitionShadow.usableForPrediction = true; }
})) test(`report rejects ${name}`, () => {
  const r = captured(); mutate(r); assert.equal(run(r).counts.settledRaces, 0);
});
test("a newly generated historical sidecar is not forward evidence", () => {
  const r = fixture(); r.selectedAt = "2026-09-26T00:00:00Z"; r.deadlineAt = "2026-09-26T00:01:00Z";
  const out = c.attach(r, { now: "2030-09-26T00:01:00Z" }); assert.equal(run(out).counts.settledRaces, 0);
});
test("no sidecar is not reported as an unchanged valid race", () => {
  const out = run(fixture()); assert.equal(out.counts.observedEightTicketRaces, 0); assert.equal(out.excluded["not-captured"], 1);
});
test("gain and lost hit are both settled at the same eight-ticket cost", () => {
  const gain = run(), loss = run(captured(), official("1-3-5", 650));
  assert.equal(gain.gains, 1); assert.equal(gain.activatedMetrics.C.returnYen, 1190);
  assert.equal(gain.activatedMetrics.base.stakeYen, 800); assert.equal(gain.activatedMetrics.C.stakeYen, 800);
  assert.equal(loss.losses, 1); assert.equal(loss.activatedMetrics.base.returnYen, 650);
  assert.equal(gain.adoptionStatus, "NOT_APPROVED"); assert.equal(loss.automaticApplication, false);
});
test("capture count, activation, pending, void and duplicate are distinct", () => {
  const r = captured(), pending = report.build([r, r], new Map());
  assert.equal(pending.counts.observedEightTicketRaces, 1); assert.equal(pending.counts.pendingRaces, 1);
  assert.equal(pending.counts.activatedRaces, 1); assert.equal(pending.counts.settledActivatedRaces, 0);
  for (const result of [{ ...official(), void: true }, { ...official(), starts: [{ falseStart: true }] },
    { ...official(), refunds: [1] }, official("1-4-2", 0), { ...official(), source: "other" },
    { ...official(), raceKey: "20300926-01-1" }]) {
    const out = run(r, result); assert.equal(out.counts.pendingRaces, 0);
    assert.equal(out.counts.resolvedExcludedRaces, 1); assert.equal(out.counts.settledRaces, 0);
  }
});
test("report writes a separate C file and never mutates A or the normal ledger", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eight-c-report-"));
  try {
    fs.mkdirSync(path.join(root, "data/predictions"), { recursive: true }); fs.mkdirSync(path.join(root, "data/results"));
    fs.mkdirSync(path.join(root, "data/stats"));
    const r = captured(); fs.writeFileSync(path.join(root, "data/predictions/20300926.json"), JSON.stringify({ date: "20300926", predictions: [r], verificationPredictions: [] }));
    fs.writeFileSync(path.join(root, "data/results/20300926.json"), JSON.stringify({ races: [{ ...official(), raceKey: r.raceKey }] }));
    const protectedFiles = ["continuous-performance-ledger.json", "eight-ticket-promotion-shadow-report.json"];
    for (const name of protectedFiles) fs.writeFileSync(path.join(root, "data/stats", name), "UNCHANGED");
    assert.equal(report.main(root).gains, 1);
    for (const name of protectedFiles) assert.equal(fs.readFileSync(path.join(root, "data/stats", name), "utf8"), "UNCHANGED");
    const a = oldA.build([fixture()], new Map()), b = oldA.build([r], new Map());
    delete a.generatedAt; delete b.generatedAt; assert.deepEqual(a, b);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("collector attaches C, compaction preserves it and missing C cannot break collection", () => {
  const collector = require("../scripts/collect-predictions");
  const r = fixture(), before = clone(r);
  const attached = collector.withEightTicketExhibitionShadow(r, { now: NOW });
  assert.equal(attached.eightTicketExhibitionShadow.eligible, true); assert.deepEqual(r, before);
  const saved = clone(collector.compactStoredVerification(attached));
  assert.deepEqual(saved.eightTicketExhibitionShadow, attached.eightTicketExhibitionShadow);
  assert.equal(report.validate(saved).reason, undefined);
  const original = Module._load;
  try {
    Module._load = function(request) {
      if (String(request).endsWith("eight-ticket-exhibition-shadow.cjs")) throw Error("test-only unavailable");
      return original.apply(this, arguments);
    };
    const failed = collector.withEightTicketExhibitionShadow(r);
    assert.equal(failed.eightTicketExhibitionShadow.status, "unavailable");
    const { eightTicketExhibitionShadow, ...rest } = failed; assert.deepEqual(rest, before);
  } finally { Module._load = original; }
});
