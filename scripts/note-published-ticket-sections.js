'use strict';

// Public-article result scope is separate from the original practical ledger.
// This module never runs a prediction engine or reads candidate24/research pools.
const { createHash } = require('node:crypto');
const { seriesOfBundle, publicationKey } = require('./note-article-series');
const categoryV2 = require('./note-category-article');
const V2_LABELS = categoryV2.LABELS, V2_PRIMARY_LABELS = categoryV2.PRIMARY_LABELS;
const VERSION = 'published-ticket-sections-v1';
const EVIDENCE_VERSION = 'note-publication-evidence-v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const review = reason => ({ status: 'review', reason });
const valid = value => typeof value === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(value) && new Set(value.split('-')).size === 3;
const unique = values => [...new Set(values)];
const sorted = values => unique(values).sort();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const same = (a, b) => equal(sorted(a), sorted(b));
const requireValue = (value, reason) => { if (!value) throw Error(reason); };
const LABELS = Object.freeze(['中心の買い目', '相手を広げるなら', '別の展開を考えるなら', '高配当を狙うなら', '別会計の参考予想']);
const REFERENCE = LABELS[4];
const DESCRIPTIONS = Object.freeze([
  'この買い目を中心に検討します。', '相手を広げたい場合の追加候補です。',
  '別の展開に備える追加候補です。', '高配当を狙う場合の追加候補です。',
  '中心の買い目の成績とは別集計の参考予想です。'
]);

// Reviewed byte fingerprints at publisher commit
// 220e62b37055e2bd25c1f308505a10671efea55e (2026-10-06). Receipt
// 840b1b3f3ebd0c32102032e19054bb30950fee47 names this exact commit as its
// sole parent. Dates, sourceCommit, or the original's formation-v4 label alone
// do NOT prove which publication adapter was used.
const LEGACY_READABLE = Object.freeze({
  presentationVersion: 'readable-v1',
  rendererSha256: 'f8bdeed262196f6e0a57d98e93a09c0a9b85f4c8bbbaa96bac383ddb5bcff389',
  publicationSourceSha256: 'd00657d58c8c9e35b679142bd5e7c981bdfa42905c0bb1ea85377fb234d47e4f',
  generatorSha256: '2f4b9769f34e29287e8b23bae208a694c39eca66700850397a64879619d48be3'
});

// Frozen readable-v1 ticket grammar. Do not import a mutable latest renderer.
function ticketsIn(text) {
  const matches = [...String(text).normalize('NFKC').matchAll(/(?<![0-9])([1-6]+(?:・[1-6]+)*|全|ALL)\s*[-→－–―]\s*([1-6]+(?:・[1-6]+)*|全|ALL)\s*[-→－–―]\s*([1-6]+(?:・[1-6]+)*|全|ALL)(?![0-9])/gi)];
  return matches.flatMap(match => {
    const axes = match.slice(1, 4).map(axis => unique(axis.replace(/全|ALL/gi, '123456').replaceAll('・', '').split('')));
    return axes[0].flatMap(a => axes[1].flatMap(b => axes[2].map(c => `${a}-${b}-${c}`).filter(valid)));
  });
}
function ticketRows(rows, reason, optional = false) {
  if (optional && rows === undefined) return [];
  requireValue(Array.isArray(rows), reason);
  const values = rows.map(row => typeof row === 'string' ? row : row?.ticket);
  requireValue(values.every(valid), reason);
  return values;
}
function canonicalSections(sections) {
  return sections.map(section => ({ label: section.label, tickets: sorted(section.tickets) }));
}
function describe(sections, presentationVersion) {
  const reference = presentationVersion === categoryV2.PRESENTATION_VERSION ? categoryV2.REFERENCE : REFERENCE;
  const all = canonicalSections(sections);
  const primary = all.filter(section => section.label !== reference);
  const unionTickets = sorted(primary.flatMap(section => section.tickets));
  return { status: 'verified', version: VERSION, presentationVersion,
    publishedTicketCount: unionTickets.length, sections: primary, unionTickets,
    sectionsSha256: hash(JSON.stringify(all)), publishedTicketsSha256: hash(JSON.stringify(unionTickets)),
    referenceTicketCount: all.filter(section => section.label === reference).reduce((count, section) => count + section.tickets.length, 0),
    ...(presentationVersion === categoryV2.PRESENTATION_VERSION ? { displayedPrimaryTicketCount: primary.reduce((count, section) => count + section.tickets.length, 0) } : {}) };
}

