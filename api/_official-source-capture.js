'use strict';
// Request-identity opt-in, never enabled by HTTP query/body/headers.
const { createHash } = require('node:crypto');
const pending = new WeakMap();
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const fail = reason => { throw new Error(`independent_official_${reason}`); };
const time = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ? Date.parse(value) : NaN;

function validateSources(sources, { date, jcd, raceNo }, now = Date.now()) {
  if (!Array.isArray(sources) || sources.length !== 2) fail('sources_missing');
  const roles = ['entry', 'exhibition'];
  for (let i = 0; i < roles.length; i++) {
    const source = sources[i];
    let url;
    try { url = new URL(source?.url); } catch { fail('source_url_invalid'); }
    if (source.role !== roles[i] || url.protocol !== 'https:' ||
        !['www.boatrace.jp', 'boatrace.jp'].includes(url.hostname) || url.port ||
        url.username || url.password || url.hash ||
        url.pathname !== `/owpc/pc/race/${i === 0 ? 'racelist' : 'beforeinfo'}` ||
        url.searchParams.getAll('hd').length !== 1 || url.searchParams.get('hd') !== String(date) ||
        url.searchParams.getAll('jcd').length !== 1 || Number(url.searchParams.get('jcd')) !== Number(jcd) ||
        url.searchParams.getAll('rno').length !== 1 || Number(url.searchParams.get('rno')) !== Number(raceNo)) fail('source_identity_invalid');
    if (!Number.isFinite(time(source.observedAt)) || time(source.observedAt) > now) fail('source_time_invalid');
    if (typeof source.text !== 'string' || source.text.trim().length < 30 ||
        source.sha256 !== sha256(source.text)) fail('source_bytes_invalid');
  }
  return sources;
}

function observeSources(req) {
  if (pending.has(req)) fail('observer_already_registered');
  const result = { status: 'not_captured', sources: null };
  pending.set(req, result);
  return () => structuredClone(result);
}

function captureSources(req, originals) {
  const result = pending.get(req);
  if (!result) return;
  // Capture failure cannot stop the existing normal prediction/API path.
  // The separate consumer must require status=captured before using the data.
  try {
    if (result.status !== 'not_captured') fail('duplicate_capture');
    const sources = originals.map(source => ({ ...source, sha256: sha256(source.text) }));
    validateSources(sources, { date: req.query.date, jcd: req.query.jcd, raceNo: req.query.rno });
    result.sources = sources;
    result.status = 'captured';
  } catch {
    result.status = 'capture_failed';
    result.sources = null;
  }
}

module.exports = { observeSources, captureSources, validateSources };
