'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { fixture } = require('./note-independent-monitor-fixture');
const { publicationKey, seriesOfBundle } = require('./note-article-series');
const { saveIndependentMonitorNote } = require('./save-independent-monitor-note');
const { publicationPayload } = require('./note-publication-source');
const { draftClaimRef, preflightDraft } = require('./note-github-ui-transport');
const { publishQueue } = require('./publish-note-queue');
const { receiptRow, indexBody } = require('./note-marketing-content');
const config = require('../config/note-marketing.json');
const now = Date.parse('2026-09-28T16:01:00+09:00');
const sha = text => createHash('sha256').update(text).digest('hex');
const env = { GITHUB_REPOSITORY: 'takechanman12250711-oss/chappy-boatrace-ai', GITHUB_SHA: 'a'.repeat(40), NOTE_CLAIM_TOKEN: 'test', NOTE_UI_MODE: 'publish' };
function original(kind = 'escape') {
  const b = fixture();
  b.monitor.kind = kind;
  if (kind === 'manshu') b.article.title = b.article.title.replace('イン逃げ', '万舟');
  b.monitor.article = structuredClone(b.article);
  return b;
}
function withRoot(fn) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-series-test-'));
  return Promise.resolve().then(() => fn(rootDir)).finally(() => fs.rmSync(rootDir, { recursive: true, force: true }));
}
function saveBytes(bundle, rootDir) {
  const bytes = JSON.stringify(bundle), sourceSha256 = sha(bytes);
  const file = `data/note-drafts/${bundle.record.date}/${bundle.record.raceKey}-${sourceSha256}.json`;
  fs.mkdirSync(path.dirname(path.join(rootDir, file)), { recursive: true });
  fs.writeFileSync(path.join(rootDir, file), bytes);
  return { file, bytes, sourceSha256 };
}

test('intake preserves complete independent original and has one immutable path', () => withRoot(rootDir => {
  for (const kind of ['escape', 'manshu']) {
    const b = original(kind), before = JSON.stringify(b);
    const saved = saveIndependentMonitorNote(b, { rootDir, now });
    assert.equal(saved.articleSeries, kind);
    assert.equal(saved.publicationKey, b.record.raceKey + ':' + kind);
    assert.equal(fs.readFileSync(path.join(rootDir, saved.sourcePath), 'utf8'), before + '\n');
    assert.equal(saved.changed, true);
    assert.equal(saveIndependentMonitorNote(b, { rootDir, now }).changed, false);
    const p = publicationPayload(saved.sourcePath, rootDir, now);
    assert.equal(p.title, b.article.title);
    assert.ok(p.freeText.includes('元の理由を短縮・差し替えしない。'));
    assert.ok(p.paidText.startsWith(kind === 'escape' ? '🎯 独立本命' : '💥 独立万舟'));
    assert.deepEqual(require('./note-readable-article').ticketsIn(p.paidText), ['1-2-3', '1-2-4']);
    assert.equal(JSON.stringify(b), before);
  }
}));

test('provisional, future, wrong-kind, missing exhibition and late originals cannot enter queue', () => withRoot(rootDir => {
  for (const change of [b => { b.monitor.status = 'provisional'; },
    b => { b.article.title = b.article.title.replace('イン逃げ', '万舟'); b.monitor.article = structuredClone(b.article); },
    b => { b.record.exhibitionSnapshot.entries[0].exhibition.displayTime = null; }]) {
    const b = original(); change(b);
    assert.throws(() => saveIndependentMonitorNote(b, { rootDir, now }));
  }
  assert.throws(() => saveIndependentMonitorNote(original(), { rootDir, now: now - 120000 }), /current_race/);
  assert.throws(() => saveIndependentMonitorNote(original(), { rootDir, now: Date.parse('2026-09-28T17:28:00+09:00') }), /audit_blocked/);
  assert.throws(() => saveIndependentMonitorNote(original(), { rootDir, now: now + 86400000 }), /current_race/);
  const future = saveBytes(original(), rootDir);
  assert.throws(() => publicationPayload(future.file, rootDir, now - 120000), /future_confirmation/);
}));

test('handoff keeps all three kinds for one race and only newest within each kind', () => withRoot(rootDir => {
  const normal = original(); normal.version = 'note-draft-bundle-v1'; delete normal.monitor; delete normal.record.source;
  saveBytes(normal, rootDir);
  for (const kind of ['escape', 'manshu']) {
    const b = original(kind); saveBytes(b, rootDir);
    b.capturedAt = '2026-09-28T16:00:30+09:00'; saveBytes(b, rootDir);
  }
  const invalid = original(); invalid.record.raceKey = 'bad'; saveBytes(invalid, rootDir);
  const script = path.join(__dirname, 'build-note-publish-handoff.js');
  const handoff = JSON.parse(execFileSync(process.execPath, ['-e', `console.log(JSON.stringify(require(${JSON.stringify(script)}).buildLatestHandoff({write:false}).payload))`], { cwd: rootDir, encoding: 'utf8' }));
  assert.equal(handoff.candidateCount, 3);
  assert.deepEqual(handoff.candidates.map(c => c.articleSeries).sort(), ['escape', 'manshu', 'normal']);
  for (const row of handoff.candidates.filter(c => c.articleSeries !== 'normal')) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(rootDir, row.sourcePath))).capturedAt, '2026-09-28T16:00:30+09:00');
  }
}));

