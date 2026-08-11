"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;
require("../js/ai-core");
const core=global.ChappyAICore;
const dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function parts(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).map(Number):null;}
function key(v){const p=parts(v);return p?p.join("-"):"";}
function actual(r){return key(r?.result?.resultTicket||r?.result?.review?.resultTicket);}
function oldTickets(r){return (r?.prediction?.practicalTickets||[]).map(key).filter(Boolean);}
function replayData(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return {...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function generatedTickets(ai){const f=ai?.formations||{};return [...(f.main||[]),...(f.safety||[]),...(f.flow||[]),...(f.longshot||[])].map(key).filter(Boolean);}
const out={settled:0,replayed:0,replayErrors:0,oldHits:0,newCoreHits:0,gained:0,lost:0,oldOrderMiss:0,oldOrderMissNowExact:0,mainScenarioSame:0,mainScenarioCompared:0,examplesGained:[],examplesLost:[],errors:[]};
for(const f of fs.readdirSync(dir).filter(x=>/^202608(0[7-9]|10)\.json$/.test(x)).sort()){const d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;out.settled++;const a=actual(r),data=replayData(r);if(!a||!data)continue;try{const ai=core.buildPredictionData(data);out.replayed++;const old=oldTickets(r),now=generatedTickets(ai);const oldHit=old.includes(a),newHit=now.includes(a);if(oldHit)out.oldHits++;if(newHit)out.newCoreHits++;if(!oldHit&&newHit){out.gained++;if(out.examplesGained.length<12)out.examplesGained.push({raceKey:r.raceKey,actual:a,old:old.slice(0,10),now:now.slice(0,16),scenario:ai?.raceScenarios?.mainScenario?.type||""});}if(oldHit&&!newHit){out.lost++;if(out.examplesLost.length<12)out.examplesLost.push({raceKey:r.raceKey,actual:a,old:old.slice(0,10),now:now.slice(0,16),scenario:ai?.raceScenarios?.mainScenario?.type||""});}if(String(r?.result?.review?.missType||"")==="着順違い"){out.oldOrderMiss++;if(newHit)out.oldOrderMissNowExact++;}const oldType=String(r?.prediction?.raceFlow?.mainScenario?.type||r?.prediction?.raceFlow?.scenarioType||"");const newType=String(ai?.raceScenarios?.mainScenario?.type||"");if(oldType&&newType){out.mainScenarioCompared++;if(oldType===newType)out.mainScenarioSame++;}}
catch(e){out.replayErrors++;if(out.errors.length<12)out.errors.push({raceKey:r.raceKey,error:String(e?.message||e)});}}}
console.log(JSON.stringify(out,null,2));