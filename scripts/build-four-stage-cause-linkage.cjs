'use strict';
const path=require('node:path');
const input=require('./analysis-input-contract');
const expansion=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const ROOT=path.resolve(__dirname,'..');
const parts=t=>String(t||'').split('-').map(Number);
const numeric=v=>Number.isFinite(Number(v))?Number(v):null;
const pct=(n,d)=>d?Number((100*n/d).toFixed(1)):0;
const predictionOf=r=>r?.prediction||r||{};
const conditionsOf=r=>predictionOf(r)?.preRaceConditions||r?.preRaceConditions||{};
function boatNumber(e,i){const n=Number(e?.boatNo??e?.boat??e?.frameNo??e?.number??e?.course);return Number.isInteger(n)&&n>=1&&n<=6?n:i+1}
function boatEntries(r){const c=conditionsOf(r),raw=Array.isArray(c?.boats)?c.boats:Array.isArray(c?.entries)?c.entries:[];return raw.slice(0,6).map((e,i)=>({...e,__boatNo:boatNumber(e,i)}))}
function byBoat(xs,n){return xs.find(e=>e.__boatNo===n)||xs[n-1]||null}
function rank(xs,n,key,lower=true){const target=numeric(byBoat(xs,n)?.[key]),vals=xs.map(e=>numeric(e?.[key])).filter(Number.isFinite);if(!Number.isFinite(target)||!vals.length)return null;return 1+vals.filter(v=>lower?v<target:v>target).length}
const listOf=v=>Array.isArray(v)?v.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=6):[];
function stageFor(base,actual){const a=parts(actual),heads=new Set(base.map(x=>parts(x.ticket)[0]));if(!heads.has(a[0]))return'head_miss';const pref=new Set(base.map(x=>{const p=parts(x.ticket);return p.length===3?`${p[0]}-${p[1]}`:''}));return pref.has(`${a[0]}-${a[1]}`)?'third_place_miss':'second_place_miss'}
function countBy(rows,key){const m=new Map();for(const r of rows){const k=String(r[key]??'missing');m.set(k,(m.get(k)||0)+1)}return[...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([value,count])=>({value,count,percent:pct(count,rows.length)}))}
function boolStat(rows,key){const a=rows.filter(r=>typeof r[key]==='boolean'),yes=a.filter(r=>r[key]).length;return{available:a.length,yes,no:a.length-yes,yesPercent:pct(yes,a.length)}}
function rankOne(rows,key){const a=rows.filter(r=>Number.isFinite(r[key])),yes=a.filter(r=>r[key]===1).length;return{available:a.length,rank1:yes,rank1Percent:pct(yes,a.length)}}
function summarize(rows){return{count:rows.length,actualWinnerLane:countBy(rows,'actualHead'),primaryBaselineHead:countBy(rows,'primaryBaselineHead'),venue:countBy(rows,'venue').slice(0,12),wallState:countBy(rows,'wallState').slice(0,8),oneEscapeUnderrated:boolStat(rows,'oneEscapeUnderrated'),outerHeadBackedAgainstOneWin:boolStat(rows,'outerHeadBackedAgainstOneWin'),outerAttackSignalled:boolStat(rows,'outerAttackSignalled'),attackerWon:boolStat(rows,'attackerWon'),actualHeadCurrentSTRank1:rankOne(rows,'actualHeadCurrentSTRank'),actualHeadExhibitionSTRank1:rankOne(rows,'actualHeadExhibitionSTRank'),actualHeadExhibitionTimeRank1:rankOne(rows,'actualHeadExhibitionTimeRank'),actualHeadAttackStrengthRank1:rankOne(rows,'actualHeadAttackStrengthRank'),actualHeadRaceFlowPowerRank1:rankOne(rows,'actualHeadRaceFlowPowerRank'),actualSecondInRemainers:boolStat(rows,'actualSecondInRemainers'),actualThirdInRemainers:boolStat(rows,'actualThirdInRemainers'),actualSecondInPickupCandidates:boolStat(rows,'actualSecondInPickupCandidates'),actualThirdInPickupCandidates:boolStat(rows,'actualThirdInPickupCandidates'),exactWinnerWithin24:boolStat(rows,'exactWinnerWithin24')}}
function build(){
 const cohort=input.buildDefaultCohort({root:ROOT}),rows=[];
 for(const record of cohort.records){
  const actual=input.actualTicket(record.__officialResult);if(!actual)continue;
  const pool=expansion.collectTicketPool(record);if(pool.length<7)continue;
  const base=pool.slice(0,7);if(base.some(x=>x.ticket===actual))continue;
  const a=parts(actual);if(a.length!==3)continue;
  const stage=stageFor(base,actual),baselineHeads=[...new Set(base.map(x=>parts(x.ticket)[0]).filter(Number.isInteger))],primaryBaselineHead=parts(base[0]?.ticket)[0]||null;
  const p=predictionOf(record),e=p?.verificationEvidence||record?.verificationEvidence||{},s=e?.raceScenarios||p?.raceScenarios||{},w=e?.wallTheory||p?.wallTheory||{},entries=boatEntries(record);
  const attacker=numeric(s?.attackerBoatNo??s?.attackerCourse??s?.attacker),remainers=listOf(s?.remainers),pickups=listOf(s?.pickupCandidates);
  const raceKey=record.__analysisRaceKey||input.raceKey(record),vr=record?.jcd??record?.venueCode??record?.stadiumCode??record?.placeCode??conditionsOf(record)?.jcd??conditionsOf(record)?.venueCode??'',venue=String(vr||'').padStart(2,'0');
  const exactRank=pool.findIndex(x=>x.ticket===actual);
  rows.push({raceKey,stage,actual,actualHead:a[0],actualSecond:a[1],actualThird:a[2],primaryBaselineHead,baselineHeads,venue:/^\d{2}$/.test(venue)?venue:'missing',exactWinnerWithin24:exactRank>=0&&exactRank<24,exactCandidateRank:exactRank>=0?exactRank+1:null,oneEscapeUnderrated:a[0]===1?!baselineHeads.includes(1):false,outerHeadBackedAgainstOneWin:a[0]===1?baselineHeads.some(h=>h>=3):false,attackerBoatNo:Number.isFinite(attacker)?attacker:null,outerAttackSignalled:Number.isFinite(attacker)?attacker>=3:null,attackerWon:Number.isFinite(attacker)?attacker===a[0]:null,wallState:String(w?.state||'').trim()||'missing',wallBoat:numeric(w?.wallBoat??s?.wallBoat),actualHeadCurrentSTRank:rank(entries,a[0],'currentST',true),actualHeadExhibitionSTRank:rank(entries,a[0],'exhibitionST',true),actualHeadExhibitionTimeRank:rank(entries,a[0],'exhibitionTime',true),actualHeadAttackStrengthRank:rank(entries,a[0],'attackStrength',false),actualHeadRaceFlowPowerRank:rank(entries,a[0],'raceFlowPower',false),actualSecondInRemainers:remainers.length?remainers.includes(a[1]):null,actualThirdInRemainers:remainers.length?remainers.includes(a[2]):null,actualSecondInPickupCandidates:pickups.length?pickups.includes(a[1]):null,actualThirdInPickupCandidates:pickups.length?pickups.includes(a[2]):null});
 }
 const byStage={head_miss:summarize(rows.filter(r=>r.stage==='head_miss')),second_place_miss:summarize(rows.filter(r=>r.stage==='second_place_miss')),third_place_miss:summarize(rows.filter(r=>r.stage==='third_place_miss'))};
 const exclusivePriority=Object.entries(byStage).map(([stage,v])=>({stage,count:v.count,shareOfMissesPercent:pct(v.count,rows.length)})).sort((a,b)=>b.count-a.count||a.stage.localeCompare(b.stage));
 return{schemaVersion:1,analysisId:'four-stage-cause-linkage-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,methodology:{cohort:'same saved pre-deadline cohort and candidate order as four-stage-miss-diagnosis-v1',exclusiveStages:['head_miss','second_place_miss','third_place_miss'],signalLinkage:'Only saved pre-race verificationEvidence/preRaceConditions are linked. Official result supplies the outcome label only.',oneEscapeUnderrated:'official winner was lane 1 and lane 1 was absent from baseline seven heads',outerHeadBackedAgainstOneWin:'official winner was lane 1 while at least one baseline-seven head was lane 3-6',stAndExhibition:'rank of the official winner inside the six saved pre-race boat records; lower ST/time is better',remainPickup:'whether official second/third boat had already been stored in saved remainers/pickupCandidates',caution:'Descriptive linkage only; it does not prove causality and must not auto-change production.'},diagnostics:{...cohort.diagnostics,missRows:rows.length},exclusivePriority,largestExclusiveStage:exclusivePriority[0]||null,byStage,rows};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build,stageFor,summarize};
