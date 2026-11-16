'use strict';

// readable-v9 (2026-11-16 owner decision): saved practical tickets of the
// "独立展開" (independent scenario) family that belong to none of the four
// saved pools are published in their own sections instead of blocking the
// whole article:
//   🌀 波乱のシナリオ             saved reason "別頭の独立展開"
//                                 (a boat other than the main head wins)
//   😼 チャッピーの「もしかして」 saved reason "残し艇を使う押さえ展開"
//                                 (same flow, another boat stays in the places)
// Membership comes only from the classification saved in the immutable
// original. Odds, order and results never choose a section, and a ticket of
// any other family still stops the article (readable_category_membership_missing).
// Without such tickets every byte equals readable-v8.
// note-category-article.js, note-korogashi-presentation.cjs,
// note-plain-presentation.cjs and note-center-presentation.cjs stay
// byte-identical for recovery; this module repeats their rules with the two
// extra sections only.
const { createHash } = require('node:crypto');
const categoryV2 = require('./note-category-article');
const modelV3 = require('./note-korogashi-presentation.cjs');
const plain = require('./note-plain-presentation.cjs');
const { seriesOfBundle } = require('./note-article-series');
const { MAX_PUBLICATION_TICKETS } = require('./note-ticket-limit.cjs');
const PRESENTATION_VERSION = 'readable-v9';
const UPSET = '🌀 波乱のシナリオ';
const MAYBE = '😼 チャッピーの「もしかして」';
const SCENARIO_LABELS = Object.freeze([UPSET, MAYBE]);
// Saved scenarioClassificationReason -> published section.
const SCENARIO_BY_REASON = Object.freeze({ '別頭の独立展開': UPSET, '残し艇を使う押さえ展開': MAYBE });
const NORMAL_LABELS = categoryV2.NORMAL_LABELS, REFERENCE = categoryV2.REFERENCE;
const LABELS = Object.freeze([...NORMAL_LABELS, ...SCENARIO_LABELS, REFERENCE]);
const TOTAL_HEADING = '📌 合計（重複なし）';
const MODEL_LABEL = modelV3.MODEL_LABEL;
// Same bytes as the v3 model notice (not exported there).
const MODEL_NOTICE = [
  '保存済みの実戦厳選を、コロがし検証用に再掲しています。',
  '上の公開予想と重複する買い目です。追加の予想や追加購入を勧めるものではありません。',
  '公開予想の点数・的中成績には重ねて加算せず、コロがし検証は別に集計します。'
].join('\n');
const FORMATION = /^(?:[1-6](?:・[1-6])*) → (?:[1-6](?:・[1-6])*) → (?:[1-6](?:・[1-6])*)$/;
const requireValue = (value, reason) => { if (!value) throw Error(reason); };
const unique = values => [...new Set(values)];
const valid = ticket => typeof ticket === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(ticket) && new Set(ticket.split('-')).size === 3;
const same = (a, b) => JSON.stringify(unique(a).sort()) === JSON.stringify(unique(b).sort());
const hash = value => createHash('sha256').update(value).digest('hex');
const ticketOf = row => typeof row === 'string' ? row : row?.ticket;

