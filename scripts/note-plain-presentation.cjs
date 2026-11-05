'use strict';

// readable-v7 (2026-11-01 owner decision): the end-of-article practical
// subset is shown as "⭐ 中心の買い目" with a plain notice, matching the free
// introduction and the weekly results. Tickets, order, count and the subset
// itself are exactly the readable-v3 model appendix; only its heading and
// notice text change, and the totals line drops the word "延べ". note-korogashi-presentation.cjs stays byte-identical so
// v3-v6 recovery fingerprints are unaffected.
const { createHash } = require('node:crypto');
const modelV3 = require('./note-korogashi-presentation.cjs');
const PRESENTATION_VERSION = 'readable-v7';
const LABEL = '⭐ 中心の買い目';
const NOTICE = [
  'AIがいちばん自信のある買い目です。上の買い目と同じもので、追加で買うことを勧めるものではありません。',
  'この買い目の成績は、上の買い目全体の成績とは別に数えます。'
].join('\n');
const V3_NOTICE = [
  '保存済みの実戦厳選を、コロがし検証用に再掲しています。',
  '上の公開予想と重複する買い目です。追加の予想や追加購入を勧めるものではありません。',
  '公開予想の点数・的中成績には重ねて加算せず、コロがし検証は別に集計します。'
].join('\n');
const requireValue = (value, reason) => { if (!value) throw Error(reason); };
const hash = value => createHash('sha256').update(value).digest('hex');
const once = (text, part) => text.split(part).length === 2;

// The totals line of the v2 category footer, reworded without "延べ".
const V3_TOTAL = /^区分別は延べ(\d+)点。同じ買い目は合計で1点と数えます。$/m;
const PLAIN_TOTAL = /^区分ごとの点数を足すと(\d+)点です（同じ買い目は合計では1点と数えます）。$/m;
const plainTotal = n => `区分ごとの点数を足すと${n}点です（同じ買い目は合計では1点と数えます）。`;
const v3Total = n => `区分別は延べ${n}点。同じ買い目は合計で1点と数えます。`;
const count = (text, pattern) => (text.match(new RegExp(pattern.source, 'gm')) || []).length;
// v3 appendix bytes -> v7 appendix bytes. Each replaced part must occur once.
function fromModelText(text) {
  const heading = `\n\n${modelV3.MODEL_LABEL}\n\n`, notice = `\n\n${V3_NOTICE}`;
  requireValue(typeof text === 'string' && once(text, heading) && once(text, notice), 'plain_model_appendix_invalid');
  requireValue(!text.includes(LABEL) && !text.includes(NOTICE) && count(text, V3_TOTAL) === 1 && !count(text, PLAIN_TOTAL), 'plain_model_appendix_invalid');
  return text.replace(heading, `\n\n${LABEL}\n\n`).replace(notice, `\n\n${NOTICE}`)
    .replace(V3_TOTAL, (_, n) => plainTotal(n));
}
// v7 appendix bytes -> v3 appendix bytes, so the frozen v3 parser validates it.
function toModelText(text) {
  const heading = `\n\n${LABEL}\n\n`, notice = `\n\n${NOTICE}`;
  requireValue(typeof text === 'string' && once(text, heading) && once(text, notice), 'plain_model_appendix_invalid');
  requireValue(!text.includes(modelV3.MODEL_LABEL) && !text.includes(V3_NOTICE) && count(text, PLAIN_TOTAL) === 1 && !count(text, V3_TOTAL), 'plain_model_appendix_invalid');
  return text.replace(heading, `\n\n${modelV3.MODEL_LABEL}\n\n`).replace(notice, `\n\n${V3_NOTICE}`)
    .replace(PLAIN_TOTAL, (_, n) => v3Total(n));
}
function paidTextFromSource(bundle, series, article) {
  return fromModelText(modelV3.paidTextFromSource(bundle, series, article));
}
function parsePaidText(paidText) {
  const parsed = modelV3.parsePaidText(toModelText(paidText));
  requireValue(fromModelText(toModelText(paidText)) === paidText, 'plain_model_appendix_invalid');
  return parsed;
}
function modelProof(paidText, sourceSha256) {
  const proof = modelV3.modelProof(toModelText(paidText), sourceSha256);
  return { ...proof, label: LABEL };
}
module.exports = { PRESENTATION_VERSION, LABEL, NOTICE, fromModelText, toModelText, paidTextFromSource, parsePaidText, modelProof, hash };
