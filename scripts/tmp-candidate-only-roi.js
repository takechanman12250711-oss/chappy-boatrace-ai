"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;require("../js/boat-identity");require("../js/ai-core");require("../js/prediction");
const selector=require("../js/practical-selection"),dir=path.join(process.cwd(),"data","predictions"),rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function tk(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):"";}
function dataOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function structured3(d){const cov=Array.isArray(d?.physicalCoverage)?d.physicalCoverage:[];const pos=new Set(cov.map(x=>Number(x?.position||0)).filter(x=>x>=1&&x<=3));return pos.size===3;}
const thresholds=[85,90];
const out={assumption:"Each promoted ticket is simulated at JPY100; payout uses stored official trifecta payout per JPY100.",thresholds:{}};
for(const t of thresholds) out.thresholds[t]={all:{races:0,baseHits:0,newHits:0,addedTickets:0,addedStake:0,incrementalReturn:0,gains:0},train:{races:0,baseHits:0,newHits:0,addedTickets:0,addedStake:0,incrementalReturn:0,gains:0},test:{races:0,baseHits:0,newHits:0,addedTickets:0,addedStake:0,incrementalReturn:0,gains:0},gainDetails:[]};
for(const f of fs.readdirSync(dir).filter(x=>/^202608(0[7-9]|10)\.json$/.test(x)).sort()){
  const date=Number(f.slice(0,8)),d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
  for(const r of rows(d)){
    if(r?.result?.settled!==true) continue;
    const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket); if(!data||!actual) continue;
    const payout=Number(r?.result?.payout||r?.result?.officialPayoutPer100||r?.result?.review?.payout||0);
    const p=global.createPrediction(data),sel=selector.select(p),base=(sel?.tickets||[]).map(x=>tk(x?.ticket||x)).filter(Boolean),baseHit=base.includes(actual);
    const raw=[...(sel?.candidateDecisions||[]),...(sel?.excludedCandidates||[])],seen=new Set();
    const cand=raw.filter(x=>String(x?.reasonCode||"")==="CANDIDATE_ONLY_EVALUATION").filter(x=>{const k=tk(x?.ticket||x);if(!k||base.includes(k)||seen.has(k))return false;seen.add(k);return true;});
    for(const t of thresholds){
      const bucket=out.thresholds[t],parts=[bucket.all,date<=20260808?bucket.train:bucket.test];
      for(const x of parts){x.races++;if(baseHit)x.baseHits++;}
      const capacity=Math.max(0,10-base.length);
      const eligible=cand.filter(c=>structured3(c)&&Number(c?.priorityScore||0)>=t).sort((a,b)=>Number(b?.priorityScore||0)-Number(a?.priorityScore||0)||tk(a?.ticket||a).localeCompare(tk(b?.ticket||b))).slice(0,capacity);
      const promoted=eligible.map(c=>tk(c?.ticket||c)),newHit=baseHit||promoted.includes(actual),gain=!baseHit&&promoted.includes(actual);
      for(const x of parts){x.addedTickets+=eligible.length;x.addedStake+=eligible.length*100;if(newHit)x.newHits++;if(gain){x.gains++;x.incrementalReturn+=payout;}}
      if(gain) bucket.gainDetails.push({date,raceKey:r?.raceKey||`${date}-${r.jcd}-${r.raceNo}`,actual,payout,addedTickets:eligible.length,priority:Number(eligible.find(c=>tk(c?.ticket||c)===actual)?.priorityScore||0)});
    }
  }
}
for(const t of thresholds){for(const k of["all","train","test"]){const x=out.thresholds[t][k];x.baseHitRate=x.races?Number((x.baseHits/x.races*100).toFixed(2)):0;x.newHitRate=x.races?Number((x.newHits/x.races*100).toFixed(2)):0;x.incrementalRecoveryRate=x.addedStake?Number((x.incrementalReturn/x.addedStake*100).toFixed(2)):0;x.incrementalProfit=x.incrementalReturn-x.addedStake;x.returnPerGain=x.gains?Number((x.incrementalReturn/x.gains).toFixed(2)):0;}}
fs.mkdirSync("tmp-analysis-output",{recursive:true});fs.writeFileSync("tmp-analysis-output/candidate-only-roi.json",JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