// ---- categories -----------------------------------------------------------
function poolTickets(rows) {
  requireValue(Array.isArray(rows), 'readable_category_source_missing');
  const values = rows.map(ticketOf);
  requireValue(values.every(valid), 'readable_category_ticket_invalid');
  return unique(values);
}
// The published section of one saved practical row, or null. Every saved copy
// of the classification must agree; nothing is inferred from odds or position.
function scenarioLabel(row) {
  if (!row || typeof row !== 'object' || row.category !== '独立展開' || row.candidateKind !== 'independent-scenario') return null;
  if (row.displayCategory !== undefined && row.displayCategory !== '独立展開') return null;
  return Object.hasOwn(SCENARIO_BY_REASON, row.scenarioClassificationReason) ? SCENARIO_BY_REASON[row.scenarioClassificationReason] : null;
}
function sourceSections(bundle, series, article = bundle.article) {
  // Independent-monitor originals have a single section and never gain these.
  if (series !== 'normal') return categoryV2.sourceSections(bundle, series, article);
  requireValue(Array.isArray(bundle.baselinePracticalTickets), 'published_tickets_unverified');
  const centralRows = bundle.baselinePracticalTickets;
  const central = centralRows.map(ticketOf);
  requireValue(central.every(valid) && unique(central).length === central.length, 'published_tickets_unverified');
  const parts = categoryV2.originalParts(article, false);
  requireValue(Number(parts.practical[2]) === central.length && same(categoryV2.ticketsIn(parts.practical[1]), central), 'published_original_center_mismatch');
  const prediction = bundle.record?.prediction;
  const pools = [prediction?.mainSheet?.tickets, prediction?.mainSheet?.coverTickets,
    prediction?.mainSheet?.flowTickets, prediction?.manshuSheet?.tickets];
  const sections = pools.map((rows, index) => ({ label: NORMAL_LABELS[index], tickets: poolTickets(rows) }));
  const classified = new Set(sections.flatMap(section => section.tickets));
  const extra = new Map(SCENARIO_LABELS.map(label => [label, []]));
  const savedCopy = Array.isArray(prediction?.practicalTickets) ? prediction.practicalTickets : [];
  for (const row of centralRows) {
    const ticket = ticketOf(row);
    if (classified.has(ticket)) continue;
    const label = scenarioLabel(row);
    // The prediction's own saved copy of this ticket must carry the same family.
    const copy = savedCopy.find(value => ticketOf(value) === ticket);
    requireValue(label && copy && scenarioLabel(copy) === label, 'readable_category_membership_missing');
    extra.get(label).push(ticket);
  }
  for (const label of SCENARIO_LABELS) if (extra.get(label).length) sections.push({ label, tickets: extra.get(label) });
  if (parts.referenceTickets.length) sections.push({ label: REFERENCE, tickets: parts.referenceTickets });
  return sections;
}
const hasScenario = sections => sections.some(section => SCENARIO_LABELS.includes(section.label));
function validateSections(sections) {
  requireValue(Array.isArray(sections) && sections.length > NORMAL_LABELS.length, 'published_sections_incomplete');
  const primary = sections.filter(section => section.label !== REFERENCE);
  requireValue(sections.length === primary.length || (sections.length === primary.length + 1 && sections.at(-1).label === REFERENCE), 'published_section_order_invalid');
  requireValue(NORMAL_LABELS.every((label, index) => primary[index]?.label === label), 'published_section_family_invalid');
  const scenario = primary.slice(NORMAL_LABELS.length).map(section => section.label);
  requireValue(scenario.length >= 1 && JSON.stringify(scenario) === JSON.stringify(SCENARIO_LABELS.filter(label => scenario.includes(label))), 'published_section_family_invalid');
  const pooled = new Set(primary.slice(0, NORMAL_LABELS.length).flatMap(section => section.tickets)), seen = new Set();
  for (const section of sections) {
    requireValue(LABELS.includes(section.label) && Array.isArray(section.tickets) && section.tickets.every(valid), 'published_section_label_invalid');
    requireValue(section.tickets.length === unique(section.tickets).length, 'published_ticket_display_duplicate');
    if (section.label === REFERENCE) requireValue(section.tickets.length > 0, 'published_section_count_invalid');
    if (SCENARIO_LABELS.includes(section.label)) {
      // A scenario section holds only tickets that are in no pool and no other scenario section.
      requireValue(section.tickets.length > 0 && section.tickets.every(ticket => !pooled.has(ticket) && !seen.has(ticket)), 'published_section_family_invalid');
      section.tickets.forEach(ticket => seen.add(ticket));
    }
  }
}
function footer(sections) {
  const counts = categoryV2.totals(sections);
  return [TOTAL_HEADING, `公開予想：${counts.primary}点`,
    `区分別は延べ${counts.displayed}点。同じ買い目は合計で1点と数えます。`,
    ...(counts.reference ? [`参考予想：${counts.reference}点（別集計）`, `参考を含む全体：${counts.all}点（重複なし）`] : [])].join('\n');
}
function paidTextFromSections(sections) {
  if (!hasScenario(sections)) return categoryV2.paidTextFromSections(sections);
  validateSections(sections);
  return sections.map(section => [section.label,
    `${categoryV2.formations(section.tickets) || '保存済みの買い目なし'}\n${section.tickets.length}点`].join('\n\n')).join('\n\n') + '\n\n' + footer(sections);
}
function parsePaidSections(paidText) {
  requireValue(typeof paidText === 'string' && paidText.trim(), 'published_paid_text_missing');
  if (!paidText.split('\n').some(line => SCENARIO_LABELS.includes(line))) return categoryV2.parsePaidSections(paidText);
  const marker = '\n\n' + TOTAL_HEADING + '\n', parts = paidText.split(marker);
  requireValue(parts.length === 2, 'published_sections_incomplete');
  const sections = [];
  let current = null;
  for (const line of parts[0].split('\n')) {
    if (!line) continue;
    if (LABELS.includes(line)) {
      requireValue(!current || current.declared !== null, 'published_section_count_mismatch');
      current = { label: line, tickets: [], declared: null, empty: false };
      sections.push(current); continue;
    }
    requireValue(current && current.declared === null, 'published_ticket_line_invalid');
    const count = /^(0|[1-9]\d*)点$/.exec(line);
    if (count) {
      current.declared = Number(count[1]);
      requireValue(current.declared === current.tickets.length && (current.declared > 0 || current.empty), 'published_section_count_mismatch');
    } else if (line === '保存済みの買い目なし') {
      requireValue(!current.tickets.length && !current.empty, 'published_ticket_line_invalid'); current.empty = true;
    } else {
      requireValue(FORMATION.test(line) && !current.empty, 'published_ticket_line_ambiguous');
      const tickets = categoryV2.ticketsIn(line);
      requireValue(tickets.length, 'published_ticket_line_invalid');
      current.tickets.push(...tickets);
    }
  }
  requireValue(current && current.declared !== null, 'published_section_count_mismatch');
  const result = sections.map(({ label, tickets }) => ({ label, tickets }));
  validateSections(result);
  requireValue(TOTAL_HEADING + '\n' + parts[1] === footer(result), 'published_total_text_invalid');
  return result;
}
// The object the renderer uses in place of the v2 category module.
const category = Object.freeze({ REFERENCE, sourceSections, paidTextFromSections, parsePaidSections,
  originalParts: categoryV2.originalParts, totals: categoryV2.totals });

