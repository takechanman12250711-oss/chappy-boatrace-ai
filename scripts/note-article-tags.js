'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { requireSeries } = require('./note-article-series');

// Genre and hashtags per article kind. Definition only: nothing here is typed
// into note yet. The kind comes from the saved source's articleSeries, never
// from the body text, the favourite boat, or the word "万舟" in an article.
const MAX_TAGS = 8;

function loadTagConfig(rootDir = path.join(__dirname, '..')) {
  const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'config/note-article-tags.json'), 'utf8'));
  if (config.version !== 'note-article-tags-v1') throw new Error('note_article_tags_version_invalid');
  return config;
}

function validTag(tag) {
  return typeof tag === 'string' && tag === tag.trim() && tag.length >= 1 && tag.length <= 20 && !/[#＃\s]/.test(tag);
}

function articleClassification(payload, config = loadTagConfig()) {
  const series = requireSeries(payload?.articleSeries);
  const parts = /^(\d{8})-(\d{1,2})-(\d{1,2})$/.exec(String(payload?.raceKey || ''));
  if (!parts) throw new Error('note_article_tags_race_key_invalid');
  const venue = config.venues?.[String(Number(parts[2]))];
  if (!venue) throw new Error('note_article_tags_venue_unknown');
  const kind = config.series?.[series];
  if (!kind || !validTag(kind.genre)) throw new Error('note_article_tags_series_missing');
  const tags = [...kind.tags, `ボートレース${venue}`, ...config.common];
  if (tags.length > MAX_TAGS || new Set(tags).size !== tags.length || !tags.every(validTag)) {
    throw new Error('note_article_tags_invalid');
  }
  return Object.freeze({ series, genre: kind.genre, venue, tags: Object.freeze(tags) });
}

module.exports = { MAX_TAGS, loadTagConfig, articleClassification };
