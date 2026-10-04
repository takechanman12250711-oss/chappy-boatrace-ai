'use strict';

// Source identity, never inferred from a normal AI ticket or headline.
const SERIES = Object.freeze({
  normal: { label: 'AI展開予想', brand: 'チャッピーボートレースAI', color: '#136b86' },
  escape: { label: 'イン逃げ', brand: 'チャッピー 狙い目監視', color: '#167665' },
  manshu: { label: '万舟', brand: 'チャッピー 狙い目監視', color: '#aa5732' }
});
function requireSeries(value = 'normal') {
  if (!Object.hasOwn(SERIES, value)) throw new Error('note_article_series_invalid');
  return value;
}
function seriesOfBundle(bundle) {
  if (bundle?.version === 'note-draft-bundle-v1' && bundle.record?.source !== 'independent-watch') return 'normal';
  if (bundle?.version === 'independent-monitor-note-v1' && bundle.monitor?.origin === 'independent-watch' &&
      bundle.record?.source === 'independent-watch' && ['escape', 'manshu'].includes(bundle.monitor.kind)) return bundle.monitor.kind;
  throw new Error('note_article_series_source_invalid');
}
function publicationKey(raceKey, series = 'normal') {
  const m = /^(\d{8})-(\d{1,2})-(\d{1,2})$/.exec(String(raceKey || ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 24 || Number(m[3]) < 1 || Number(m[3]) > 12) {
    throw new Error('note_claim_race_key_invalid');
  }
  return `${m[1]}-${m[2].padStart(2, '0')}-${Number(m[3])}:${requireSeries(series)}`;
}
function seriesTitle(article, series) {
  requireSeries(series);
  // Monitoring originals already identify their kind. Preserve their wording.
  if (series !== 'normal') return article;
  return { ...article, title: `【AI展開予想】${article.title.replace(/^【(?:通常予想|AI展開予想)】/, '')}` };
}
module.exports = { SERIES, requireSeries, seriesOfBundle, publicationKey, seriesTitle };