function parsePaidSections(paidText, presentationVersion) {
  if (presentationVersion === categoryV2.PRESENTATION_VERSION) return categoryV2.parsePaidSections(paidText);
  requireValue(presentationVersion === 'readable-v1', 'published_presentation_version_unsupported');
  requireValue(typeof paidText === 'string' && paidText.trim(), 'published_paid_text_missing');
  const lines = paidText.split(/\r?\n/), sections = [];
  let current = null, inBudget = false, budgetSeen = false, cumulative = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (LABELS.includes(line)) {
      requireValue(!inBudget && !sections.some(section => section.label === line), 'published_section_label_invalid');
      if (current) requireValue(current.declared === current.tickets.length, 'published_section_count_mismatch');
      current = { label: line, tickets: [], declared: null };
      sections.push(current);
      continue;
    }
    if (line === '金額の目安（1点100円）') {
      requireValue(!inBudget && current && current.declared === current.tickets.length, 'published_section_count_mismatch');
      current = null; inBudget = true; continue;
    }
    if (!line) continue;
    if (inBudget) {
      const central = sections[0].tickets.length;
      const expected = `中心のみ${central * 100}円${cumulative > central ? `／追加・参考をすべて含めると${cumulative * 100}円` : ''}`;
      requireValue(!budgetSeen && line === expected, 'published_budget_text_invalid');
      budgetSeen = true; continue;
    }
    const count = /^(\d+)点(?:｜ここまで合計(\d+)点)?$/.exec(line);
    if (count) {
      requireValue(current && current.declared === null, 'published_section_count_invalid');
      current.declared = Number(count[1]);
      cumulative += current.tickets.length;
      requireValue(current.declared > 0 && current.declared === current.tickets.length &&
        (!count[2] || Number(count[2]) === cumulative), 'published_section_count_mismatch');
      continue;
    }
    const mentioned = ticketsIn(line);
    if (mentioned.length) {
      requireValue(current && current.declared === null &&
        /^(?:[1-6]+(?:・[1-6]+)*|全|ALL)\s*[-→－–―]\s*(?:[1-6]+(?:・[1-6]+)*|全|ALL)\s*[-→－–―]\s*(?:[1-6]+(?:・[1-6]+)*|全|ALL)$/i.test(line), 'published_ticket_line_ambiguous');
      current.tickets.push(...mentioned);
    } else {
      requireValue(current && current.declared !== null &&
        line === DESCRIPTIONS[LABELS.indexOf(current.label)], 'published_ticket_line_invalid');
    }
  }
  requireValue(sections.length && sections[0].label === LABELS[0] && inBudget && budgetSeen, 'published_sections_incomplete');
  const all = sections.flatMap(section => section.tickets);
  requireValue(all.length === new Set(all).size, 'published_ticket_display_duplicate');
  requireValue(sections.every((section, index) => !index || LABELS.indexOf(section.label) > LABELS.indexOf(sections[index - 1].label)), 'published_section_order_invalid');
  return sections.map(({ label, tickets }) => ({ label, tickets }));
}

// Internal publication helper: its result contains paid tickets. Result-facing
// callers must use publishedTicketSections, which enforces the real deadline.
function extractPublishedTicketSections(paidText, { presentationVersion = 'readable-v1' } = {}) {
  try { return describe(parsePaidSections(paidText, presentationVersion), presentationVersion); }
  catch (error) { return review(error.message); }
}

// Hash-only evidence is safe to put in the receipt. Reference labels/counts are
// retained, explicitly excluded from the approved public-result union.
function sectionProof(paidText, presentationVersion = 'readable-v1') {
  const reference = presentationVersion === categoryV2.PRESENTATION_VERSION ? categoryV2.REFERENCE : REFERENCE;
  const sections = canonicalSections(parsePaidSections(paidText, presentationVersion));
  const result = describe(sections, presentationVersion);
  return { version: VERSION, presentationVersion, paidTextSha256: hash(paidText),
    sectionsSha256: result.sectionsSha256, publishedTicketsSha256: result.publishedTicketsSha256,
    publishedTicketCount: result.publishedTicketCount,
    sections: sections.map(section => ({ label: section.label, ticketCount: section.tickets.length,
      ticketsSha256: hash(JSON.stringify(section.tickets)), includedInPublishedResult: section.label !== reference })) };
}

