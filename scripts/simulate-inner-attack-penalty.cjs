'use strict';
const scoreAb = require('../js/effective-score-weight-ab');
const missReport = require('./build-effective-score-miss-attribution-report');

const PENALTIES = [0.5,1,1.5,2,2.5,3,4,5];
const SIGNALS = ['stAndRoleAttack','tripleAttack'];

function signalForPair(top, challenger, baseline) {
  const gap = key => (challenger.components[key] - top.components[key]) * baseline.weights[key];
  const contributions = scoreAb.COMPONENT_ORDER.map(key => ({ key, weightedGap: gap(key) }));
  const strongestTop = [...contributions].sort((a,b)=>a.weightedGap-b.weightedGap)[0];
  if (strongestTop.key !== 'courseIndex') return null;
  const st = gap('st') > 1e-12;
  const roleAttack = gap('roleAttack') > 1e-12;
  const exhibition = gap('exhibition') > 1e-12;
  return { stAndRoleAttack: st && roleAttack, tripleAttack: st && roleAttack && exhibition };
}

function adjustedRanking(ranked, penalty) {
  return ranked.map(row => ({...row, adjustedTotal: row.total - (row.boatNo===1 ? penalty : 0)}))
    .sort((a,b)=>b.adjustedTotal-a.adjustedTotal || b.roleAttack-a.roleAttack || a.boatNo-b.boatNo);
}

function simulate(options={}) {
  const { weightConfig, settled } = missReport.loadDiscovery(options);
  const baseline = scoreAb.baselineProfile(weightConfig);
  const baselineRows = settled.rows.map(row => ({ row, ranked: scoreAb.rankAnalyses(row.analyses, baseline, weightConfig) }));
  const baselineTop1 = baselineRows.filter(x=>x.ranked[0].boatNo===x.row.winnerBoatNo).length;
  const results = [];

  for (const signalKey of SIGNALS) {
    for (const penalty of PENALTIES) {
      let top1 = 0, changed = 0, added = 0, lost = 0, triggered = 0;
      const addedRaceKeys = [], lostRaceKeys = [];
      for (const item of baselineRows) {
        const { row, ranked } = item;
        const top = ranked[0];
        const baselineWin = top.boatNo === row.winnerBoatNo;
        let applies = false;
        if (top.boatNo === 1) {
          for (const challengerNo of [3,4]) {
            const challenger = ranked.find(x=>x.boatNo===challengerNo);
            const signal = challenger ? signalForPair(top, challenger, baseline) : null;
            if (signal?.[signalKey]) { applies = true; break; }
          }
        }
        if (applies) triggered += 1;
        const adjusted = adjustedRanking(ranked, applies ? penalty : 0);
        const adjustedWin = adjusted[0].boatNo === row.winnerBoatNo;
        if (adjusted[0].boatNo !== top.boatNo) changed += 1;
        if (!baselineWin && adjustedWin) { added += 1; addedRaceKeys.push(row.raceKey); }
        if (baselineWin && !adjustedWin) { lost += 1; lostRaceKeys.push(row.raceKey); }
        if (adjustedWin) top1 += 1;
      }
      results.push({ signalKey, penalty, triggeredRaceCount: triggered, top1, baselineTop1, netTop1: top1-baselineTop1, added, lost, changedTopBoatCount: changed, addedRaceKeys, lostRaceKeys });
    }
  }

  results.sort((a,b)=>b.netTop1-a.netTop1 || b.added-a.added || a.lost-b.lost || a.penalty-b.penalty);
  return {
    schemaVersion: 1,
    analysisId: 'inner-attack-penalty-simulation-v1',
    scope: { dataset:'discovery-only', holdoutUsed:false, productionChanged:false, baselineTop1 },
    penalties: PENALTIES,
    signals: SIGNALS,
    results,
    best: results[0]
  };
}

if (require.main===module) process.stdout.write(`${JSON.stringify(simulate(),null,2)}\n`);
module.exports = { simulate, signalForPair, adjustedRanking, PENALTIES, SIGNALS };
