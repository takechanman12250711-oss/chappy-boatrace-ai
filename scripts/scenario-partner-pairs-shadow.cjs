'use strict';
// Research-only: reuse per-scenario positional scores before the fixed role table.
// Scores are ranking indices, NOT calibrated probabilities. Never import this
// module from a production entry point until an explicitly reviewed adoption.
const VERSION = 'scenario-partner-pairs-main-only-v1';
const validBoat = n => Number.isInteger(n) && n >= 1 && n <= 6;
const exact = t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
function rankPairs({head, outcomes} = {}) {
  if (!validBoat(head)) throw Error('invalid-head');
  if (!Array.isArray(outcomes) || outcomes.length !== 6) throw Error('six-outcomes-required');
  const seen = new Set();
  const clean = outcomes.map(r => {
    if (!validBoat(r?.boatNo) || seen.has(r.boatNo)) throw Error('invalid-or-duplicate-boat');
    seen.add(r.boatNo);
    for (const k of ['secondScore', 'thirdScore']) {
      if (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] < 0 || r[k] > 100) throw Error('invalid-positional-score');
    }
    return {boatNo:r.boatNo, secondScore:r.secondScore, thirdScore:r.thirdScore,
      reasons:Array.isArray(r.reasons) ? r.reasons.filter(x=>typeof x==='string') : []};
  });
  const eligible = clean.filter(r=>r.boatNo !== head), pairs=[];
  for (const second of eligible) for (const third of eligible) {
    if (second.boatNo === third.boatNo) continue;
    pairs.push({ticket:`${head}-${second.boatNo}-${third.boatNo}`, second:second.boatNo, third:third.boatNo,
      secondScore:second.secondScore, thirdScore:third.thirdScore,
      rankingScore:Number((second.secondScore + third.thirdScore).toFixed(6)),
      weakestPosition:Math.min(second.secondScore, third.thirdScore),
      secondReasons:second.reasons,thirdReasons:third.reasons});
  }
  // Equal weighting is an experimental ordering assumption, not learned odds.
  pairs.sort((a,b)=>b.rankingScore-a.rankingScore || b.weakestPosition-a.weakestPosition || a.second-b.second || a.third-b.third);
  return pairs.map((r,i)=>({...r,rank:i+1}));
}
function selectMainPartners({baseTickets, mainHead, outcomes} = {}) {
  if (!Array.isArray(baseTickets) || !baseTickets.length || baseTickets.length > 10 ||
      !baseTickets.every(exact) || new Set(baseTickets).size !== baseTickets.length) throw Error('invalid-base-tickets');
  const pairs=rankPairs({head:mainHead,outcomes});
  const count=baseTickets.filter(t=>Number(t[0])===mainHead).length;
  if (!count) throw Error('main-head-absent');
  const chosen=pairs.slice(0,count);let offset=0;
  const tickets=baseTickets.map(t=>Number(t[0])===mainHead?chosen[offset++].ticket:t);
  if(new Set(tickets).size!==tickets.length || tickets.length!==baseTickets.length)throw Error('budget-or-duplicate-invariant');
  return {version:VERSION, tickets, mainHead, mainHeadCount:count, alternativeHeadsUnchanged:true,
    candidateCount:pairs.length, rankedPairs:pairs,
    removed:baseTickets.filter(t=>!tickets.includes(t)), added:tickets.filter(t=>!baseTickets.includes(t)),
    adopted:false,probabilityModel:false};
}
module.exports={VERSION,rankPairs,selectMainPartners};
