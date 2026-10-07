'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { fixture } = require('./note-independent-monitor-fixture');
const { LEGACY_READABLE, publishedTicketSections, sectionProof } = require('./note-published-ticket-sections');
const { CATEGORIES, winningProvenance, validateWinningProvenance, validatedRowOrigins, validatedReportOrigins } = require('./note-result-provenance');
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const METHOD = 'published-main-sections-v1';

function normalBundle() {
  const bundle = fixture();
  bundle.version = 'note-draft-bundle-v1';
  delete bundle.record.source; delete bundle.monitor;
  bundle.record.prediction.mainSheet = {
    tickets: ['1-2-3', '1-3-2'], coverTickets: ['1-3-2', '1-4-3'], flowTickets: ['1-2-3', '3-1-2']
  };
  bundle.record.prediction.manshuSheet = { tickets: ['1-2-3', '3-1-2', '4-1-2'] };
  bundle.record.prediction.candidate24Tickets = ['6-5-4'];
  bundle.article.format = 'formation-v4';
  bundle.article.paidText = '🔥 実戦厳選\n\n・1-2-34\n\n計 2点\n\n本命とは別会計の参考予想\n・5-1-2';
  return bundle;
}

function input({ bundle = normalBundle(), combination = '1-4-3', presentationVersion = 'readable-v1' } = {}) {
  const bytes = JSON.stringify(bundle), deadline = Date.parse(bundle.record.deadlineAt);
  const articleSeries = bundle.monitor?.kind || 'normal';
  const row = {
    raceKey: bundle.record.raceKey, publicationKey: `${bundle.record.raceKey}:${articleSeries}`, articleSeries,
    sourceSha256: hash(bytes), place: bundle.record.place, raceNo: bundle.record.raceNo,
    deadlineAt: bundle.record.deadlineAt, publishedAt: new Date(deadline - 180000).toISOString(),
    ticketCount: bundle.baselinePracticalTickets.length
  };
  row.publicationEvidence = {
    version: 'note-publication-evidence-v1', receiptCommitSha: 'a'.repeat(40), publisherCommitSha: 'b'.repeat(40),
    sourceSha256: row.sourceSha256, ...LEGACY_READABLE
  };
  if (presentationVersion === 'readable-v2') {
    const { readableArticle } = require('./note-readable-article');
    const article = readableArticle(bundle.article, bundle);
    row.publicationEvidence.presentationVersion = presentationVersion;
    row.publicationEvidence.publishedDisplayProof = sectionProof(article.paidText, presentationVersion);
  }
  const now = deadline + 3600000, section = publishedTicketSections(row, bytes, now);
  assert.equal(section.status, 'verified', JSON.stringify(section));
  const matchedSections = section.sections.filter(value => value.tickets.includes(combination)).map(value => value.label);
  const settlement = {
    status: matchedSections.length ? 'hit' : 'miss', method: METHOD, combination, payoutPer100Yen: 1090,
    publishedTicketCount: section.publishedTicketCount, sectionsSha256: section.sectionsSha256,
    referenceTicketCount: section.referenceTicketCount, matchedSections
  };
  settlement.evidenceId = hash([METHOD, row.publicationKey, row.sourceSha256, section.sectionsSha256, combination, settlement.payoutPer100Yen].join('|'));
  row.publishedSettlement = settlement;
  return { bundle, row, bytes, section, settlement, now };
}

const derive = f => winningProvenance(f.row, f.bytes, f.settlement, f.section, f.now);
const binding = f => ({
  publicationKey: f.row.publicationKey, raceKey: f.row.raceKey, articleSeries: f.row.articleSeries,
  sourceSha256: f.row.sourceSha256, status: f.settlement.status, combination: f.settlement.combination,
  evidenceId: f.settlement.evidenceId, sectionsSha256: f.settlement.sectionsSha256, matchedSections: f.settlement.matchedSections
});
const ids = origins => origins.map(value => value.categoryId);
function rehashReport(report) {
  report.sourceSha256 = hash(JSON.stringify(report.sources));
  report.evidenceId = hash([report.version, report.raceKey, report.sourceSha256, report.combination,
    report.payoutPer100Yen, report.publishedTicketCount, JSON.stringify(report.matchedSections)].join('|'));
  return report;
}
function reportOf(inputs) {
  const first = inputs[0];
  return rehashReport({
    version: 'published-main-race-result-v1', raceKey: first.row.raceKey,
    publicationKey: `${first.row.raceKey}:published-main`, status: 'hit',
    combination: first.settlement.combination, payoutPer100Yen: first.settlement.payoutPer100Yen,
    publishedTicketCount: new Set(inputs.flatMap(f => f.section.unionTickets)).size,
    articleSeries: inputs.map(f => f.row.articleSeries),
    matchedSections: inputs.flatMap(f => f.settlement.matchedSections.map(label => ({ articleSeries: f.row.articleSeries, label }))),
    sources: inputs.map(f => ({ publicationKey: f.row.publicationKey, sourceSha256: f.row.sourceSha256,
      publishedAt: f.row.publishedAt, sectionsSha256: f.settlement.sectionsSha256,
      status: f.settlement.status, evidenceId: f.settlement.evidenceId })),
    winningProvenance: inputs.map(derive)
  });
}

