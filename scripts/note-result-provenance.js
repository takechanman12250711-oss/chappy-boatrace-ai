'use strict';

// Optional display provenance for an already-settled published hit. This never
// settles a race, changes an evidence/claim key, or runs a prediction engine.
const { createHash } = require('node:crypto');
const { seriesOfBundle } = require('./note-article-series');
const VERSION = 'note-result-provenance-v1';
const METHOD = 'published-main-sections-v1';
const digest = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const validTicket = value => typeof value === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(value) && new Set(value.split('-')).size === 3;
const requireValue = value => { if (!value) throw Error('result_provenance_unverified'); };
const EMPTY = Object.freeze([]);

const CATEGORIES = Object.freeze({
  main: Object.freeze({ categoryId: 'main', articleSeries: 'normal', label: '本命', sourceField: 'record.prediction.mainSheet.tickets' }),
  cover: Object.freeze({ categoryId: 'cover', articleSeries: 'normal', label: '押さえ', sourceField: 'record.prediction.mainSheet.coverTickets' }),
  flow: Object.freeze({ categoryId: 'flow', articleSeries: 'normal', label: '流し', sourceField: 'record.prediction.mainSheet.flowTickets' }),
  manshu: Object.freeze({ categoryId: 'manshu', articleSeries: 'normal', label: '万舟狙い', sourceField: 'record.prediction.manshuSheet.tickets' }),
  'independent-escape': Object.freeze({ categoryId: 'independent-escape', articleSeries: 'escape', label: '独立本命', sourceField: 'monitor.tickets' }),
  'independent-manshu': Object.freeze({ categoryId: 'independent-manshu', articleSeries: 'manshu', label: '独立万舟', sourceField: 'monitor.tickets' })
});

// A digest alone cannot prove membership in SHA256-addressed JSON. Only the
// exact immutable objects minted after source verification are trusted in this
// process. JSON/structuredClone round trips intentionally lose that authority.
// No original bytes, paid body, ticket pools or private fields are retained.
const verifiedProofs = new WeakMap();

function tickets(rows) {
  if (rows === undefined) return [];
  requireValue(Array.isArray(rows));
  const values = rows.map(row => typeof row === 'string' ? row : row?.ticket);
  requireValue(values.every(validTicket));
  return values;
}

function sectionProjection(section) {
  return {
    version: section.version, presentationVersion: section.presentationVersion,
    publishedTicketCount: section.publishedTicketCount, sectionsSha256: section.sectionsSha256,
    publishedTicketsSha256: section.publishedTicketsSha256,
    sections: section.sections, unionTickets: section.unionTickets
  };
}

function proofData(proof) {
  return {
    version: proof.version, publicationKey: proof.publicationKey, raceKey: proof.raceKey,
    articleSeries: proof.articleSeries, sourceSha256: proof.sourceSha256,
    combination: proof.combination, settlementEvidenceId: proof.settlementEvidenceId,
    sectionsSha256: proof.sectionsSha256, matchedSections: proof.matchedSections,
    origins: proof.origins
  };
}

/**
 * Derive only exact origins of the actual winning published ticket.
 * row and settlement are the existing verified source/result, and section is
 * the unchanged publishedTicketSections() result. Literal published headings
 * are kept separately; neither legacy headings nor practicalTickets imply a
 * source category. Missing/invalid/unsupported provenance is always optional.
 */
function winningProvenance(row, bytes, settlement, section, now = Date.now()) {
  try {
    requireValue(settlement?.status === 'hit' && settlement.method === METHOD && section?.status === 'verified');
    requireValue((typeof bytes === 'string' || Buffer.isBuffer(bytes)) && digest(bytes) === row?.sourceSha256);
    // Recheck the immutable source/receipt proof, identity and deadline rather
    // than treating an arbitrary {status:'verified'} section object as proof.
    const { publishedTicketSections } = require('./note-published-ticket-sections');
    const verified = publishedTicketSections(row, bytes, now);
    requireValue(verified.status === 'verified' && equal(sectionProjection(section), sectionProjection(verified)));
    requireValue(['readable-v1', 'readable-v2', 'readable-v3', 'readable-v4'].includes(verified.presentationVersion));
    const combination = settlement.combination;
    requireValue(validTicket(combination) && verified.unionTickets.includes(combination));
    const matchedSections = verified.sections.filter(value => value.tickets.includes(combination)).map(value => value.label);
    requireValue(matchedSections.length && equal(settlement.matchedSections, matchedSections));
    requireValue(settlement.sectionsSha256 === verified.sectionsSha256 && settlement.publishedTicketCount === verified.publishedTicketCount);
    requireValue(Number.isSafeInteger(settlement.payoutPer100Yen) && settlement.payoutPer100Yen > 0);
    const evidenceId = digest([METHOD, row.publicationKey, row.sourceSha256, verified.sectionsSha256,
      combination, settlement.payoutPer100Yen].join('|'));
    requireValue(settlement.evidenceId === evidenceId);

    const bundle = JSON.parse(bytes), series = seriesOfBundle(bundle);
    let ids;
    if (series === 'normal') {
      const prediction = bundle.record.prediction;
      const pools = [['main', prediction.mainSheet?.tickets], ['cover', prediction.mainSheet?.coverTickets],
        ['flow', prediction.mainSheet?.flowTickets], ['manshu', prediction.manshuSheet?.tickets]];
      ids = pools.filter(([, values]) => tickets(values).includes(combination)).map(([id]) => id);
    } else {
      // Independent monitoring originals must never inherit ordinary pools,
      // even if those fields happen to be attached to the archived bundle.
      requireValue(bundle.monitor?.raceKey === row.raceKey && bundle.monitor.kind === series &&
        tickets(bundle.monitor.tickets).includes(combination));
      ids = [`independent-${series}`];
    }
    if (!ids.length) return null;
    const origins = Object.freeze(ids.map(id => Object.freeze({ categoryId: id, sourceField: CATEGORIES[id].sourceField })));
    const data = {
      version: VERSION, publicationKey: row.publicationKey, raceKey: row.raceKey,
      articleSeries: series, sourceSha256: row.sourceSha256, combination,
      settlementEvidenceId: evidenceId, sectionsSha256: verified.sectionsSha256,
      matchedSections: Object.freeze([...matchedSections]), origins
    };
    const proof = Object.freeze({ ...data, provenanceSha256: digest(JSON.stringify(data)) });
    verifiedProofs.set(proof, Object.freeze({
      serialized: JSON.stringify(proof),
      categories: Object.freeze(ids.map(id => CATEGORIES[id]))
    }));
    return proof;
  } catch { return null; }
}

