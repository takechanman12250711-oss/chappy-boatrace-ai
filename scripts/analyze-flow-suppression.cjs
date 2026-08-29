'use strict';
const scoreAb=require('../js/effective-score-weight-ab');
const miss=require('./build-effective-score-miss-attribution-report');

function build(){
 const {weightConfig,settled}=miss.loadDiscovery(); const baseline=scoreAb.baselineProfile(weightConfig);
 const groups={attackWin:[],innerWin:[]};
 for(const row of settled.rows){
  const ranked=scoreAb.rankAnalyses(row.analyses,baseline,weightConfig); const one=ranked.find(x=>x.boatNo===1); if(!one||ranked[0].boatNo!==1)continue;
  for(const no of [3,4]){const out=ranked.find(x=>x.boatNo===no);if(!out)continue;
   const gap=k=>(out.components[k]-one.components[k])*baseline.weights[k];
   const strongAttack=gap('st')>0&&gap('roleAttack')>0;
   const flowSuppressed=gap('raceFlow')<0;
   if(!strongAttack||!flowSuppressed)continue;
   const rec={raceKey:row.raceKey,boatNo:no,winner:row.winnerBoatNo,st:gap('st'),roleAttack:gap('roleAttack'),raceFlow:gap('raceFlow'),exhibition:gap('exhibition'),courseIndex:gap('courseIndex')};
   if(row.winnerBoatNo===no)groups.attackWin.push(rec); else if(row.winnerBoatNo===1)groups.innerWin.push(rec);
  }
 }
 const summarize=a=>({count:a.length,avg:{st:avg(a,'st'),roleAttack:avg(a,'roleAttack'),raceFlow:avg(a,'raceFlow'),exhibition:avg(a,'exhibition'),courseIndex:avg(a,'courseIndex')}});
 return {schemaVersion:1,analysisId:'flow-suppression-v1',scope:{dataset:'discovery-only',holdoutUsed:false,productionChanged:false,definition:'1号艇がbaseline top。3/4号艇がST・攻め役割で優位だがraceFlowで劣位'},attackWin:summarize(groups.attackWin),innerWin:summarize(groups.innerWin),records:groups};
}
function avg(a,k){return a.length?Number((a.reduce((s,x)=>s+x[k],0)/a.length).toFixed(4)):0;}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
