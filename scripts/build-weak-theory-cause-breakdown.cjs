'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const MIN_EVALUATED=20;
const WEAK_RECOVERY=80;
function summarizeTheory(theoryKey,venues){
  const weakVenues=venues.filter(row=>Number(row.recoveryRate)<WEAK_RECOVERY);
  const profitableVenues=venues.filter(row=>Number(row.recoveryRate)>=100);
  const classification=weakVenues.length*2>venues.length?'BROAD_WEAKNESS':weakVenues.length*2<venues.length?'VENUE_CONCENTRATED':'MIXED';
  return {
    theoryKey,
    venueCount:venues.length,
    weakVenueCount:weakVenues.length,
    profitableVenueCount:profitableVenues.length,
    classification,
    worstVenues:[...venues].sort((a,b)=>(a.recoveryRate??999)-(b.recoveryRate??999)).slice(0,5),
    bestVenues:[...venues].sort((a,b)=>(b.recoveryRate??-1)-(a.recoveryRate??-1)).slice(0,5)
  };
}
function build(){
  const p=read('data/stats/theory-performance-report.json');
  const rows=(p.byVenueTheory||[]).filter(x=>Number(x.evaluatedCount)>=MIN_EVALUATED);
  const weak=new Set((p.byTheory||[]).filter(x=>Number(x.evaluatedCount)>=MIN_EVALUATED&&Number(x.recoveryRate)<WEAK_RECOVERY).map(x=>x.theoryKey));
  const by={};
  for(const r of rows.filter(x=>weak.has(x.theoryKey))){
    (by[r.theoryKey]??=[]).push({jcd:r.jcd,place:r.place,evaluatedCount:r.evaluatedCount,practicalHitRate:r.practicalHitRate,recoveryRate:r.recoveryRate,profit:r.profit});
  }
  for(const v of Object.values(by))v.sort((a,b)=>(a.recoveryRate??999)-(b.recoveryRate??999));
  const summaries=[...weak].map(key=>summarizeTheory(key,by[key]||[]));
  return {
    schemaVersion:2,
    generatedAt:new Date().toISOString(),
    productionChanged:false,
    selectionContract:{minimumEvaluated:MIN_EVALUATED,weakRecoveryRateBelow:WEAK_RECOVERY,source:'existing PR #1017 diagnostic scope; not a production gate'},
    weakTheoryKeys:[...weak],
    summaries,
    byVenue:by,
    interpretation:'diagnostic-only: BROAD_WEAKNESS means a majority of eligible venue rows are below the same 80% recovery criterion already used to select weak theories; no automatic weakening or threshold change',
    automaticProductionChange:false
  };
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={MIN_EVALUATED,WEAK_RECOVERY,summarizeTheory,build};