test('legacy merged heading keeps its literal name while exact cover membership proves 押さえ', () => {
  const f = input(), before = JSON.stringify(f), proof = derive(f);
  assert(proof);
  assert.deepEqual(proof.matchedSections, ['相手を広げるなら']);
  assert.deepEqual(proof.origins, [{ categoryId: 'cover', sourceField: 'record.prediction.mainSheet.coverTickets' }]);
  assert.deepEqual(validateWinningProvenance(proof, binding(f)), [CATEGORIES.cover]);
  assert.equal(proof.sourceSha256, f.row.sourceSha256);
  assert.equal(proof.settlementEvidenceId, f.settlement.evidenceId);
  assert.equal(JSON.stringify(f), before);
});

test('all confirmed original origins are listed without treating deduplicated headings as category evidence', () => {
  for (const [combination, expected] of [
    ['1-3-2', ['main', 'cover']], ['1-2-3', ['main', 'flow', 'manshu']], ['3-1-2', ['flow', 'manshu']], ['4-1-2', ['manshu']]
  ]) {
    const f = input({ combination }), proof = derive(f);
    assert.deepEqual(ids(validateWinningProvenance(proof, binding(f))), expected);
    assert.equal(proof.matchedSections.length, 1);
  }
});

test('unknown central origin is optional; no ordinary-main attribution is invented', () => {
  const f = input({ combination: '1-2-4' }), before = JSON.stringify(f.settlement);
  assert.equal(f.settlement.status, 'hit');
  assert.deepEqual(f.settlement.matchedSections, ['中心の買い目']);
  assert.equal(derive(f), null);
  assert.equal(JSON.stringify(f.settlement), before);
  f.row.winningProvenance = { categoryId: 'main', label: '本命' };
  assert.deepEqual(validatedRowOrigins(f.row), []);
});

test('candidate24, references and substitute pools cannot become origin or hit evidence', () => {
  for (const combination of ['6-5-4', '5-1-2']) {
    const f = input({ combination });
    assert.equal(f.settlement.status, 'miss');
    assert.equal(derive(f), null);
    f.settlement.status = 'hit';
    assert.equal(derive(f), null);
  }
  const bundle = normalBundle();
  bundle.record.prediction.ticketSheets = { main: ['1-2-4'] };
  bundle.record.prediction.aiCore = { mainSheet: { tickets: ['1-2-4'] } };
  bundle.record.prediction.candidate24Tickets.push('1-2-4');
  const f = input({ bundle, combination: '1-2-4' });
  assert.equal(derive(f), null);
});

test('arbitrary display/category metadata on a saved ticket never changes its exact source-field origin', () => {
  const bundle = normalBundle();
  bundle.record.prediction.mainSheet.coverTickets = [{ ticket: '1-4-3', category: '本命', categoryId: 'main', sourceField: 'manshuSheet.tickets' }];
  const f = input({ bundle });
  assert.deepEqual(ids(validateWinningProvenance(derive(f), binding(f))), ['cover']);
});

test('only hit accepts provenance; optional data cannot reclassify review, miss, pending or void', () => {
  for (const status of ['miss', 'pending', 'review', 'void', undefined]) {
    const f = input(); f.settlement.status = status;
    const before = JSON.stringify(f);
    assert.equal(derive(f), null);
    assert.equal(JSON.stringify(f), before);
  }
});

test('SHA, source identity, publication evidence and deadline are verified before proof minting', () => {
  const variants = [
    f => { f.bytes += ' '; }, f => { f.bytes = Buffer.from('invalid'); },
    f => { f.row.raceKey = '20260928-15-7'; }, f => { f.row.raceNo = 7; },
    f => { f.row.place = '大村'; }, f => { f.row.publicationKey += ':other'; },
    f => { f.row.sourceSha256 = 'a'.repeat(64); }, f => { f.row.publicationEvidence = null; },
    f => { f.now = Date.parse(f.row.deadlineAt); }, f => { f.now = NaN; },
    f => { f.row.publishedAt = f.row.deadlineAt; }
  ];
  for (const mutate of variants) { const f = input(); mutate(f); assert.equal(derive(f), null); }
  for (const value of [undefined, null, 1, [], {}]) {
    assert.equal(winningProvenance(value, value, value, value), null);
    assert.deepEqual(validateWinningProvenance(value, value), []);
  }
  const f = input(); f.bytes = Buffer.from(f.bytes);
  assert(derive(f));
});

