'use strict';

const path=require('node:path');
const input=require('./analysis-input-contract');
const expansion=require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit=require('./analyze-ticket-expansion-payout-v2.cjs');

const ROOT=path.resolve(__dirname,'..');
const ACTIVATED_AT=Date.parse('2026-09-01T10:19:20Z');
const STAKE=100;
const CAPS=[8,9,10,11,12];
const GATES=[50,100,250];

function finite(v){return typeof v==='number'&&Number.isFinite(v);}
function pct(n,d){return d?Number((100*n/d).toFixed(1)):0;}
function parts(t){return String(t||'').split('-').map(Number);}
function timeOf(r){for(const v of [r?.selectedAt,r?.capturedAt,r?.createdAt,r?.prediction?.selectedAt,r?.prediction?.capturedAt,r?.prediction?.createdAt]){const t=Date.parse(String(v||''));if(Number.isFinite(t))return t;}return NaN;}
function conditionsOf(r){return r?.prediction?.preRaceConditions||r?.preRaceConditions||null;}
function boatNo(b,i){const n=Number(b?.boatNo??b?.boat??b?.frameNo??i+1);return Number.isInteger(n)&&n>=1&&n<=6?n:i+1;}
function leader(boats,key){const rows=boats.map((b,i)=>({boatNo:boatNo(b,i),value:b?.[key]})).filter(x=>finite(x.value)).sort((a,b)=>b.value-a.value||a.boatNo-b.boatNo);return rows[0]||null;}
function support(ticket,attackBoat,flowBoat){const [h,s,t]=parts(ticket);return {attackHead:h===attackBoat,flowLeg:s===flowBoat||t===flowBoat};}
function empty(){return {eligibleRaces:0,triggerRaces:0,addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0,profitYen:0,roiPercent:0};}
function finalize(m){m.profitYen=m.returnYen-m.investmentYen;m.roiPercent=pct(m.returnYen,m.investmentYen);return m;}

function build(){
 const cohort=input.buildDefaultCohort({root:ROOT});
 const payouts=payoutAudit.payoutMap();
 const modes={attackHead:{},flowSecondOrThird:{},combined:{}};
 for(const mode of Object.keys(modes)) for(const cap of CAPS) modes[mode][String(cap)]=empty();
 let settled=0;

 for(const r of cohort.records){
  const tm=timeOf(r); if(!Number.isFinite(tm)||tm<ACTIVATED_AT)continue;
  const c=conditionsOf(r); if(c?.sourceTiming!=='pre_deadline'||c?.officialResultUsed!==false)continue;
  const boats=Array.isArray(c.boats)?c.boats:[]; if(boats.length!==6)continue;
  const actual=input.actualTicket(r.__officialResult); if(!actual)continue;
  const attack=leader(boats,'attackStrength'); const flow=leader(boats,'raceFlowPower'); if(!attack||!flow)continue;
  const pool=expansion.collectTicketPool(r).slice(0,12); if(pool.length<8)continue;
  settled++;
  const base=pool.slice(0,7); const baseHit=base.some(x=>x.ticket===actual);
  const payout=payouts.get(r.__analysisRaceKey||input.raceKey(r))||0;

  for(const cap of CAPS){
    const extras=pool.slice(7,cap);
    const groups={
      attackHead:extras.filter(x=>support(x.ticket,attack.boatNo,flow.boatNo).attackHead),
      flowSecondOrThird:extras.filter(x=>support(x.ticket,attack.boatNo,flow.boatNo).flowLeg),
      combined:extras.filter(x=>{const s=support(x.ticket,attack.boatNo,flow.boatNo);return s.attackHead||s.flowLeg;})
    };
    for(const [name,added] of Object.entries(groups)){
      const m=modes[name][String(cap)]; m.eligibleRaces++;
      if(!added.length)continue;
      m.triggerRaces++; m.addedTickets+=added.length; m.investmentYen+=added.length*STAKE;
      if(!baseHit&&added.some(x=>x.ticket===actual)){m.rescueCount++;m.returnYen+=payout;if(payout>=10000)m.manboatRescueCount++;}
    }
  }
 }

 for(const byCap of Object.values(modes)) for(const m of Object.values(byCap)) finalize(m);
 const marginal={};
 for(const [name,byCap] of Object.entries(modes)){
  marginal[name]={};
  let prev={addedTickets:0,rescueCount:0,manboatRescueCount:0,investmentYen:0,returnYen:0};
  for(const cap of CAPS){
   const cur=byCap[String(cap)];
   const d={addedTickets:cur.addedTickets-prev.addedTickets,rescueCount:cur.rescueCount-prev.rescueCount,manboatRescueCount:cur.manboatRescueCount-prev.manboatRescueCount,investmentYen:cur.investmentYen-prev.investmentYen,returnYen:cur.returnYen-prev.returnYen};
   d.profitYen=d.returnYen-d.investmentYen; d.roiPercent=pct(d.returnYen,d.investmentYen);
   marginal[name][`ticket${cap}`]=d;
   prev={addedTickets:cur.addedTickets,rescueCount:cur.rescueCount,manboatRescueCount:cur.manboatRescueCount,investmentYen:cur.investmentYen,returnYen:cur.returnYen};
  }
 }
 return {schemaVersion:1,analysisId:'role-ticket-marginal-cap-v1',generatedAt:new Date().toISOString(),activatedAt:new Date(ACTIVATED_AT).toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,eligibleSettledRaceCount:settled,cumulativeByCap:modes,marginalByAddedPosition:marginal,gates:GATES.map(n=>({n,reached:settled>=n,status:settled>=n?'ready_for_review':'collecting'})),methodology:{baseline:'first 7 saved pre-race candidates fixed',caps:CAPS,attackHead:'candidate head equals saved attackStrength leader',flowSecondOrThird:'candidate second or third equals saved raceFlowPower leader',combined:'union of both rules',stake:`${STAKE} yen flat per added ticket`,interpretation:'marginalByAddedPosition isolates the incremental contribution of extending the candidate window from the prior cap to each next cap',outcomeUse:'evaluation only',warning:'Forward shadow only. No automatic ticket adoption.'}};
}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');
module.exports={build};
