"use strict";
const fs=require("node:fs"),path=require("node:path");
const dir=path.join(__dirname,"..","data","predictions");
const counts=new Map(),breakdown=new Map(),holdRanks=new Map(),pickupRanks=new Map();
let settled=0,miss=0,known=0,candidateExists=0,partnerMiss=0,sameHead=0,secondInHold=0,thirdInPickup=0,bothRoleCandidates=0;
const arr=v=>Array.isArray(v)?v:[];
const boat=v=>Number(v?.boatNo??v?.number??v?.waku??v?.boat??v)||0;
const ticket=v=>{const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):"";};
function actual(record){const x=record?.result||{};for(const v of[x.ticket,x.trifecta,x.resultTicket,x.review?.resultTicket,x.review?.actualTicket]){const n=ticket(v);if(n)return n;}for(const o of[x.order,x.finishOrder,x.review?.order,x.review?.finishOrder])if(Array.isArray(o)&&o.length>=3)return o.slice(0,3).map(Number).join("-");return "";}
function roleList(p,key){const theory=p?.holdPickupTheory||p?.aiCore?.holdPickupTheory||{};const direct=key==="hold"?theory.secondCandidates:theory.thirdCandidates;const flow=key==="hold"?p?.raceFlow?.holdBoats:p?.raceFlow?.pickupBoats;return arr(direct?.length?direct:flow).map(boat).filter(Boolean);}
for(const name of fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort()){
 const data=JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));
 for(const record of[...arr(data.predictions),...arr(data.verificationPredictions)]){
  if(record?.result?.settled!==true)continue; settled++;
  if(record.result?.practicalHit===true||record.result?.review?.practicalHit===true)continue; miss++;
  const type=String(record.result?.review?.missType||"不明");counts.set(type,(counts.get(type)||0)+1);
  const a=actual(record);if(a)known++;
  const p=record.prediction||{};
  const forms=[...arr(p.mainSheet?.tickets),...arr(p.mainSheet?.coverTickets),...arr(p.mainSheet?.flowTickets),...arr(p.manshuSheet?.tickets),...arr(p.ticketSheets?.main),...arr(p.ticketSheets?.cover),...arr(p.ticketSheets?.flow),...arr(p.ticketSheets?.hole),...arr(p.ticketSheets?.possibility),...arr(p.aiCore?.formations?.possibilityCandidates),...arr(p.formations?.possibilityCandidates)].map(ticket).filter(Boolean);
  const exists=Boolean(a&&forms.includes(a));if(exists)candidateExists++;
  const key=`${type}|${exists?"candidate-exists":"candidate-absent"}`;breakdown.set(key,(breakdown.get(key)||0)+1);
  if(type!=="相手抜け"||!a)continue;
  partnerMiss++;
  const [first,second,third]=a.split("-").map(Number);
  const practical=arr(p.practicalTickets).map(ticket).filter(Boolean);
  if(practical.some(t=>Number(t[0])===first))sameHead++;
  const holds=roleList(p,"hold"),picks=roleList(p,"pickup");
  const hr=holds.indexOf(second),pr=picks.indexOf(third);
  const hk=hr<0?"absent":String(hr+1),pk=pr<0?"absent":String(pr+1);
  holdRanks.set(hk,(holdRanks.get(hk)||0)+1);pickupRanks.set(pk,(pickupRanks.get(pk)||0)+1);
  if(hr>=0)secondInHold++;if(pr>=0)thirdInPickup++;if(hr>=0&&pr>=0)bothRoleCandidates++;
 }
}
console.log(JSON.stringify({settled,miss,missTypes:Object.fromEntries([...counts].sort((a,b)=>b[1]-a[1])),actualKnown:known,candidateExists,breakdown:Object.fromEntries([...breakdown].sort((a,b)=>b[1]-a[1])),partnerMiss:{count:partnerMiss,sameHead,secondInHold,thirdInPickup,bothRoleCandidates,holdRanks:Object.fromEntries(holdRanks),pickupRanks:Object.fromEntries(pickupRanks)}},null,2));