test('forged verified-section objects and altered settlements are rejected without mutating the ledger', () => {
  for (const mutate of [
    f => { f.section.status = 'hit'; }, f => { f.section.sections[1].label = '押さえ'; },
    f => { f.section.unionTickets.push('6-5-4'); }, f => { f.section.publishedTicketCount++; },
    f => { f.section.sectionsSha256 = 'a'.repeat(64); }, f => { f.settlement.matchedSections = ['中心の買い目']; },
    f => { f.settlement.combination = '1-1-2'; }, f => { f.settlement.evidenceId = 'a'.repeat(64); },
    f => { f.settlement.sectionsSha256 = 'a'.repeat(64); }, f => { f.settlement.payoutPer100Yen++; },
    f => { f.settlement.publishedTicketCount++; }, f => { f.settlement.method = 'other-v1'; }
  ]) {
    const f = input(); mutate(f);
    const before = JSON.stringify(f);
    assert.equal(derive(f), null); assert.equal(JSON.stringify(f), before);
  }
});

test('a source with missing origin does not fall back to labels and invalid pools fail optionally', () => {
  const bundle = normalBundle(); delete bundle.record.prediction.mainSheet; delete bundle.record.prediction.manshuSheet;
  const f = input({ bundle, combination: '1-2-3' });
  assert.equal(derive(f), null);
  for (const rows of [null, ['1-1-2'], [{ combination: '1-4-3' }], '1-4-3']) {
    const changed = normalBundle(); changed.record.prediction.mainSheet.coverTickets = rows;
    const bytes = JSON.stringify(changed), base = input();
    base.bytes = bytes; base.row.sourceSha256 = hash(bytes); base.row.publicationEvidence.sourceSha256 = hash(bytes);
    assert.equal(derive(base), null);
  }
});

test('proofs and canonical origins are deeply readonly and retain no raw source or unplayed tickets', () => {
  const f = input(), proof = derive(f), canonical = validateWinningProvenance(proof, binding(f));
  assert(Object.isFrozen(proof) && Object.isFrozen(proof.origins) && Object.isFrozen(proof.origins[0]) && Object.isFrozen(proof.matchedSections));
  assert(Object.isFrozen(canonical) && Object.isFrozen(canonical[0]));
  assert.throws(() => { proof.origins[0].categoryId = 'main'; }, TypeError);
  assert.throws(() => { proof.matchedSections[0] = '本命'; }, TypeError);
  assert.throws(() => { canonical[0].label = '本命'; }, TypeError);
  for (const secret of ['6-5-4', '5-1-2', '1-2-4', 'paidText', 'boatAssessments', 'fullText']) assert(!JSON.stringify(proof).includes(secret));
});

test('serialized, cloned, proxied or rehashed forged metadata cannot mint display authority', () => {
  const f = input(), proof = derive(f), forged = clone(proof);
  forged.origins = [{ categoryId: 'main', sourceField: CATEGORIES.main.sourceField }];
  const { provenanceSha256, ...data } = forged; forged.provenanceSha256 = hash(JSON.stringify(data));
  for (const copy of [clone(proof), structuredClone(proof), { ...proof }, forged, Object.freeze(forged), new Proxy(proof, {})]) {
    assert.deepEqual(validateWinningProvenance(copy, binding(f)), []);
  }
  assert.deepEqual(ids(validateWinningProvenance(derive(f), binding(f))), ['cover']);
});

test('each binding field must match the minted source settlement and exact published headings', () => {
  const f = input(), proof = derive(f);
  for (const field of ['publicationKey', 'raceKey', 'articleSeries', 'sourceSha256', 'status', 'combination', 'evidenceId', 'sectionsSha256']) {
    assert.deepEqual(validateWinningProvenance(proof, { ...binding(f), [field]: 'tampered' }), []);
  }
  assert.deepEqual(validateWinningProvenance(proof, { ...binding(f), matchedSections: ['本命'] }), []);
  assert.deepEqual(validateWinningProvenance(proof, { ...binding(f), matchedSections: [] }), []);
});

