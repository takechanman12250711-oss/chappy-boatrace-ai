'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { publicContent, renderCard, FONT_PATH, INDEX_URL, PUBLISHED_SECTION_LABELS, altText, observationLabel } = require('./note-result-card.cjs');
const digest = value => createHash('sha256').update(value).digest('hex');
const NOW = Date.parse('2026-10-06T22:45:00+09:00');

function fixture(series = 'normal', date = '20261006') {
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  const row = { raceKey: `${date}-09-11`, publicationKey: `${date}-09-11:${series}`, articleSeries: series,
    place: '津', raceNo: 11, ticketCount: 5, sourceSha256: 'a'.repeat(64),
    deadlineAt: `${iso}T15:30:00+09:00`, publishedAt: `${iso}T15:05:00+09:00`,
    url: 'https://note.com/great_robin3243/n/n123456789abc',
    resultUrl: `https://www.boatrace.jp/owpc/pc/race/raceresult?hd=${date}&jcd=09&rno=11`,
    settlement: { status: 'hit', combination: '1-3-2', payoutPer100Yen: 12340 } };
  row.settlement.resultUrl = row.resultUrl;
  row.settlement.evidenceId = digest([row.publicationKey, row.sourceSha256,
    row.settlement.combination, row.settlement.payoutPer100Yen].join('|'));
  return row;
}

function aggregateFixture() {
  const center = fixture();
  const report = { version: 'published-main-race-result-v1', raceKey: center.raceKey, place: center.place,
    raceNo: center.raceNo, deadlineAt: center.deadlineAt, publishedAt: center.publishedAt, status: 'hit',
    articleSeries: ['normal', 'escape', 'manshu'], publishedTicketCount: 19,
    matchedSections: [{ articleSeries: 'normal', label: '相手を広げるなら' },
      { articleSeries: 'manshu', label: '中心の買い目' }], combination: center.settlement.combination,
    payoutPer100Yen: center.settlement.payoutPer100Yen, resultUrl: center.resultUrl,
    sourceSha256: 'c'.repeat(64), publicationKey: `${center.raceKey}:published-main` };
  report.evidenceId = aggregateDigest(report);
  return report;
}
function aggregateDigest(report) {
  return digest([report.version, report.raceKey, report.sourceSha256, report.combination, report.payoutPer100Yen,
    report.publishedTicketCount, JSON.stringify(report.matchedSections)].join('|'));
}

test('public race aggregate shows all published main sections once per actual race, separate from center scope', async () => {
  const report = aggregateFixture(), before = structuredClone(report);
  const content = publicContent(report, { now: NOW });
  assert.equal(content.scope, 'published-main');
  assert.equal(content.publishedTicketCount, 19);
  assert(!Object.hasOwn(content, 'ticketCount'));
  assert.equal(content.seriesLabel, 'AI展開予想 / 本命予想 / 万舟予想');
  assert.deepEqual(content.matchedSections, report.matchedSections);
  assert.equal(content.indexUrl, INDEX_URL);
  const alt = altText(content);
  assert(alt.includes('掲載全券19点（重複なし）'));
  assert(alt.includes('AI展開予想・相手を広げるなら'));
  assert(alt.includes('万舟予想・中心の買い目'));
  assert(!alt.includes('押さえ'));
  assert(!alt.includes('中心の買い目19点'));
  assert(!alt.includes('事前公開の記事'));
  const first = await renderCard(report, { now: NOW });
  const again = await renderCard(report, { now: NOW + 1000 });
  assert.equal(first.sha256, again.sha256);
  assert(first.name.includes('-published-main-'));
  assert.deepEqual(report, before);
  assert(Object.isFrozen(content.matchedSections));
  assert(Object.isFrozen(content.matchedSections[0]));
  assert(!JSON.stringify(content).includes(report.sourceSha256));
  assert(!JSON.stringify(content).includes(report.evidenceId));
});

