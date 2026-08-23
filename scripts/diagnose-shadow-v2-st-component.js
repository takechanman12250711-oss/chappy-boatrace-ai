"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const dir=path.join(root,"data","predictions");
function docs(){return fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort().map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));}
function comp(r={}){return (r?.evaluation?.components||[]).find(x=>x?.key==="stSlit")||null;}
function inc(o,k){k=String(k??"(null)");o[k]=(o[k]||0)+1;}
let verificationRaces=0,shadowRecords=0,matched=0,withComponent=0,formal=0,score=0,settled=0,formalSettled=0;const byDate={},sources={},status={},scoreBand={};
for(const d of docs()){
  const verification=new Map((d.verificationPredictions||[]).map(r=>[String(r.raceKey||""),r]));
  verificationRaces+=verification.size;
  for(const s of(d.shadowV2Predictions||[])){
    shadowRecords++;
    const key=String(s.raceKey||"");const r=verification.get(key);if(r)matched++;
    const c=comp(s);if(!c)continue;withComponent++;
    if(c.formal===true)formal++;if(Number.isFinite(Number(c.score)))score++;
    const isSettled=Boolean(r?.result?.settled===true||r?.result?.resultTicket);if(isSettled)settled++;if(c.formal===true&&isSettled)formalSettled++;
    const date=String(s.date||r?.date||d.date||"unknown");byDate[date]??={withComponent:0,formal:0};byDate[date].withComponent++;if(c.formal===true)byDate[date].formal++;
    inc(sources,c.source);inc(status,c?.detail?.status);const n=Number(c.score);if(Number.isFinite(n))inc(scoreBand,n>=80?"80+":n>=70?"70-79":n>=60?"60-69":n>=50?"50-59":"<50");
  }
}
console.log(JSON.stringify({verificationRaces,shadowRecords,matched,withComponent,formal,score,settled,formalSettled,formalRate:withComponent?Math.round(formal/withComponent*1000)/10:0,byDate,sources,status,scoreBand},null,2));
if(withComponent===0)process.exitCode=2;
