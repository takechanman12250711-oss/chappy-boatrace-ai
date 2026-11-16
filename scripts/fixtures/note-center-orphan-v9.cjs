'use strict';

// Ticket-only derivative of immutable 20-9 source
// cfa2c59b91b7b4e1e44435cc873cb7e41d598406b487796306489500be9433bf.
// Metadata/prose are synthetic. This fixture is never publication evidence.
const { fixture } = require('../note-independent-monitor-fixture');
const practical = ['3-1-5','3-2-5','3-1-6','1-2-3','1-2-4','3-2-1','3-2-6','4-1-2','3-1-4','1-3-4'];
const pools = [
  ['3-1-5','3-2-5','3-1-6','3-2-6'],
  ['1-2-3','1-2-4','1-2-5','1-2-6','1-4-3','1-4-5','1-4-6','1-3-4'],
  ['3-1-2','3-1-4','3-1-5','3-1-6','3-2-1','3-2-4','3-2-5','3-2-6'],
  ['5-1-4','5-1-2','5-4-1','5-4-2','5-2-1','5-2-4','6-1-4','6-1-2','6-4-1','6-4-2','6-2-1','6-2-4','5-1-6','5-2-6','4-2-3','4-2-5']
];
const reference = ['4-1-2','4-1-5','5-1-3','5-4-3'];
const clone = value => structuredClone(value);
function normalBundle({ orphan = true, count = 10 } = {}) {
  const b = fixture(); b.version = 'note-draft-bundle-v1';
  delete b.monitor; delete b.record.source;
  const tickets = count > 10 ? [...practical, '4-1-6'] : practical.slice(0, count);
  const rows = tickets.map(ticket => ({ ticket, odds: 20,
    category: ticket === '4-1-2' ? '独立展開' : '本命',
    source: ticket === '4-1-2' ? 'preserved-alternate-attack-scenario' : 'saved-fixture-pool' }));
  const p = b.record.prediction;
  Object.assign(p, { date: b.record.date, confidence: 84,
    race: { date: b.record.date, stadiumName: b.record.place, raceNo: b.record.raceNo, raceInfo: { deadline: '17:29' } },
    practicalTickets: clone(rows),
    mainSheet: { honmei: { boatNo: 3, name: 'テスト選手', score: 84 },
      evaluations: [1,2,3,4,5,6].map(boatNo => ({ boatNo, name: 'テスト選手', score: 84 })),
      tickets: clone(pools[0]), coverTickets: clone(orphan ? pools[1] : [...pools[1], '4-1-2']), flowTickets: clone(pools[2]) },
    manshuSheet: { tickets: clone(pools[3]) },
    raceFlow: { title: '保存した展開', summary: '保存した展開を参考に考えます。' }
  });
  b.baselinePracticalTickets = clone(rows);
  b.article = require('../../js/note-generator').generateArticle(p, { practicalTickets: rows.slice(0, 10) });
  if (!b.article.ok) throw Error('synthetic_note_fixture_generation_failed');
  if (count > 10) b.article.practicalTickets = clone(rows);
  p.manshuSheet.forecastLedger = { forecasts: reference.map(ticket => ({ formation: { notation: ticket, expandedTickets: [{ ticket }] } })) };
  b.article.paidText += '\n\n本命とは別会計の参考予想\n' + reference.map(ticket => '・' + ticket).join('\n');
  b.article.fullText = [b.article.freeText, b.article.paywallMarker, b.article.paidText,
    '※舟券の購入は自己責任で、無理のない範囲でお楽しみください。', b.article.tags.join(' ')].join('\n\n');
  b.capturedAt = b.record.selectedAt;
  b.maxPracticalTickets = 10; b.minLeadSeconds = 120;
  return b;
}
module.exports = { normalBundle, practical, pools, reference };
