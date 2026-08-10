"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "data", "predictions");
const counts = new Map();
let settled = 0, miss = 0, candidateExists = 0, actualKnown = 0;
const breakdown = new Map();
function arr(v){ return Array.isArray(v)?v:[]; }
function normTicket(v){ const m=String(v?.ticket||v||"").match(/[1-6]/g)||[]; return m.length>=3?m.slice(0,3).join("-"):""; }
function resultTicket(record){ const x=record?.result||{}; for(const v of [x.ticket,x.trifecta,x.resultTicket,x.review?.resultTicket,x.review?.actualTicket]){const n=normTicket(v);if(n)return n;} for(const order of [x.order,x.finishOrder,x.review?.order,x.review?.finishOrder]){if(Array.isArray(order)&&order.length>=3)return order.slice(0,3).map(Number).join("-");} return ""; }
for(const name of fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort()){
 const data=JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));
 for(const record of [...arr(data.predictions),...arr(data.verificationPredictions)]){
  if(record?.result?.settled!==true)continue; settled++;
  const hit=record.result?.practicalHit===true||record.result?.review?.practicalHit===true; if(hit)continue; miss++;
  const type=String(record.result?.review?.missType||"不明"); counts.set(type,(counts.get(type)||0)+1);
  const actual=resultTicket(record); if(actual) actualKnown++;
  const p=record.prediction||{};
  const formations=[...arr(p.mainSheet?.tickets),...arr(p.mainSheet?.coverTickets),...arr(p.mainSheet?.flowTickets),...arr(p.manshuSheet?.tickets),...arr(p.ticketSheets?.main),...arr(p.ticketSheets?.cover),...arr(p.ticketSheets?.flow),...arr(p.ticketSheets?.hole),...arr(p.ticketSheets?.possibility),...arr(p.aiCore?.formations?.possibilityCandidates),...arr(p.formations?.possibilityCandidates)].map(normTicket).filter(Boolean);
  const exists=Boolean(actual&&formations.includes(actual)); if(exists)candidateExists++;
  const key=`${type}|${exists?"candidate-exists":"candidate-absent"}`; breakdown.set(key,(breakdown.get(key)||0)+1);
 }
}
console.log(JSON.stringify({settled,miss,missTypes:Object.fromEntries([...counts].sort((a,b)=>b[1]-a[1])),actualKnown,candidateExists,breakdown:Object.fromEntries([...breakdown].sort((a,b)=>b[1]-a[1]))},null,2));
