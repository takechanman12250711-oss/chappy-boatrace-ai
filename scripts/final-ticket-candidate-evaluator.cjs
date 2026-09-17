'use strict';

const inputContract = require('./analysis-input-contract');

function normalizeTicket(value) {
  return String(value || '').replace(/\s+/g, '').replace(/→/g, '-');
}

function uniqueTickets(values) {
  return [...new Set((values || []).map(normalizeTicket).filter(Boolean))];
}

function ticketList(prediction) {
  const direct = prediction?.buyTickets || prediction?.tickets || prediction?.ticketRanks;
  if (Array.isArray(direct)) {
    return uniqueTickets(direct.map((item) => typeof item === 'string' ? item : item?.ticket || item?.combination || item?.text));
  }
  const formation = prediction?.formation || prediction?.formations || {};
  return uniqueTickets([
    ...(formation.main || formation.honmei || []),
    ...(formation.cover || formation.osae || []),
    ...(formation.nagashi || formation.flow || []),
    ...(formation.hole || formation.manshu || [])
  ]);
}

function topBoat(prediction) {
  return Number(prediction?.ranking?.[0]?.boatNo || prediction?.expectedBoats?.[0]?.boatNo || prediction?.mainSheet?.honmei?.boatNo || 0) || null;
}

function scenario(prediction) {
  return String(prediction?.aiCore?.scenario?.main?.type || prediction?.aiCore?.scenario?.mainScenario?.type || prediction?.raceFlow?.type || prediction?.raceFlow?.title || '');
}

function attacker(prediction) {
  return Number(prediction?.aiCore?.scenario?.main?.attackerBoatNo || prediction?.aiCore?.roleSummary?.attacker || prediction?.raceFlow?.attackBoats?.[0]?.boatNo || 0) || null;
}

function actualTicket(result) { return inputContract.actualTicket(result); }

function payout(result) {
  const source = result?.__officialResult || result?.officialResult || result?.raceResult || result?.result || result || {};
  return Number(source?.trifectaPayout || source?.payout3t || source?.payout || result?.trifectaPayout || result?.payout3t || result?.payout || 0) || 0;
}

function evaluatePair({ baseline, candidate, result, stakePerTicket = 100 }) {
  const baseTickets = ticketList(baseline);
  const candidateTickets = ticketList(candidate);
  const actual = actualTicket(result);
  const baseHit = actual ? baseTickets.includes(actual) : false;
  const candidateHit = actual ? candidateTickets.includes(actual) : false;
  const paid = payout(result);

  return {
    rankingChanged: topBoat(baseline) !== topBoat(candidate),
    scenarioChanged: scenario(baseline) !== scenario(candidate),
    attackerChanged: attacker(baseline) !== attacker(candidate),
    ticketsChanged: JSON.stringify(baseTickets) !== JSON.stringify(candidateTickets),
    baseline: { tickets: baseTickets.length, hit: baseHit, stake: baseTickets.length * stakePerTicket, return: baseHit ? paid : 0 },
    candidate: { tickets: candidateTickets.length, hit: candidateHit, stake: candidateTickets.length * stakePerTicket, return: candidateHit ? paid : 0 },
    addedHit: !baseHit && candidateHit,
    lostHit: baseHit && !candidateHit
  };
}

function aggregate(rows) {
  const total = rows.length;
  const sum = (side, key) => rows.reduce((n, row) => n + Number(row?.[side]?.[key] || 0), 0);
  const count = (key) => rows.filter((row) => row[key]).length;
  const baselineStake = sum('baseline', 'stake');
  const candidateStake = sum('candidate', 'stake');
  const baselineReturn = sum('baseline', 'return');
  const candidateReturn = sum('candidate', 'return');
  const baselineHits = rows.filter((row) => row.baseline.hit).length;
  const candidateHits = rows.filter((row) => row.candidate.hit).length;

  return {
    races: total,
    propagation: { rankingChanged: count('rankingChanged'), scenarioChanged: count('scenarioChanged'), attackerChanged: count('attackerChanged'), ticketsChanged: count('ticketsChanged') },
    hits: { baseline: baselineHits, candidate: candidateHits, added: count('addedHit'), lost: count('lostHit'), net: candidateHits - baselineHits },
    tickets: { baseline: sum('baseline', 'tickets'), candidate: sum('candidate', 'tickets'), delta: sum('candidate', 'tickets') - sum('baseline', 'tickets') },
    roi: {
      baseline: baselineStake ? Math.round((baselineReturn / baselineStake) * 10000) / 100 : 0,
      candidate: candidateStake ? Math.round((candidateReturn / candidateStake) * 10000) / 100 : 0,
      delta: baselineStake && candidateStake ? Math.round(((candidateReturn / candidateStake) - (baselineReturn / baselineStake)) * 10000) / 100 : 0
    }
  };
}

module.exports = { normalizeTicket, ticketList, actualTicket, evaluatePair, aggregate };
