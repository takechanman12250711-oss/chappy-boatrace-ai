'use strict';
const scoreAb = require('../js/effective-score-weight-ab');
const missReport = require('./build-effective-score-miss-attribution-report');

const ST_THRESHOLDS = [0,0.25,0.5,0.75,1];
const ROLE_THRESHOLDS = [0,0.25,0.5,0.75,1];
const EXHIBITION_THRESHOLDS = [null,0,0.5,1];
const MAX_COURSE_GAPS = [null,2,3,4];
const PENALTIES = [1.5,2,2.5,3,4];

function pairFeatures(top, challenger, baseline) {
  const weightedGap = key => (challenger.components[key] - top.components[key]) * baseline.weights[key];
  const all = scoreAb.COMPONENT_ORDER.map(key => ({key, gap: weightedGap(key)}));
  const strongestTop = [...all].sort((a,b)=>a.gap-b.gap)[0];
  if (strongestTop.key !== 'courseIndex') return null;
  return {
    st: weightedGap('st'),
    roleAttack: weightedGap('roleAttack'),
    exhibition: weightedGap('exhibition'),
    courseGap: -weightedGap('courseIndex')
  };
}

function matches(features, cfg) {
  return features.st >= cfg.st &&
    features.roleAttack >= cfg.roleAttack &&
    (cfg.exhibition === null || features.exhibition >= cfg.exhibition) &&
    (cfg.maxCourseGap === null || features.courseGap <= cfg.maxCourseGap);
}

function adjust(ranked, penalty) {
  return ranked.map(x=>({...x, adjustedTotal:x.total-(x.boatNo===1?penalty:0)}))
    .sort((a,b)=>b.adjustedTotal-a.adjustedTotal || b.roleAttack-a.roleAttack || a.boatNo-b.boatNo);
}

function evaluate(rows, baseline, cfg) {
  let top1=0, added=0, lost=0, triggered=0, changed=0;
  for (const {row,ranked} of rows) {
    const top=ranked[0];
    const before=top.boatNo===row.winnerBoatNo;
    let applies=false;
    if(top.boatNo===1){
      for(const boatNo of [3,4]){
        const challenger=ranked.find(x=>x.boatNo===boatNo);
        const f=challenger?pairFeatures(top,challenger,baseline):null;
        if(f&&matches(f,cfg)){applies=true;break;}
      }
    }
    if(applies)triggered++;
    const afterRanked=adjust(ranked,applies?cfg.penalty:0);
    const after=afterRanked[0].boatNo===row.winnerBoatNo;
    if(afterRanked[0].boatNo!==top.boatNo)changed++;
    if(!before&&after)added++;
    if(before&&!after)lost++;
    if(after)top1++;
  }
  return {top1,added,lost,netTop1:added-lost,triggeredRaceCount:triggered,changedTopBoatCount:changed};
}

function search(options={}) {
  const {weightConfig,settled}=missReport.loadDiscovery(options);
  const baseline=scoreAb.baselineProfile(weightConfig);
  const rows=settled.rows.map(row=>({row,ranked:scoreAb.rankAnalyses(row.analyses,baseline,weightConfig)}));
  const baselineTop1=rows.filter(x=>x.ranked[0].boatNo===x.row.winnerBoatNo).length;
  const midpoint=Math.floor(rows.length/2);
  const first=rows.slice(0,midpoint), second=rows.slice(midpoint);
  const candidates=[];
  for(const st of ST_THRESHOLDS)for(const roleAttack of ROLE_THRESHOLDS)for(const exhibition of EXHIBITION_THRESHOLDS)for(const maxCourseGap of MAX_COURSE_GAPS)for(const penalty of PENALTIES){
    const cfg={st,roleAttack,exhibition,maxCourseGap,penalty};
    const all=evaluate(rows,baseline,cfg);
    if(all.triggeredRaceCount<10)continue;
    const h1=evaluate(first,baseline,cfg),h2=evaluate(second,baseline,cfg);
    candidates.push({...cfg,...all,chronologicalHalves:[h1,h2]});
  }
  candidates.sort((a,b)=>b.netTop1-a.netTop1 || Math.min(b.chronologicalHalves[0].netTop1,b.chronologicalHalves[1].netTop1)-Math.min(a.chronologicalHalves[0].netTop1,a.chronologicalHalves[1].netTop1) || b.added-a.added || a.lost-b.lost || a.triggeredRaceCount-b.triggeredRaceCount);
  return {schemaVersion:1,analysisId:'inner-attack-threshold-grid-v1',scope:{dataset:'discovery-only',holdoutUsed:false,productionChanged:false,baselineTop1},grid:{ST_THRESHOLDS,ROLE_THRESHOLDS,EXHIBITION_THRESHOLDS,MAX_COURSE_GAPS,PENALTIES},candidateCount:candidates.length,best:candidates[0]||null,topCandidates:candidates.slice(0,30)};
}

if(require.main===module)process.stdout.write(`${JSON.stringify(search(),null,2)}\n`);
module.exports={search,pairFeatures,matches,evaluate};
