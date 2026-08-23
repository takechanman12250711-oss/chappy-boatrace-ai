"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const dir=path.join(root,"data","predictions");
function docs(){return fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort().map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));}
function comp(r={}){return (r?.shadowV2?.evaluation?.components||[]).find(x=>x?.key==="stSlit")||null;}
function inc(o,k){k=String(k??"(null)");o[k]=(o[k]||0)+1;}
let races=0,withShadow=0,withComponent=0,formal=0,score=0,settled=0,formalSettled=0;const byDate={},sources={},status={},scoreBand={};
for(const d of docs())for(const r of(d.verificationPredictions||[])){races++;if(r.shadowV2)withShadow++;const c=comp(r);if(!c)continue;withComponent++;if(c.formal===true)formal++;if(Number.isFinite(Number(c.score)))score++;if(r?.result?.settled===true||r?.result?.resultTicket)settled++;if(c.formal===true&&(r?.result?.settled===true||r?.result?.resultTicket))formalSettled++;const date=String(r.date||d.date||"unknown");byDate[date]??={withComponent:0,formal:0};byDate[date].withComponent++;if(c.formal===true)byDate[date].formal++;inc(sources,c.source);inc(status,c?.detail?.status);const s=Number(c.score);if(Number.isFinite(s))inc(scoreBand,s>=80?"80+":s>=70?"70-79":s>=60?"60-69":s>=50?"50-59":"<50");}
console.log(JSON.stringify({races,withShadow,withComponent,formal,score,settled,formalSettled,formalRate:withComponent?Math.round(formal/withComponent*1000)/10:0,byDate,sources,status,scoreBand},null,2));
if(withComponent===0)process.exitCode=2;
