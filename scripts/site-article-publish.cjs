'use strict';

// 2026-11-12 owner decision: note auto-posting needs the paid Browser Use
// service (balance $0). Publish the same audited readable article on our own
// free site (GitHub Pages) instead, and announce it on X through Buffer Free.
// The article text, tickets, gate and deadline checks are exactly the audited
// note payload. Only the two note.com navigation links are swapped for the
// site's own page. One immutable file per race and series; never rewritten.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { SOCIAL_NOTICE } = require('./note-social-notice');

const VERSION = 'site-article-v1';
const ROOT = 'data/site-articles';
const CONFIG_PATH = 'config/site-publish.json';
const ARTICLE_PATH = /^data\/site-articles\/\d{8}\/[a-f0-9]{64}\.json$/;
const INDEX_PATH = /^data\/site-articles\/\d{8}\/index\.json$/;
const labels = { normal: 'AI展開', escape: '本命', manshu: '万舟' };
const digest = value => createHash('sha256').update(value).digest('hex');
const jst = ms => new Date(ms + 9 * 3600000).toISOString();

function loadConfig(rootDir = process.cwd()) {
  const config = JSON.parse(fs.readFileSync(path.join(rootDir, CONFIG_PATH), 'utf8'));
  if (config.version !== 'site-publish-config-v1' || typeof config.enabled !== 'boolean' ||
      typeof config.announce !== 'boolean' ||
      !/^https:\/\/takechanman12250711-oss\.github\.io\/chappy-boatrace-ai\/yosou\.html$/.test(config.pageUrl || '')) {
    throw new Error('site_publish_config_invalid');
  }
  return config;
}

function articleId(publicationKey) {
  if (!/^\d{8}-\d{2}-\d{1,2}:(normal|escape|manshu)$/.test(publicationKey || '')) throw new Error('site_publication_key_invalid');
  return digest(publicationKey);
}
const dateOfKey = publicationKey => publicationKey.slice(0, 8);
function articlePath(publicationKey) {
  return `${ROOT}/${dateOfKey(publicationKey)}/${articleId(publicationKey)}.json`;
}
function articleUrl(config, publicationKey) {
  return `${config.pageUrl}?d=${dateOfKey(publicationKey)}&id=${articleId(publicationKey)}`;
}
function isPublished(rootDir, publicationKey) {
  return fs.existsSync(path.join(rootDir, articlePath(publicationKey)));
}

// The free part ends with note.com navigation (today's list, beginner guide).
// On our site those become the site's own list page. Nothing else changes.
function siteFreeText(freeText) {
  const lines = String(freeText).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^https:\/\/note\.com\//.test(lines[i])) {
      if (out.length && out[out.length - 1].trim() && !/^https?:/.test(out[out.length - 1])) out.pop();
      continue;
    }
    out.push(lines[i]);
  }
  const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (/note\.com/.test(text)) throw new Error('site_free_text_note_link_left');
  return text;
}

function buildArticle(payload, now = Date.now()) {
  if (payload?.canPublish !== true || payload.price !== 0) throw new Error('site_article_payload_not_free');
  if (!(now < Date.parse(payload.deadlineAt))) throw new Error('site_article_deadline_passed');
  const m = /^(\d{8})-(\d{2})-(\d{1,2}):(normal|escape|manshu)$/.exec(payload.publicationKey || '');
  if (!m) throw new Error('site_publication_key_invalid');
  const place = (/^🚤 \d{1,2}月\d{1,2}日 (.+?)(\d{1,2})R$/m.exec(payload.freeText) || [])[1];
  if (!place || Number((/^🚤 .+?(\d{1,2})R$/m.exec(payload.freeText) || [])[1]) !== Number(m[3])) throw new Error('site_article_place_invalid');
  return {
    version: VERSION,
    id: articleId(payload.publicationKey),
    publicationKey: payload.publicationKey,
    raceKey: payload.raceKey,
    articleSeries: payload.articleSeries,
    place, raceNo: Number(m[3]), jcd: m[2],
    title: payload.title,
    deadlineAt: payload.deadlineAt,
    publishedAt: new Date(now).toISOString(),
    presentationVersion: payload.presentationVersion,
    sourcePath: payload.sourcePath,
    sourceSha256: payload.sourceSha256,
    practicalTicketCount: payload.practicalTicketCount,
    freeText: siteFreeText(payload.freeText),
    paidText: payload.paidText,
    // Exact audited note copy, kept so anyone can check nothing was changed.
    auditedFreeTextSha256: digest(payload.freeText),
    auditedPaidTextSha256: digest(payload.paidText)
  };
}

