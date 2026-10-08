'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { readableArticle, ticketsIn } = require('./note-readable-article');
const frozenV3 = require('./note-recovery-readable-v3.cjs');
const { FALLBACK, safeNormalExplanation } = require('./note-free-explanation.cjs');
const { fixture: independentFixture } = require('./note-independent-monitor-fixture');
const { sectionProof } = require('./note-published-ticket-sections');
function fixture() {
  const b = independentFixture(); b.version = 'note-draft-bundle-v1'; delete b.monitor; delete b.record.source;
  const p = b.record.prediction;
  p.mainSheet = { honmei: { boatNo: 1 }, tickets: ['1-2-3','1-2-4'],
    coverTickets: ['2-1-3'], flowTickets: ['1-2-3','1-2-4'],
    reason: '本命は5号艇。対抗は1号艇。' };
  p.manshuSheet = { tickets: ['4-1-2'] };
  p.verificationEvidence = { mainScenario: { headBoatNo: 1, attackerBoatNo: 1, type: 'escape', label: '1号艇逃げ' } };
  b.article.format = 'formation-v4';
  b.article.rangeSummary = '最有力展開は1号艇逃げ。1号艇を1着軸に、内側の残しを評価する。';
  b.article.allRangeGroups = [{ key: 'main', tickets: ['1-2-3','1-2-4'], reason: '1号艇逃げから作られた本線候補。1号艇1着、2号艇2着、3号艇3着の順で評価する。' }];
  b.article.paidText = '🔥 実戦厳選\n\n・1-2-34\n\n計 2点';
  return b;
}
test('future v4 removes contradictory old ranking prose but keeps every paid byte and source immutable', () => {
  const b = fixture(), before = JSON.stringify(b), old = readableArticle(b.article,b,{presentationVersion:'readable-v3'}), next = readableArticle(b.article,b);
  assert.match(old.freeText,/本命は5号艇/);
  assert.equal(next.presentationVersion,'readable-v4');
  assert.doesNotMatch(next.freeText,/本命は5号艇|対抗は1号艇/);
  assert.match(next.freeText,/最有力展開は1号艇逃げ/);
  assert.equal(next.paidText,old.paidText);
  assert.deepEqual(sectionProof(next.paidText,'readable-v4',{sourceSha256:'a'.repeat(64)}).modelSubset,
    sectionProof(old.paidText,'readable-v3',{sourceSha256:'a'.repeat(64)}).modelSubset);
  assert.equal(JSON.stringify(b),before);
  assert.deepEqual(ticketsIn(next.freeText),[]);
  assert.equal(next.fullText.split(next.paywallMarker).length,2);
});
test('explicit legacy v3 reproduces frozen free, paid and full bytes exactly', () => {
  const b=fixture();assert.deepEqual(readableArticle(b.article,b,{presentationVersion:'readable-v3'}),frozenV3.readableArticle(b.article,b));
});
test('matching saved formal head keeps canonical stored prose without raw ranking fallback', () => {
  const b=fixture();delete b.article.rangeSummary;
  b.record.prediction.mainSheet.reason='本命は1号艇。内側の残しを評価する。';
  assert.equal(safeNormalExplanation(b.article,b),'1号艇逃げから作られた本線候補。');
});
test('missing or unbound main group fails closed even with matching raw reason', () => {
  for(const edit of [b=>delete b.article.allRangeGroups,
    b=>b.article.allRangeGroups[0].tickets=['5-1-2'],
    b=>b.article.allRangeGroups[0].reason='本命は1号艇。',
    b=>b.article.allRangeGroups.push(structuredClone(b.article.allRangeGroups[0]))]) {
    const b=fixture();b.record.prediction.mainSheet.reason='本命は1号艇。';edit(b);
    assert.equal(safeNormalExplanation(b.article,b),FALLBACK);
  }
});
test('alternative stale head wording is never taken from raw or arbitrary group prose', () => {
  for(const stale of ['5号艇が本命。','本線は5号艇。','対抗は1号艇。']) {
    const b=fixture();b.record.prediction.mainSheet.reason=stale;
    b.article.rangeSummary += stale;
    b.article.allRangeGroups[0].reason += stale;
    const text=safeNormalExplanation(b.article,b);
    assert.equal(text,'最有力展開は1号艇逃げ。\n1号艇逃げから作られた本線候補。');
    assert.ok(!text.includes(stale));
  }
});
test('missing, multi-head or conflicting canonical head uses a neutral disclosure', () => {
  for(const edit of [
    b=>delete b.record.prediction.mainSheet.honmei,
    b=>delete b.record.prediction.verificationEvidence,
    b=>delete b.record.prediction.verificationEvidence.mainScenario.headBoatNo,
    b=>b.record.prediction.verificationEvidence.mainScenario.headBoatNo=null,
    b=>b.record.prediction.verificationEvidence.mainScenario.headBoatNo='1oops',
    b=>b.record.prediction.verificationEvidence.mainScenario.headBoatNo=true,
    b=>b.record.prediction.verificationEvidence.mainScenario.headBoatNo=1.5,
    b=>b.record.prediction.verificationEvidence.mainScenario.attackerBoatNo=5,
    b=>b.record.prediction.verificationEvidence.mainScenario.label='5号艇が本命',
    b=>b.record.prediction.verificationEvidence.mainScenario.type='unknown',
    b=>b.record.prediction.mainSheet.tickets.push('5-1-2'),
    b=>b.record.prediction.verificationEvidence.mainScenario.headBoatNo=5
  ]) {const b=fixture();edit(b);assert.equal(safeNormalExplanation(b.article,b),FALLBACK);}
});
test('unbound group prose and concrete tickets cannot escape into the free preview', () => {
  const b=fixture();b.article.allRangeGroups[0].tickets=['5-1-2'];
  b.article.allRangeGroups[0].reason='本命は5号艇。';
  b.article.rangeSummary+='1-2-3を想定する。';
  const next=readableArticle(b.article,b);assert.doesNotMatch(next.freeText,/本命は5号艇/);assert.deepEqual(ticketsIn(next.freeText),[]);
});
test('result-like extra fields never select the free explanation', () => {
  const b=fixture(), before=safeNormalExplanation(b.article,b);
  b.record.prediction.result={trifecta:{combination:'5-1-2'}};b.record.actualHead=5;
  assert.equal(safeNormalExplanation(b.article,b),before);
});
test('independent original prose and paid bytes stay unchanged', () => {
  for(const kind of ['escape','manshu']) {const b=independentFixture();b.monitor.kind=kind;
    const old=readableArticle(b.article,b,{presentationVersion:'readable-v3'}),next=readableArticle(b.article,b);
    assert.equal(next.freeText,old.freeText);assert.equal(next.paidText,old.paidText);assert.equal(next.fullText,old.fullText);
  }
});