test('row convenience preserves trusted references through shallow spreads and safely drops round-tripped proof', () => {
  const f = input(); f.row.winningProvenance = derive(f);
  const before = JSON.stringify(f.row), origins = validatedRowOrigins({ ...f.row });
  assert.deepEqual(ids(origins), ['cover']);
  assert.equal(origins[0].label, '押さえ');
  assert.deepEqual(origins[0].publishedSections, ['相手を広げるなら']);
  assert.equal(JSON.stringify(f.row), before);
  assert.deepEqual(validatedRowOrigins(clone(f.row)), []);
  assert.deepEqual(validatedRowOrigins({ ...f.row, publishedSettlement: { ...f.settlement, payoutPer100Yen: 9999 } }), []);
});

test('independent kinds use monitor origin, never attached ordinary or manshu pools', () => {
  for (const kind of ['escape', 'manshu']) {
    const bundle = fixture(); bundle.monitor.kind = kind;
    bundle.record.prediction.mainSheet = { tickets: ['1-2-3'], coverTickets: ['1-2-3'], flowTickets: ['1-2-3'] };
    bundle.record.prediction.manshuSheet = { tickets: ['1-2-3'] };
    const f = input({ bundle, combination: '1-2-3' }), proof = derive(f);
    assert.deepEqual(ids(validateWinningProvenance(proof, binding(f))), [`independent-${kind}`]);
    assert.equal(proof.articleSeries, kind);
    assert.deepEqual(proof.origins, [{ categoryId: `independent-${kind}`, sourceField: 'monitor.tickets' }]);
    bundle.monitor.raceKey = '20260928-15-7';
    const wrongRace = input({ bundle, combination: '1-2-3' });
    assert.equal(derive(wrongRace), null);
  }
});

test('aggregate provenance checks immutable report/source hashes and each original article family', () => {
  const ordinary = input({ combination: '1-2-3' }), independent = input({ bundle: fixture(), combination: '1-2-3' });
  const report = reportOf([ordinary, independent]), before = JSON.stringify(report);
  assert.deepEqual(ids(validatedReportOrigins(report)), ['main', 'flow', 'manshu', 'independent-escape']);
  assert.deepEqual(ids(validatedReportOrigins({ ...report })), ['main', 'flow', 'manshu', 'independent-escape']);
  assert.equal(JSON.stringify(report), before);
  assert.deepEqual(validatedReportOrigins(clone(report)), []);
  for (const field of ['evidenceId', 'sourceSha256', 'status', 'combination', 'publicationKey']) {
    assert.deepEqual(validatedReportOrigins({ ...report, [field]: 'tampered' }), []);
  }
  const payoutChanged = rehashReport({ ...report, payoutPer100Yen: 9999 });
  assert.deepEqual(validatedReportOrigins(payoutChanged), []);
  assert.deepEqual(validatedReportOrigins({ ...report, winningProvenance: [...report.winningProvenance, report.winningProvenance[0]] }), []);
});

test('source rebinding or new category labels cannot be laundered by recomputing ordinary report hashes', () => {
  const f = input(), report = reportOf([f]);
  for (const edit of [
    value => { value.sources[0].sourceSha256 = 'a'.repeat(64); },
    value => { value.sources[0].sectionsSha256 = 'a'.repeat(64); },
    value => { value.sources[0].evidenceId = 'a'.repeat(64); },
    value => { value.sources[0].status = 'miss'; },
    value => { value.sources[0].publicationKey = f.row.raceKey + ':escape'; },
    value => { value.matchedSections[0].label = '中心の買い目'; },
    value => { value.sources.push({ ...value.sources[0] }); }
  ]) {
    const changed = { ...clone(report), winningProvenance: report.winningProvenance };
    edit(changed); rehashReport(changed);
    assert.deepEqual(validatedReportOrigins(changed), []);
  }
});

test('readable-v2 category headings and independent labels preserve exact-source provenance', () => {
  const normalSource = normalBundle();
  normalSource.record.prediction.mainSheet.tickets.push('1-2-4');
  const normal = input({ bundle: normalSource, presentationVersion: 'readable-v2' }), proof = derive(normal);
  assert(proof);
  assert.deepEqual(proof.matchedSections, ['🛡️ 押さえ']);
  assert.deepEqual(ids(validateWinningProvenance(proof, binding(normal))), ['cover']);
  for (const kind of ['escape', 'manshu']) {
    const bundle = fixture(); bundle.monitor.kind = kind;
    const f = input({ bundle, combination: '1-2-3', presentationVersion: 'readable-v2' });
    assert.deepEqual(derive(f).matchedSections, [kind === 'escape' ? '🎯 独立本命' : '💥 独立万舟']);
    assert.deepEqual(ids(validateWinningProvenance(derive(f), binding(f))), [`independent-${kind}`]);
  }
});
