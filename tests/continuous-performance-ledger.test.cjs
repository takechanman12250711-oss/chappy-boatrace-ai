'use strict';
const assert = require('node:assert/strict');
const mod = require('../scripts/build-continuous-performance-ledger.cjs');
const f = require('./helpers/report-input-fixture.cjs');
f.withArchive(root => {
  const records = Array.from({ length: 108 }, (_, i) => f.prediction(i % 12 + 1, '20261003', String(Math.floor(i / 12) + 1).padStart(2, '0')));
  records[0].prediction.practicalTickets = [];
  records[0].prediction.practicalSelection.tickets = ['1-2-3']; // Empty primary list is authoritative.
  records[1].prediction.practicalTickets = ['1-2-3', '1-2-4', '1-2-5', '1-2-6', '1-3-2', '1-3-4', '1-3-5', '1-3-6', '1-4-2', '1-4-3', '1-4-5'];
  records[2].selectedAt = records[2].deadlineAt;
  records[3].prediction.practicalTickets = [{ ticket: '1-2-3', amountYen: 9000 }, '1-2-3', '1-2-4'];
  records[4].prediction.verificationEvidence.generation.logicFingerprint = 'generation-2';
  records[5].prediction.verificationEvidence = {}; // Truthy evidence prevents fallback.
  records[5].prediction.practicalSelection.verificationEvidence = { generation: records[4].prediction.verificationEvidence.generation };
  const verification = [f.clone(records[0]), f.clone(records[2])];
  verification[0].prediction.practicalTickets = ['1-2-3']; verification[1].selectedAt = '2026-10-03T05:00:00Z';
  const races = records.map(r => f.official(r)); races[6].source = 'untrusted'; races[7].resultAvailable = false;
  records[8].__officialResult = { trifecta: { combination: '6-5-4', payout: 99999 } };
  f.saveDay(root, '20261003', records, verification, races);
  const r = f.parity(mod, root);
  assert.equal(r.productionChanged, false); assert.equal(r.policy.fixedTheoryABUnaffected, true);
  assert.equal(r.cumulative.races, 103); assert.equal(r.rolling100.races, 100);
  assert.equal(r.cumulative.hits, 103); assert.equal(r.cumulative.stakeYen, 10400); assert.equal(r.cumulative.returnYen, 123600);
  assert.equal(r.diagnostics.invalidPracticalTicketCount, 1); assert.equal(r.diagnostics.missingPracticalTicketCount, 1);
  assert.equal(r.generationBreakdown.length, 3);
  assert.equal(r.generationBreakdown.reduce((n, row) => n + row.races, 0), 103);
  assert.equal(r.rows.find(row => row.raceKey === records[8].raceKey).actualTicket, '1-2-3');
});
console.log('continuous performance ledger: deterministic parity, generation, accounting, rolling 100 passed');
