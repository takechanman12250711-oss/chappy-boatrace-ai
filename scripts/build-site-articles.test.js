'use strict';
// Local synthetic fixtures only. No network or publication is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fixture } = require('./note-independent-monitor-fixture');
const source = require('./note-publication-source');
const { buildSiteArticles, VERSION } = require('./build-site-articles');
const START = Date.parse('2026-09-28T17:26:00+09:00');

function workspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'site-articles-test-'));
  fs.mkdirSync(path.join(directory, 'config'));
  fs.copyFileSync(path.join(__dirname, '../config/note-marketing.json'), path.join(directory, 'config/note-marketing.json'));
  const candidates = [6, 7].map(raceNo => {
    let bundle = fixture();
    if (raceNo === 7) {
      bundle = JSON.parse(JSON.stringify(bundle).replaceAll('20260928-15-6', '20260928-15-7')
        .replaceAll('6R', '7R').replaceAll('rno=6', 'rno=7').replaceAll('17:29', '17:49'));
      bundle.record.raceNo = 7; bundle.article.meta.raceNo = 7; bundle.monitor.article.meta.raceNo = 7;
    }
    const bytes = JSON.stringify(bundle);
    const sourcePath = `data/note-drafts/${bundle.record.date}/${bundle.record.raceKey}-${createHash('sha256').update(bytes).digest('hex')}.json`;
    fs.mkdirSync(path.dirname(path.join(directory, sourcePath)), { recursive: true });
    fs.writeFileSync(path.join(directory, sourcePath), bytes);
    const payload = source.publicationPayload(sourcePath, directory, START);
    return { publicationKey: payload.publicationKey, raceKey: payload.raceKey, sourcePath, place: bundle.record.place, raceNo, payload };
  });
  return { directory, candidates, handoff: { candidates: candidates.map(({ payload, ...rest }) => rest) },
    read: name => JSON.parse(fs.readFileSync(path.join(directory, 'data/site-articles', name), 'utf8')),
    close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('articles carry the same audited public copy as the note article and are saved in deadline order', () => {
  const w = workspace();
  try {
    const result = buildSiteArticles({ rootDir: w.directory, now: START, handoff: w.handoff });
    assert.deepEqual(result.added, w.candidates.map(c => c.publicationKey));
    const day = w.read('20260928.json');
    assert.equal(day.version, VERSION);
    day.articles.forEach((article, index) => {
      const payload = w.candidates[index].payload;
      assert.equal(article.title, payload.title);
      assert.equal(article.introText, payload.freeText);
      assert.equal(article.ticketText, payload.paidText);
      assert.equal(article.sourceSha256, payload.sourceSha256);
      assert.equal(article.presentationVersion, 'readable-v7');
      assert.equal(article.savedAt, new Date(START).toISOString());
      assert.ok(Date.parse(article.savedAt) < Date.parse(article.deadlineAt));
      assert.equal('publishedAt' in article, false, 'generation time is not recorded as a publication time');
    });
    assert.deepEqual(w.read('latest.json'), { version: VERSION, date: '20260928', path: 'data/site-articles/20260928.json',
      count: 2, updatedAt: new Date(START).toISOString() });
  } finally { w.close(); }
});

test('the first publication is never rewritten and a later run adds nothing', () => {
  const w = workspace();
  try {
    buildSiteArticles({ rootDir: w.directory, now: START, handoff: { candidates: [w.handoff.candidates[0]] } });
    const before = fs.readFileSync(path.join(w.directory, 'data/site-articles/20260928.json'), 'utf8');
    const again = buildSiteArticles({ rootDir: w.directory, now: START + 30000, handoff: { candidates: [w.handoff.candidates[0]] } });
    assert.deepEqual(again.added, []);
    assert.equal(fs.readFileSync(path.join(w.directory, 'data/site-articles/20260928.json'), 'utf8'), before);
    const second = buildSiteArticles({ rootDir: w.directory, now: START + 30000, handoff: w.handoff });
    assert.deepEqual(second.added, [w.candidates[1].publicationKey]);
    const day = w.read('20260928.json');
    assert.equal(day.articles[0].savedAt, new Date(START).toISOString());
    assert.equal(day.articles[1].savedAt, new Date(START + 30000).toISOString());
  } finally { w.close(); }
});

test('nothing is published too close to or after the deadline, on another day, or from a changed original', () => {
  const w = workspace();
  try {
    const deadline = Date.parse(w.candidates[0].payload.deadlineAt);
    const close = buildSiteArticles({ rootDir: w.directory, now: deadline - 120000, handoff: { candidates: [w.handoff.candidates[0]] } });
    assert.deepEqual(close.added, []);
    assert.equal(close.skipped[0].reason, 'publication_content_audit_blocked');
    const nextDay = buildSiteArticles({ rootDir: w.directory, now: START + 24 * 3600000, handoff: w.handoff });
    assert.deepEqual(nextDay.skipped.map(item => item.reason), ['race_day_mismatch', 'race_day_mismatch']);
    fs.appendFileSync(path.join(w.directory, w.candidates[1].sourcePath), ' ');
    const changed = buildSiteArticles({ rootDir: w.directory, now: START, handoff: { candidates: [w.handoff.candidates[1]] } });
    assert.equal(changed.skipped[0].reason, 'publication_source_hash_mismatch');
    assert.equal(fs.existsSync(path.join(w.directory, 'data/site-articles')), false, 'no file is written when nothing qualifies');
    assert.throws(() => buildSiteArticles({ rootDir: w.directory, now: START, handoff: {} }), /candidates_invalid/);
  } finally { w.close(); }
});

test('the note handoff is still saved when there is no site output, and the page claims no publication time', () => {
  const { execFileSync } = require('node:child_process');
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/build-note-publish-handoff.yml'), 'utf8');
  const step = workflow.slice(workflow.indexOf('- name: Save handoffs only when changed'));
  const script = step.slice(step.indexOf('run: |') + 6).split('\n').map(line => line.replace(/^ {10}/, '')).join('\n')
    .replace(/git pull --rebase origin main\n/, '').replace(/git push origin main\n?/, '');
  for (const withSite of [false, true]) {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'site-articles-git-'));
    try {
      const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
      git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.invalid');
      git('config', 'commit.gpgsign', 'false');
      fs.mkdirSync(path.join(repo, 'data/note-publish'), { recursive: true });
      fs.writeFileSync(path.join(repo, 'README'), 'x'); git('add', '.'); git('commit', '-q', '-m', 'base');
      for (const name of ['latest.json', 'latest.md', 'iphone.json']) fs.writeFileSync(path.join(repo, 'data/note-publish', name), '{}');
      if (withSite) {
        fs.mkdirSync(path.join(repo, 'data/site-articles'));
        fs.writeFileSync(path.join(repo, 'data/site-articles/latest.json'), '{}');
      }
      execFileSync('bash', ['-e', '-c', script], { cwd: repo, encoding: 'utf8' });
      const saved = git('show', '--name-only', '--format=%s', 'HEAD').trim().split('\n');
      assert.equal(saved[0], 'Build note publish handoff');
      assert.equal(saved.includes('data/note-publish/latest.json'), true);
      assert.equal(saved.includes('data/site-articles/latest.json'), withSite);
    } finally { fs.rmSync(repo, { recursive: true, force: true }); }
  }
  const page = fs.readFileSync(path.join(__dirname, '../yosou.html'), 'utf8');
  assert.doesNotMatch(page, /publishedAt|（締切前）/);
});