test('aggregate rejects uncertain, mislabeled, reference-only or malformed published facts', () => {
  const base = aggregateFixture();
  const changes = [
    { status: 'miss' }, { status: 'pending' }, { status: 'review' }, { status: 'void' },
    { articleSeries: [] }, { articleSeries: ['normal', 'normal'] }, { articleSeries: ['research'] },
    { publishedTicketCount: 0 }, { publishedTicketCount: 121 }, { publishedTicketCount: '19' },
    { publishedTicketCount: 19.5 }, { matchedSections: [] },
    { matchedSections: [{ articleSeries: 'normal', label: '押さえ' }] },
    { matchedSections: [{ articleSeries: 'normal', label: '別会計参考' }] },
    { matchedSections: [{ articleSeries: 'reference', label: '中心の買い目' }] },
    { matchedSections: [base.matchedSections[0], base.matchedSections[0]] },
    { matchedSections: [{ ...base.matchedSections[0], futureTickets: ['6-5-4'] }] },
    { publicationKey: base.raceKey + ':normal' }, { place: '大村' }, { raceNo: 12 },
    { raceKey: '20260230-09-11' }, { sourceSha256: 'secret' },
    { publishedAt: base.deadlineAt }, { publishedAt: '2026-10-06' }, { publishedAt: undefined },
    { resultUrl: 'https://example.com' }, { combination: '1-1-2' }, { payoutPer100Yen: 0 },
    { evidenceId: 'b'.repeat(64) }, { firstResultSeenAt: '2026-10-06T15:29:59+09:00' },
    { firstResultSeenAt: new Date(NOW + 1).toISOString() }, { firstResultSeenAt: '2026-02-30T16:00:00Z' },
  ];
  for (const change of changes) assert.throws(() => publicContent({ ...base, ...change }, { now: NOW }), /result_card_/);
  const missingSeries = { ...base, articleSeries: ['normal'] };
  assert.throws(() => publicContent(missingSeries, { now: NOW }), /matched_sections_invalid/);
  // Changing a whitelisted section without changing its source-linked evidence fails.
  assert.throws(() => publicContent({ ...base, matchedSections: [{ articleSeries: 'normal', label: '高配当を狙うなら' }] }, { now: NOW }), /evidence_mismatch/);
});

test('aggregate max twelve actual headings fit and private or reference inputs never enter image', async () => {
  const report = aggregateFixture();
  report.matchedSections = report.articleSeries.flatMap(articleSeries => PUBLISHED_SECTION_LABELS.map(label => ({ articleSeries, label })));
  report.publishedTicketCount = 120;
  report.firstResultSeenAt = '2026-10-06T07:15:16Z';
  report.evidenceId = aggregateDigest(report);
  const card = await renderCard(report, { now: NOW });
  assert.equal(card.content.matchedSections.length, 12);
  assert(card.altText.includes('掲載全券120点'));
  assert(card.altText.includes('結果確認 10/6 16:15 JST'));
  const extra = { ...report, originalJson: 'PRIVATE_ORIGINAL', futureTickets: ['6-5-4'], actualProfit: 9876543,
    referenceTickets: ['5-4-6'], url: 'https://note.com/great_robin3243/n/nabcdef' };
  Object.defineProperty(extra, 'personalData', { enumerable: true, get() { throw Error('private_data_read'); } });
  const clean = await renderCard(extra, { now: NOW });
  assert.equal(clean.sha256, card.sha256);
  const exposed = JSON.stringify({ content: clean.content, altText: clean.altText });
  for (const value of ['PRIVATE_ORIGINAL', '6-5-4', '5-4-6', '9876543', extra.url]) assert(!exposed.includes(value));
});

test('project only public verified-hit fields, with Japanese labels for each original series', () => {
  for (const [series, label] of Object.entries({ normal: 'AI展開予想', escape: '本命予想', manshu: '万舟予想' })) {
    const row = fixture(series), before = structuredClone(row);
    const content = publicContent(row, { now: NOW });
    assert.equal(content.seriesLabel, label);
    assert.equal(content.ticketCount, 5);
    assert.equal(content.combination, '1-3-2');
    assert.equal(content.payoutPer100Yen, 12340);
    assert.equal(content.previousDay, false);
    assert.equal(content.indexUrl, INDEX_URL);
    assert(!JSON.stringify(content).includes(row.url));
    assert(!altText(content).includes(row.url));
    assert.deepEqual(row, before);
    assert(Object.isFrozen(content));
    assert(altText(content).includes('2026年10月6日'));
    assert(altText(content).includes('公式結果照合済み'));
    assert(altText(content).includes('確定出目（3連単） 1-3-2'));
    assert(altText(content).includes('公式払戻（100円あたり）12,340円'));
  }
});

