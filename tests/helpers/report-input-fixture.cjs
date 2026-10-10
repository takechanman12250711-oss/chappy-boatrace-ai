'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const clone = value => JSON.parse(JSON.stringify(value));
function analysis(boatNo, overrides = {}) {
  return { boatNo, indexes: { raceFlow: 40, st: 40, exhibition: 40, local: 40, turn: 40, national: 40, motor: 40, ...overrides.indexes },
    roleScores: { attack: 40, hold: 40, pickup: 40, ...overrides.roleScores }, courseStructureTheory: { appliedIndex: overrides.courseIndex ?? 40 } };
}
function prediction(raceNo = 1, date = '20261003', jcd = '20') {
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return { raceKey: `${date}-${jcd}-${raceNo}`, date, jcd, raceNo,
    selectedAt: `${iso}T05:00:00Z`, deadlineAt: `${iso}T06:00:00Z`,
    prediction: {
      preRaceConditions: { schemaVersion: 4, source: 'boatrace-official', sourceTiming: 'pre_deadline', sourceFetchedAt: `${iso}T05:00:00Z`, officialResultUsed: false, boats: [] },
      practicalTickets: ['1-2-3'],
      candidate24Tickets: ['1-4-3', '1-3-2', '1-4-3', '1-5-2', '1-6-2', '1-2-3'],
      mainSheet: { honmei: { boatNo: 1 } },
      boatEvaluation: { evaluations: [2, 3, 4, 5, 6].map(boatNo => ({ boatNo, hold: 70, expected: 70, attack: 70, pickup: 70 })) },
      verificationEvidence: { generation: { logicFingerprint: 'generation-1', confidenceDefinitionVersion: 'confidence-1', ticketPolicyVersion: 'tickets-1' } },
      practicalSelection: { frameRiseFallReplayBasis: { analyses: [
        analysis(1, { indexes: { raceFlow: 80, st: 50, exhibition: 50 }, roleScores: { attack: 50 }, courseIndex: 90 }),
        analysis(2), analysis(3, { indexes: { raceFlow: 60, st: 51, exhibition: 56 }, roleScores: { attack: 53 }, courseIndex: 70 }),
        analysis(4), analysis(5), analysis(6)
      ] } }
    } };
}
function official(record, ticket = '1-2-3', payout = 1200) {
  return { date: record.date, jcd: record.jcd, raceNo: record.raceNo, source: 'boatrace-official', resultAvailable: true, status: 'finished', trifecta: { combination: ticket, payout } };
}
function withArchive(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-compaction-'));
  fs.mkdirSync(path.join(root, 'data/predictions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data/results'), { recursive: true });
  try { return run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function saveDay(root, date, predictions, verificationPredictions = [], races = predictions.map(r => official(r))) {
  fs.writeFileSync(path.join(root, 'data/predictions', `${date}.json`), JSON.stringify({ predictions, verificationPredictions }));
  fs.writeFileSync(path.join(root, 'data/results', `${date}.json`), JSON.stringify({ date, races }));
}
function comparable(report) { const copy = clone(report); delete copy.generatedAt; return copy; }
function parity(mod, root) {
  const before = snapshot(root);
  const full = comparable(mod.build({ root, compactPredictionRecord: null }));
  const compact = comparable(mod.build({ root }));
  assert.deepEqual(compact, full, 'all report fields and diagnostics must remain identical');
  assert.deepEqual(snapshot(root), before, 'build must not mutate any source bytes');
  const dirs = { root: path.join(root, 'unused-root'), predictionsDir: path.join(root, 'data/predictions'), resultsDir: path.join(root, 'data/results') };
  assert.deepEqual(comparable(mod.build(dirs)), compact, 'explicit source directories must work');
  return compact;
}
function snapshot(root) {
  return Object.fromEntries(['predictions', 'results'].flatMap(dir => fs.readdirSync(path.join(root, 'data', dir)).map(name => [dir + '/' + name, fs.readFileSync(path.join(root, 'data', dir, name), 'utf8')])));
}
module.exports = { clone, analysis, prediction, official, withArchive, saveDay, comparable, parity };
