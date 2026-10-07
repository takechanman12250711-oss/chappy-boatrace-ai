'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readableArticle: currentReadableArticle, ticketsIn } = require('./note-readable-article');
const readableArticle = (article, bundle) => currentReadableArticle(article, bundle, { presentationVersion: 'readable-v1' });
const readableArticleV2 = (article, bundle) => currentReadableArticle(article, bundle, { presentationVersion: 'readable-v2' });
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

function categoryFixture() {
  const b = fixture(); b.version = 'note-draft-bundle-v1';
  delete b.monitor; delete b.record.source;
  b.record.prediction.mainSheet = {
    tickets: [{ ticket: '1-2-3', odds: 12.3 }, { ticket: '1-2-4', odds: 16.4 }, { ticket: '1-3-2', odds: 20 }],
    coverTickets: [{ ticket: '1-3-2', odds: 20 }, { ticket: '2-1-3', odds: 30 }],
    flowTickets: [{ ticket: '1-2-3', odds: 12.3 }, { ticket: '3-1-2', odds: 40 }],
    reason: '内側の差しにも注意します。'
  };
  b.record.prediction.manshuSheet = { tickets: [{ ticket: '3-1-2', odds: 40 }, { ticket: '4-1-2', odds: 120 }] };
  b.record.prediction.raceFlow = { summary: '1号艇の逃げを中心に考えます。2号艇の差しも見ます。' };
  b.record.prediction.candidate24Tickets = [{ ticket: '6-5-4', odds: 900 }];
  b.article.format = 'formation-v4';
  b.article.paidText = '🔥 実戦厳選\n\n・1-2-34\n\n計 2点\n\n本命とは別会計の参考予想\n・4-1-2\n・5-1-2';
  return b;
}
test('readable-v2 preserves explicit source categories and overlaps, odds and practical priority', () => {
  const b = categoryFixture(), before = JSON.stringify(b), a = readableArticleV2(b.article, b);
  const parsed = require('./note-category-article').parsePaidSections(a.paidText);
  assert.equal(a.presentationVersion, 'readable-v2');
  assert.deepEqual(parsed.map(section => section.label), ['🎯 本命','🛡️ 押さえ','🌊 流し','💥 万舟狙い','🧾 別会計の参考予想']);
  for (const [index, source] of [b.record.prediction.mainSheet.tickets, b.record.prediction.mainSheet.coverTickets,
    b.record.prediction.mainSheet.flowTickets, b.record.prediction.manshuSheet.tickets].entries()) {
    assert.deepEqual([...parsed[index].tickets].sort(), source.map(row => row.ticket).sort());
  }
  assert.deepEqual(parsed.at(-1).tickets, ['4-1-2', '5-1-2']);
  assert.equal(JSON.stringify(b), before);
  assert.equal(ticketsIn(a.paidText).length, 11, 'all memberships, including reference overlaps, stay visible');
  assert.equal(new Set(ticketsIn(a.paidText)).size, 7);
  assert.ok(a.paidText.includes('公開予想：6点\n区分別は延べ9点。同じ買い目は合計で1点と数えます。'));
  assert.ok(a.paidText.includes('参考予想：2点（別集計）\n参考を含む全体：7点（重複なし）'));
  assert.ok(a.paidText.endsWith('参考を含む全体：7点（重複なし）'));
  assert.ok(!/金額|予算|[0-9０-９]+円|[¥￥]/.test(a.paidText));
  assert.ok(a.freeText.includes('💡 すべての買い目を購入する前提ではありません。'));
  assert.ok(!a.paidText.includes('6 → 5 → 4'));
  assert.ok(!a.paidText.includes('中心の買い目'));
  assert.equal(a.fullText.split(a.paywallMarker).length, 2);
});
test('readable-v2 has short saved rationale and emoji date/deadline, with no paid ticket leak', () => {
  const b = categoryFixture();
  b.record.prediction.raceFlow.summary = '1-2-3を想定します。1号艇の逃げを中心に考えます。2号艇の差しも見ます。';
  b.article.freeText += '\n\n作成時点の取得済み情報による参考予想です。\n\n今日の予想一覧\nhttps://note.com/great_robin3243/n/na76b6c6c18ff';
  const a = readableArticleV2(b.article, b);
  assert.ok(a.freeText.startsWith('🚤 9月28日 丸亀6R\n🕒 締切 17:29'));
  assert.ok(a.freeText.includes('🧭 展開の考え方\n1号艇の逃げを中心に考えます。\n2号艇の差しも見ます。\n内側の差しにも注意します。'));
  assert.deepEqual(ticketsIn(a.freeText), []);
  assert.ok(a.freeText.includes('作成時点の取得済み情報による参考予想です。'));
  assert.ok(a.freeText.includes('今日の予想一覧\nhttps://note.com/great_robin3243/n/na76b6c6c18ff'));
  assert.ok(a.paidText.includes('1 → 2 → 3・4'));
});
test('readable-v2 fails closed rather than guessing missing category membership', () => {
  for (const mutate of [b => { delete b.record.prediction.mainSheet.coverTickets; },
    b => { b.record.prediction.mainSheet.flowTickets = null; },
    b => { delete b.record.prediction.manshuSheet; }]) {
    const b = categoryFixture(); mutate(b);
    assert.throws(() => readableArticleV2(b.article, b), /category_source_missing/);
  }
  const b = categoryFixture(); b.record.prediction.mainSheet.tickets = ['1-2-3'];
  assert.throws(() => readableArticleV2(b.article, b), /category_membership_missing/);
  b.record.prediction.mainSheet.tickets = ['7-2-1'];
  assert.throws(() => readableArticleV2(b.article, b), /category_ticket_invalid/);
});
test('readable-v2 explicit empty categories are zero, never inferred from practical selection or candidate24', () => {
  const b = categoryFixture();
  b.record.prediction.mainSheet.coverTickets = []; b.record.prediction.mainSheet.flowTickets = [];
  b.record.prediction.manshuSheet.tickets = [];
  const a = readableArticleV2(b.article, b);
  for (const heading of ['🛡️ 押さえ','🌊 流し','💥 万舟狙い']) assert.ok(a.paidText.includes(heading + '\n\n保存済みの買い目なし\n0点'));
});
test('readable-v2 independent article kinds remain separate from every ordinary AI pool', () => {
  for (const kind of ['escape', 'manshu']) {
    const b = fixture(); b.monitor.kind = kind;
    const a = readableArticleV2(b.article, b);
    assert.ok(a.paidText.startsWith(kind === 'escape' ? '🎯 独立本命' : '💥 独立万舟'));
    assert.ok(a.freeText.includes('🔎 通常AIとは別の独立した監視予想です。'));
    assert.ok(a.freeText.includes('💡 すべての買い目を購入する前提ではありません。'));
    assert.ok(!/金額|予算|[0-9０-９]+円|[¥￥]/.test(a.paidText));
    assert.ok(a.freeText.includes('元の理由を短縮・差し替えしない。'));
    assert.deepEqual(ticketsIn(a.paidText), ['1-2-3','1-2-4']);
    for (const key of ['mainSheet', 'manshuSheet', 'ticketSheets']) {
      const changed = structuredClone(b); changed.record.prediction[key] = {};
      assert.throws(() => readableArticleV2(changed.article, changed), /independent_pool_mixture/);
    }
  }
});
