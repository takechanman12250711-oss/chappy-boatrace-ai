'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { NOTE_PRICE_YEN, isRecordedPrice } = require('./note-pricing');
const { validateDraftGate } = require('./note-github-ui-transport');
const { receiptRow, indexBody, loadConfig } = require('./note-marketing-content');

test('new articles accept only the 200 yen trial price; old handoffs fail closed', () => {
  const now = Date.parse('2026-10-04T07:30:00Z');
  const payload = { canPublish: true, blockReason: null, raceKey: '20261004-13-4',
    raceDate: '2026-10-04', deadlineAt: '2026-10-04T17:00:00+09:00',
    title: 'price trial', freeText: 'free', paidText: 'paid', price: NOTE_PRICE_YEN };
  assert.equal(NOTE_PRICE_YEN, 200);
  assert.equal(require('./build-note-iphone-handoff').NOTE_PRICE_YEN, NOTE_PRICE_YEN);
  assert.equal(validateDraftGate(payload, now).ok, true);
  for (const price of [0, 100, 300, 500]) {
    assert.deepEqual(validateDraftGate({ ...payload, price }, now), { ok: false, reason: 'price_not_200' });
  }
});

test('mixed historical and trial receipts keep their actual prices in the index', () => {
  const now = Date.parse('2026-10-04T07:30:00Z');
  const rows = [300, 200].map((price, i) => {
    const raceKey = `20261004-13-${i + 4}`;
    const source = JSON.stringify({ version: 'note-draft-bundle-v1', record: {
      raceKey, place: '尼崎', raceNo: i + 4, deadlineAt: '2026-10-04T17:00:00+09:00' } });
    const receipt = { version: 'note-publication-receipt-v1', raceKey, price,
      url: `https://note.com/great_robin3243/n/nabc${i}`, sourceSha256: createHash('sha256').update(source).digest('hex'),
      publishedAt: '2026-10-04T16:00:00+09:00', verifiedAt: '2026-10-04T16:00:10+09:00' };
    const original = JSON.stringify(receipt);
    const row = receiptRow(receipt, source, now);
    assert.equal(JSON.stringify(receipt), original);
    assert.equal(row.price, price);
    assert.throws(() => receiptRow({ ...receipt, price: 500 }, source, now), /receipt_invalid/);
    return row;
  });
  const config = loadConfig();
  const body = indexBody(rows, config, now);
  assert(body.includes('公開時価格 300円'));
  assert(body.includes('公開時価格 200円'));
  assert(body.includes('新規公開の記事は各200円'));
  assert(!body.includes('各記事300円'));
  assert(config.guide.initialBody.includes('各200円'));
  const cachedLegacyRow = { ...rows[0] }; delete cachedLegacyRow.price;
  assert(indexBody([cachedLegacyRow], config, now).includes('価格は記事ページで確認'));
  for (const price of [0, 100, 500, null, '200']) assert.equal(isRecordedPrice(price), false);
});
