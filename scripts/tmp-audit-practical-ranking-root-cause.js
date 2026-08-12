"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;require("../js/boat-identity");require("../js/ai-core");require("../js/prediction");const ps=require("../js/practical-selection");
const dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
const ticket=v=>{const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):""};
const dataOf=r=>{const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<6)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}}};
const selectedOf=p=>{const x=p?.practicalSelection||p?.aiCore?.practicalSelection||p?.selection||{};const a=x?.selectedTickets||x?.tickets||p?.practicalTickets||[];return a.map(ticket).filter(Boolean)};
const allCandidatesOf=p=>{const x=p?.practicalSelection||p?.aiCore?.practicalSelection||{};const buckets=[x.selectedCandidates,x.excludedCandidates,x.candidates,x.candidatePool,p?.aiCore?.ticketCandidates,p?.ticketCandidates];const map=new Map();for(const arr of buckets)for(const c of Array.isArray(arr)?arr:[]){const t=ticket(c);if(t&&!map.has(t))map.set(t,c)}return map};
const period=n=>n<20260807?"pre":n<=20260810?"mid":"recent";
const seen=new Set(),misses=[];let settled=0,hits=0,candidateMissing=0;
for(const f of fs.readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x)).sort()){
 const date=f.slice(0,8),n=+date,d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
 for(const r of rows(d)){
  if(r?.result?.settled!==true)continue;const key=r.raceKey||`${date}-${r.jcd}-${r.raceNo}`;if(seen.has(key))continue;seen.add(key);const actual=ticket(r?.result?.resultTicket||r?.result?.review?.resultTicket);const data=dataOf(r);if(!actual||!data)continue;settled++;
  let p;try{p=global.createPrediction(data)}catch(e){continue}
  let selection=p?.practicalSelection||p?.aiCore?.practicalSelection||null;if(!selection&&ps?.buildPracticalSelection){try{selection=ps.buildPracticalSelection(p)}catch(e){}}
  if(selection&&!p.practicalSelection)p.practicalSelection=selection;
  const selected=selectedOf(p);if(selected.includes(actual)){hits++;continue}
  const cand=allCandidatesOf(p);const win=cand.get(actual);if(!win){candidateMissing++;continue}
  const selectedRows=selected.map(t=>cand.get(t)||{ticket:t});const winScore=Number(win?.priorityScore??win?.score??0);const ranked=[...cand.values()].sort((a,b)=>Number(b?.priorityScore??b?.score??0)-Number(a?.priorityScore??a?.score??0));const rank=ranked.findIndex(x=>ticket(x)===actual)+1;
  const boundary=selectedRows.length?Math.min(...selectedRows.map(x=>Number(x?.priorityScore??x?.score??0)).filter(Number.isFinite)):null;
  misses.push({key,date,period:period(n),actual,rank,winScore,boundary,scoreGap:boundary===null?null:winScore-boundary,selectionTier:String(win?.selectionTier||win?.tier||""),reasonCode:String(win?.reasonCode||win?.excludeReasonCode||""),branchIds:win?.branchIds||[],requirementIds:win?.requirementIds||[],scenarioType:String(win?.scenarioType||win?.type||""),head:Number(actual[0]),selectedCount:selected.length,selected:selectedRows.map(x=>({ticket:ticket(x),score:Number(x?.priorityScore??x?.score??0),tier:String(x?.selectionTier||x?.tier||""),scenarioType:String(x?.scenarioType||x?.type||"")}))});
 }
}
const group=(arr,key)=>Object.entries(arr.reduce((m,x)=>{const k=String(x[key]??"");m[k]=(m[k]||0)+1;return m},{})).sort((a,b)=>b[1]-a[1]).slice(0,30);
const buckets={rank:group(misses.map(x=>({...x,rankBucket:x.rank?x.rank<=10?"1-10":x.rank<=15?"11-15":x.rank<=20?"16-20":"21+":"unknown"})),"rankBucket"),tier:group(misses,"selectionTier"),reason:group(misses,"reasonCode"),scenario:group(misses,"scenarioType"),head:group(misses,"head")};
const near=misses.filter(x=>x.rank>0&&x.rank<=15).sort((a,b)=>(b.winScore-(b.boundary??-999))-(a.winScore-(a.boundary??-999)));
const report={settled,hits,misses:settled-hits,candidateMissing,rankingMisses:misses.length,buckets,nearBoundaryCount:near.length,nearBoundary:near.slice(0,200),rows:misses};
fs.mkdirSync("tmp-analysis-output",{recursive:true});fs.writeFileSync("tmp-analysis-output/practical-ranking-root-cause.json",JSON.stringify(report,null,2));console.log(JSON.stringify({settled,hits,misses:report.misses,candidateMissing,rankingMisses:misses.length,buckets,nearBoundaryCount:near.length},null,2));