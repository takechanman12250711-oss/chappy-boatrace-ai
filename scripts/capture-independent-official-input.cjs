'use strict';
// Capture materials only. No model, tickets, article, storage or publication.
const { observeSources, validateSources } = require('../api/_official-source-capture');
const { exhibitionSnapshot } = require('./note-exhibition');
const fail = reason => { throw new Error(`independent_official_${reason}`); };

async function captureIndependentOfficialInput(target, { handler = require('../api/race'), now = Date.now } = {}) {
  const { date, jcd, raceNo, deadlineAt } = target || {};
  if (!/^\d{8}$/.test(date || '') || !/^\d{2}$/.test(jcd || '') || Number(jcd) < 1 || Number(jcd) > 24 ||
      !Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12 ||
      typeof deadlineAt !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(deadlineAt) ||
      !Number.isFinite(Date.parse(deadlineAt))) fail('target_invalid');
  const checkDeadline = () => {
    const current = now();
    if (!Number.isFinite(current) || new Date(current + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '') !== date ||
        Date.parse(deadlineAt) - current <= 120000) fail('current_deadline_required');
    return current;
  };
  checkDeadline();
  const req = { query: { date, jcd, rno: String(raceNo) } };
  const read = observeSources(req);
  let status = 200, data, responses = 0;
  const res = { setHeader() {}, status(code) { status = code; return this; }, json(value) { data = value; responses++; return value; } };
  await handler(req, res);
  const current = checkDeadline();
  if (responses !== 1 || status !== 200 || data?.ok !== true) fail('fetch_failed');
  if (data.source !== 'boatrace-official' || data.date !== date || Number(data.stadiumCode) !== Number(jcd) ||
      data.raceNo !== raceNo || !Number.isFinite(Date.parse(data.fetchedAt)) || Date.parse(data.fetchedAt) > current) fail('response_identity_invalid');
  const captured = read();
  if (captured.status !== 'captured') fail(captured.status);
  validateSources(captured.sources, target, current);
  if (captured.sources.some(source => Date.parse(source.observedAt) > Date.parse(data.fetchedAt))) fail('source_time_invalid');
  const exhibition = exhibitionSnapshot(data, data.fetchedAt);
  if (!exhibition.ready) fail('exhibition_not_verified');
  return {
    version: 'independent-official-input-v1', raceKey: `${date}-${jcd}-${raceNo}`,
    date, jcd, raceNo, deadlineAt, capturedAt: new Date(current).toISOString(),
    sources: captured.sources, exhibitionSnapshot: exhibition,
    // Explicit projection excludes model/history enrichment and any ticket lists.
    entries: structuredClone(data.entries), startExhibition: structuredClone(data.startExhibition),
    automaticReady: false, publicationReady: false
  };
}
module.exports = { captureIndependentOfficialInput };
