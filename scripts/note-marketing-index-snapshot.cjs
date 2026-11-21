'use strict';
// Read-only check used before an X (Buffer) send: is the index that was last
// verified on the public page still the current index?
//
// The verified public index is a snapshot of one moment. The only clock-driven
// part of publishedIndexBody is each row's article link, which becomes the
// EXPIRED text exactly at the saved deadline (the date header is bound by the
// caller's same-day check). So the rendering only changes at saved deadlines.
//
// A snapshot taken just before such a deadline is still accepted when every
// row whose link changed since then is a free (0 yen) article: the link left
// visible sells nothing, and the next index update removes it. A paid row, an
// unknown price, or any other difference (new rows, results, course text)
// still fails exactly as before. Nothing here edits note, state or a receipt.
const { publishedIndexBody, hash, jstDate } = require('./note-marketing-content');
const { EXPIRED, purchaseLinkText } = require('./note-marketing-expiry');
const { isFreePrice } = require('./note-pricing');

function indexSnapshotCurrent(state, config, now) {
  const stored = state?.articles?.index?.hash;
  if (typeof stored !== 'string' || !Number.isFinite(now)) return false;
  if (stored === hash(publishedIndexBody(state, config, now))) return true;
  const rows = Array.isArray(state.rows) ? state.rows : [];
  // One instant per interval between today's passed deadlines, newest first.
  const instants = [...new Set(rows.map(r => Date.parse(r?.deadlineAt))
    .filter(d => Number.isFinite(d) && d <= now).map(d => d - 1)
    .filter(t => jstDate(t) === jstDate(now)))].sort((a, b) => b - a);
  for (const at of instants) {
    if (stored !== hash(publishedIndexBody(state, config, at))) continue;
    const changed = rows.filter(r => purchaseLinkText(r, at) !== purchaseLinkText(r, now));
    return changed.length > 0 && changed.every(r => isFreePrice(r.price) &&
      purchaseLinkText(r, at) === r.url && purchaseLinkText(r, now) === EXPIRED);
  }
  return false;
}

module.exports = { indexSnapshotCurrent };
