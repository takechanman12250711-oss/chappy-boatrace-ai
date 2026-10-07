'use strict';
// Presentation only. This never changes a paid article, its price, the saved
// official deadline, a publication receipt, or the original prediction.
const EXPIRED = '締切済み｜購入リンクの掲載終了';
const UNKNOWN = '締切未確認｜購入リンクの掲載保留';
const NOTICE = '締切済みの記事は購入しないでください。一覧の購入リンクは定期更新時に外します。記事本体の販売停止ではないため、直接URLや更新前の画面からは購入できる場合があります。';
const ARTICLE = /^https:\/\/note\.com\/great_robin3243\/n\/n[a-f0-9]+$/;
function requireClock(now) {
  if (!Number.isFinite(now)) throw Error('marketing_expiry_clock_invalid');
}
function deadlineState(deadlineAt, now) {
  requireClock(now);
  // Do not let the runner's local timezone interpret an unqualified time.
  if (typeof deadlineAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(deadlineAt)) return 'unknown';
  const deadline = Date.parse(deadlineAt);
  if (!Number.isFinite(deadline)) return 'unknown';
  const zone = deadlineAt.match(/([+-])(\d{2}):(\d{2})$/);
  const offset = zone ? (zone[1] === '+' ? 1 : -1) * (Number(zone[2]) * 60 + Number(zone[3])) : 0;
  if (new Date(deadline + offset * 60000).toISOString().slice(0,19) !== deadlineAt.slice(0,19)) return 'unknown';
  return deadline <= now ? 'expired' : 'before_deadline';
}
function purchaseLinkText(row, now) {
  const status = deadlineState(row?.deadlineAt, now);
  if (status === 'expired') return EXPIRED;
  if (status !== 'before_deadline' || !ARTICLE.test(row?.url || '')) return UNKNOWN;
  return row.url;
}
function indexPurchaseLinks(text, rows, now, { freeUrls = [] } = {}) {
  requireClock(now);
  if (typeof text !== 'string' || !Array.isArray(rows) || !Array.isArray(freeUrls)) throw Error('marketing_expiry_input_invalid');
  // Explicitly exempt only the two configured free navigation pages. A saved
  // course snapshot may contain a paid source URL whose row is no longer in
  // the two-day window; never leave such an unverified purchase link visible.
  const free = new Set(freeUrls);
  const known = new Map();
  for (const row of rows) {
    if (!ARTICLE.test(row?.url || '')) continue;
    const value = purchaseLinkText(row, now);
    if (known.has(row.url) && known.get(row.url) !== value) known.set(row.url, UNKNOWN);
    else if (!known.has(row.url)) known.set(row.url, value);
  }
  return text.replace(/https:\/\/note\.com\/great_robin3243\/n\/n[a-f0-9]+(?:[?#][^\s<>"']*)?/g, raw => {
    const canonical = raw.split(/[?#]/)[0];
    if (free.has(canonical)) return raw;
    const value = known.get(canonical);
    if (value === canonical) return raw;
    return value || UNKNOWN;
  });
}
module.exports = { EXPIRED, UNKNOWN, NOTICE, deadlineState, purchaseLinkText, indexPurchaseLinks };
