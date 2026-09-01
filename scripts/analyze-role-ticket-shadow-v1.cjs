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
function leader(boats,key){const rows=boats.map((b,i)=>({boatNo:boatNo(b,i),value:b?.[key]})).filter(x=>finite(x.value)).sort((a,b)=>b.value-a.value||a.boatNo-b.boatNo);return rows[0]||null;}
function roleSupport(ticket,attackBoat,flowBoat){const [h,s,t]=parts(ticket);return {attackHead:h===attackBoat,flowSecond:s===flowBoat,flowThird:t===flowBoat,any:h===attackBoat||s===flowBoat||t===flowBoat};}
function empty(){return {eligibleRaces:0,triggerRaces:0,addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0};}

function build(){
 const cohort=input.buildDefaultCohort({root:ROOT});
 const payouts=payoutAudit.payoutMap();
 const modes={attackHead:empty(),flowSecondOrThird:empty(),combined:empty()};
 let settled=0;
 for(const r of cohort.records){
  const tm=timeOf(r); if(!Number.isFinite(tm)||tm<ACTIVATED_AT)continue;
  const c=conditionsOf(r); if(c?.sourceTiming!=='pre_deadline'||c?.officialResultUsed!==false)continue;
  const boats=Array.isArray(c.boats)?c.boats:[]; if(boats.length!==6)continue;
  const actual=input.actualTicket(r.__officialResult); if(!actual)continue;
  const attack=leader(boats,'attackStrength'); const flow=leader(boats,'raceFlowPower');
  if(!attack||!flow)continue;
  const pool=expansion.collectTicketPool(r).slice(0,12); if(pool.length<8)continue;
  settled++;
  const base=pool.slice(0,7); const extras=pool.slice(7,12);
  const baseHit=base.some(x=>x.ticket===actual);
  const groups={
    attackHead:extras.filter(x=>roleSupport(x.ticket,attack.boatNo,flow.boatNo).attackHead),
    flowSecondOrThird:extras.filter(x=>{const s=roleSupport(x.ticket,attack.boatNo,flow.boatNo);return s.flowSecond||s.flowThird;}),
    combined:extras.filter(x=>roleSupport(x.ticket,attack.boatNo,flow.boatNo).any)
  };
  const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;
  for(const [name,added] of Object.entries(groups)){
    const m=modes[name]; m.eligibleRaces++;
    if(!added.length)continue;
    m.triggerRaces++; m.addedTickets+=added.length; m.investmentYen+=added.length*STAKE;
    if(!baseHit&&added.some(x=>x.ticket===actual)){m.rescueCount++;m.returnYen+=payout;if(payout>=10000)m.manboatRescueCount++;}
  }
 }
 for(const m of Object.values(modes)){m.profitYen=m.returnYen-m.investmentYen;m.roiPercent=pct(m.returnYen,m.investmentYen);}
 return {schemaVersion:1,analysisId:'role-ticket-shadow-v1',generatedAt:new Date().toISOString(),activatedAt:new Date(ACTIVATED_AT).toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleSettledRaceCount:settled,modes,gates:GATES.map(n=>({n,reached:settled>=n,status:settled>=n?'ready_for_review':'collecting'})),methodology:{baseline:'first 7 saved pre-race candidates',candidateWindow:'saved ranks 8-12 only',attackHead:'add only candidates whose head boat equals saved attackStrength leader',flowSecondOrThird:'add only candidates whose second or third boat equals saved raceFlowPower leader',combined:'union of attack-head and flow-second/third support',stake:`${STAKE} yen flat per added ticket`,outcomeUse:'evaluation only',warning:'Forward shadow only. No automatic ticket adoption.'}};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