test('display only genuine matching observation time, in JST; never infer official finalization time', async () => {
  const row = fixture();
  const absent = publicContent(row, { now: NOW });
  assert(!Object.hasOwn(absent, 'resultSeenAt'));
  assert.equal(observationLabel(absent), '');
  assert(!altText(absent).includes('結果確認'));
  row.resultObservation = { evidenceId: row.settlement.evidenceId,
    firstResultSeenAt: '2026-10-06T07:15:16.789Z', officialSourceCheckedAt: '2026-10-06T06:50:00Z' };
  const content = publicContent(row, { now: NOW });
  assert.equal(content.resultSeenAt, '2026-10-06T07:15:16.789Z');
  assert.equal(observationLabel(content), '結果確認 10/6 16:15 JST');
  assert(altText(content).includes('結果確認 10/6 16:15 JST'));
  assert(!JSON.stringify(content).includes('06:50'));
  const observed = await renderCard(row, { now: NOW });
  const plain = await renderCard(fixture(), { now: NOW });
  assert.notEqual(observed.sha256, plain.sha256);
  assert.equal((await renderCard(row, { now: NOW + 1000 })).sha256, observed.sha256);
  row.resultObservation.firstResultSeenAt = row.deadlineAt;
  assert.equal(observationLabel(publicContent(row, { now: NOW })), '結果確認 10/6 15:30 JST');
  for (const change of [
    { evidenceId: 'f'.repeat(64) }, { firstResultSeenAt: '2026-10-06T15:29:59+09:00' },
    { firstResultSeenAt: new Date(NOW + 1).toISOString() }, { firstResultSeenAt: null },
    { firstResultSeenAt: '2026-02-30T16:00:00+09:00' }, { firstResultSeenAt: '2026-10-06 16:00:00' },
  ]) {
    assert.throws(() => publicContent({ ...row, resultObservation: { ...row.resultObservation, ...change } }, { now: NOW }), /observation_invalid/);
  }
  // Another known timestamp cannot stand in for missing first observation.
  assert.throws(() => publicContent({ ...row, resultObservation: {
    evidenceId: row.settlement.evidenceId, officialSourceCheckedAt: '2026-10-06T07:15:16Z',
  } }, { now: NOW }), /observation_invalid/);
});

test('current/previous JST race dates only; explicit previous-day assertion cannot lie', () => {
  const yesterday = fixture('normal', '20261005');
  assert.equal(publicContent(yesterday, { now: NOW }).previousDay, true);
  assert(altText(publicContent(yesterday, { now: NOW, previousDay: true })).includes('前日分'));
  assert.throws(() => publicContent(yesterday, { now: NOW, previousDay: false }), /previous_day_mismatch/);
  assert.throws(() => publicContent(fixture(), { now: NOW, previousDay: true }), /previous_day_mismatch/);
  for (const date of ['20261007', '20261004', '20260230', '20261301', '20260000', '2026106']) {
    assert.throws(() => publicContent(fixture('normal', date), { now: NOW }), /race_date/);
  }
  // UTC Oct 6 15:00 is already Oct 7 in Japan.
  assert.equal(publicContent(fixture(), { now: Date.parse('2026-10-06T15:00:00Z') }).previousDay, true);
  for (const now of [NaN, Infinity, '2026-10-06', null]) assert.throws(() => publicContent(fixture(), { now }), /now_invalid/);
});

