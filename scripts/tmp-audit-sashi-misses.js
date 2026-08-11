"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;require("../js/ai-core");const core=global.ChappyAICore;
const dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function replayData(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return {...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function ticket(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):"";}
function stats(a){const x=[...a].sort((a,b)=>a-b);if(!x.length)return null;const avg=x.reduce((s,v)=>s+v,0)/x.length;const q=p=>x[Math.floor((x.length-1)*p)];return{n:x.length,min:x[0],p25:q(.25),median:q(.5),p75:q(.75),max:x[x.length-1],avg:+avg.toFixed(2)};}
const out={races:0,twoWins:0,twoPredictedHead:0,twoWinMainSashi:0,twoWinPredEscape:0,twoWinPredOther:0,sashiRankOnTwoWins:{first:0,second:0,third:0,fourth:0},margins:{escapeMinusSashiTwoWins:[],sashiMinusThirdTwoWins:[],sashiMinusFourthTwoWins:[]},components:{sashiScore:[],escapeScore:[],sashiSlit:[],sashiNewSam:[],sashiFrame:[],sashiDouble:[]},examples:[]};
for(const f of fs.readdirSync(dir).filter(x=>/^202608(0[7-9]|10)\.json$/.test(x)).sort()){
  const d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
  for(const r of rows(d)){
    if(r?.result?.settled!==true)continue;
    const data=replayData(r);const actual=ticket(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)continue;
    const ai=core.buildPredictionData(data),sc=ai?.raceScenarios?.scenarios||[];if(!sc.length)continue;
    out.races++;
    const actualHead=Number(actual[0]),main=ai?.raceScenarios?.mainScenario?.type||"";
    const by=Object.fromEntries(sc.map(s=>[s.type,s]));
    const sashi=by.sashi,escape=by.escape,three=by.threeAttack,four=by.fourAttack;
    if(main==="sashi")out.twoPredictedHead++;
    if(actualHead!==2)continue;
    out.twoWins++;
    if(main==="sashi")out.twoWinMainSashi++;else if(main==="escape")out.twoWinPredEscape++;else out.twoWinPredOther++;
    const ranked=sc.slice().sort((a,b)=>Number(b.score)-Number(a.score));const rank=ranked.findIndex(s=>s.type==="sashi")+1;if(rank===1)out.sashiRankOnTwoWins.first++;else if(rank===2)out.sashiRankOnTwoWins.second++;else if(rank===3)out.sashiRankOnTwoWins.third++;else if(rank===4)out.sashiRankOnTwoWins.fourth++;
    const ss=Number(sashi?.score),es=Number(escape?.score),ts=Number(three?.score),fs4=Number(four?.score);
    if(Number.isFinite(es)&&Number.isFinite(ss))out.margins.escapeMinusSashiTwoWins.push(es-ss);
    if(Number.isFinite(ss)&&Number.isFinite(ts))out.margins.sashiMinusThirdTwoWins.push(ss-ts);
    if(Number.isFinite(ss)&&Number.isFinite(fs4))out.margins.sashiMinusFourthTwoWins.push(ss-fs4);
    if(Number.isFinite(ss))out.components.sashiScore.push(ss);if(Number.isFinite(es))out.components.escapeScore.push(es);
    out.components.sashiSlit.push(Number(sashi?.slitAdjustment||0));out.components.sashiNewSam.push(Number(sashi?.newSamAdjustment||0));out.components.sashiFrame.push(Number(sashi?.frameMovementAdjustment||0));out.components.sashiDouble.push(Number(sashi?.doubleTimeAdjustment||0));
    if(out.examples.length<12)out.examples.push({date:f.slice(0,8),jcd:r.jcd,raceNo:r.raceNo,actual,main,sashiScore:ss,escapeScore:es,margin:+(es-ss).toFixed(1),sashiReason:sashi?.reason||sashi?.evidence||null});
  }
}
out.margins.escapeMinusSashiTwoWins=stats(out.margins.escapeMinusSashiTwoWins);out.margins.sashiMinusThirdTwoWins=stats(out.margins.sashiMinusThirdTwoWins);out.margins.sashiMinusFourthTwoWins=stats(out.margins.sashiMinusFourthTwoWins);
for(const k of Object.keys(out.components))out.components[k]=stats(out.components[k]);
console.log(JSON.stringify(out,null,2));