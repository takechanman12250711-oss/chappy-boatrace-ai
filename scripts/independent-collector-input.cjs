'use strict';
// In-memory consumer only. No persistence, publication or prediction decision.
async function callWithIndependentOfficialInput(callApi, handler, query, target, { now = Date.now } = {}) {
  let read, setupFailed = false;
  const data = await callApi(handler, query, {
    observeRequest(req) {
      try { read = require('../api/_official-source-capture').observeSources(req); }
      catch { setupFailed = true; }
    }
  });
  let independentInput;
  try {
    if (setupFailed || !read) throw new Error('independent_official_observer_unavailable');
    const packet = require('./capture-independent-official-input.cjs')
      .buildIndependentOfficialInput(target, data, read(), { now });
    independentInput = { status: 'captured', packet, automaticReady: false, publicationReady: false };
  } catch (error) {
    // Whitelist diagnostic codes: errors must never expose source HTML.
    const message = String(error?.message || '');
    const reason = /^independent_official_[a-z_]+$/.test(message) ? message : 'independent_official_capture_failed';
    independentInput = { status: 'not_ready', reason, automaticReady: false, publicationReady: false };
  }
  return { data, independentInput };
}
module.exports = { callWithIndependentOfficialInput };
