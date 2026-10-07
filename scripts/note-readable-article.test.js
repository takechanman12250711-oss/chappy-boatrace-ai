'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readableArticle, ticketsIn } = require('./note-readable-article');
const { sectionProof } = require('./note-published-ticket-sections');
const { fixture } = require('./note-independent-monitor-fixture');
test('independent original remains immutable, reasons move before the paywall', () => {
  for (const kind of ['escape', 'manshu']) {
    const b = fixture(); b.monitor.kind = kind;
    const before = JSON.stringify(b), a = readableArticle(b.article, b);
    assert.equal(JSON.stringify(b), before);
    assert.ok(a.freeText.includes('元の理由を短縮・差し替えしない。'));
    assert.deepEqual(ticketsIn(a.freeText), []);
    assert.deepEqual(ticketsIn(a.paidText), ['1-2-3', '1-2-4']);
    assert.ok(a.paidText.includes('1 → 2 → 3・4\n2点'));
    assert.ok(!a.paidText.includes('・1-2-34'));
    assert.ok(a.freeText.includes('中心の買い目 2点'));
    assert.equal(a.fullText.split(a.paywallMarker).length, 2);
    assert.ok(a.freeText.includes('🧭 展開の考え方\n\n監視の根拠'));
    assert.ok(a.freeText.includes('🎟️ 有料部分の内容\n中心の買い目 2点\n重複を除いた全体は2点です。'));
    assert.ok(a.freeText.includes('📊 的中報告について\n・中心・追加の買い目全体で判定'));
    // Preview-only layout must not alter the exact existing paid-body proof.
    assert.equal(sectionProof(a.paidText).paidTextSha256,
      'cb6fb0fb2fd0bd1e2ce4f7a9a914e7c888c10ef12926768c9741082d95a3010c');
  }
});
test('compact rectangles preserve the exact ticket set without inventing cross combinations', () => {
  for (const tickets of [
    ['1-2-4','1-2-5','1-3-4','1-3-5'],
    ['1-2-4','1-2-5','1-3-4'],
    ['1-2-4','1-2-5','1-3-5','1-3-4']
  ]) {
    const b = fixture();
    b.baselinePracticalTickets = tickets;
    b.article.paidText = '買い目\n\n' + tickets.map(t => '・'+t).join('\n') + '\n\n計 '+tickets.length+'点';
    const a = readableArticle(b.article, b);
    assert.deepEqual(ticketsIn(a.paidText).sort(), [...tickets].sort());
    assert.equal((a.paidText.match(/1点100円/g) || []).length, 1);
    if (tickets.length === 4 && tickets[2] === '1-3-4') assert.ok(a.paidText.includes('1 → 2・3 → 4・5'));
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
  assert.deepEqual([...shown].sort(), ['1-2-3','1-2-4','1-3-2','1-4-2','2-1-3','4-1-2','5-1-2'].sort());
  assert.equal(new Set(shown).size, shown.length);
  assert.equal(JSON.stringify(b), before);
  assert.ok(a.paidText.indexOf('中心の買い目') < a.paidText.indexOf('相手を広げるなら'));
  assert.ok(a.freeText.includes('全体は7点'));
  assert.ok(a.freeText.includes('中心の買い目 2点\n追加・参考 5点\n'));
});
test('a concrete ticket in an explanation cannot leak into the free preview', () => {
  const b = fixture(); b.article.paidText = '理由 1-2-3\n\n' + b.article.paidText;
  const a = readableArticle(b.article, b);
  assert.deepEqual(ticketsIn(a.freeText), []);
  assert.deepEqual(ticketsIn(a.paidText), ['1-2-3', '1-2-4']);
});
test('non-adjacent display grouping preserves immutable source priority and every ticket', () => {
  const b = fixture();
  const tickets = ['1-5-2','1-5-4','1-2-5','1-4-5','1-2-4','1-4-2','1-5-6'];
  b.baselinePracticalTickets = tickets;
  b.article.paidText = '買い目\n\n' + tickets.map(t => '・'+t).join('\n') + '\n\n計 7点';
  const before = JSON.stringify(b);
  const a = readableArticle(b.article, b);
  assert.deepEqual(ticketsIn(a.paidText).sort(), [...tickets].sort());
  assert.equal(JSON.stringify(b), before);
  assert.ok(a.paidText.includes('1 → 5 → 2・4・6'));
});
test('non-adjacent axes merge across all positions but never across paid sections', () => {
  const b = fixture();
  const tickets = ['1-2-4','1-3-4','1-2-5','1-3-5','6-2-4','6-3-4','6-2-5','6-3-5'];
  b.baselinePracticalTickets = tickets;
  b.article.paidText = '買い目\n\n'+tickets.map(t=>'・'+t).join('\n')+'\n\n計 8点';
  const a = readableArticle(b.article,b);
  assert.ok(a.paidText.includes('1・6 → 2・3 → 4・5\n8点'));
  assert.deepEqual(ticketsIn(a.paidText).sort(), [...tickets].sort());
  // Formatting accepts this fixture; the real publication gate still caps 7.
  b.version = 'note-draft-bundle-v1';
  b.baselinePracticalTickets = ['1-2-4'];
  b.record.prediction.mainSheet = { tickets: ['1-2-4','1-2-5'] };
  b.article.paidText = '🔥 実戦厳選\n\n・1-2-4\n\n計 1点';
  const split = readableArticle(b.article,b).paidText.split('相手を広げるなら');
  assert.deepEqual(ticketsIn(split[0]), ['1-2-4']);
  assert.deepEqual(ticketsIn(split[1]), ['1-2-5']);
});
