'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const c = require('./compare-official-stat-slots.cjs');
test('candidate removes only the two stat overwrites', () => {
  for (const name of ['history-insights-base', 'motor-maintenance-insights']) {
    const source = fs.readFileSync(`js/${name}.js`, 'utf8'), changed = c.officialStatsSource(name, source);
    assert.ok(changed.length < source.length && source.length - changed.length < 60);
  }
  assert.equal(c.officialStatsSource('ai-core', 'x'), 'x');
});
test('official numbers come from the saved official row text, identifiers untouched', () => {
  const raw = '2 3828 / B1 明石 正之 兵庫/兵庫 53歳/52.0kg F1 L0 0.16 4.94 21.84 47.13 4.88 24.00 48.00 42 34.62 65.38 39 33.10 46.90 8R';
  const entry = { boat: 2, registerNo: '3828', boatNo: 39, motorNo: 42, localWinRate: 5.82, motor2Rate: 29.4, motorRate: 29.4, rawBlock: raw };
  const row = { conditions: { escapeEvaluationEvidence: { entries: [entry] } } };
  const out = c.withOfficialStats(row).conditions.escapeEvaluationEvidence.entries[0];
  assert.equal(out.localWinRate, 4.88); assert.equal(out.motor2Rate, 34.62); assert.equal(out.boat2Rate, 33.1);
  assert.equal(out.boatNo, 39); assert.equal(out.motorNo, 42); assert.equal(out.motorRate, undefined);
  assert.equal(entry.localWinRate, 5.82, 'saved input stays unchanged');
  assert.throws(() => c.withOfficialStats({ conditions: { escapeEvaluationEvidence: { entries: [{ ...entry, rawBlock: '' }] } } }), /official-row-unavailable/);
});
