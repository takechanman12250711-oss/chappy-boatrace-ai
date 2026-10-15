"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), zlib = require("node:zlib");
const source = require("../scripts/eight-ticket-promotion-report-source.cjs");
const archive = require("../scripts/daily-prediction-source-archive");
const DATE = "20300925", FIRST = "20260925";
function temp(t) { const r = fs.mkdtempSync(path.join(os.tmpdir(), "eight-source-")); t.after(() => fs.rmSync(r, { recursive: true, force: true })); return r; }
function write(root, p, value) { const f = path.join(root, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)); }
function row() {
  const tickets = ["3-1-5", "3-2-5", "3-1-6", "1-2-3", "1-2-4", "3-2-1", "3-2-6", "1-3-4"].map((ticket, i) => ({ ticket, category: i === 7 ? "検証済み救済" : "本線" }));
  const selection = { status: "selected", tickets,
    expansionSummary: { candidatePromotionTickets: [{ ticket: "1-2-5", priorityScore: 92 }],
      threeCourseEscapeRescueFixed5: { applied: true, version: "historical-fixture",
        targetLabel: "3コース攻め", index: 7, ticket: "1-3-4", replacedTicket: "1-2-5" } },
    verificationEvidence: { generation: { logicFingerprint: "evaluated-scenarios-v1", confidenceDefinitionVersion: "internal-score-v1", ticketPolicyVersion: "fixture" } } };
  return { raceKey: DATE + "-03-2", date: DATE, jcd: "03", raceNo: 2,
    selectedAt: "2030-09-25T00:00:00.000Z", deadlineAt: "2030-09-25T00:10:00.000Z",
    practicalPriorityShadow: { capturedAt: "2030-09-25T00:00:00.000Z", sourceCommit: "a".repeat(40),
      eightTicketPromotionShadow: { historicalFixture: true } },
    prediction: { practicalSelection: selection, practicalTickets: tickets, verificationEvidence: selection.verificationEvidence,
      preRaceConditions: { schemaVersion: 4, sourceTiming: "pre_deadline", officialResultUsed: false,
        source: "boatrace-official", sourceFetchedAt: "2030-09-24T23:59:00.000Z" } } };
}
function daily(r = row(), date = DATE) { return { date, updatedAt: "2030-09-25T00:02:00.000Z", predictions: [], verificationPredictions: [r] }; }
function stored(root, data = daily()) {
  const raw = Buffer.from(JSON.stringify(data)), compressed = zlib.gzipSync(raw);
  const meta = archive.metadataFor({ date: data.date, raw, archive: compressed, parsed: data });
  write(root, `data/predictions/source-archives/${data.date}.json.gz`, compressed);
  write(root, `data/predictions/source-archives/${data.date}.meta.json`, meta); return meta;
}
test("empty repository remains an empty observation", t => {
  const out = source.load(temp(t), FIRST); assert.equal(out.records.length, 0); assert.equal(out.diagnostics.complete, true);
});
test("raw-only day is loaded", t => {
  const root = temp(t); write(root, `data/predictions/${DATE}.json`, daily());
  const out = source.load(root, FIRST); assert.equal(out.records.length, 1); assert.equal(out.diagnostics.sources[0].source, "raw");
});
test("archive-only day is not silently omitted", t => {
  const root = temp(t); stored(root); const out = source.load(root, FIRST);
  assert.equal(out.records.length, 1); assert.equal(out.diagnostics.capturedRaces, 1);
  assert.equal(out.diagnostics.sources[0].source, "archive"); assert.equal(fs.existsSync(path.join(root, `data/predictions/${DATE}.json`)), false);
});
test("compact raw and complete archive count the same race once", t => {
  const root = temp(t); stored(root); const data = daily(); data.verificationPredictions = [];
  write(root, `data/predictions/${DATE}.json`, data); const out = source.load(root, FIRST);
  assert.equal(out.records.length, 1); assert.equal(out.diagnostics.capturedRaces, 1);
});
test("strictly newer raw is not overwritten by stale archive", t => {
  const root = temp(t); stored(root); const data = daily(); data.updatedAt = "2030-09-25T00:03:00.000Z";
  data.verificationPredictions = []; write(root, `data/predictions/${DATE}.json`, data);
  const out = source.load(root, FIRST); assert.equal(out.records.length, 0); assert.equal(out.diagnostics.sources[0].source, "raw");
});
test("primary records remain preferred over verification duplicates", t => {
  const root = temp(t), data = daily(); const primary = row(); delete primary.practicalPriorityShadow;
  data.predictions = [primary]; stored(root, data); const out = source.load(root, FIRST);
  assert.equal(out.records.length, 1); assert.equal(out.diagnostics.withoutSnapshotRaces, 1);
});
test("missing snapshots are counted without retrospective backfill", t => {
  const root = temp(t), r = row(); delete r.practicalPriorityShadow; const data = daily(r);
  stored(root, data); const out = source.load(root, FIRST); assert.equal(out.diagnostics.withoutSnapshotRaces, 1);
  assert.equal(out.records[0].practicalPriorityShadow, undefined);
});
test("dates before first capture are excluded", t => {
  const root = temp(t); stored(root, daily(row(), "20260924")); assert.deepEqual(source.dates(root, FIRST), []);
});
for (const missing of ["meta.json", "json.gz"]) test(`incomplete archive ${missing} is an explicit source error`, t => {
  const root = temp(t); stored(root); fs.unlinkSync(path.join(root, `data/predictions/source-archives/${DATE}.${missing}`));
  const out = source.load(root, FIRST); assert.equal(out.diagnostics.complete, false); assert.equal(out.diagnostics.errors.length, 1);
});
test("corrupt archive cannot become zero valid observations", t => {
  const root = temp(t); stored(root); write(root, `data/predictions/source-archives/${DATE}.json.gz`, "corrupt");
  const out = source.load(root, FIRST); assert.equal(out.diagnostics.complete, false);
  assert.match(out.diagnostics.errors[0].message, /fingerprint/);
});
test("restored payload hash must match metadata", t => {
  const root = temp(t), meta = stored(root); meta.sourceSha256 = "0".repeat(64);
  write(root, `data/predictions/source-archives/${DATE}.meta.json`, meta);
  assert.match(source.load(root, FIRST).diagnostics.errors[0].message, /source-fingerprint/);
});
test("malformed raw is an explicit error", t => {
  const root = temp(t); write(root, `data/predictions/${DATE}.json`, "not json");
  assert.equal(source.load(root, FIRST).diagnostics.complete, false);
});
test("day identity mismatch is not accepted", t => {
  const root = temp(t); write(root, `data/predictions/${DATE}.json`, daily(row(), "20300926"));
  assert.match(source.load(root, FIRST).diagnostics.errors[0].message, /invalid-daily/);
});
test("one corrupt day does not discard the other day or claim completeness", t => {
  const root = temp(t); stored(root); write(root, "data/predictions/20300926.json", "broken");
  const out = source.load(root, FIRST); assert.equal(out.records.length, 1); assert.equal(out.diagnostics.complete, false);
});
test("reading never changes original inputs or sidecars", t => {
  const root = temp(t); stored(root); const file = path.join(root, `data/predictions/source-archives/${DATE}.json.gz`);
  const before = fs.readFileSync(file); source.load(root, FIRST); assert.deepEqual(fs.readFileSync(file), before);
});
test("retired A/C comparisons no longer run after collection or results", () => {
  const w = fs.readFileSync(path.join(__dirname, "../.github/workflows/build-continuous-performance-ledger.yml"), "utf8");
  assert.doesNotMatch(w, /capture-report:|Collect automatic race predictions|build-eight-ticket-/);
  assert.match(w, /Collect official race results/);
  assert.match(w, /build-four-stage-miss-diagnosis/);
  assert.match(w, /build-hit-first-practical-report/);
  const collector = fs.readFileSync(path.join(__dirname, '../scripts/collect-predictions.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../js/frame-rise-fall-replay-preload.js'), 'utf8');
  assert.doesNotMatch(collector, /withEightTicketExhibitionShadow|eight-ticket-exhibition-shadow/);
  assert.doesNotMatch(preload, /eight-ticket-promotion-preload/);
});
