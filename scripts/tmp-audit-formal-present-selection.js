"use strict";

const fs = require("node:fs");
const path = require("node:path");
global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");

const selector = require("../js/practical-selection");
const core = global.ChappyAICore;
const dir = path.join(process.cwd(), "data", "predictions");
const rows = (d) => [...(d.predictions || []), ...(d.verificationPredictions || [])];

function tk(v) {
  const m = String(v?.ticket || v || "").match(/[1-6]/g) || [];
  return m.length >= 3 ? m.slice(0, 3).join("-") : "";
}
function list(v) { return (Array.isArray(v) ? v : []).map((x) => tk(x?.ticket || x)).filter(Boolean); }
function dataOf(r) {
  const s = r?.prediction?.preRaceConditions || r?.preRaceConditions;
  if (!s || !Array.isArray(s.boats) || s.boats.length < 5) return null;
  return {...s, entries:s.boats, boats:s.boats, jcd:r.jcd, stadiumCode:r.jcd, venueCode:r.jcd, placeName:r.place, venueName:r.place, raceNo:r.raceNo, rno:r.raceNo, weather:s.weather || {}};
}
function bump(o,k){o[k]=(o[k]||0)+1;}
function bucket(v){const n=Number(v);if(!Number.isFinite(n))return "none";if(n>=95)return "95+";if(n>=90)return "90-94.99";if(n>=85)return "85-89.99";if(n>=80)return "80-84.99";if(n>=75)return "75-79.99";if(n>=70)return "70-74.99";if(n>=65)return "65-69.99";return "<65";}
function rankOf(arr,ticket){const i=list(arr).indexOf(ticket);return i>=0?i+1:null;}
function findCandidate(selection,ticket){
  const hits=[];
  for(const d of Array.isArray(selection?.targetDecisions)?selection.targetDecisions:[]){
    for(const c of Array.isArray(d?.candidateDecisions)?d.candidateDecisions:[]){
      if(tk(c?.ticket)===ticket) hits.push({evaluationId:String(d?.evaluationId||""),symbol:String(d?.symbol||""),selected:d?.selected===true,ticketSelected:c?.ticketSelected===true,relation:String(c?.relation||""),reasonCode:String(c?.reasonCode||""),reason:String(c?.reason||""),priorityScore:Number(c?.priorityScore||0),selectionBoundary:d?.selectionBoundary??null,comparisonTicket:String(d?.comparisonTicket||""),comparisonScore:d?.comparisonScore??null,scoreGap:d?.scoreGap??null});
    }
  }
  return hits;
}
function findExcluded(selection,ticket){
  return (Array.isArray(selection?.excludedCandidates)?selection.excludedCandidates:[])
    .filter((x)=>tk(x?.ticket)===ticket)
    .map((x)=>({priorityScore:Number(x?.priorityScore||0),reasonCode:String(x?.reasonCode||""),reason:String(x?.reason||""),requirementIds:Array.isArray(x?.requirementIds)?x.requirementIds.map(String):[],branchIds:Array.isArray(x?.branchIds)?x.branchIds.map(String):[],coveredEvaluationIds:Array.isArray(x?.coveredEvaluationIds)?x.coveredEvaluationIds.map(String):[]}));
}

const out={count:0,categoryPresence:{main:0,safety:0,flow:0,longshot:0},categoryCombos:{},bestRanks:{main:{},safety:{},flow:{},longshot:{}},selectedCount:{},capacity:{},candidateDecisionFound:0,excludedFound:0,candidateReasonCodes:{},excludedReasonCodes:{},priorityBuckets:{},samples:[]};

for(const f of fs.readdirSync(dir).filter((x)=>/^202608(0[7-9]|10)\.json$/.test(x)).sort()){
  const date=f.slice(0,8),d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
  for(const r of rows(d)){
    if(r?.result?.settled!==true)continue;
    const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)continue;
    const prediction=global.createPrediction(data),selection=selector.select(prediction),selected=list(selection?.tickets);if(selected.includes(actual))continue;
    const ai=core.buildPredictionData(data),fm=ai?.formations||{};
    const cats={main:list(fm.main).includes(actual),safety:list(fm.safety).includes(actual),flow:list(fm.flow).includes(actual),longshot:list(fm.longshot).includes(actual)};
    if(!Object.values(cats).some(Boolean))continue;
    out.count++;
    const present=Object.keys(cats).filter((k)=>cats[k]);for(const k of present)out.categoryPresence[k]++;
    bump(out.categoryCombos,present.join("+")||"none");
    const ranks={main:rankOf(fm.main,actual),safety:rankOf(fm.safety,actual),flow:rankOf(fm.flow,actual),longshot:rankOf(fm.longshot,actual)};
    for(const [k,v] of Object.entries(ranks))if(v!=null)bump(out.bestRanks[k],String(v));
    bump(out.selectedCount,String(selected.length));bump(out.capacity,String(Math.max(0,10-selected.length)));
    const candidateHits=findCandidate(selection,actual),excluded=findExcluded(selection,actual);
    if(candidateHits.length)out.candidateDecisionFound++;if(excluded.length)out.excludedFound++;
    for(const x of candidateHits){bump(out.candidateReasonCodes,x.reasonCode||"NONE");bump(out.priorityBuckets,bucket(x.priorityScore));}
    for(const x of excluded){bump(out.excludedReasonCodes,x.reasonCode||"NONE");bump(out.priorityBuckets,bucket(x.priorityScore));}
    out.samples.push({raceKey:r?.raceKey||`${date}-${r.jcd}-${r.raceNo}`,actual,selectedCount:selected.length,capacity:Math.max(0,10-selected.length),categories:present,ranks,candidateHits,excluded});
  }
}

fs.mkdirSync("tmp-analysis-output",{recursive:true});
fs.writeFileSync("tmp-analysis-output/formal-present-selection.json",JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