// ---- end-of-article practical subset (1-10 tickets, as in v8) -------------
function ticketRows(rows) {
  requireValue(Array.isArray(rows), 'center_model_source_missing');
  const tickets = rows.map(ticketOf);
  requireValue(tickets.length >= 1 && tickets.length <= MAX_PUBLICATION_TICKETS, 'center_model_ticket_count_invalid');
  requireValue(tickets.every(valid), 'center_model_ticket_invalid');
  requireValue(new Set(tickets).size === tickets.length, 'center_model_ticket_duplicate');
  return tickets;
}
function requirePrimarySubset(tickets, sections) {
  const primary = new Set(sections.filter(section => section.label !== REFERENCE).flatMap(section => section.tickets));
  requireValue(tickets.every(ticket => primary.has(ticket)), 'center_model_primary_membership_missing');
}
function sourceSubset(bundle) {
  const series = seriesOfBundle(bundle);
  requireValue(series !== 'normal' || bundle.record?.source === undefined, 'center_model_source_unknown');
  const tickets = ticketRows(bundle.baselinePracticalTickets);
  const copies = [bundle.record?.prediction?.practicalTickets, bundle.article?.practicalTickets];
  if (series !== 'normal') copies.push(bundle.monitor?.tickets);
  for (const rows of copies) requireValue(same(tickets, ticketRows(rows)), 'center_model_source_mismatch');
  requirePrimarySubset(tickets, sourceSections(bundle, series));
  return Object.freeze(tickets);
}
function modelPaidTextFromSource(bundle, series, article = bundle.article) {
  requireValue(series === seriesOfBundle(bundle), 'center_model_series_mismatch');
  const tickets = sourceSubset(bundle);
  requireValue(same(tickets, ticketRows(article?.practicalTickets)), 'center_model_source_mismatch');
  const sections = sourceSections(bundle, series, article);
  requirePrimarySubset(tickets, sections);
  return paidTextFromSections(sections) + '\n\n' +
    [MODEL_LABEL, `${categoryV2.formations(tickets)}\n${tickets.length}点`, MODEL_NOTICE].join('\n\n');
}
function modelParsePaidText(paidText) {
  requireValue(typeof paidText === 'string' && paidText.length, 'published_paid_text_missing');
  const parts = paidText.split('\n\n' + MODEL_LABEL + '\n\n');
  requireValue(parts.length === 2, 'center_model_appendix_missing_or_duplicate');
  const [basePaidText, modelText] = parts;
  const sections = parsePaidSections(basePaidText);
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
module.exports = { PRESENTATION_VERSION, LABEL: plain.LABEL, UPSET, MAYBE, SCENARIO_LABELS, SCENARIO_BY_REASON,
  category, model, scenarioLabel, sourceSections, sourceSubset, paidTextFromSource, parsePaidText, modelProof };