function indexEntry(article) {
  const { id, publicationKey, raceKey, articleSeries, place, raceNo, jcd, title, deadlineAt, publishedAt } = article;
  return { id, publicationKey, raceKey, articleSeries, place, raceNo, jcd, title, deadlineAt, publishedAt };
}

// Writes the immutable article and rebuilds that day's list from the files on
// disk. Returns the repository paths that changed.
function writeArticle(rootDir, article) {
  const file = articlePath(article.publicationKey);
  if (article.id !== articleId(article.publicationKey)) throw new Error('site_article_id_mismatch');
  const target = path.join(rootDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(article, null, 2) + '\n', { flag: 'wx' });
  const dir = path.dirname(target);
  const entries = fs.readdirSync(dir).filter(name => /^[a-f0-9]{64}\.json$/.test(name))
    .map(name => indexEntry(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))))
    .sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt) || a.publicationKey.localeCompare(b.publicationKey));
  const index = `${ROOT}/${dateOfKey(article.publicationKey)}/index.json`;
  fs.writeFileSync(path.join(rootDir, index), JSON.stringify({ version: 'site-article-index-v1',
    date: dateOfKey(article.publicationKey), articles: entries }, null, 2) + '\n');
  return [file, index];
}

const weight = text => [...text.replace(/https:\/\/\S+/g, 'x'.repeat(23))].reduce((n, c) => n + (c.codePointAt(0) > 127 ? 2 : 1), 0);
function announcementText(article, config) {
  const date = article.raceKey.slice(4, 8);
  const time = jst(Date.parse(article.deadlineAt)).slice(11, 16);
  const text = [
    `🚤 ${Number(date.slice(0, 2))}/${Number(date.slice(2))} ${labels[article.articleSeries]}予想`,
    `${article.place}${article.raceNo}R｜🕒 ${time}締切`,
    '',
    '🧭 展開・注目艇・狙う理由',
    '🎟️ 買い目・点数（すべて無料）',
    '外れも含めて結果を全部公開しています。',
    articleUrl(config, article.publicationKey),
    '',
    SOCIAL_NOTICE
  ].join('\n');
  if (weight(text) > 280) throw new Error('site_announcement_too_long');
  return text;
}

// One X post per site article. The claim tag is created before sending, so a
// lost response is never sent twice. Failures never undo the publication.
async function announce(article, { env = process.env, config, log, delivery } = {}) {
  if (!config.announce) return { status: 'disabled' };
  const { ledger, transport, blockers } = require('./send-note-buffer.cjs');
  const social = JSON.parse(fs.readFileSync('config/note-social.json', 'utf8'));
  const reasons = blockers(social, env, Date.now());
  if (reasons.length) return { status: 'skipped', reasons };
  const store = log ? null : require('./note-marketing-store').client(env);
  log = log || ledger(store);
  delivery = delivery || transport(env, social, log);
  const text = announcementText(article, config);
  const suffix = `${article.raceKey.slice(0, 8)}/${article.id}`, name = `site-buffer-claim/${suffix}`;
  if (await log.get(name)) return { status: 'already_claimed' };
  await log.put(name, { version: 'site-buffer-claim-v1', publicationKey: article.publicationKey, textSha256: digest(text), claimedAt: new Date().toISOString() });
  const channelId = await delivery.channel();
  const post = await delivery.create(text, channelId);
  await log.put(`site-buffer-accepted/${suffix}`, { postId: post.id, channelId, textSha256: digest(text), acceptedAt: new Date().toISOString() });
  return { status: 'accepted', postId: post.id };
}

module.exports = { VERSION, ROOT, CONFIG_PATH, ARTICLE_PATH, INDEX_PATH, loadConfig, articleId, articlePath, articleUrl,
  isPublished, siteFreeText, buildArticle, writeArticle, announcementText, announce, weight };
