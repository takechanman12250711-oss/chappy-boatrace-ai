"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "data", "predictions");
const counts = new Map();
let settled = 0, miss = 0, candidateExists = 0, selectedMiss = 0;
const byCandidate = new Map();
function arr(v){ return Array.isArray(v)?v:[]; }
function normTicket(v){ const m=String(v?.ticket||v||"").match(/[1-6]/g)||[]; return m.length>=3?m.slice(0,3).join("-"):""; }
function resultTicket(r){
  const x=r?.result||{};
  const vals=[x.ticket,x.trifecta,x.resultTicket,x.review?.resultTicket,x.review?.actualTicket];
  for(const v of vals){const n=normTicket(v);if(n)return n;}
  const order=x.order||x.finishOrder||x.review?.order||x.review?.finishOrder;
  if(Array.isArray(order)&&order.length>=3)return order.slice(0,3).map(Number).join("-");
  return "";
}
for(const name of fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort()){
  const data=JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));
  for(const record of [...arr(data.predictions),...arr(data.verificationPredictions)]){
    if(record?.result?.settled!==true)continue;
    settled++;
    const hit=record.result?.practicalHit===true||record.result?.review?.practicalHit===true;
    if(hit)continue;
    miss++;
    const type=String(record.result?.review?.missType||"不明"); counts.set(type,(counts.get(type)||0)+1);
    const actual=resultTicket(record);
    const pred=record.prediction||{};
    const practical=[...arr(pred.practicalTickets),...arr(pred.ticketSheets?.selected),...arr(pred.selectedTickets)].map(normTicket).filter(Boolean);
    const formations=[...arr(pred.mainSheet?.tickets),...arr(pred.mainSheet?.coverTickets),...arr(pred.mainSheet?.flowTickets),...arr(pred.manshuSheet?.tickets),...arr(pred.ticketSheets?.main),...arr(pred.ticketSheets?.cover),...arr(pred.ticketSheets?.flow),...arr(pred.ticketSheets?.hole),...arr(pred.ticketSheets?.possibility),...arr(pred.aiCore?.formations?.possibilityCandidates),...arr(pred.formations?.possibilityCandidates)].map(normTicket).filter(Boolean);
    const exists=actual&&formations.includes(actual);
    if(exists) candidateExists++;
    if(actual&&practical.includes(actual)) selectedMiss++;
    const key=exists?"candidate-exists":"candidate-absent"; byCandidate.set(`${type}|${key}`,(byCandidate.get(`${type}|${key}`)||0)+1);
  }
}
console.log(JSON.stringify({settled,miss,missTypes:Object.fromEntries([...counts].sort((a,b)=>b[1]-a[1])),candidateExists,selectedMiss,breakdown:Object.fromEntries([...byCandidate].sort((a,b)=>b[1]-a[1]))},null,2));