test('malformed source identity, note links, timestamps and counts fail closed', () => {
  const changes = [
    { sourceSha256: null }, { sourceSha256: 'x'.repeat(64) }, { publicationKey: '20261006-09-11:manshu' },
    { articleSeries: 'candidate24' }, { place: '個人情報' }, { place: '津<script>' }, { place: '尼崎' },
    { raceNo: '11' }, { raceNo: 12 }, { raceKey: '20261006-25-11' },
    { ticketCount: 0 }, { ticketCount: 8 }, { ticketCount: 24 }, { ticketCount: '5' },
    { url: 'https://note.com/another/n/nabcdef' }, { url: 'https://note.com/great_robin3243/n/nabc?token=secret' },
    { url: 'https://note.com/great_robin3243/n/nabc#private' }, { url: 'file:///private' },
    { publishedAt: '2026-10-06T15:30:00+09:00' }, { publishedAt: '2026-10-06T16:30:00+09:00' },
    { publishedAt: '2026-02-30T15:00:00+09:00' }, { publishedAt: '2026-10-06 15:00:00' },
    { deadlineAt: '2026-10-07T15:30:00+09:00' }, { resultUrl: 'https://example.com/result' },
  ];
  for (const change of changes) assert.throws(() => publicContent({ ...fixture(), ...change }, { now: NOW }), /result_card_/);
  assert.throws(() => publicContent(fixture(), { now: Date.parse(fixture().deadlineAt) }), /publication_time_invalid/);
  for (const row of [null, [], 'private text']) assert.throws(() => publicContent(row, { now: NOW }), /row_invalid/);
});

test('only fully verified center hits; malformed official source/result and evidence rejected', () => {
  for (const change of [
    { status: 'miss' }, { status: 'pending' }, { status: 'review' }, { status: 'void' },
    { combination: '1-1-2' }, { combination: '7-1-2' }, { combination: '1-2-3 OR 4-5-6' },
    { payoutPer100Yen: 0 }, { payoutPer100Yen: -1 }, { payoutPer100Yen: 12.3 },
    { payoutPer100Yen: '12340' }, { payoutPer100Yen: 100000000 },
    { resultUrl: 'https://example.com/result' }, { resultUrl: fixture().resultUrl.replace('rno=11', 'rno=12') },
    { evidenceId: 'b'.repeat(64) },
  ]) {
    const row = fixture(); row.settlement = { ...row.settlement, ...change };
    assert.throws(() => publicContent(row, { now: NOW }), /result_card_/);
  }
});

test('unknown private and future-ticket fields do not enter content, alt text, PNG or hash', async () => {
  const row = fixture(), clean = await renderCard(row, { now: NOW });
  const injected = { ...row, customer: 'PRIVATE_CUSTOMER_13579', profit: 'PRIVATE_PROFIT_24680',
    futureTickets: ['6-5-4'], sourceJson: 'PRIVATE_ORIGINAL_JSON', API_KEY: 'PRIVATE_SECRET',
    settlement: { ...row.settlement, privateNotes: 'PRIVATE_NOTES', purchasedPayout: 9999999 } };
  // Failing getters demonstrate no accidental serialize/spread of unknown data.
  Object.defineProperty(injected, 'personalData', { enumerable: true, get() { throw Error('private_data_read'); } });
  const card = await renderCard(injected, { now: NOW });
  assert.deepEqual(card.png, clean.png);
  assert.equal(card.sha256, clean.sha256);
  assert.deepEqual(card.content, clean.content);
  const output = JSON.stringify({ content: card.content, altText: card.altText, name: card.name });
  for (const text of ['PRIVATE_', '6-5-4', row.sourceSha256, row.settlement.evidenceId, '9999999']) {
    assert(!output.includes(text)); assert(!card.png.includes(Buffer.from(text)));
  }
});

