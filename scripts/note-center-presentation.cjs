'use strict';

// readable-v8 (2026-11-16 owner decision): the end-of-article "⭐ 中心の買い目"
// subset may hold 1-10 tickets (was 1-7). With 1-7 tickets every byte equals
// readable-v7. note-korogashi-presentation.cjs (the v3 model, 1-7 only) and
// note-plain-presentation.cjs (the v7 wording) stay byte-identical so v3-v7
// recovery fingerprints are unaffected; this module repeats the v3 model
// rules with only the count widened, then applies the unchanged v7 wording.
const { createHash } = require('node:crypto');
const categoryV2 = require('./note-category-article');
const modelV3 = require('./note-korogashi-presentation.cjs');
const plain = require('./note-plain-presentation.cjs');
const { seriesOfBundle } = require('./note-article-series');
const { MAX_PUBLICATION_TICKETS } = require('./note-ticket-limit.cjs');
const PRESENTATION_VERSION = 'readable-v8';
const MODEL_LABEL = modelV3.MODEL_LABEL;
// Same bytes as the v3 model notice (not exported there).
const MODEL_NOTICE = [
  '保存済みの実戦厳選を、コロがし検証用に再掲しています。',
  '上の公開予想と重複する買い目です。追加の予想や追加購入を勧めるものではありません。',
  '公開予想の点数・的中成績には重ねて加算せず、コロがし検証は別に集計します。'
].join('\n');
const FORMATION = /^(?:[1-6](?:・[1-6])*) → (?:[1-6](?:・[1-6])*) → (?:[1-6](?:・[1-6])*)$/;
const requireValue = (value, reason) => { if (!value) throw Error(reason); };
const valid = ticket => typeof ticket === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(ticket) && new Set(ticket.split('-')).size === 3;
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const hash = value => createHash('sha256').update(value).digest('hex');

function ticketRows(rows) {
  requireValue(Array.isArray(rows), 'center_model_source_missing');
  const tickets = rows.map(row => typeof row === 'string' ? row : row?.ticket);
  requireValue(tickets.length >= 1 && tickets.length <= MAX_PUBLICATION_TICKETS, 'center_model_ticket_count_invalid');
  requireValue(tickets.every(valid), 'center_model_ticket_invalid');
  requireValue(new Set(tickets).size === tickets.length, 'center_model_ticket_duplicate');
  return tickets;
}
function requirePrimarySubset(tickets, sections) {
  const primary = new Set(sections.filter(section => section.label !== categoryV2.REFERENCE)
    .flatMap(section => section.tickets));
  requireValue(tickets.every(ticket => primary.has(ticket)), 'center_model_primary_membership_missing');
}
function sourceSubset(bundle) {
  // Only established original bundle families qualify. Never fall back to a
  // candidate24 pool, autonomous research candidate, category or reference list.
  const series = seriesOfBundle(bundle);
  requireValue(series !== 'normal' || bundle.record?.source === undefined, 'center_model_source_unknown');
  const tickets = ticketRows(bundle.baselinePracticalTickets);
  const copies = [bundle.record?.prediction?.practicalTickets, bundle.article?.practicalTickets];
  if (series !== 'normal') copies.push(bundle.monitor?.tickets);
  for (const rows of copies) requireValue(same(tickets, ticketRows(rows)), 'center_model_source_mismatch');
  requirePrimarySubset(tickets, categoryV2.sourceSections(bundle, series));
  // A new immutable array in the baseline's original order.
  return Object.freeze(tickets);
}
// The v3 appendix bytes, for the unchanged v3-v7 renderer chain.
function modelPaidTextFromSource(bundle, series, article = bundle.article) {
  requireValue(series === seriesOfBundle(bundle), 'center_model_series_mismatch');
  const tickets = sourceSubset(bundle);
  requireValue(same(tickets, ticketRows(article?.practicalTickets)), 'center_model_source_mismatch');
  const sections = categoryV2.sourceSections(bundle, series, article);
  requirePrimarySubset(tickets, sections);
  return categoryV2.paidTextFromSections(sections) + '\n\n' +
    [MODEL_LABEL, `${categoryV2.formations(tickets)}\n${tickets.length}点`, MODEL_NOTICE].join('\n\n');
}
function modelParsePaidText(paidText) {
  requireValue(typeof paidText === 'string' && paidText.length, 'published_paid_text_missing');
  const parts = paidText.split('\n\n' + MODEL_LABEL + '\n\n');
  requireValue(parts.length === 2, 'center_model_appendix_missing_or_duplicate');
  const [basePaidText, modelText] = parts;
  const sections = categoryV2.parsePaidSections(basePaidText);
  const blocks = modelText.split('\n\n');
  requireValue(blocks.length === 2 && blocks[1] === MODEL_NOTICE, 'center_model_appendix_invalid');
  const lines = blocks[0].split('\n'), count = /^([1-9]|10)点$/.exec(lines.pop());
  requireValue(count && lines.length && lines.every(line => FORMATION.test(line)), 'center_model_appendix_invalid');
  const modelTickets = ticketRows(lines.flatMap(line => {
    requireValue(line.split(' → ').every(axis => {
      const boats = axis.split('・');
      return new Set(boats).size === boats.length;
    }), 'center_model_appendix_invalid');
    const tickets = categoryV2.ticketsIn(line);
    requireValue(tickets.length, 'center_model_ticket_invalid');
    return tickets;
  }));
  requireValue(Number(count[1]) === modelTickets.length, 'center_model_ticket_count_mismatch');
  requirePrimarySubset(modelTickets, sections);
  return { sections, modelTickets, basePaidText };
}
// The object the renderer chain uses in place of the v3 model.
const model = Object.freeze({ paidTextFromSource: modelPaidTextFromSource, parsePaidText: modelParsePaidText });

// Published (v7-worded) bytes.
function paidTextFromSource(bundle, series, article) {
  return plain.fromModelText(modelPaidTextFromSource(bundle, series, article));
}
function parsePaidText(paidText) {
  const parsed = modelParsePaidText(plain.toModelText(paidText));
  requireValue(plain.fromModelText(plain.toModelText(paidText)) === paidText, 'plain_model_appendix_invalid');
  return parsed;
}
function modelProof(paidText, sourceSha256) {
  requireValue(typeof sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(sourceSha256), 'center_model_source_hash_invalid');
  const { modelTickets } = parsePaidText(paidText);
  return { version: 'note-korogashi-display-v1', label: plain.LABEL, sourceSha256,
    ticketCount: modelTickets.length, ticketsSha256: hash(JSON.stringify([...new Set(modelTickets)].sort())),
    includedInPublishedResult: false };
}
module.exports = { PRESENTATION_VERSION, LABEL: plain.LABEL, model, sourceSubset, paidTextFromSource, parsePaidText, modelProof };
