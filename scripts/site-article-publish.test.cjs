'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const site = require('./site-article-publish.cjs');
const { dispatchReadyNote } = require('./dispatch-ready-note');

const FREE = [
  '🚤 11月12日 戸田4R', '🕒 締切 12:06', '', '🧭 展開の考え方', '説明', '',
  '📊 結果は当たりも外れも全部公開し、当たった区分を書きます。', '',
  '今日の予想一覧', 'https://note.com/great_robin3243/n/na76b6c6c18ff', '',
  'はじめての方へ', 'https://note.com/great_robin3243/n/ne975c7bb8bea', '',
  '⭐ AIがいちばん自信のある「中心の買い目」は、記事の最後に載せています。上の買い目と同じものです。', '',
  '※予想は参考情報です。舟券の購入は20歳以上の方が、ご自身の判断と責任でお願いします。'
].join('\n');
const PAID = '🎯 本命\n\n2 → 1 → 3・4\n2点\n\n⭐ 中心の買い目\n\n2 → 1 → 3\n1点';
const payload = (over = {}) => ({
  canPublish: true, price: 0, publicationKey: '20301112-02-4:normal', raceKey: '20301112-02-4', articleSeries: 'normal',
  title: '【AI展開予想】11月12日 戸田4R｜締切 12:06｜チャッピーボートレースAI', deadlineAt: '2030-11-12T12:06:00+09:00',
  presentationVersion: 'readable-v7', sourcePath: 'data/note-drafts/20301112/x.json', sourceSha256: 'a'.repeat(64),
  practicalTicketCount: 1, freeText: FREE, paidText: PAID, ...over
});
const before = Date.parse('2030-11-12T11:00:00+09:00');
const config = { version: 'site-publish-config-v1', enabled: true, announce: true,
  pageUrl: 'https://takechanman12250711-oss.github.io/chappy-boatrace-ai/yosou.html' };

test('note links are replaced, everything else is kept', () => {
  const text = site.siteFreeText(FREE);
  assert.doesNotMatch(text, /note\.com|今日の予想一覧|はじめての方へ/);
  assert.match(text, /📊 結果は当たりも外れも全部公開し、当たった区分を書きます。\n\n⭐ AIがいちばん自信のある/);
  assert.match(text, /^🚤 11月12日 戸田4R\n🕒 締切 12:06\n\n🧭 展開の考え方\n説明\n\n/);
  assert.match(text, /20歳以上/);
});

test('article keeps the audited tickets and refuses late or paid copies', () => {
  const article = site.buildArticle(payload(), before);
  assert.equal(article.paidText, PAID);
  assert.equal(article.place, '戸田'); assert.equal(article.raceNo, 4);
  assert.equal(article.id, createHash('sha256').update('20301112-02-4:normal').digest('hex'));
  assert.equal(article.auditedFreeTextSha256, createHash('sha256').update(FREE).digest('hex'));
  assert.throws(() => site.buildArticle(payload(), Date.parse('2030-11-12T12:06:00+09:00')), /deadline_passed/);
  assert.throws(() => site.buildArticle(payload({ price: 200 }), before), /not_free/);
  assert.throws(() => site.buildArticle(payload({ publicationKey: '20301112-02-5:normal' }), before), /place_invalid/);
});

test('articles are immutable and the day list is rebuilt from files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-article-'));
  const a = site.buildArticle(payload(), before);
  const b = site.buildArticle(payload({ publicationKey: '20301112-02-3:normal', raceKey: '20301112-02-3',
    freeText: FREE.replace('戸田4R', '戸田3R'), deadlineAt: '2030-11-12T11:40:00+09:00' }), before);
  const changed = site.writeArticle(root, a);
  assert.deepEqual(changed.map(file => site.ARTICLE_PATH.test(file) || site.INDEX_PATH.test(file)), [true, true]);
  site.writeArticle(root, b);
  assert.throws(() => site.writeArticle(root, a), /EEXIST/);
  const index = JSON.parse(fs.readFileSync(path.join(root, 'data/site-articles/20301112/index.json'), 'utf8'));
  assert.deepEqual(index.articles.map(x => x.raceNo), [3, 4]);
  assert.equal(index.articles[0].freeText, undefined);
  assert.equal(site.isPublished(root, '20301112-02-4:normal'), true);
  assert.equal(site.isPublished(root, '20301112-02-4:manshu'), false);
});

test('X announcement fits, links to the site and carries the notice', () => {
  const text = site.announcementText(site.buildArticle(payload(), before), config);
  assert.ok(site.weight(text) <= 280);
  assert.match(text, /戸田4R｜🕒 12:06締切/);
  assert.match(text, /yosou\.html\?d=20301112&id=[a-f0-9]{64}/);
  assert.match(text, /20歳以上・自己責任/);
  assert.doesNotMatch(text, /note\.com|絶対|必勝|確実|実戦厳選/);
});

