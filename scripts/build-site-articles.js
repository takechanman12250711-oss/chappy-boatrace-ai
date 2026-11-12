'use strict';
// Free race articles on our own site. The same saved original, the same
// source audit and the same public copy (readable-v7) as the note article are
// written to data/site-articles, which GitHub Pages serves as-is. No browser,
// login or outside service is involved.
const fs = require('node:fs');
const path = require('node:path');
const { publicationPayload } = require('./note-publication-source');
const { isFreePrice } = require('./note-pricing');

const VERSION = 'site-articles-v1';
const OUTPUT_DIR = 'data/site-articles';

function jstDate(ms) {
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
}

function readDay(file, date) {
  if (!fs.existsSync(file)) return { version: VERSION, date, articles: [] };
  const day = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (day.version !== VERSION || day.date !== date || !Array.isArray(day.articles)) throw new Error('site_articles_day_invalid');
  return day;
}

function buildSiteArticles({ rootDir = process.cwd(), now = Date.now(), handoff, write = true } = {}) {
  const latest = handoff || require('./build-note-publish-handoff').buildLatestHandoff({ write: false }).payload;
  if (!Array.isArray(latest?.candidates)) throw new Error('site_articles_candidates_invalid');
  const date = jstDate(now);
  const file = path.join(rootDir, OUTPUT_DIR, `${date}.json`);
  const day = readDay(file, date);
  const known = new Set(day.articles.map(article => article.publicationKey));
  const added = [], skipped = [];
  for (const candidate of latest.candidates) {
    if (known.has(candidate.publicationKey)) continue;
    const skip = reason => skipped.push({ publicationKey: candidate.publicationKey, reason });
    // Only today's races, and only while the deadline is still ahead at
    // generation time. The site may still show it later than this.
    if (String(candidate.raceKey || '').slice(0, 8) !== date) { skip('race_day_mismatch'); continue; }
    let payload;
    try {
      // Real-clock audit of the immutable original: exhibition, source hash,
      // 1-7 centre tickets, deadline more than 120 seconds ahead.
      payload = publicationPayload(candidate.sourcePath, rootDir, now);
    } catch (error) { skip(error.message); continue; }
    if (payload.publicationKey !== candidate.publicationKey) { skip('publication_key_mismatch'); continue; }
    if (!isFreePrice(Number(payload.price))) { skip('not_free_presentation'); continue; }
    if (!(Date.parse(payload.deadlineAt) > now)) { skip('deadline_passed'); continue; }
    known.add(payload.publicationKey);
    // First publication wins and is never rewritten, like the note reservation.
    const article = {
      publicationKey: payload.publicationKey, raceKey: payload.raceKey, articleSeries: payload.articleSeries,
      place: candidate.place ?? null, raceNo: candidate.raceNo ?? null, deadlineAt: payload.deadlineAt,
      title: payload.title, introText: payload.freeText, ticketText: payload.paidText,
      presentationVersion: payload.presentationVersion, sourcePath: payload.sourcePath,
      // When this entry was generated. It is not a publication time: the
      // commit, push and site deployment all happen later and are not verified here.
      sourceSha256: payload.sourceSha256, savedAt: new Date(now).toISOString()
    };
    day.articles.push(article);
    added.push(article.publicationKey);
  }
  if (added.length && write) {
    day.articles.sort((a, b) => Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt) || a.publicationKey.localeCompare(b.publicationKey));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(day, null, 2)}\n`);
    fs.writeFileSync(path.join(rootDir, OUTPUT_DIR, 'latest.json'), `${JSON.stringify({
      version: VERSION, date, path: `${OUTPUT_DIR}/${date}.json`, count: day.articles.length,
      updatedAt: new Date(now).toISOString()
    }, null, 2)}\n`);
  }
  return { date, added, skipped, count: day.articles.length };
}

if (require.main === module) {
  const result = buildSiteArticles();
  console.log(`SITE_ARTICLES=${JSON.stringify({ date: result.date, added: result.added.length, total: result.count, skipped: result.skipped.length })}`);
  const reasons = {};
  for (const item of result.skipped) reasons[item.reason] = (reasons[item.reason] || 0) + 1;
  if (result.skipped.length) console.log(`SITE_ARTICLES_SKIPPED=${JSON.stringify(reasons)}`);
}

module.exports = { VERSION, OUTPUT_DIR, buildSiteArticles };
