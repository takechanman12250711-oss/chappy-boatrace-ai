'use strict';

const path=require('node:path');
const input=require('./analysis-input-contract');
const expansion=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit=require('./analyze-ticket-expansion-payout-v2.cjs');

const ROOT=path.resolve(__dirname,'..');
const ACTIVATED_AT=Date.parse('2026-09-01T10:19:20Z');
const STAKE=100;
const GATES=[50,100,250];

function finite(v){return typeof v==='number'&&Number.isFinite(v);}
function pct(n,d){return d?Number((100*n/d).toFixed(1)):0;}
function parts(t){return String(t||'').split('-').map(Number);}
function timeOf(r){for(const v of [r?.selectedAt,r?.capturedAt,r?.createdAt,r?.prediction?.selectedAt,r?.prediction?.capturedAt,r?.prediction?.createdAt]){const t=Date.parse(String(v||''));if(Number.isFinite(t))return t;}return NaN;}
function conditionsOf(r){return r?.prediction?.preRaceConditions||r?.preRaceConditions||null;}
function boatNo(b,i){const n=Number(b?.boatNo??b?.boat??b?.frameNo??i+1);return Number.isInteger(n)&&n>=1&&n<=6?n:i+1;}
function ranked(boats,key){return boats.map((b,i)=>({boatNo:boatNo(b,i),value:b?.[key],st:b?.exhibitionST})).filter(x=>finite(x.value)).sort((a,b)=>b.value-a.value||a.boatNo-b.boatNo);}
function bestStBoat(boats){return boats.map((b,i)=>({boatNo:boatNo(b,i),st:b?.exhibitionST})).filter(x=>finite(x.st)).sort((a,b)=>a.st-b.st||a.boatNo-b.boatNo)[0]?.boatNo||null;}
function roleSupport(ticket,attackBoat,flowBoat){const [h,s,t]=parts(ticket);return h===attackBoat||s===flowBoat||t===flowBoat;}
function empty(){return {eligibleRaces:0,triggerRaces:0,addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0};}
function finalize(m){m.profitYen=m.returnYen-m.investmentYen;m.roiPercent=pct(m.returnYen,m.investmentYen);return m;}

function build(){
 const cohort=input.buildDefaultCohort({root:ROOT});
 const payouts=payoutAudit.payoutMap();
 const triggers={
  attackMargin05:empty(), attackMargin10:empty(), flowMargin05:empty(), flowMargin10:empty(), attackAndBestST:empty(), strongEither:empty(), strongEitherCap9:empty(), strongEitherCap12:empty()
 };
 let settled=0;
 for(const r of cohort.records){
  const tm=timeOf(r); if(!Number.isFinite(tm)||tm<ACTIVATED_AT)continue;
  const c=conditionsOf(r); if(c?.sourceTiming!=='pre_deadline'||c?.officialResultUsed!==false)continue;
  const boats=Array.isArray(c.boats)?c.boats:[]; if(boats.length!==6)continue;
  const actual=input.actualTicket(r.__officialResult); if(!actual)continue;
  const ar=ranked(boats,'attackStrength'); const fr=ranked(boats,'raceFlowPower'); if(ar.length<2||fr.length<2)continue;
  const pool=expansion.collectTicketPool(r).slice(0,12); if(pool.length<8)continue;
  settled++;
  const attack=ar[0].boatNo, flow=fr[0].boatNo;
  const attackMargin=ar[0].value-ar[1].value, flowMargin=fr[0].value-fr[1].value;
  const stAgree=bestStBoat(boats)===attack;
  const base=pool.slice(0,7); const baseHit=base.some(x=>x.ticket===actual);
  const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;
  const defs={
    attackMargin05:{on:attackMargin>=0.5,cap:12}, attackMargin10:{on:attackMargin>=1.0,cap:12},
    flowMargin05:{on:flowMargin>=0.5,cap:12}, flowMargin10:{on:flowMargin>=1.0,cap:12},
    attackAndBestST:{on:stAgree,cap:12}, strongEither:{on:attackMargin>=1.0||flowMargin>=1.0||stAgree,cap:12},
    strongEitherCap9:{on:attackMargin>=1.0||flowMargin>=1.0||stAgree,cap:9}, strongEitherCap12:{on:attackMargin>=1.0||flowMargin>=1.0||stAgree,cap:12}
  };
  for(const [name,d] of Object.entries(defs)){
    const m=triggers[name]; m.eligibleRaces++;
    if(!d.on)continue;
    const added=pool.slice(7,d.cap).filter(x=>roleSupport(x.ticket,attack,flow));
    if(!added.length)continue;
    m.triggerRaces++;m.addedTickets+=added.length;m.investmentYen+=added.length*STAKE;
    if(!baseHit&&added.some(x=>x.ticket===actual)){m.rescueCount++;m.returnYen+=payout;if(payout>=10000)m.manboatRescueCount++;}
  }
 }
 Object.values(triggers).forEach(finalize);
 return {schemaVersion:1,analysisId:'role-ticket-special-trigger-v1',generatedAt:new Date().toISOString(),activatedAt:new Date(ACTIVATED_AT).toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleSettledRaceCount:settled,triggers,gates:GATES.map(n=>({n,reached:settled>=n,status:settled>=n?'ready_for_review':'collecting'})),methodology:{baseline:'first 7 saved candidates fixed',candidateWindow:'saved ranks 8-12',roleRule:'attack leader as head OR flow leader in second/third',specialTriggers:'attack margin, flow margin, or attack leader matching best exhibition ST',capComparison:'same strongEither trigger at cap 9 versus cap 12',stake:`${STAKE} yen flat per added ticket`,outcomeUse:'evaluation only',warning:'Forward shadow only; no automatic production adoption.'}};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