test('announcement is claimed before sending and never sent twice', async () => {
  const tags = new Map(); let sent = 0;
  const log = { get: async name => tags.get(name) || null,
    put: async (name, value) => { if (tags.has(name)) throw new Error('marketing_github_POST_422'); tags.set(name, value); } };
  const delivery = { channel: async () => 'c1', create: async () => { sent++; return { id: 'p1' }; } };
  const env = { BUFFER_API_KEY: 'key' };
  const article = site.buildArticle(payload(), before);
  assert.equal((await site.announce(article, { env, config, log, delivery })).status, 'accepted');
  assert.equal((await site.announce(article, { env, config, log, delivery })).status, 'already_claimed');
  assert.equal(sent, 1);
  assert.equal((await site.announce(article, { env, config: { ...config, announce: false }, log, delivery })).status, 'disabled');
  assert.deepEqual((await site.announce(article, { env: {}, config, log, delivery })).reasons, ['buffer_api_key_missing']);
});

test('live-note publishes to the site in the source commit and never starts the note publisher', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'site-dispatch-'));
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const bare = path.join(base, 'remote.git'), work = path.join(base, 'work');
  git(base, ['init', '--bare', '-b', 'main', bare]); git(base, ['init', '-b', 'main', work]);
  for (const args of [['config', 'user.name', 't'], ['config', 'user.email', 't@example.com']]) git(work, args);
  fs.mkdirSync(path.join(work, 'config'));
  fs.writeFileSync(path.join(work, 'config/site-publish.json'), JSON.stringify(config));
  git(work, ['add', '.']); git(work, ['commit', '-m', 'init']); git(work, ['remote', 'add', 'origin', bare]); git(work, ['push', 'origin', 'main']);
  const bytes = 'audited source\n', sha = createHash('sha256').update(bytes).digest('hex');
  const file = `data/note-drafts/20301112/20301112-02-4-${sha}.json`;
  fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
  fs.writeFileSync(path.join(work, file), bytes);
  const candidates = [{ raceKey: '20301112-02-4', articleSeries: 'normal', sourcePath: file }];
  let seen = null, announced = 0;
  const options = {
    rootDir: work, git: args => git(work, args), now: () => before, guard: () => {},
    env: { GITHUB_REPOSITORY: 'takechanman12250711-oss/chappy-boatrace-ai', GITHUB_REF: 'refs/heads/main', NOTE_CLAIM_TOKEN: 't',
      NOTE_SOURCE_ISOLATED: 'true', PUBLICATION_TARGET: 'site' },
    build: () => ({ payload: { candidates } }),
    prepare: async ({ handoff }) => {
      seen = handoff.candidates;
      const c = handoff.candidates[0];
      if (!c) return { ok: false, reason: 'no_eligible_unclaimed_article' };
      const no = c.raceKey.split('-')[2];
      return { ok: true, payload: payload({ sourcePath: file, sourceSha256: sha, raceKey: c.raceKey,
        publicationKey: `20301112-02-${no}:normal`, freeText: FREE.replace('戸田4R', `戸田${no}R`) }) };
    },
    request: async () => assert.fail('note publisher must not be dispatched'),
    announce: async () => { announced++; return { status: 'accepted' }; }
  };
  const result = await dispatchReadyNote(options);
  assert.equal(result.published, 'site'); assert.equal(announced, 1);
  const pushed = git(base, ['--git-dir', bare, 'show', '--name-only', '--format=', 'main']).split('\n').sort();
  assert.deepEqual(pushed, [file, site.articlePath('20301112-02-4:normal'), 'data/site-articles/20301112/index.json'].sort());
  // Next run skips the published race instead of offering it again.
  assert.equal((await dispatchReadyNote(options)).reason, 'no_eligible_unclaimed_article');
  assert.deepEqual(seen, []); assert.equal(announced, 1);
  // A failed X post never undoes or fails the publication.
  candidates.push({ raceKey: '20301112-02-5', articleSeries: 'normal', sourcePath: file });
  const failed = await dispatchReadyNote({ ...options, announce: async () => { throw new Error('buffer_http_500'); } });
  assert.deepEqual(failed.social, { status: 'failed', reason: 'buffer_http_500' });
  assert.equal(site.isPublished(work, '20301112-02-5:normal'), true);
  assert.match(git(base, ['--git-dir', bare, 'show', '--name-only', '--format=', 'main']), /index\.json/);
  await assert.rejects(dispatchReadyNote({ ...options, env: { ...options.env, NOTE_SOURCE_ISOLATED: 'false' } }), /requires_isolated/);
});
