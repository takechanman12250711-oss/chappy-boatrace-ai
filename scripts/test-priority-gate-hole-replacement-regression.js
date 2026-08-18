"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const selector = require("../js/practical-selection");

const MAXIMUM_DATE = "20260812";
const predictionDirectory = path.join(process.cwd(), "data", "predictions");
function rowsOf(data){return[...(data.predictions||[]),...(data.verificationPredictions||[])];}
function ticketOf(value){const numbers=String(value?.ticket||value||"").match(/[1-6]/g)||[];return numbers.length>=3?numbers.slice(0,3).join("-"):"";}
function predictionInput(row){const frozen=row?.prediction?.preRaceConditions||row?.preRaceConditions;if(!frozen||!Array.isArray(frozen.boats)||frozen.boats.length<5)return null;return{...frozen,entries:frozen.boats,boats:frozen.boats,jcd:row.jcd,stadiumCode:row.jcd,venueCode:row.jcd,placeName:row.place,venueName:row.place,raceNo:row.raceNo,rno:row.raceNo,weather:frozen.weather||{}};}
function periodOf(date){const numericDate=Number(date);return numericDate<20260807?"pre":numericDate<=20260810?"mid":"recent";}
function emptyStats(){return{races:0,baseHits:0,nextHits:0,gains:0,losses:0,changes:0,stake:0,baseReturn:0,nextReturn:0};}
function addRace(stats,{baseHit,nextHit,changed,stake,payout}){stats.races+=1;stats.stake+=stake;if(baseHit){stats.baseHits+=1;stats.baseReturn+=payout;}if(nextHit){stats.nextHits+=1;stats.nextReturn+=payout;}if(changed)stats.changes+=1;if(!baseHit&&nextHit)stats.gains+=1;if(baseHit&&!nextHit)stats.losses+=1;}
const periods={pre:emptyStats(),mid:emptyStats(),recent:emptyStats()},holdout=emptyStats(),seen=new Set(),rankCounts={},addedPriorityCounts={},addedTicketCounts={};
for(const filename of fs.readdirSync(predictionDirectory).filter(name=>/^\d{8}\.json$/.test(name)).sort()){
 const date=filename.slice(0,8);if(date>MAXIMUM_DATE)continue;const data=JSON.parse(fs.readFileSync(path.join(predictionDirectory,filename),"utf8"));
 for(const row of rowsOf(data)){
  if(row?.result?.settled!==true)continue;const raceKey=row.raceKey||`${date}-${row.jcd}-${row.raceNo}`;if(seen.has(raceKey))continue;seen.add(raceKey);
  const actual=ticketOf(row?.result?.resultTicket||row?.result?.review?.resultTicket),input=predictionInput(row);if(!actual||!input)continue;
  const selection=selector.select(global.createPrediction(input)),nextTickets=(selection.tickets||[]).map(ticketOf),replacement=selection?.expansionSummary?.priorityGateReplacement||null,baseTickets=nextTickets.slice();
  assert.equal(selection?.verificationEvidence?.generation?.ticketPolicyVersion,"practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5-coursefailclosed1",`${raceKey}: policy version`);
  if(replacement){
   assert.equal(replacement.applied,true,`${raceKey}: applied audit`);assert.equal(replacement.maximumRank,10,`${raceKey}: maximum rank`);assert.ok(replacement.candidateRank>=1&&replacement.candidateRank<=10,`${raceKey}: candidate rank`);assert.equal(replacement.sourceReasonCode,"CANDIDATE_ONLY_EVALUATION",`${raceKey}: source reason`);assert.equal(replacement.sourceBranch,"formation:hole",`${raceKey}: source branch`);assert.ok(replacement.addedTicket.startsWith("1-"),`${raceKey}: 1-head only`);assert.ok(replacement.addedPriorityScore>replacement.removedPriorityScore,`${raceKey}: strictly higher priority`);assert.ok(!["本線","流し"].includes(replacement.removedCategory),`${raceKey}: keep main and atomic flow tickets`);assert.equal(nextTickets.length,baseTickets.length,`${raceKey}: fixed ticket count`);assert.equal(nextTickets[replacement.selectedIndex],replacement.addedTicket,`${raceKey}: replacement position`);assert.ok(!nextTickets.includes(replacement.removedTicket),`${raceKey}: removed ticket absent`);
   baseTickets[replacement.selectedIndex]=replacement.removedTicket;
   assert.ok(selection.candidateDecisions.some(decision=>decision.ticket===replacement.addedTicket&&decision.selected===true&&decision.reasonCode==="PRIORITY_GATE_HOLE_PROMOTED"),`${raceKey}: promoted decision audit`);assert.ok(selection.candidateDecisions.some(decision=>decision.ticket===replacement.removedTicket&&decision.selected===false&&decision.reasonCode==="PRIORITY_GATE_REPLACED"),`${raceKey}: removed decision audit`);
   rankCounts[replacement.candidateRank]=(rankCounts[replacement.candidateRank]||0)+1;addedPriorityCounts[replacement.addedPriorityScore]=(addedPriorityCounts[replacement.addedPriorityScore]||0)+1;addedTicketCounts[replacement.addedTicket]=(addedTicketCounts[replacement.addedTicket]||0)+1;
  }
  assert.equal(baseTickets.length,nextTickets.length,`${raceKey}: stake remains fixed`);
  const baseHit=baseTickets.includes(actual),nextHit=nextTickets.includes(actual),payout=Number(row?.result?.payoutPer100||row?.result?.review?.payoutPer100||0),sample={baseHit,nextHit,changed:Boolean(replacement),stake:nextTickets.length*100,payout};addRace(periods[periodOf(date)],sample);if(date>="20260812")addRace(holdout,sample);
 }
}
assert.deepEqual(periods,{pre:{races:457,baseHits:132,nextHits:134,gains:2,losses:0,changes:16,stake:379000,baseReturn:221980,nextReturn:223510},mid:{races:313,baseHits:107,nextHits:109,gains:2,losses:0,changes:10,stake:264200,baseReturn:211610,nextReturn:213500},recent:{races:209,baseHits:57,nextHits:58,gains:2,losses:1,changes:17,stake:184400,baseReturn:168520,nextReturn:170930}});
assert.deepEqual(holdout,{races:112,baseHits:33,nextHits:33,gains:1,losses:1,changes:9,stake:98300,baseReturn:117770,nextReturn:118630});
assert.deepEqual(rankCounts,{4:27,5:7,7:1,10:8});assert.deepEqual(addedPriorityCounts,{83:1,92:42});assert.deepEqual(addedTicketCounts,{"1-2-3":42,"1-6-4":1});
const total=Object.values(periods).reduce((sum,value)=>{for(const key of Object.keys(sum))sum[key]+=value[key];return sum;},emptyStats());
assert.deepEqual(total,{races:979,baseHits:296,nextHits:301,gains:6,losses:1,changes:43,stake:827600,baseReturn:602110,nextReturn:607940});
console.log("priority-gate hole replacement regression: OK",JSON.stringify({periods,holdout,total}));
