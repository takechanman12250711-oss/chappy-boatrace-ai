'use strict';

// Input adapter only. Never imports or invokes prediction.js / AI Core.
// The existing publication audit, exhibition gate, deadline, price,
// reservation and public-page verification remain mandatory downstream.
const { createHash } = require('node:crypto');
const VERSION = 'independent-monitor-note-v1';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const time = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ? Date.parse(value) : NaN;
const ticketOf = row => typeof row === 'string' ? row : row?.ticket;

function independentArticle(bundle) {
  const monitor = bundle?.monitor;
  const record = bundle?.record;
  const article = bundle?.article;
  if (bundle?.version !== VERSION || monitor?.origin !== 'independent-watch' ||
      record?.source !== 'independent-watch' ||
      !['escape', 'manshu'].includes(monitor?.kind)) {
    throw new Error('independent_monitor_identity_invalid');
  }
  if (!record || !article || monitor.raceKey !== record.raceKey ||
      monitor.status !== 'confirmed-after-exhibition' ||
      article.format !== 'formation-v3') {
    throw new Error('independent_monitor_not_confirmed');
  }
  const confirmed = time(monitor.confirmedAt);
  const selected = time(record.selectedAt);
  const captured = time(bundle.capturedAt);
  const deadline = time(record.deadlineAt);
  if (![confirmed, selected, captured, deadline].every(Number.isFinite) ||
      confirmed !== selected || captured < selected || captured >= deadline ||
      time(record.exhibitionSnapshot?.capturedAt) > confirmed) {
    throw new Error('independent_monitor_time_invalid');
  }
  if (!Array.isArray(monitor.sources) || monitor.sources.length < 2 ||
      !monitor.sources.some(source => source.role === 'entry') ||
      !monitor.sources.some(source => source.role === 'exhibition')) {
    throw new Error('independent_monitor_sources_missing');
  }
  for (const source of monitor.sources) {
    let url;
    try { url = new URL(source.url); } catch { throw new Error('independent_monitor_source_url_invalid'); }
    if (url.protocol !== 'https:' || !['www.boatrace.jp', 'boatrace.jp'].includes(url.hostname) ||
        url.searchParams.get('hd') !== String(record.date) ||
        Number(url.searchParams.get('jcd')) !== Number(record.jcd) ||
        Number(url.searchParams.get('rno')) !== Number(record.raceNo) ||
        !Number.isFinite(time(source.observedAt)) || time(source.observedAt) > confirmed ||
        typeof source.text !== 'string' || source.text.trim().length < 30 ||
        hash(source.text) !== source.sha256) {
      throw new Error('independent_monitor_source_invalid');
    }
  }
  const boats = monitor.boatAssessments;
  if (!Array.isArray(boats) || boats.length !== 6 ||
      new Set(boats.map(row => row.boat)).size !== 6 ||
      boats.some(row => !Number.isInteger(row.boat) || row.boat < 1 || row.boat > 6 ||
        typeof row.reason !== 'string' || !row.reason.trim())) {
    throw new Error('independent_monitor_assessments_missing');
  }
  if (!equal(article, monitor.article) ||
      !equal(article.practicalTickets, monitor.tickets) ||
      !equal(bundle.baselinePracticalTickets, monitor.tickets) ||
      !equal(record.prediction?.practicalTickets, monitor.tickets)) {
    throw new Error('independent_monitor_original_mismatch');
  }
  if (record.prediction?.mainSheet || record.prediction?.manshuSheet ||
      record.prediction?.aiCore || article.allRangeGroups ||
      !String(article.title).includes('狙い目監視') ||
      /チャッピーボートレースAI/.test(article.title) ||
      !String(article.freeText).includes('通常AIの予想とは別の、独立した監視予想です。')) {
    throw new Error('independent_monitor_app_mix_detected');
  }
  const tickets = monitor.tickets.map(ticketOf);
  if (!tickets.length || tickets.length > 7 || new Set(tickets).size !== tickets.length ||
      tickets.some(ticket => !/^[1-6]-[1-6]-[1-6]$/.test(ticket) || new Set(ticket.split('-')).size !== 3)) {
    throw new Error('independent_monitor_tickets_invalid');
  }
  return article;
}

module.exports = { VERSION, independentArticle };
