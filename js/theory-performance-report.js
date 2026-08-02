"use strict";

function pct(n,d){return d?Math.round(n/d*1000)/10:0;}
function normalizeTicket(v){const b=String(v||"").match(/[1-6]/g)||[];return b.length>=3?b.slice(0,3).join("-"):"";}
function buildRows(records){
  const rows=[];
  (Array.isArray(records)?records:[]).forEach(record=>{
    if(record?.result?.settled!==true) return;
    const actual=normalizeTicket(record?.result?.resultTicket);
    const payout=Number(record?.result?.payout||0);
    const scenarioHit=record?.result?.verification?.scenarioHit===true || record?.result?.verification?.structuredScenarioHit===true;
    const theories=record?.theoryTagSnapshot?.theories;
    (Array.isArray(theories)?theories:[]).forEach(theory=>{
      const tickets=[...new Set((theory.tickets||[]).map(normalizeTicket).filter(Boolean))];
      const stake=tickets.length*100;
      const hit=Boolean(actual&&tickets.includes(actual));
      rows.push({
        raceKey:String(record?.raceKey||""),
        jcd:String(record?.jcd||"").padStart(2,"0"),
        place:String(record?.place||""),
        theoryKey:String(theory?.theoryKey||""),
        label:String(theory?.label||theory?.theoryKey||""),
        version:String(theory?.version||""),
        formal:theory?.formal===true,
        ticketCount:tickets.length,
        mainTicketCount:Number(theory?.mainTicketCount||0),
        hit,
        scenarioHit,
        stake,
        return:hit?payout:0
      });
    });
  });
  return rows.filter(r=>r.theoryKey);
}
function summarize(rows,keyFn){
  const groups=new Map();
  rows.forEach(row=>{
    const key=keyFn(row); if(!key)return;
    if(!groups.has(key))groups.set(key,{key,label:row.label,theoryKey:row.theoryKey,jcd:row.jcd,place:row.place,races:new Set(),uses:0,hits:0,scenarioHits:0,stake:0,return:0,ticketCount:0,mainTicketCount:0});
    const g=groups.get(key); g.races.add(row.raceKey); g.uses++; g.hits+=row.hit?1:0; g.scenarioHits+=row.scenarioHit?1:0; g.stake+=row.stake; g.return+=row.return; g.ticketCount+=row.ticketCount; g.mainTicketCount+=row.mainTicketCount;
  });
  return [...groups.values()].map(g=>({key:g.key,label:g.label,theoryKey:g.theoryKey,jcd:g.jcd,place:g.place,raceCount:g.races.size,useCount:g.uses,hitCount:g.hits,hitRate:pct(g.hits,g.uses),scenarioHitCount:g.scenarioHits,scenarioMatchRate:pct(g.scenarioHits,g.uses),stake:g.stake,return:g.return,profit:g.return-g.stake,recoveryRate:pct(g.return,g.stake),ticketCount:g.ticketCount,mainTicketCount:g.mainTicketCount})).sort((a,b)=>b.raceCount-a.raceCount||a.key.localeCompare(b.key));
}
function build(records){const rows=buildRows(records);return{version:"1.0.0",status:rows.length?"collecting-data":"no-data",sampleCount:rows.length,byTheory:summarize(rows,r=>r.theoryKey),byVenueTheory:summarize(rows,r=>`${r.jcd}:${r.theoryKey}`),usableForPrediction:false,automaticApplication:false};}
module.exports={buildRows,summarize,build};
