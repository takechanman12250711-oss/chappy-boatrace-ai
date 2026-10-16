'use strict';
// Capture materials only. No model, tickets, article, storage or publication.
const { observeSources, validateSources } = require('../api/_official-source-capture');
const { exhibitionSnapshot } = require('./note-exhibition');
const { parseDeadlineTimes, createDeadlineAt } = require('../api/schedule');
const fail = reason => { throw new Error(`independent_official_${reason}`); };
const jstDate = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');

async function captureIndependentOfficialInput(target, { handler = require('../api/race'), now = Date.now } = {}) {
  validateTarget(target, now);
  const req = { query: { date: target.date, jcd: target.jcd, rno: String(target.raceNo) } };
  const read = observeSources(req);
  let status = 200, data, responses = 0;
  const res = { setHeader() {}, status(code) { status = code; return this; }, json(value) { data = value; responses++; return value; } };
  await handler(req, res);
  if (responses !== 1 || status !== 200 || data?.ok !== true) fail('fetch_failed');
  return buildIndependentOfficialInput(target, data, read(), { now });
}

function validateTarget(target, now) {
  const { date, jcd, raceNo, deadlineAt } = target || {};
  if (!/^\d{8}$/.test(date || '') || !/^\d{2}$/.test(jcd || '') || Number(jcd) < 1 || Number(jcd) > 24 ||
      !Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12 ||
      typeof deadlineAt !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(deadlineAt) ||
      !Number.isFinite(Date.parse(deadlineAt))) fail('target_invalid');
  if (jstDate(Date.parse(deadlineAt)) !== date) fail('deadline_date_mismatch');
  const checkDeadline = () => {
    const current = now();
    if (!Number.isFinite(current) || jstDate(current) !== date ||
        Date.parse(deadlineAt) - current <= 120000) fail('current_deadline_required');
    return current;
  };
  return checkDeadline();
}

// Build only from the already observed request. Never refetch an official page.
function buildIndependentOfficialInput(target, data, captured, { now = Date.now } = {}) {
  const current = validateTarget(target, now);
  const { date, jcd, raceNo, deadlineAt } = target;
  if (data?.ok !== true) fail('fetch_failed');
  if (data.source !== 'boatrace-official' || data.date !== date || Number(data.stadiumCode) !== Number(jcd) ||
      data.raceNo !== raceNo || !Number.isFinite(Date.parse(data.fetchedAt)) || Date.parse(data.fetchedAt) > current) fail('response_identity_invalid');
  if (captured.status !== 'captured') fail(captured.status);
  validateSources(captured.sources, target, current);
  if (captured.sources.some(source => Date.parse(source.observedAt) > Date.parse(data.fetchedAt))) fail('source_time_invalid');
  // The caller's deadline is only a preliminary budget check. Bind it to the
  // same fetched official entry page, using the existing schedule parser.
  const entrySource = captured.sources[0];
  const times = parseDeadlineTimes(entrySource.text);
  if (times.length !== 12 || times.some(value => !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value))) fail('official_deadline_missing');
  const officialDeadlineAt = createDeadlineAt(date, times[raceNo - 1].padStart(5, '0'));
  if (Date.parse(officialDeadlineAt) !== Date.parse(deadlineAt)) fail('official_deadline_mismatch');
  const exhibition = exhibitionSnapshot(data, data.fetchedAt);
  if (!exhibition.ready) fail('exhibition_not_verified');
  return {
    version: 'independent-official-input-v1', raceKey: `${date}-${jcd}-${raceNo}`,
    date, jcd, raceNo, deadlineAt, capturedAt: new Date(current).toISOString(),
    sources: captured.sources, exhibitionSnapshot: exhibition,
    officialDeadline: { deadlineAt: officialDeadlineAt, sourceSha256: entrySource.sha256,
      url: entrySource.url, observedAt: entrySource.observedAt, raceNo },
    // Explicit projection excludes model/history enrichment and any ticket lists.
    entries: structuredClone(data.entries), startExhibition: structuredClone(data.startExhibition),
    automaticReady: false, publicationReady: false
  };
}
module.exports = { captureIndependentOfficialInput, buildIndependentOfficialInput };
