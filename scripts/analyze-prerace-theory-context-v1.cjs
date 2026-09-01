'use strict';

const path=require('node:path');
const input=require('./analysis-input-contract');
const ROOT=path.resolve(__dirname,'..');
const ACTIVATED_AT=Date.parse('2026-09-01T10:19:20Z');

function finite(v){return typeof v==='number'&&Number.isFinite(v)}
function pct(n,d){return d?Number((100*n/d).toFixed(1)):0}
function timeOf(r){for(const v of [r?.selectedAt,r?.capturedAt,r?.createdAt,r?.prediction?.selectedAt,r?.prediction?.capturedAt,r?.prediction?.createdAt]){const t=Date.parse(String(v||''));if(Number.isFinite(t))return t;}return NaN;}
function cOf(r){return r?.prediction?.preRaceConditions||r?.preRaceConditions||null}
function boatNo(b,i){const n=Number(b?.boatNo??b?.boat??b?.frameNo??i+1);return Number.isInteger(n)&&n>=1&&n<=6?n:i+1}
function leader(boats,key,lower=false){const a=boats.map((b,i)=>({boatNo:boatNo(b,i),value:b?.[key]})).filter(x=>finite(x.value));if(!a.length)return null;a.sort((x,y)=>lower?x.value-y.value||x.boatNo-y.boatNo:y.value-x.value||x.boatNo-y.boatNo);return a[0];}
function stat(){return{samples:0,wins:0,top2:0,top3:0,winRate:0,top2Rate:0,top3Rate:0}}
function add(s,boat,order){if(!boat)return;s.samples++;const p=order.indexOf(boat)+1;if(p===1)s.wins++;if(p>0&&p<=2)s.top2++;if(p>0&&p<=3)s.top3++;}
function fin(s){s.winRate=pct(s.wins,s.samples);s.top2Rate=pct(s.top2,s.samples);s.top3Rate=pct(s.top3,s.samples);return s;}
function bucket(obj,key){obj[key] ||= stat(); return obj[key];}
function waterClass(c){const w=c?.weather||{};const wind=Number(w.windSpeed??w.wind??c?.windSpeed);const wave=Number(w.waveHeight??w.wave??c?.waveHeight);if((Number.isFinite(wind)&&wind>=6)||(Number.isFinite(wave)&&wave>=8))return'strong';if((Number.isFinite(wind)&&wind>=3)||(Number.isFinite(wave)&&wave>=3))return'medium';if(Number.isFinite(wind)||Number.isFinite(wave))return'calm';return'missing';}
function build(){
 const cohort=input.buildDefaultCohort({root:ROOT});
 const byAttackFrame={},byFlowFrame={},byWater={},attackOuter={},attackInner={inner:stat(),outer:stat()},flowInner={inner:stat(),outer:stat()};
 let eligible=0;
 for(const r of cohort.records){const t=timeOf(r);if(!Number.isFinite(t)||t<ACTIVATED_AT)continue;const c=cOf(r);if(c?.sourceTiming!=='pre_deadline'||c?.officialResultUsed!==false)continue;const boats=Array.isArray(c.boats)?c.boats:[];if(boats.length!==6)continue;const order=input.finishOrder(r.__officialResult);if(order.length!==3)continue;eligible++;
   const a=leader(boats,'attackStrength'),f=leader(boats,'raceFlowPower'); const wc=waterClass(c);
   if(a){add(bucket(byAttackFrame,String(a.boatNo)),a.boatNo,order);add(a.boatNo<=3?attackInner.inner:attackInner.outer,a.boatNo,order);byWater[wc] ||= {attack:stat(),flow:stat()};add(byWater[wc].attack,a.boatNo,order);}
   if(f){add(bucket(byFlowFrame,String(f.boatNo)),f.boatNo,order);add(f.boatNo<=3?flowInner.inner:flowInner.outer,f.boatNo,order);byWater[wc] ||= {attack:stat(),flow:stat()};add(byWater[wc].flow,f.boatNo,order);}
 }
 for(const v of Object.values(byAttackFrame))fin(v);for(const v of Object.values(byFlowFrame))fin(v);fin(attackInner.inner);fin(attackInner.outer);fin(flowInner.inner);fin(flowInner.outer);for(const v of Object.values(byWater)){fin(v.attack);fin(v.flow)}
 return{schemaVersion:1,analysisId:'prerace-theory-context-v1',generatedAt:new Date().toISOString(),activatedAt:new Date(ACTIVATED_AT).toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleSettledRaceCount:eligible,byAttackLeaderFrame:byAttackFrame,byFlowLeaderFrame:byFlowFrame,attackLeaderInnerOuter:attackInner,flowLeaderInnerOuter:flowInner,byWaterClass:byWater,methodology:{source:'post-#761 canonical pre-deadline predictions joined to official settled results',waterClass:'strong if wind>=6m/s or wave>=8cm; medium if wind>=3m/s or wave>=3cm; otherwise calm when available',purpose:'test whether attack/flow signal value is portable by frame and water context',warning:'Research-only descriptive forward audit. No automatic adoption.'}};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
