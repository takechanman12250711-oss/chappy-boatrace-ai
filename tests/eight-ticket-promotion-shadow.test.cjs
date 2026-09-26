"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), vm = require("node:vm");
const Module = require("node:module");
require("../scripts/eight-ticket-promotion-preload.cjs");
const guard = require("../scripts/eight-ticket-promotion-shadow.cjs");
const rescue = require("../js/three-course-escape-rescue-fixed5");
const reporter = require("../scripts/build-eight-ticket-promotion-shadow-report.cjs");
const priority = require("../js/practical-priority-shadow");
const root = path.resolve(__dirname, "..");
const browser = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "js/practical-priority-shadow.js"), "utf8"), browser);
const legacy = browser.window.ChappyPracticalPriorityShadow;
const plain = value => JSON.parse(JSON.stringify(value));
const generation = { logicFingerprint: "evaluated-scenarios-v1", confidenceDefinitionVersion: "internal-score-v1",
  ticketPolicyVersion: "practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5-coursefailclosed1" };
function selection(promoted = "1-2-5") {
  const tickets = ["3-1-5", "3-2-5", "3-1-6", "1-2-3", "1-2-4", "3-2-1", "3-2-6", promoted];
  return rescue.apply({ raceFlow: { title: "3コース攻め" } }, {
    status: "selected", tickets: tickets.map((ticket, i) => ({ ticket, category: i < 3 ? "本線" : i < 5 ? "押さえ" : i < 7 ? "流し" : "候補補完", odds: 0 })),
    expansionSummary: { candidatePromotionTickets: [{ ticket: promoted, priorityScore: 92 }] },
    verificationEvidence: { generation, mainScenario: { label: "3コース攻め" } }
  });
}
const NOW = "2030-09-25T00:01:00.000Z";
function record(s = selection()) {
  return { raceKey: "20300925-03-2", date: "20300925", jcd: "03", raceNo: 2,
    selectedAt: "2030-09-25T00:00:00.000Z", deadlineAt: "2030-09-25T00:10:00.000Z",
    practicalPriorityShadow: { capturedAt: "2030-09-25T00:00:00.000Z", sourceCommit: "a".repeat(40),
      eightTicketPromotionShadow: guard.build(s, { now: NOW }) },
    prediction: { practicalTickets: s.tickets, practicalSelection: s, verificationEvidence: s.verificationEvidence,
      preRaceConditions: { schemaVersion: 4, sourceTiming: "pre_deadline", officialResultUsed: false,
        source: "boatrace-official", sourceFetchedAt: "2030-09-24T23:59:00.000Z" } } };
}
function official(actual = "1-2-5", payout = 980) {
  return { resultSource: "boatrace-official", resultAvailable: true, status: "finished", trifecta: { combination: actual, payout } };
}
function runReport(r, result = official()) { return reporter.build([r], new Map([[r.raceKey, result]])); }
for (const promoted of ["1-2-5", "1-4-5"]) test(`real rescue output restores recorded ${promoted}, not a fixed ticket`, () => {
  const s = selection(promoted), before = JSON.stringify(s), out = guard.build(s);
  assert.equal(out.eligible, true); assert.equal(out.shadowTickets[7], promoted);
  assert.equal(out.baseTickets[7], "1-3-4"); assert.equal(out.shadowTickets.length, 8);
  assert.deepEqual(out.shadowTickets.slice(0, 7), out.baseTickets.slice(0, 7));
  assert.equal(JSON.stringify(s), before); assert.equal(out.affectsTickets, false);
});
for (const n of [0, 5, 6, 7, 9, 10]) test(`${n} tickets remain unchanged`, () => {
  const s = selection(); s.tickets = Array.from({ length: n }, (_, i) => s.tickets[i % 8]);
  const before = JSON.stringify(s), out = guard.build(s);
  assert.equal(out.eligible, false); assert.deepEqual(out.baseTickets, out.shadowTickets);
  assert.equal(JSON.stringify(s), before);
});
const malformed = {
  "skipped selection": s => { s.status = "skipped"; },
  "missing rescue": s => { delete s.expansionSummary.threeCourseEscapeRescueFixed5; },
  "wrong rescue version": s => { s.expansionSummary.threeCourseEscapeRescueFixed5.version = "unknown"; },
  "wrong scenario": s => { s.expansionSummary.threeCourseEscapeRescueFixed5.targetLabel = "4カド攻め"; },
  "wrong current ticket": s => { s.tickets[7].ticket = "6-5-4"; },
  "out-of-range index": s => { s.expansionSummary.threeCourseEscapeRescueFixed5.index = 8; },
  "fractional index": s => { s.expansionSummary.threeCourseEscapeRescueFixed5.index = 1.5; },
  "below existing threshold": s => { s.expansionSummary.candidatePromotionTickets[0].priorityScore = 89.99; },
  "invalid score": s => { s.expansionSummary.candidatePromotionTickets[0].priorityScore = NaN; },
  "unproven promotion": s => { s.expansionSummary.candidatePromotionTickets = []; },
  "ambiguous promotion": s => { s.expansionSummary.candidatePromotionTickets.push({ ...s.expansionSummary.candidatePromotionTickets[0] }); },
  "duplicate promoted ticket": s => { s.tickets[4].ticket = "1-2-5"; },
  "duplicate source": s => { s.tickets[0].ticket = s.tickets[1].ticket; },
  "invalid ticket": s => { s.tickets[0].ticket = "1-1-2"; },
  "protected main row": s => { s.tickets[7].category = "本線"; },
  "protected flow row": s => { s.tickets[7].category = "流し"; }
};
for (const [name, mutate] of Object.entries(malformed)) test(`fails closed: ${name}`, () => {
  const s = selection(); mutate(s); const out = guard.build(s);
  assert.equal(out.eligible, false); assert.deepEqual(out.shadowTickets, out.baseTickets);
});
test("90 is the existing inclusive boundary", () => {
  const s = selection(); s.expansionSummary.candidatePromotionTickets[0].priorityScore = 90;
  assert.equal(guard.build(s).eligible, true);
});
test("result, payout, odds, venue and date do not choose the restored ticket", () => {
  const a = selection(), b = selection(); Object.assign(b, { actualTicket: "6-5-4", payout: 999999, venue: "test", date: "19000101" });
  for (const row of b.tickets) row.odds = 9999;
  assert.deepEqual(guard.build(a, { now: NOW }), guard.build(b, { now: NOW }));
});
test("new sidecar does not change legacy study or browser API", () => {
  const s = selection(), node = priority.build(s);
  const { eightTicketPromotionShadow, ...old } = node;
  assert.deepEqual(plain(old), plain(legacy.build(s)));
  assert.equal(eightTicketPromotionShadow.eligible, true);
  assert.equal(legacy.build(s).eightTicketPromotionShadow, undefined);
});
test("unavailable sidecar cannot interrupt collection", () => {
  const original = Module._load;
  try {
    Module._load = function(request) {
      if (String(request).endsWith("eight-ticket-promotion-shadow.cjs")) throw Error("simulated unavailable");
      return original.apply(this, arguments);
    };
    const out = priority.build(selection()); assert.equal(out.eightTicketPromotionShadow.status, "unavailable");
    const { eightTicketPromotionShadow, ...old } = out;
    assert.deepEqual(plain(old), plain(legacy.build(selection())));
  } finally { Module._load = original; }
});
test("forward report distinguishes activation from observed races", () => {
  const out = runReport(record());
  assert.equal(out.counts.observedEightTicketRaces, 1); assert.equal(out.counts.activatedRaces, 1);
  assert.equal(out.gains, 1); assert.equal(out.losses, 0);
  assert.equal(out.activatedMetrics.A.returnYen, 980); assert.equal(out.activatedMetrics.base.stakeYen, 800);
  assert.equal(out.adoptionStatus, "NOT_APPROVED");
});
test("forward report counts a lost hit", () => {
  const out = runReport(record(), official("1-3-4", 4500)); assert.equal(out.gains, 0); assert.equal(out.losses, 1);
});
for (const [name, mutate] of Object.entries({
  "missing snapshot": r => { delete r.practicalPriorityShadow.eightTicketPromotionShadow; },
  "changed source": r => { r.prediction.practicalTickets[0].ticket = "6-4-2"; },
  "stale capture time": r => { r.practicalPriorityShadow.capturedAt = "2030-09-24T00:00:00Z"; },
  "after-deadline generation": r => { r.practicalPriorityShadow.eightTicketPromotionShadow.createdAt = r.deadlineAt; },
  "before-capture generation": r => { r.practicalPriorityShadow.eightTicketPromotionShadow.createdAt = "2020-01-01T00:00:00Z"; },
  "official result used": r => { r.prediction.preRaceConditions.officialResultUsed = true; },
  "tampered candidate": r => { r.practicalPriorityShadow.eightTicketPromotionShadow.shadowTickets[7] = "6-5-4"; },
  "wrong source commit": r => { r.practicalPriorityShadow.sourceCommit = "main"; }
})) test(`report excludes ${name}`, () => {
  const r = record(); mutate(r); assert.equal(runReport(r).counts.settledRaces, 0);
});
test("void, refunds and unofficial payouts are not ordinary gains", () => {
  for (const result of [{ ...official(), void: true }, { ...official(), refunds: [1] }, { ...official(), resultSource: "untrusted" }, official("1-2-5", 0)])
    assert.equal(runReport(record(), result).counts.settledRaces, 0);
});
test("duplicates are not counted twice and pending stays pending", () => {
  const r = record(), out = reporter.build([r, r], new Map());
  assert.equal(out.counts.observedEightTicketRaces, 1); assert.equal(out.counts.pendingRaces, 1);
  assert.equal(out.counts.settledActivatedRaces, 0);
});
function recordedInputs() {
  const wanted = new Set(["20260922-06-5", "20260922-03-2", "20260923-03-2"]), out = [];
  for (const date of ["20260922", "20260923"]) {
    const data = JSON.parse(fs.readFileSync(path.join(root, "data/predictions", date + ".json"), "utf8"));
    const canonical = require("../scripts/analysis-input-contract").mergePredictionSources(data.predictions || [], data.verificationPredictions || []);
    for (const row of canonical.filter(r => wanted.has(r.raceKey))) {
      const c = row.prediction.preRaceConditions;
      const conditions = Object.fromEntries(["schemaVersion", "sourceTiming", "officialResultUsed", "source", "sourceFetchedAt", "boats", "weather", "dataAvailability", "newEngineMode"].filter(k => k in c).map(k => [k, c[k]]));
      out.push({ raceKey: row.raceKey, date, jcd: row.jcd, place: row.place, raceNo: row.raceNo, selectedAt: row.selectedAt, deadlineAt: row.deadlineAt, conditions });
    }
  }
  assert.equal(out.length, 3); return out;
}
test("current selector -> collector -> compact JSON -> note stays unchanged", () => {
  const collector = require("../scripts/collect-predictions"), generator = require("../js/note-generator");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eight-shadow-integration-"));
  try {
    for (const row of recordedInputs()) {
      const input = { ...row.conditions, entries: row.conditions.boats.map(b => ({ ...b, boat: b.boatNo })), jcd: row.jcd, stadiumCode: row.jcd, venueName: row.place, placeName: row.place, raceNo: row.raceNo, rno: row.raceNo };
      const item = { ...row, capturedAt: row.selectedAt, raceData: input, rawRaceData: input, type: "test", score: 80 };
      const before = collector.buildStoredPrediction(row.date, item, false, row.selectedAt, { practicalPriorityShadowBuilder: s => plain(legacy.build(s)) });
      const after = collector.buildStoredPrediction(row.date, item, false, row.selectedAt);
      const { eightTicketPromotionShadow, ...old } = after.practicalPriorityShadow;
      assert.ok(eightTicketPromotionShadow); assert.deepEqual(old, before.practicalPriorityShadow);
      const { eightTicketExhibitionShadow: beforeC, ...beforeProduction } = before;
      const { eightTicketExhibitionShadow: afterC, ...afterProduction } = after;
      assert.ok(beforeC && afterC, "independent C capture is present on both paths");
      assert.deepEqual({ ...afterProduction, practicalPriorityShadow: old }, beforeProduction, "all production record fields unchanged");
      const compact = collector.compactStoredVerification(collector.detachShadowV2(after));
      const target = path.join(tmp, row.raceKey + ".json"); fs.writeFileSync(target, JSON.stringify(compact));
      const saved = JSON.parse(fs.readFileSync(target, "utf8"));
      assert.deepEqual(saved.prediction.practicalTickets, before.prediction.practicalTickets);
      assert.deepEqual(saved.practicalPriorityShadow.eightTicketPromotionShadow, eightTicketPromotionShadow);
      const prediction = global.createPrediction(input);
      prediction.race = { ...prediction.race, date: row.date, stadiumName: row.place, raceNo: row.raceNo, deadlineAt: row.deadlineAt };
      const a = generator.generateArticle(prediction, { practicalTickets: before.prediction.practicalTickets, publicationPolicy: "all-races-v1" });
      const b = generator.generateArticle(prediction, { practicalTickets: saved.prediction.practicalTickets, publicationPolicy: "all-races-v1" });
      assert.equal(a.ok, true); assert.deepEqual(b, a, "note text and ticket list unchanged");
      assert.deepEqual(b.practicalTickets.map(t => t.ticket), eightTicketPromotionShadow.baseTickets);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test("eligible actual-rescue output survives collector and compact persistence", () => {
  const collector = require("../scripts/collect-predictions"), original = global.ChappyPracticalSelection;
  const s = selection(), frozen = JSON.stringify(s);
  try {
    global.ChappyPracticalSelection = { ...original, select: () => s };
    const r = collector.buildStoredPrediction("20300925", { jcd: "03", place: "test", raceNo: 2,
      deadlineAt: "2030-09-25T00:10:00Z", raceData: {}, type: "test", score: 80 }, false,
      "2030-09-25T00:00:00Z", { createPrediction: () => ({ raceFlow: { title: "3コース攻め" } }), coreApi: {} });
    const saved = plain(collector.compactStoredVerification(r));
    assert.equal(saved.practicalPriorityShadow.eightTicketPromotionShadow.eligible, true);
    assert.equal(saved.practicalPriorityShadow.eightTicketPromotionShadow.shadowTickets[7], "1-2-5");
    assert.equal(saved.prediction.practicalTickets[7].ticket, "1-3-4"); assert.equal(JSON.stringify(s), frozen);
  } finally { global.ChappyPracticalSelection = original; }
});
test("separate shadow cannot alter continuous performance accounting", () => {
  const ledger = require("../scripts/build-continuous-performance-ledger.cjs");
  const r = { ...record(), __analysisRaceKey: "20300925-03-2", __officialResult: official("1-2-5", 980) };
  const before = plain(r); delete before.practicalPriorityShadow;
  assert.deepEqual(ledger.evaluate(r), ledger.evaluate(before)); assert.equal(ledger.evaluate(r).hit, false);
  assert.equal(runReport(r).gains, 1);
});
test("resolved exclusions are not reported as pending", () => {
  const out = runReport(record(), { ...official(), void: true });
  assert.equal(out.counts.pendingRaces, 0); assert.equal(out.counts.resolvedExcludedRaces, 1);
});
test("preload is idempotent and never wraps production selector", () => {
  const preload = require("../scripts/eight-ticket-promotion-preload.cjs");
  assert.equal(preload.wrap(priority), priority);
  const selector = require("../js/practical-selection"), original = selector.select;
  require("../scripts/eight-ticket-promotion-preload.cjs"); assert.equal(selector.select, original);
});
