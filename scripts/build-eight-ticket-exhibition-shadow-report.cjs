"use strict";
// Separate C ledger. Read existing captures; never regenerate a missing sidecar.
const fs = require("node:fs"), path = require("node:path");
const input = require("./analysis-input-contract");
const guard = require("./eight-ticket-exhibition-shadow.cjs");
const { metrics } = require("./build-eight-ticket-promotion-shadow-report.cjs");
const VALID_STATUSES = new Set(["eligible", "no-strong-escape-trim", "no-concentrated-promotions", "ineligible-promotion",
  "exhibition-or-official-course-incomplete", "head-not-official-inner-course", "candidate-pool-not-recorded", "no-qualified-alternative"]);
function validate(record) {
  const s = record?.eightTicketExhibitionShadow;
  if (!s) return { reason: "not-captured" };
  if (s.version !== guard.POLICY.id || s.logicFingerprint !== guard.FINGERPRINT || s.automaticApplication !== false ||
      s.usableForPrediction !== false || s.affectsTickets !== false || s.affectsPrediction !== false)
    return { reason: "invalid-contract" };
  const replay = guard.capture(record, { now: s.createdAt });
  if (JSON.stringify(replay) !== JSON.stringify(s)) return { reason: "snapshot-input-or-identity-mismatch" };
  if (s.status === "outside-eight-ticket-scope") return { reason: s.status };
  if (!VALID_STATUSES.has(s.status) || s.baseTickets.length !== 8) return { reason: s.status || "invalid-capture" };
  return { snapshot: s };
}
function build(records = [], officialResults = new Map()) {
  const rows = [], observed = [], excluded = {}, statusCounts = {}, seen = new Set();
  let pendingRaces = 0, resolvedExcludedRaces = 0;
  const skip = reason => { excluded[reason] = (excluded[reason] || 0) + 1; };
  for (const record of records) {
    const key = input.raceKey(record);
    if (!key || seen.has(key)) { skip("invalid-or-duplicate-race"); continue; } seen.add(key);
    const checked = validate(record); if (checked.reason) { skip(checked.reason); continue; }
    const s = checked.snapshot; observed.push({ raceKey: key, eligible: s.eligible });
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    const result = officialResults.get(key);
    if (!result || (result.resultAvailable !== true && result.status !== "void" && !result.void)) { pendingRaces++; continue; }
    if (result.void || result.status === "void" || result.refund || result.refunded || result.refunds?.length ||
        result.starts?.some(x => x.falseStart || x.lateStart)) { skip("void-or-refund"); resolvedExcludedRaces++; continue; }
    const actual = input.actualTicket(result), payout = result.trifecta?.payout, resultKey = input.raceKey(result);
    if (!input.isOfficialResultSource(result) || result.resultAvailable !== true || result.status !== "finished" ||
        !guard.validTicket(actual) || !Number.isFinite(payout) || payout <= 0 || (resultKey && resultKey !== key) ||
        input.normalizeTicket(result.trifecta) !== actual) { skip("invalid-official-result"); resolvedExcludedRaces++; continue; }
    rows.push({ raceKey: key, selectedAt: record.selectedAt, sourceCommit: s.sourceCommit, sourceGeneration: s.sourceGeneration,
      base: s.baseTickets, C: s.shadowTickets, eligible: s.eligible, replacement: s.replacement, actual, payout });
  }
  rows.sort((a, b) => Date.parse(a.selectedAt) - Date.parse(b.selectedAt) || a.raceKey.localeCompare(b.raceKey));
  const changed = rows.filter(r => r.eligible);
  return { version: "eight-ticket-exhibition-shadow-report-v1", generatedAt: new Date().toISOString(),
    policy: guard.POLICY, logicFingerprint: guard.FINGERPRINT, productionChanged: false,
    automaticApplication: false, usableForPrediction: false, adoptionStatus: "NOT_APPROVED",
    interpretation: "C prospective saved captures only; historical analysis and A are not pooled; no automatic adoption",
    counts: { observedEightTicketRaces: observed.length, activatedRaces: observed.filter(r => r.eligible).length,
      settledRaces: rows.length, settledActivatedRaces: changed.length, pendingRaces, resolvedExcludedRaces },
    statusCounts, allEightTicketMetrics: { base: metrics(rows, "base"), C: metrics(rows, "C") },
    activatedMetrics: { base: metrics(changed, "base"), C: metrics(changed, "C") },
    gains: changed.filter(r => !r.base.includes(r.actual) && r.C.includes(r.actual)).length,
    losses: changed.filter(r => r.base.includes(r.actual) && !r.C.includes(r.actual)).length,
    excluded, rows };
}
function main(root = path.resolve(__dirname, "..")) {
  const loaded = require("./eight-ticket-promotion-report-source.cjs").load(root, guard.POLICY.firstCaptureDate);
  const results = new Map();
  for (const date of new Set(loaded.records.map(r => input.raceKey(r).slice(0, 8)))) {
    const file = path.join(root, "data/results", date + ".json"); if (!fs.existsSync(file)) continue;
    for (const result of JSON.parse(fs.readFileSync(file, "utf8")).races || []) {
      const key = input.raceKey(result, date); if (key) results.set(key, result);
    }
  }
  const report = build(loaded.records, results), d = loaded.diagnostics;
  const captured = loaded.records.filter(r => r.eightTicketExhibitionShadow);
  report.sourceDiagnostics = { complete: d.complete, sources: d.sources, errors: d.errors,
    canonicalRaces: loaded.records.length, capturedRaces: captured.length,
    withoutSnapshotRaces: loaded.records.length - captured.length };
  const out = path.join(root, "data/stats/eight-ticket-exhibition-shadow-report.json"), temporary = out + "." + process.pid + ".tmp";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + "\n"); fs.renameSync(temporary, out);
  console.log(JSON.stringify({ sourceDiagnostics: report.sourceDiagnostics, counts: report.counts, gains: report.gains,
    losses: report.losses, adoptionStatus: report.adoptionStatus }));
  if (!d.complete) throw Error("C report source incomplete; partial diagnostic report saved");
  return report;
}
if (require.main === module) main();
module.exports = { validate, build, main };
