'use strict';
// Run in the existing audit workflow against every saved daily input. No
// regeneration/backfill: compare every field the report reads before retaining.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const input = require('../scripts/analysis-input-contract.js');
const { collectTicketPool } = require('../scripts/analyze-ticket-expansion-7-12-18-24.cjs');
const { compactFourStageRecord } = require('../scripts/report-input-projection.cjs');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = [];
let rows = 0, candidateItems = 0;
for (const name of fs.readdirSync(path.join(root, 'data/predictions')).filter(n => /^\d{8}\.json$/.test(n)).sort()) {
  const filename = path.join(root, 'data/predictions', name);
  const bytes = fs.readFileSync(filename), sha256 = hash(bytes);
  const doc = JSON.parse(bytes.toString('utf8'));
  let fileRows = 0;
  for (const source of ['predictions', 'verificationPredictions']) {
    for (const raw of Array.isArray(doc[source]) ? doc[source] : []) {
      const compact = compactFourStageRecord(raw);
      assert.equal(input.raceKey(compact), input.raceKey(raw), name + ': race identity');
      assert.equal(input.preDeadlineReason(compact), input.preDeadlineReason(raw), name + ': eligibility');
      const pool = collectTicketPool(raw);
      assert.deepEqual(collectTicketPool(compact), pool, name + ': full saved pool/order/scores');
      candidateItems += pool.length; rows++; fileRows++;
    }
  }
  assert.equal(hash(fs.readFileSync(filename)), sha256, name + ': source unchanged');
  manifest.push({ path: 'data/predictions/' + name, sha256, bytes: bytes.length, rows: fileRows });
}
assert.ok(manifest.length > 0 && rows > 0, 'actual saved predictions required');
process.stdout.write(JSON.stringify({ schemaVersion: 1, check: 'ticket-miss-attribution-source-projection-parity',
  generatedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  complete: true, sourceUnchanged: true, files: manifest.length, rows, candidateItems,
  checks: ['race-key', 'pre-deadline-eligibility', 'complete-saved-pool-order-and-scores'], manifest,
  productionChanged: false, automaticApplication: false, usableForPrediction: false }, null, 2) + '\n');
