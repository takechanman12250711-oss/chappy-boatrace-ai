'use strict';

// Frozen readable-v3 extension. The v2 category body and result scope stay
// unchanged; this appendix only identifies an already saved practical subset.
const { createHash } = require('node:crypto');
const categoryV2 = require('./note-category-article');
const { seriesOfBundle } = require('./note-article-series');
const PRESENTATION_VERSION = 'readable-v3';
const MODEL_LABEL = '🔄 コロがし検証対象';
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
  requireValue(Array.isArray(rows), 'korogashi_model_source_missing');
  const tickets = rows.map(row => typeof row === 'string' ? row : row?.ticket);
  requireValue(tickets.length >= 1 && tickets.length <= 7, 'korogashi_model_ticket_count_invalid');
  requireValue(tickets.every(valid), 'korogashi_model_ticket_invalid');
  requireValue(new Set(tickets).size === tickets.length, 'korogashi_model_ticket_duplicate');
  return tickets;
}
function requirePrimarySubset(tickets, sections) {
  const primary = new Set(sections.filter(section => section.label !== categoryV2.REFERENCE)
    .flatMap(section => section.tickets));
  requireValue(tickets.every(ticket => primary.has(ticket)), 'korogashi_model_primary_membership_missing');
}
function sourceSubset(bundle) {
  // Only established original bundle families qualify. Never fall back to a
  // candidate24 pool, autonomous research candidate, category or reference list.
  const series = seriesOfBundle(bundle);
  requireValue(series !== 'normal' || bundle.record?.source === undefined,
    'korogashi_model_source_unknown');
  const tickets = ticketRows(bundle.baselinePracticalTickets);
  const copies = [bundle.record?.prediction?.practicalTickets, bundle.article?.practicalTickets];
  if (series !== 'normal') copies.push(bundle.monitor?.tickets);
  for (const rows of copies) requireValue(same(tickets, ticketRows(rows)), 'korogashi_model_source_mismatch');
  const sections = categoryV2.sourceSections(bundle, series);
  requirePrimarySubset(tickets, sections);
  // Return a new immutable string array in the baseline's original order.
  // Neither this array nor any display regrouping can mutate the saved source.
  return Object.freeze(tickets);
}
function appendix(tickets) {
  return [MODEL_LABEL, `${categoryV2.formations(tickets)}\n${tickets.length}点`, MODEL_NOTICE].join('\n\n');
}
function paidTextFromSource(bundle, series, article = bundle.article) {
  const sourceSeries = seriesOfBundle(bundle);
  requireValue(series === sourceSeries, 'korogashi_model_series_mismatch');
  const tickets = sourceSubset(bundle);
  requireValue(same(tickets, ticketRows(article?.practicalTickets)), 'korogashi_model_source_mismatch');
  const sections = categoryV2.sourceSections(bundle, series, article);
  requirePrimarySubset(tickets, sections);
  return categoryV2.paidTextFromSections(sections) + '\n\n' + appendix(tickets);
}
function parsePaidText(paidText) {
  requireValue(typeof paidText === 'string' && paidText.length, 'published_paid_text_missing');
  const parts = paidText.split('\n\n' + MODEL_LABEL + '\n\n');
  requireValue(parts.length === 2, 'korogashi_model_appendix_missing_or_duplicate');
  const [basePaidText, modelText] = parts;
  const sections = categoryV2.parsePaidSections(basePaidText);
  const blocks = modelText.split('\n\n');
  requireValue(blocks.length === 2 && blocks[1] === MODEL_NOTICE, 'korogashi_model_appendix_invalid');
  const lines = blocks[0].split('\n'), count = /^([1-7])点$/.exec(lines.pop());
  requireValue(count && lines.length && lines.every(line => FORMATION.test(line)), 'korogashi_model_appendix_invalid');
  const modelTickets = ticketRows(lines.flatMap(line => {
    requireValue(line.split(' → ').every(axis => {
      const boats = axis.split('・');
      return new Set(boats).size === boats.length;
    }), 'korogashi_model_appendix_invalid');
    const tickets = categoryV2.ticketsIn(line);
    requireValue(tickets.length, 'korogashi_model_ticket_invalid');
    return tickets;
  }));
  requireValue(Number(count[1]) === modelTickets.length, 'korogashi_model_ticket_count_mismatch');
  requirePrimarySubset(modelTickets, sections);
  return { sections, modelTickets, basePaidText };
}
function modelProof(paidText, sourceSha256) {
  requireValue(typeof sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(sourceSha256), 'korogashi_model_source_hash_invalid');
  const { modelTickets } = parsePaidText(paidText);
  return { version: 'note-korogashi-display-v1', label: MODEL_LABEL, sourceSha256,
    ticketCount: modelTickets.length, ticketsSha256: hash(JSON.stringify([...new Set(modelTickets)].sort())),
    includedInPublishedResult: false };
}
module.exports = { PRESENTATION_VERSION, MODEL_LABEL, sourceSubset, paidTextFromSource, parsePaidText, modelProof };