/**
 * Read-only public display boundary. binding must identify the current hit and
 * its source settlement, not merely the aggregate race's winning combination:
 * {publicationKey,raceKey,articleSeries,sourceSha256,status,combination,
 *  evidenceId,sectionsSha256,matchedSections}.
 *
 * Returns only fixed canonical labels/fields or []. Copied, persisted, stale,
 * forged or rebound metadata is untrusted and falls back to literal headings.
 * Re-derive through winningProvenance after loading persisted state.
 */
function validateWinningProvenance(proof, binding) {
  try {
    const verified = verifiedProofs.get(proof);
    if (!verified || !binding || binding.status !== 'hit') return EMPTY;
    if (!Object.isFrozen(proof) || JSON.stringify(proof) !== verified.serialized ||
        proof.provenanceSha256 !== digest(JSON.stringify(proofData(proof)))) return EMPTY;
    const fields = ['publicationKey', 'raceKey', 'articleSeries', 'sourceSha256', 'combination', 'sectionsSha256'];
    if (fields.some(key => proof[key] !== binding[key]) || proof.settlementEvidenceId !== binding.evidenceId ||
        !equal(proof.matchedSections, binding.matchedSections)) return EMPTY;
    return verified.categories;
  } catch { return EMPTY; }
}

function projectOrigins(proof, binding) {
  return validateWinningProvenance(proof, binding).map(category => Object.freeze({
    ...category, publicationKey: proof.publicationKey, publishedSections: proof.matchedSections
  }));
}

function settlementEvidenceId(binding, payoutPer100Yen) {
  return digest([METHOD, binding.publicationKey, binding.sourceSha256, binding.sectionsSha256,
    binding.combination, payoutPer100Yen].join('|'));
}

function validatedRowOrigins(row) {
  try {
    const settlement = row?.publishedSettlement;
    if (settlement?.status !== 'hit' || settlement.method !== METHOD) return EMPTY;
    const binding = { publicationKey: row.publicationKey, raceKey: row.raceKey, articleSeries: row.articleSeries || 'normal',
      sourceSha256: row.sourceSha256, status: settlement.status, combination: settlement.combination,
      evidenceId: settlement.evidenceId, sectionsSha256: settlement.sectionsSha256, matchedSections: settlement.matchedSections };
    if (settlement.evidenceId !== settlementEvidenceId(binding, settlement.payoutPer100Yen)) return EMPTY;
    return Object.freeze(projectOrigins(row.winningProvenance, binding));
  } catch { return EMPTY; }
}

// The established aggregate hashes are checked, never modified or replaced.
// Keep this dependency-free so the settlement/aggregation module can import it.
function validatedReportOrigins(report) {
  try {
    if (report?.version !== 'published-main-race-result-v1' || report.status !== 'hit' ||
        report.publicationKey !== `${report.raceKey}:published-main` || !Array.isArray(report.sources) ||
        !Array.isArray(report.matchedSections) || !Array.isArray(report.winningProvenance)) return EMPTY;
    if (report.sourceSha256 !== digest(JSON.stringify(report.sources)) || report.evidenceId !== digest([
      report.version, report.raceKey, report.sourceSha256, report.combination,
      report.payoutPer100Yen, report.publishedTicketCount, JSON.stringify(report.matchedSections)
    ].join('|'))) return EMPTY;
    if (new Set(report.sources.map(source => source.publicationKey)).size !== report.sources.length) return EMPTY;
    const origins = [], seen = new Set();
    for (const proof of report.winningProvenance) {
      // Inspect only minted proof objects. Untrusted serialized fields must
      // never decide the source family or supply a public display label.
      if (!verifiedProofs.has(proof)) continue;
      if (seen.has(proof.publicationKey)) return EMPTY;
      seen.add(proof.publicationKey);
      const source = report.sources.find(value => value.publicationKey === proof.publicationKey);
      if (!source || source.publicationKey !== `${report.raceKey}:${proof.articleSeries}` ||
          !report.articleSeries?.includes(proof.articleSeries)) continue;
      const binding = {
        publicationKey: source.publicationKey, raceKey: report.raceKey, articleSeries: proof.articleSeries,
        sourceSha256: source.sourceSha256, status: source.status, combination: report.combination,
        evidenceId: source.evidenceId, sectionsSha256: source.sectionsSha256,
        matchedSections: report.matchedSections.filter(value => value.articleSeries === proof.articleSeries).map(value => value.label)
      };
      if (source.evidenceId !== settlementEvidenceId(binding, report.payoutPer100Yen)) continue;
      origins.push(...projectOrigins(proof, binding));
    }
    return Object.freeze(origins);
  } catch { return EMPTY; }
}

module.exports = { VERSION, CATEGORIES, winningProvenance, validateWinningProvenance, validatedRowOrigins, validatedReportOrigins };
