"use strict";
// Only sidecars actually saved before the deadline. Never backfill a study.
const fs = require("node:fs"), path = require("node:path");
const input = require("./analysis-input-contract");
const guard = require("./eight-ticket-promotion-shadow.cjs");
function metrics(rows, side) {
  const stakeYen = rows.reduce((sum, r) => sum + r[side].length * 100, 0);
  const winners = rows.filter(r => r[side].includes(r.actual));
  const returnYen = winners.reduce((sum, r) => sum + r.payout, 0);
  return { races: rows.length, hits: winners.length, stakeYen, returnYen, profitYen: returnYen - stakeYen,
    hitRate: rows.length ? Math.round(winners.length / rows.length * 10000) / 100 : null,
    roi: stakeYen ? Math.round(returnYen / stakeYen * 10000) / 100 : null };
}
function validate(record) {
  const parent = record?.practicalPriorityShadow, snapshot = parent?.eightTicketPromotionShadow;
  if (!snapshot) return { reason: "not-captured" };
  if (snapshot.version !== guard.POLICY.id || snapshot.logicFingerprint !== guard.FINGERPRINT ||
      snapshot.automaticApplication !== false || snapshot.usableForPrediction !== false ||
      snapshot.affectsTickets !== false || snapshot.affectsPrediction !== false) return { reason: "invalid-contract" };
  const reason = input.preDeadlineReason(record); if (reason) return { reason };
  if (parent.capturedAt !== record.selectedAt || !/^[a-f0-9]{40}$/.test(parent.sourceCommit || "")) return { reason: "source-identity-mismatch" };
  const created = Date.parse(snapshot.createdAt), captured = Date.parse(record.selectedAt), deadline = Date.parse(record.deadlineAt);
  if (!Number.isFinite(created) || created < captured || created >= deadline) return { reason: "not-created-pre-deadline" };
  const p = record.prediction || {};
  const selection = { ...(p.practicalSelection || {}), tickets: p.practicalTickets,
    verificationEvidence: p.practicalSelection?.verificationEvidence || p.verificationEvidence };
  const replay = guard.build(selection, { now: snapshot.createdAt });
  if (JSON.stringify(replay) !== JSON.stringify(snapshot)) return { reason: "snapshot-does-not-match-saved-selection" };
  if (snapshot.baseTickets.length !== 8) return { reason: "outside-eight-ticket-scope" };
  if (!["eligible", "no-rescue-collision", "no-unique-promoted-source", "promotion-not-eligible"].includes(snapshot.status)) return { reason: "invalid-selection-evidence" };
  return { snapshot };
}
function build(records = [], officialResults = new Map()) {
  const excluded = {}, rows = [], observed = [], seen = new Set();
  let pendingRaces = 0, resolvedExcludedRaces = 0;
  const skip = reason => { excluded[reason] = (excluded[reason] || 0) + 1; };
  for (const record of records) {
    const key = input.raceKey(record);
    if (!key || seen.has(key)) { skip("invalid-or-duplicate-race"); continue; } seen.add(key);
    const checked = validate(record); if (checked.reason) { skip(checked.reason); continue; }
    const s = checked.snapshot; observed.push({ raceKey: key, eligible: s.eligible });
    const result = officialResults.get(key);
    if (!result || (result.resultAvailable !== true && result.status !== "void" && !result.void)) { pendingRaces++; continue; }
    if (result.void || result.status === "void" || result.refund || result.refunded || result.refunds?.length ||
        result.starts?.some(x => x.falseStart || x.lateStart)) { skip("void-or-refund"); resolvedExcludedRaces++; continue; }
    const actual = input.actualTicket(result), payout = result.trifecta?.payout;
    if (!input.isOfficialResultSource(result) || result.resultAvailable !== true || result.status !== "finished" ||
        !guard.validTicket(actual) || !Number.isFinite(payout) || payout <= 0) { skip("invalid-official-result"); resolvedExcludedRaces++; continue; }
    rows.push({ raceKey: key, selectedAt: record.selectedAt, sourceCommit: record.practicalPriorityShadow.sourceCommit,
      sourceGeneration: s.sourceGeneration, base: s.baseTickets, A: s.shadowTickets,
      eligible: s.eligible, replacement: s.replacement, actual, payout });
  }
  const changed = rows.filter(r => r.eligible);
  return { version: "eight-ticket-promotion-shadow-report-v1", generatedAt: new Date().toISOString(),
    policy: guard.POLICY, logicFingerprint: guard.FINGERPRINT,
    productionChanged: false, automaticApplication: false, usableForPrediction: false,
    adoptionStatus: "NOT_APPROVED", interpretation: "prospective saved sidecars only; not proof of future profit",
    counts: { observedEightTicketRaces: observed.length, activatedRaces: observed.filter(x => x.eligible).length,
      settledRaces: rows.length, settledActivatedRaces: changed.length, pendingRaces, resolvedExcludedRaces },
    allEightTicketMetrics: { base: metrics(rows, "base"), A: metrics(rows, "A") },
    activatedMetrics: { base: metrics(changed, "base"), A: metrics(changed, "A") },
    gains: changed.filter(r => !r.base.includes(r.actual) && r.A.includes(r.actual)).length,
    losses: changed.filter(r => r.base.includes(r.actual) && !r.A.includes(r.actual)).length,
    byGeneration: [...new Set(rows.map(r => r.sourceGeneration))].map(g => ({ generation: g,
      base: metrics(rows.filter(r => r.sourceGeneration === g), "base"), A: metrics(rows.filter(r => r.sourceGeneration === g), "A") })), excluded, rows };
}
function main(root = path.resolve(__dirname, "..")) {
  const dir = path.join(root, "data/predictions"), records = [];
  for (const name of fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n) && n.slice(0, 8) >= guard.POLICY.firstCaptureDate).sort()) {
    const text = fs.readFileSync(path.join(dir, name), "utf8"); if (!text.includes('"eightTicketPromotionShadow"')) continue;
    const data = JSON.parse(text), canonical = input.mergePredictionSources(data.predictions || [], data.verificationPredictions || []);
    records.push(...canonical.filter(r => r.practicalPriorityShadow?.eightTicketPromotionShadow));
  }
  const results = new Map();
  for (const date of new Set(records.map(r => input.raceKey(r).slice(0, 8)))) {
    const file = path.join(root, "data/results", date + ".json"); if (!fs.existsSync(file)) continue;
    for (const row of JSON.parse(fs.readFileSync(file, "utf8")).races || []) {
      const key = input.raceKey(row, date); if (key) results.set(key, row);
    }
  }
  const report = build(records, results), out = path.join(root, "data/stats/eight-ticket-promotion-shadow-report.json");
  fs.mkdirSync(path.dirname(out), { recursive: true }); const temporary = out + "." + process.pid + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + "\n"); fs.renameSync(temporary, out);
  console.log(JSON.stringify({ counts: report.counts, gains: report.gains, losses: report.losses, adoptionStatus: report.adoptionStatus }));
  return report;
}
if (require.main === module) main();
module.exports = { metrics, validate, build, main };
