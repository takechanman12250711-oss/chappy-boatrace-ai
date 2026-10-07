'use strict';

// Frozen readable-v2 display contract. Source category membership is explicit:
// practical selection never creates, renames or removes a category membership.
const PRESENTATION_VERSION = 'readable-v2';
const NORMAL_LABELS = Object.freeze(['🎯 本命', '🛡️ 押さえ', '🌊 流し', '💥 万舟狙い']);
const INDEPENDENT_LABELS = Object.freeze({ escape: '🎯 独立本命', manshu: '💥 独立万舟' });
const REFERENCE = '🧾 別会計の参考予想';
const PRIMARY_LABELS = Object.freeze([...NORMAL_LABELS, ...Object.values(INDEPENDENT_LABELS)]);
const LABELS = Object.freeze([...PRIMARY_LABELS, REFERENCE]);
const TOTAL_HEADING = '📌 合計（重複なし）';
const requireValue = (value, reason) => { if (!value) throw Error(reason); };
const unique = values => [...new Set(values)];
const same = (left, right) => JSON.stringify(unique(left).sort()) === JSON.stringify(unique(right).sort());
const valid = value => typeof value === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(value) && new Set(value.split('-')).size === 3;
const FORMATION = /^(?:[1-6](?:・[1-6])*) → (?:[1-6](?:・[1-6])*) → (?:[1-6](?:・[1-6])*)$/;
function ticketsIn(text) {
  return [...String(text).normalize('NFKC').matchAll(/(?<![0-9A-Z])([1-6]+(?:・[1-6]+)*|全|ALL)[ \t]*[-→－–―][ \t]*([1-6]+(?:・[1-6]+)*|全|ALL)[ \t]*[-→－–―][ \t]*([1-6]+(?:・[1-6]+)*|全|ALL)(?![0-9A-Z])/gi)]
    .flatMap(match => {
      const axes = match.slice(1, 4).map(axis => unique(axis.replace(/全|ALL/gi, '123456').replaceAll('・', '').split('')));
      return axes[0].flatMap(a => axes[1].flatMap(b => axes[2].map(c => `${a}-${b}-${c}`).filter(valid)));
    });
}
function ticketRows(rows, reason = 'readable_category_source_missing') {
  requireValue(Array.isArray(rows), reason);
  const values = rows.map(row => typeof row === 'string' ? row : row?.ticket);
  requireValue(values.every(valid), 'readable_category_ticket_invalid');
  return unique(values);
}
function formations(tickets) {
  const groups = new Map();
  for (const ticket of tickets) {
    const [a, b, c] = ticket.split('-'), key = `${a}-${b}`;
    if (!groups.has(key)) groups.set(key, { axes: [[a], [b], []], tickets: [] });
    groups.get(key).axes[2].push(c); groups.get(key).tickets.push(ticket);
  }
  const blocks = [...groups.values()];
  const format = axes => axes.map(axis => unique(axis).sort().join('・')).join(' → ');
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const axes = blocks[i].axes.map((axis, k) => unique([...axis, ...blocks[j].axes[k]]));
      const source = [...blocks[i].tickets, ...blocks[j].tickets];
      if (!same(ticketsIn(format(axes)), source)) continue;
      blocks[i] = { axes, tickets: source }; blocks.splice(j, 1); merged = true; break outer;
    }
  }
  return blocks.map(({ axes }) => format(axes)).join('\n');
}
function stripAsides(text) {
  let previous;
  do { previous = text; text = text.replace(/[（(［\[][^（）()［］\[\]]*[）)］\]]/g, ''); } while (text !== previous);
  return text;
}
function originalParts(article, independent) {
  requireValue(article?.ok === true && typeof article.paidText === 'string', 'published_original_article_missing');
  requireValue(article.format === (independent ? 'formation-v3' : 'formation-v4'), 'published_original_format_unsupported');
  const practical = article.paidText.match(independent
    ? /^買い目\n([\s\S]*?)\n計\s+(\d+)点$/m
    : /^🔥 実戦厳選\n([\s\S]*?)\n計\s+(\d+)点$/m);
  requireValue(practical, 'published_original_center_mismatch');
  let reference = article.paidText.slice(practical.index + practical[0].length).trim();
  if (!independent) reference = reference.split('\n').map(line => stripAsides(line).replace(/[【】]/g, '').trim())
    .filter(line => !/^内訳/.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');
  const referenceTickets = unique(ticketsIn(reference));
  requireValue(!referenceTickets.length || /^(?:【?本命とは別会計の参考予想】?|【?参考(?:[・\s】]|$))/.test(reference), 'readable_reference_label_unverified');
  return { practical, reference, referenceTickets, rationale: article.paidText.slice(0, practical.index).trim() };
}
function sourceSections(bundle, series, article = bundle.article) {
  const independent = series !== 'normal';
  requireValue(series === 'normal' || Object.hasOwn(INDEPENDENT_LABELS, series), 'note_article_series_invalid');
  const central = ticketRows(bundle.baselinePracticalTickets, 'published_tickets_unverified');
  const parts = originalParts(article, independent);
  requireValue(Number(parts.practical[2]) === central.length && same(ticketsIn(parts.practical[1]), central), 'published_original_center_mismatch');
  let sections;
  if (independent) {
    // These are independent originals, never ordinary AI main/manshu pools.
    const prediction = bundle.record?.prediction;
    requireValue(!prediction?.mainSheet && !prediction?.manshuSheet && !prediction?.ticketSheets,
      'readable_independent_pool_mixture');
    sections = [{ label: INDEPENDENT_LABELS[series], tickets: central }];
  } else {
    const prediction = bundle.record?.prediction;
    const pools = [prediction?.mainSheet?.tickets, prediction?.mainSheet?.coverTickets,
      prediction?.mainSheet?.flowTickets, prediction?.manshuSheet?.tickets];
    sections = pools.map((rows, index) => ({ label: NORMAL_LABELS[index], tickets: ticketRows(rows) }));
    const classified = new Set(sections.flatMap(section => section.tickets));
    requireValue(central.every(ticket => classified.has(ticket)), 'readable_category_membership_missing');
  }
  // Reference overlaps remain visible in their original separate accounting.
  if (parts.referenceTickets.length) sections.push({ label: REFERENCE, tickets: parts.referenceTickets });
  return sections;
}
function validateSections(sections) {
  requireValue(Array.isArray(sections) && sections.length, 'published_sections_incomplete');
  const primary = sections.filter(section => section.label !== REFERENCE);
  const normal = primary.some(section => NORMAL_LABELS.includes(section.label));
  requireValue(normal ? primary.length === NORMAL_LABELS.length && primary.every((section, index) => section.label === NORMAL_LABELS[index])
    : primary.length === 1 && Object.values(INDEPENDENT_LABELS).includes(primary[0].label), 'published_section_family_invalid');
  requireValue(sections.length === primary.length || (sections.length === primary.length + 1 && sections.at(-1).label === REFERENCE), 'published_section_order_invalid');
  requireValue(primary.some(section => section.tickets.length), 'published_sections_incomplete');
  for (const section of sections) {
    requireValue(LABELS.includes(section.label) && Array.isArray(section.tickets) && section.tickets.every(valid), 'published_section_label_invalid');
    requireValue(section.tickets.length === unique(section.tickets).length, 'published_ticket_display_duplicate');
    requireValue(section.label !== REFERENCE || section.tickets.length > 0, 'published_section_count_invalid');
  }
}
function totals(sections) {
  const primary = sections.filter(section => section.label !== REFERENCE);
  const reference = sections.find(section => section.label === REFERENCE)?.tickets || [];
  return { primary: unique(primary.flatMap(section => section.tickets)).length,
    displayed: primary.reduce((count, section) => count + section.tickets.length, 0),
    reference: reference.length, all: unique(sections.flatMap(section => section.tickets)).length };
}
function footer(sections) {
  const counts = totals(sections);
  return [TOTAL_HEADING, `公開予想：${counts.primary}点`,
    `区分別は延べ${counts.displayed}点。同じ買い目は合計で1点と数えます。`,
    ...(counts.reference ? [`参考予想：${counts.reference}点（別集計）`, `参考を含む全体：${counts.all}点（重複なし）`] : [])].join('\n');
}
function paidTextFromSections(sections) {
  validateSections(sections);
  return sections.map(section => [section.label,
    `${formations(section.tickets) || '保存済みの買い目なし'}\n${section.tickets.length}点`].join('\n\n')).join('\n\n') + '\n\n' + footer(sections);
}
function parsePaidSections(paidText) {
  requireValue(typeof paidText === 'string' && paidText.trim(), 'published_paid_text_missing');
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
      const tickets = ticketsIn(line);
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
module.exports = { PRESENTATION_VERSION, NORMAL_LABELS, INDEPENDENT_LABELS, REFERENCE, PRIMARY_LABELS, LABELS,
  ticketsIn, sourceSections, originalParts, formations, totals, paidTextFromSections, parsePaidSections };
