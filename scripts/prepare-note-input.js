'use strict';

// Enrich an already selected forecast. Never use odds to select or remove tickets.
function attachTicketOdds(value, byTicket) {
  if (Array.isArray(value)) return value.map(item => attachTicketOdds(item, byTicket));
  if (!value || typeof value !== 'object') return value;
  const copy = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, attachTicketOdds(item, byTicket)]));
  if (/^[1-6]-[1-6]-[1-6]$/.test(copy.ticket || '')) {
    const odds = Number(byTicket[copy.ticket]);
    copy.odds = Number.isFinite(odds) && odds > 0 ? odds : 0;
    copy.hasOdds = copy.odds > 0;
    copy.oddsText = copy.hasOdds ? `${copy.odds}倍` : 'オッズ未取得';
  }
  return copy;
}

async function prepareNoteInput({ prediction, baseline, record, fetchOdds, now = Date.now }) {
  const deadline = Date.parse(record.deadlineAt || '');
  let response = null;
  let oddsError = null;
  if (Number.isFinite(deadline) && deadline > now()) {
    try {
      response = await fetchOdds({ date: record.date, jcd: record.jcd, rno: record.raceNo });
      if (response?.ok !== true || response.source !== 'boatrace-official' ||
          response.date !== record.date || response.stadiumCode !== record.jcd ||
          Number(response.raceNo) !== record.raceNo || !response.byTicket) {
        throw new Error('note_odds_identity_mismatch');
      }
    } catch (error) { oddsError = error.message; response = null; }
  } else { oddsError = 'note_deadline_invalid_or_passed'; }
  const byTicket = response?.byTicket || {};
  const enriched = attachTicketOdds(prediction, byTicket);
  if (Number.isFinite(deadline)) {
    const text = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(deadline);
    enriched.race = { ...enriched.race, deadline: text,
      raceInfo: { ...enriched.race?.raceInfo, deadline: text } };
  }
  return { prediction: enriched, baseline: attachTicketOdds(baseline, byTicket),
    oddsSnapshot: { source: response?.source || null, date: record.date, jcd: record.jcd,
      raceNo: record.raceNo, capturedAt: new Date(now()).toISOString(), byTicket, error: oddsError } };
}

module.exports = { attachTicketOdds, prepareNoteInput };
