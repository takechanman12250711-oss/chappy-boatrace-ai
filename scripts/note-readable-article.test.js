'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readableArticle, ticketsIn } = require('./note-readable-article');
const { fixture } = require('./note-independent-monitor-fixture');
test('independent original remains immutable, reasons move before the paywall', () => {
  for (const kind of ['escape', 'manshu']) {
    const b = fixture(); b.monitor.kind = kind;
    const before = JSON.stringify(b), a = readableArticle(b.article, b);
    assert.equal(JSON.stringify(b), before);
    assert.ok(a.freeText.includes('元の理由を短縮・差し替えしない。'));
    assert.deepEqual(ticketsIn(a.freeText), []);
    assert.deepEqual(ticketsIn(a.paidText), ['1-2-3', '1-2-4']);
    assert.ok(a.paidText.includes('・1-2-3・4'));
    assert.ok(!a.paidText.includes('・1-2-34'));
    assert.ok(a.freeText.includes('中心の買い目 2点'));
    assert.equal(a.fullText.split(a.paywallMarker).length, 2);
  }
});
test('overlapping candidate pools and reference tickets are each shown once; none are invented or lost', () => {
  const b = fixture(); b.version = 'note-draft-bundle-v1';
  b.record.prediction.mainSheet = { tickets: ['1-2-3', '1-3-2'], coverTickets: ['1-3-2', '1-4-2'], flowTickets: ['2-1-3'] };
  b.record.prediction.manshuSheet = { tickets: ['2-1-3', '4-1-2'] };
  b.record.prediction.raceFlow = { summary: '1号艇の逃げを軸に、差しが届く展開も考えます。' };
  b.article.paidText = '🔥 実戦厳選\n\n・1-2-34\n\n計 2点\n\n本命とは別会計の参考予想\n・4-1-2\n・5-1-2';
  const before = JSON.stringify(b), a = readableArticle(b.article, b);
  const shown = ticketsIn(a.paidText);
  assert.deepEqual(shown, ['1-2-3','1-2-4','1-3-2','1-4-2','2-1-3','4-1-2','5-1-2']);
  assert.equal(new Set(shown).size, shown.length);
  assert.equal(JSON.stringify(b), before);
  assert.ok(a.paidText.indexOf('中心の買い目') < a.paidText.indexOf('相手を広げるなら'));
  assert.ok(a.freeText.includes('全体は7点'));
});
test('a concrete ticket in an explanation cannot leak into the free preview', () => {
  const b = fixture(); b.article.paidText = '理由 1-2-3\n\n' + b.article.paidText;
  const a = readableArticle(b.article, b);
  assert.deepEqual(ticketsIn(a.freeText), []);
  assert.deepEqual(ticketsIn(a.paidText), ['1-2-3', '1-2-4']);
});
test('formation compression does not move a later longshot before earlier central tickets', () => {
  const b = fixture();
  const tickets = ['1-5-2','1-5-4','1-2-5','1-4-5','1-2-4','1-4-2','1-5-6'];
  b.baselinePracticalTickets = tickets;
  b.article.paidText = '買い目\n\n' + tickets.map(t => '・'+t).join('\n') + '\n\n計 7点';
  assert.deepEqual(ticketsIn(readableArticle(b.article, b).paidText), tickets);
});