test('PNG bytes are deterministic, 1200x675, hashed and metadata-free, with actual Japanese glyphs', async () => {
  const first = await renderCard(fixture(), { now: NOW });
  const second = await renderCard(fixture(), { now: NOW + 1000 });
  assert.deepEqual(first.png, second.png);
  assert.equal(first.sha256, digest(first.png));
  assert.equal(first.width, 1200); assert.equal(first.height, 675);
  assert.equal(first.mimeType, 'image/png');
  assert(first.name.endsWith(`${first.sha256}.png`));
  const result = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image, ImageFont
image = Image.open(io.BytesIO(sys.stdin.buffer.read()))
image.load()
assert image.size == (1200, 675)
assert image.info == {}, image.info
f = ImageFont.truetype(sys.argv[1], 28, index=0, layout_engine=ImageFont.Layout.BASIC)
missing = bytes(f.getmask(chr(0x10ffff)))
for char in 'チャッピーボートレース展開予想本命万舟的中結果公式払戻円あたり中心点前日分事前公開記事確認照合済確定出目':
    assert bytes(f.getmask(char)) != missing, char
print('verified')
`, FONT_PATH], { input: first.png, encoding: 'buffer' });
  assert.equal(result.status, 0, result.stderr?.toString());
  assert.equal(result.stdout.toString().trim(), 'verified');
});

test('series and previous-day badge affect pixels; longest permitted payout fits', async () => {
  const normal = await renderCard(fixture(), { now: NOW });
  for (const series of ['escape', 'manshu']) {
    const card = await renderCard(fixture(series), { now: NOW });
    assert.notEqual(card.sha256, normal.sha256);
  }
  const previous = await renderCard(fixture('normal', '20261005'), { now: NOW, previousDay: true });
  assert.notEqual(previous.sha256, normal.sha256);
  const max = fixture('manshu');
  max.settlement.payoutPer100Yen = 99999999;
  max.settlement.evidenceId = digest([max.publicationKey, max.sourceSha256, max.settlement.combination,
    max.settlement.payoutPer100Yen].join('|'));
  assert((await renderCard(max, { now: NOW })).png.length > 1000);
  await assert.rejects(renderCard(fixture(), { now: NOW, indexUrl: fixture().url }), /free_index_invalid/);
  await assert.rejects(renderCard(fixture(), { now: NOW, fontPath: '/tmp/missing-result-font.ttf' }), /font_missing/);
});

test('longest venue, twelve headings, previous-day label and widest payouts fit together', async () => {
  for (const payout of [9999999, 10000000, 99999999]) {
    const report = aggregateFixture();
    Object.assign(report, { raceKey:'20261005-12-12',publicationKey:'20261005-12-12:published-main',place:'住之江',raceNo:12,
      publishedAt:'2026-10-05T15:00:00+09:00',deadlineAt:'2026-10-05T15:30:00+09:00',firstResultSeenAt:'2026-10-05T07:15:00Z',
      publishedTicketCount:120,payoutPer100Yen:payout,
      resultUrl:'https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261005&jcd=12&rno=12' });
    report.matchedSections=report.articleSeries.flatMap(articleSeries=>PUBLISHED_SECTION_LABELS.map(label=>({articleSeries,label})));
    report.evidenceId=aggregateDigest(report);
    const card=await renderCard(report,{now:NOW});
    assert.equal(card.width,1200);assert.equal(card.height,675);assert.equal(card.content.previousDay,true);
    assert.equal(card.content.publishedTicketCount,120);assert.equal(card.content.matchedSections.length,12);
    assert(card.altText.includes(payout.toLocaleString('ja-JP')+'円'));assert(card.altText.includes('住之江12R'));
  }
});

test('v2 category names cannot be rebound to a different article family even with a recomputed hash',()=>{
  for(const [articleSeries,label] of [['normal','🎯 独立本命'],['normal','💥 独立万舟'],['escape','🌊 流し'],['manshu','🛡️ 押さえ']]) {
    const report=aggregateFixture();report.matchedSections=[{articleSeries,label}];report.evidenceId=aggregateDigest(report);
    assert.throws(()=>publicContent(report,{now:NOW}),/matched_sections_invalid/);
  }
  for(const [articleSeries,label] of [['normal','🎯 本命'],['normal','🛡️ 押さえ'],['normal','🌊 流し'],['normal','💥 万舟狙い'],['escape','🎯 独立本命'],['manshu','💥 独立万舟']]) {
    const report=aggregateFixture();report.matchedSections=[{articleSeries,label}];report.evidenceId=aggregateDigest(report);
    assert.equal(publicContent(report,{now:NOW}).matchedSections[0].label,label);
  }
});