test('reservations preserve old normal identity and independent retries stay unique per kind', () => {
  const base = { raceKey: '20260928-01-06' };
  assert.equal(draftClaimRef(base), 'refs/tags/note-draft-claim/' + sha('20260928-1-6'));
  const refs = ['normal', 'escape', 'manshu'].map(articleSeries => draftClaimRef({ ...base, articleSeries }));
  assert.equal(new Set(refs).size, 3);
  assert.equal(draftClaimRef({ raceKey: '20260928-1-6', articleSeries: 'escape', title: 'revised' }), refs[1]);
  assert.throws(() => draftClaimRef({ ...base, articleSeries: 'invented' }));
});

test('legacy unknown attempts block; source-verified other kind allows a separate article', () => withRoot(async rootDir => {
  const oldNow = Date.now; Date.now = () => now;
  try {
    const saved = saveIndependentMonitorNote(original(), { rootDir, now });
    const p = publicationPayload(saved.sourcePath, rootDir, now);
    const legacyRef = draftClaimRef({ raceKey: p.raceKey });
    let receipt = null;
    const request = async url => {
      if (url.includes('/contents/')) return receipt ? { status: 200, json: async () => ({ encoding: 'base64', content: Buffer.from(JSON.stringify(receipt)).toString('base64') }) } : { status: 404 };
      return url.endsWith(legacyRef.slice(5)) ? { status: 200, json: async () => ({ ref: legacyRef }) } : { status: 404 };
    };
    assert.equal((await preflightDraft(p, env, request, rootDir)).reason, 'legacy_attempt_review_required');
    const normal = original(); normal.version = 'note-draft-bundle-v1'; delete normal.record.source; delete normal.monitor;
    const source = saveBytes(normal, rootDir);
    receipt = { version: 'note-publication-receipt-v1', raceKey: p.raceKey, sourceSha256: source.sourceSha256,
      price: 300, url: 'https://note.com/great_robin3243/n/n123abc', publishedAt: '2026-09-28T16:00:10+09:00', verifiedAt: '2026-09-28T16:00:20+09:00' };
    assert.equal((await preflightDraft(p, env, request, rootDir)).ok, true);
    receipt.sourceSha256 = saved.sha256;
    assert.equal((await preflightDraft(p, env, request, rootDir)).reason, 'legacy_attempt_review_required');
    await assert.rejects(preflightDraft({ ...p, articleSeries: 'manshu' }, env, request, rootDir), /mismatch_articleSeries/);
  } finally { Date.now = oldNow; }
}));

test('queue processes each kind for the same race and refuses a receipt from another kind', async () => {
  const candidates = ['normal', 'escape', 'manshu'].map(articleSeries => ({ raceKey: '20260928-15-6', articleSeries, publicationKey: publicationKey('20260928-15-6', articleSeries) }));
  const sent = [];
  const args = { env, now: () => now, build: () => ({ payload: { candidates: structuredClone(candidates) } }),
    prepare: async ({ handoff }) => handoff.candidates.length ? { ok: true, payload: handoff.candidates[0] } : { ok: false },
    publish: async ({ env: e }) => { const p = JSON.parse(fs.readFileSync(e.NOTE_IPHONE_HANDOFF)); sent.push(p.articleSeries); return { ...p, url: 'verified-test' }; } };
  assert.equal((await publishQueue(args)).published, 3);
  assert.deepEqual(sent, ['normal', 'escape', 'manshu']);
  await assert.rejects(publishQueue({ ...args, publish: async () => ({ raceKey: candidates[0].raceKey, articleSeries: 'manshu', url: 'wrong-kind' }) }), /receipt_missing/);
});

test('index verifies source kind, lists three sections, and rejects duplicate articles within kind', () => {
  const rows = ['normal', 'escape', 'manshu'].map((kind, i) => {
    const b = original(kind === 'normal' ? 'escape' : kind);
    if (kind === 'normal') { b.version = 'note-draft-bundle-v1'; delete b.monitor; delete b.record.source; }
    const bytes = JSON.stringify(b);
    const receipt = { version: 'note-publication-receipt-v1', raceKey: b.record.raceKey, sourceSha256: sha(bytes),
      price: 300, url: `https://note.com/great_robin3243/n/n123ab${i}`, publishedAt: '2026-09-28T16:00:10+09:00', verifiedAt: '2026-09-28T16:00:20+09:00', articleSeries: kind };
    assert.equal(seriesOfBundle(b), kind);
    assert.throws(() => receiptRow({ ...receipt, articleSeries: 'wrong' }, bytes, now), /series_mismatch/);
    return receiptRow(receipt, bytes, now);
  });
  const body = indexBody(rows, config, now);
  for (const [i, label] of ['AI展開予想', 'イン逃げ', '万舟'].entries()) {
    const section = body.split(label + '\n')[1].split('\n\n')[0];
    assert.ok(section.includes('17:29｜丸亀6R\n公開 16:00｜実戦厳選' + rows[i].ticketCount + '点\n公開時価格 300円\n掲載全券：照合確認中\n中心のみ（従来）：公式結果との照合待ち\n' + rows[i].url));
    assert.ok(section.includes(rows[i].resultUrl));
    assert.equal(rows.filter(row => section.includes(row.url)).length, 1, 'each article stays in its own series');
  }
  assert.throws(() => indexBody([...rows, { ...rows[1], url: 'https://note.com/great_robin3243/n/nfff' }], config, now), /duplicate/);
});
