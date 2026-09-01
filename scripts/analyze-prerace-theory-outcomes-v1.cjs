'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');

const ROOT = path.resolve(__dirname, '..');
const ACTIVATED_AT = Date.parse('2026-09-01T10:19:20Z');
const GATES = [50, 100, 250];

function finite(v){ return typeof v === 'number' && Number.isFinite(v); }
function pct(n,d){ return d ? Number((100*n/d).toFixed(1)) : 0; }
function timeOf(r){
  for(const v of [r?.selectedAt,r?.capturedAt,r?.createdAt,r?.prediction?.selectedAt,r?.prediction?.capturedAt,r?.prediction?.createdAt]){
    const t=Date.parse(String(v||'')); if(Number.isFinite(t)) return t;
  }
  return NaN;
}
function conditionsOf(r){ return r?.prediction?.preRaceConditions || r?.preRaceConditions || null; }
function boatNo(b,i){ const n=Number(b?.boatNo ?? b?.boat ?? b?.frameNo ?? i+1); return Number.isInteger(n)&&n>=1&&n<=6?n:i+1; }
function leader(boats,key,lowerBetter=false){
  const rows=boats.map((b,i)=>({boatNo:boatNo(b,i),value:b?.[key]})).filter(x=>finite(x.value));
  if(!rows.length) return null;
  rows.sort((a,b)=> lowerBetter ? a.value-b.value || a.boatNo-b.boatNo : b.value-a.value || a.boatNo-b.boatNo);
  return rows[0];
}
function margin(boats,key,lowerBetter=false){
  const rows=boats.map((b,i)=>({boatNo:boatNo(b,i),value:b?.[key]})).filter(x=>finite(x.value));
  if(rows.length<2) return null;
  rows.sort((a,b)=> lowerBetter ? a.value-b.value || a.boatNo-b.boatNo : b.value-a.value || a.boatNo-b.boatNo);
  return Number(Math.abs(rows[0].value-rows[1].value).toFixed(4));
}
function stat(){ return {samples:0,wins:0,top2:0,top3:0,winRate:0,top2Rate:0,top3Rate:0}; }
function add(s,boat,order){ if(!boat)return; s.samples++; const p=order.indexOf(boat)+1; if(p===1)s.wins++; if(p>0&&p<=2)s.top2++; if(p>0&&p<=3)s.top3++; }
function finalize(s){ s.winRate=pct(s.wins,s.samples); s.top2Rate=pct(s.top2,s.samples); s.top3Rate=pct(s.top3,s.samples); return s; }
function bucketName(v,cuts){ if(v===null||!finite(v))return 'missing'; for(const c of cuts)if(v<c.max)return c.name; return cuts[cuts.length-1].tail; }
function build(){
  const cohort=input.buildDefaultCohort({root:ROOT});
  const metrics={attackLeader:stat(),flowLeader:stat(),totalLeader:stat(),bestExhibitionST:stat(),attackAndBestSTSame:stat()};
  const attackMarginBuckets={}; const flowMarginBuckets={};
  let eligible=0,completeSignals=0,attackBestStSameSamples=0;
  for(const r of cohort.records){
    const t=timeOf(r); if(!Number.isFinite(t)||t<ACTIVATED_AT)continue;
    const c=conditionsOf(r); if(c?.sourceTiming!=='pre_deadline'||c?.officialResultUsed!==false)continue;
    const boats=Array.isArray(c.boats)?c.boats:[]; if(boats.length!==6)continue;
    const order=input.finishOrder(r.__officialResult); if(order.length!==3)continue;
    eligible++;
    if(boats.every(b=>finite(b.attackStrength)&&finite(b.raceFlowPower)&&finite(b.totalScore))) completeSignals++;
    const a=leader(boats,'attackStrength'); const f=leader(boats,'raceFlowPower'); const tt=leader(boats,'totalScore'); const st=leader(boats,'exhibitionST',true);
    add(metrics.attackLeader,a?.boatNo,order); add(metrics.flowLeader,f?.boatNo,order); add(metrics.totalLeader,tt?.boatNo,order); add(metrics.bestExhibitionST,st?.boatNo,order);
    if(a&&st&&a.boatNo===st.boatNo){ attackBestStSameSamples++; add(metrics.attackAndBestSTSame,a.boatNo,order); }
    const am=margin(boats,'attackStrength'); const fm=margin(boats,'raceFlowPower');
    const ab=bucketName(am,[{name:'<0.5',max:0.5},{name:'0.5-1.0',max:1.0},{name:'1.0-2.0',max:2.0},{name:'2.0+',max:Infinity,tail:'2.0+'}]);
    const fb=bucketName(fm,[{name:'<0.5',max:0.5},{name:'0.5-1.0',max:1.0},{name:'1.0-2.0',max:2.0},{name:'2.0+',max:Infinity,tail:'2.0+'}]);
    if(a){ attackMarginBuckets[ab] ||= stat(); add(attackMarginBuckets[ab],a.boatNo,order); }
    if(f){ flowMarginBuckets[fb] ||= stat(); add(flowMarginBuckets[fb],f.boatNo,order); }
  }
  for(const k of Object.keys(metrics))finalize(metrics[k]);
  for(const x of Object.values(attackMarginBuckets))finalize(x);
  for(const x of Object.values(flowMarginBuckets))finalize(x);
  return {schemaVersion:1,analysisId:'prerace-theory-outcomes-v1',generatedAt:new Date().toISOString(),activatedAt:new Date(ACTIVATED_AT).toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleSettledRaceCount:eligible,completeSignalRaceCount:completeSignals,completeSignalRate:pct(completeSignals,eligible),metrics,attackMarginBuckets,flowMarginBuckets,gates:GATES.map(n=>({n,reached:eligible>=n,status:eligible>=n?'ready_for_review':'collecting'})),methodology:{source:'canonical pre-deadline predictions joined to official settled results',outcomeUse:'evaluation only',attack:'highest saved attackStrength',flow:'highest saved raceFlowPower',total:'highest saved totalScore',bestExhibitionST:'lowest saved exhibitionST',combined:'same boat is attack leader and best exhibition ST',warning:'Descriptive forward audit only. Do not adopt weights or tickets automatically.'}};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