function removeAsides(text) {
  let previous;
  do { previous = text; text = text.replace(/[（(［\[][^（）()［］\[\]]*[）)］\]]/g, ''); } while (text !== previous);
  return text.trim();
}
function sourceSections(bundle, series, central) {
  const article = bundle.article, prediction = bundle.record.prediction;
  requireValue(article?.ok === true && typeof article.paidText === 'string', 'published_original_article_missing');
  const independent = series !== 'normal';
  requireValue(article.format === (independent ? 'formation-v3' : 'formation-v4'), 'published_original_format_unsupported');
  const pattern = independent ? /^買い目\n([\s\S]*?)\n計\s+(\d+)点$/m : /^🔥 実戦厳選\n([\s\S]*?)\n計\s+(\d+)点$/m;
  const practical = article.paidText.match(pattern);
  requireValue(practical && Number(practical[2]) === central.length && same(ticketsIn(practical[1]), central), 'published_original_center_mismatch');
  const sections = [{ label: LABELS[0], tickets: [...central] }], seen = new Set(central);
  if (!independent) {
    // Only these four saved pools were actually rendered by reviewed readable-v1.
    // ticketSheets, candidate24Tickets, evaluated candidates and later prediction
    // records must not be silently substituted for a missing source pool.
    const pools = [[LABELS[1], prediction.mainSheet?.tickets], [LABELS[1], prediction.mainSheet?.coverTickets],
      [LABELS[2], prediction.mainSheet?.flowTickets], [LABELS[3], prediction.manshuSheet?.tickets]];
    for (const [label, rows] of pools) {
      const tickets = unique(ticketRows(rows, 'published_saved_pool_invalid', true)).filter(ticket => !seen.has(ticket));
      tickets.forEach(ticket => seen.add(ticket));
      if (!tickets.length) continue;
      const existing = sections.find(section => section.label === label);
      if (existing) existing.tickets.push(...tickets); else sections.push({ label, tickets });
    }
  }
  let reference = article.paidText.slice(practical.index + practical[0].length).trim();
  if (!independent) {
    // Frozen compactArticle formation-v4 preprocessing before readableArticle.
    reference = reference.split('\n').map(line => removeAsides(line).replace(/[【】]/g, '').trim())
      .filter(line => !/^内訳/.test(line)).join('\n').replace(/\n{3,}/g, '\n\n');
  }
  const remaining = unique(ticketsIn(reference)).filter(ticket => !seen.has(ticket));
  if (remaining.length) sections.push({ label: REFERENCE, tickets: remaining });
  return sections;
}

