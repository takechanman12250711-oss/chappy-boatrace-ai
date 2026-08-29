'use strict';
const path = require('node:path');
const scoreAb = require('../js/effective-score-weight-ab');
const missReport = require('./build-effective-score-miss-attribution-report');
const inputContract = require('./analysis-input-contract');

const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'data', 'results');
const CANDIDATE = { st:0.75, roleAttack:0.5, exhibition:0, penalty:4 };

function rankedWithPenalty(ranked, challengerNo) {
  return ranked.map(item => ({...item, effectiveScore: item.effectiveScore - (item.boatNo === 1 ? CANDIDATE.penalty : 0)}))
    .sort((a,b)=>b.effectiveScore-a.effectiveScore || a.boatNo-b.boatNo);
}
function evaluateRows(rows, baseline, weightConfig) {
  let baselineHits=0, candidateHits=0, added=0, lost=0, triggered=0, changed=0;
  const byChallenger = {3:{triggered:0,added:0,lost:0,net:0},4:{triggered:0,added:0,lost:0,net:0}};
  const byMethod = {};
  const targetKeys = new Set(rows.map(r=>r.raceKey));
  const official = inputContract.collectOfficialResults(RESULTS_DIR,targetKeys);
  for (const row of rows) {
    const ranked=scoreAb.rankAnalyses(row.analyses,baseline,weightConfig); const base=ranked[0];
    const baseHit=base.boatNo===row.winnerBoatNo; if(baseHit) baselineHits++;
    let challengerNo=null;
    if(base.boatNo===1){
      for(const no of [3,4]){ const c=ranked.find(x=>x.boatNo===no); if(!c)continue;
        const gaps={}; for(const key of ['st','roleAttack','exhibition']) gaps[key]=(c.components[key]-base.components[key])*baseline.weights[key];
        const contributions=scoreAb.COMPONENT_ORDER.map(key=>({key,gap:(c.components[key]-base.components[key])*baseline.weights[key]}));
        const strongest=[...contributions].sort((a,b)=>a.gap-b.gap)[0];
        if(strongest.key==='courseIndex'&&gaps.st>=CANDIDATE.st&&gaps.roleAttack>=CANDIDATE.roleAttack&&gaps.exhibition>=CANDIDATE.exhibition){challengerNo=no;break;}
      }
    }
    const adjusted=challengerNo?rankedWithPenalty(ranked,challengerNo):ranked; if(challengerNo)triggered++;
    const candHit=adjusted[0].boatNo===row.winnerBoatNo; if(candHit)candidateHits++;
    if(adjusted[0].boatNo!==base.boatNo)changed++;
    if(!baseHit&&candHit){added++; if(challengerNo)byChallenger[challengerNo].added++;}
    if(baseHit&&!candHit){lost++; if(challengerNo)byChallenger[challengerNo].lost++;}
    if(challengerNo)byChallenger[challengerNo].triggered++;
    if(challengerNo){const method=inputContract.winningMethod(official.get(row.raceKey))||'unknown'; byMethod[method] ||= {triggered:0,added:0,lost:0,net:0}; byMethod[method].triggered++; if(!baseHit&&candHit)byMethod[method].added++; if(baseHit&&!candHit)byMethod[method].lost++;}
  }
  for(const x of Object.values(byChallenger))x.net=x.added-x.lost; for(const x of Object.values(byMethod))x.net=x.added-x.lost;
  return {raceCount:rows.length,baselineHits,candidateHits,net:candidateHits-baselineHits,triggered,changed,added,lost,byChallenger,byMethod};
}
function build(){const {weightConfig,settled}=missReport.loadDiscovery();const baseline=scoreAb.baselineProfile(weightConfig);const rows=[...settled.rows].sort((a,b)=>a.raceKey.localeCompare(b.raceKey));const blocks=[];const size=Math.ceil(rows.length/4);for(let i=0;i<4;i++){const part=rows.slice(i*size,(i+1)*size);if(part.length)blocks.push({block:i+1,from:part[0].raceKey,to:part.at(-1).raceKey,...evaluateRows(part,baseline,weightConfig)});}return{schemaVersion:1,analysisId:'inner-attack-candidate-stability-v1',scope:{dataset:'discovery-only',holdoutUsed:false,productionChanged:false,candidate:CANDIDATE},overall:evaluateRows(rows,baseline,weightConfig),chronologicalQuartiles:blocks};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n'); module.exports={build,CANDIDATE};