// Frozen exact readable-v1 formation renderer, used only to check receipt body
// hashes; unions always come from immutable source sections above.
function formations(tickets) {
  const groups = new Map();
  for (const ticket of tickets) {
    const [a, b, c] = ticket.split('-'), key = `${a}-${b}`;
    if (!groups.has(key)) groups.set(key, { axes: [[a], [b], []], tickets: [] });
    groups.get(key).axes[2].push(c); groups.get(key).tickets.push(ticket);
  }
  const blocks = [...groups.values()];
  const format = axes => axes.map(axis => sorted(axis).join('・')).join(' → ');
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
function paidTextFromSections(sections) {
  let cumulative = 0;
  const central = sections[0].tickets.length, total = sections.reduce((count, section) => count + section.tickets.length, 0);
  return sections.map((section, index) => {
    cumulative += section.tickets.length;
    return [section.label, formations(section.tickets) + `\n${section.tickets.length}点${index ? `｜ここまで合計${cumulative}点` : ''}`,
      DESCRIPTIONS[LABELS.indexOf(section.label)]].join('\n\n');
  }).join('\n\n') + `\n\n金額の目安（1点100円）\n中心のみ${central * 100}円${total > central ? `／追加・参考をすべて含めると${total * 100}円` : ''}`;
}

// Evidence is collected from the verified receipt tag/commit, not an original's
// generation sourceCommit. The collector must read renderer/source/generator
// bytes at the receipt commit's sole parent and hash them. Existing rows without
// this evidence remain review; never infer a publication renderer from a date.
function publishedTicketSections(row, bytes, now = Date.now()) {
  try {
    requireValue(Number.isFinite(now), 'published_clock_invalid');
    requireValue((typeof bytes === 'string' || Buffer.isBuffer(bytes)) && hash(bytes) === row?.sourceSha256, 'source_hash_mismatch');
    let bundle;
    try { bundle = JSON.parse(bytes); } catch { throw Error('source_json_invalid'); }
    const record = bundle.record, series = seriesOfBundle(bundle), deadline = Date.parse(row.deadlineAt);
    const published = Date.parse(row.publishedAt), captured = Date.parse(bundle.capturedAt);
    requireValue(record?.raceKey === row.raceKey && record.deadlineAt === row.deadlineAt && record.place === row.place &&
      Number(record.raceNo) === row.raceNo && series === (row.articleSeries || 'normal') &&
      row.publicationKey === publicationKey(row.raceKey, series) &&
      [deadline, published, captured].every(Number.isFinite) && captured <= published && published < deadline && published <= now, 'source_identity_mismatch');
    const central = ticketRows(bundle.baselinePracticalTickets, 'published_tickets_unverified');
    requireValue(central.length > 0 && central.length <= 7 && central.length === row.ticketCount && unique(central).length === central.length &&
      same(central, ticketRows(record.prediction?.practicalTickets, 'published_tickets_unverified')), 'published_tickets_unverified');
    if (series !== 'normal') {
      requireValue(same(central, ticketRows(bundle.monitor?.tickets, 'monitor_tickets_mismatch')) &&
        same(central, ticketRows(bundle.article?.practicalTickets, 'monitor_tickets_mismatch')) &&
        equal(bundle.article, bundle.monitor?.article), 'monitor_tickets_mismatch');
    }
    // No paid ticket lists or section membership leave the result API at/before
    // deadline, even with a forged early official result or complete receipt.
    if (now <= deadline) return { status: 'pending', reason: 'official_result_pending' };
    const evidence = row.publicationEvidence;
    requireValue(evidence?.version === EVIDENCE_VERSION && evidence.sourceSha256 === row.sourceSha256 &&
      /^[a-f0-9]{40}$/.test(evidence.receiptCommitSha || '') && /^[a-f0-9]{40}$/.test(evidence.publisherCommitSha || ''), 'published_renderer_evidence_missing');
    const proof = evidence.publishedDisplayProof;
    if (!proof) requireValue(Object.entries(LEGACY_READABLE).filter(([key]) => key !== 'presentationVersion')
      .every(([key, value]) => evidence[key] === value) &&
      (!evidence.presentationVersion || evidence.presentationVersion === LEGACY_READABLE.presentationVersion), 'published_renderer_unreviewed');
    else requireValue(proof.version === VERSION && ['readable-v1', categoryV2.PRESENTATION_VERSION].includes(proof.presentationVersion), 'published_display_proof_unsupported');
    const presentationVersion = proof?.presentationVersion || 'readable-v1';
    requireValue(!evidence.presentationVersion || evidence.presentationVersion === presentationVersion, 'published_display_proof_mismatch');
    const sections = presentationVersion === categoryV2.PRESENTATION_VERSION
      ? categoryV2.sourceSections(bundle, series) : sourceSections(bundle, series, central);
    const paidText = presentationVersion === categoryV2.PRESENTATION_VERSION
      ? categoryV2.paidTextFromSections(sections) : paidTextFromSections(sections);
    const expectedProof = sectionProof(paidText, presentationVersion);
    if (proof) requireValue(equal(proof, expectedProof), 'published_display_proof_mismatch');
    return { ...describe(sections, presentationVersion), evidenceBasis: proof ? 'receipt-display-proof' : 'receipt-publisher-code',
      receiptCommitSha: evidence.receiptCommitSha, publisherCommitSha: evidence.publisherCommitSha };
  } catch (error) { return review(error.message); }
}

// The caller still validates official source, chronology, payout, refunds and
// ambiguous/dead-heat results. This only classifies an already-verified result.
function classifyPublishedTickets(row, bytes, officialCombination, now = Date.now()) {
  const extracted = publishedTicketSections(row, bytes, now);
  if (extracted.status !== 'verified') return extracted;
  if (!valid(officialCombination)) return review('official_combination_invalid');
  return { ...extracted, status: extracted.unionTickets.includes(officialCombination) ? 'hit' : 'miss',
    matchedSections: extracted.sections.filter(section => section.tickets.includes(officialCombination)).map(section => section.label) };
}

module.exports = { VERSION, EVIDENCE_VERSION, LEGACY_READABLE, V2_LABELS, V2_PRIMARY_LABELS, sectionProof, extractPublishedTicketSections,
  publishedTicketSections, classifyPublishedTickets };
