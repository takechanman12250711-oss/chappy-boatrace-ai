"use strict";
const fs=require("node:fs"),path=require("node:path");
const dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function parts(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).map(Number):null;}
function practical(r){const a=Array.isArray(r?.prediction?.practicalTickets)?r.prediction.practicalTickets:[];return a.map(parts).filter(Boolean);}
function actual(r){for(const v of [r?.result?.resultTicket,r?.result?.review?.resultTicket]){const p=parts(v);if(p)return p;}return null;}
function sameSet(a,b){return [...a].sort().join("") === [...b].sort().join("");}
function pattern(ticket,a){if(!sameSet(ticket,a))return"";return ticket.map(n=>a.indexOf(n)+1).join("");}
function summary(r){return String(r?.prediction?.raceFlow?.summary||"");}
function scenario(r){const s=summary(r);if(/最有力展開は1号艇逃げ/.test(s))return"escape";if(/最有力展開は2コース差し/.test(s))return"sashi";if(/最有力展開は3コース攻め/.test(s))return"threeAttack";if(/最有力展開は4カド|最有力展開は4コース攻め/.test(s))return"fourAttack";return"unknown";}
const c={settled:0,orderMiss:0,withSameSetTicket:0,patterns:{},primaryPattern:{},scenarioPatterns:{},sameHeadReverse:0,wrongHeadSameSet:0,multiplePermutationTypes:0,examples:{}};
for(const f of fs.readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x))){const d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;c.settled++;if(String(r?.result?.review?.missType||"")!=="着順違い")continue;c.orderMiss++;const a=actual(r),ts=practical(r);if(!a||!ts.length)continue;const ps=[...new Set(ts.map(t=>pattern(t,a)).filter(Boolean))];if(!ps.length)continue;c.withSameSetTicket++;if(ps.length>1)c.multiplePermutationTypes++;const sc=scenario(r);if(!c.scenarioPatterns[sc])c.scenarioPatterns[sc]={};ps.forEach(p=>{c.patterns[p]=(c.patterns[p]||0)+1;c.scenarioPatterns[sc][p]=(c.scenarioPatterns[sc][p]||0)+1;});const priority=["132","213","231","312","321"].find(p=>ps.includes(p))||ps[0];c.primaryPattern[priority]=(c.primaryPattern[priority]||0)+1;if(ps.includes("132"))c.sameHeadReverse++;if(ps.some(p=>p!=="132"))c.wrongHeadSameSet++;for(const p of ps){if(!c.examples[p])c.examples[p]=[];if(c.examples[p].length<5)c.examples[p].push({raceKey:r?.raceKey||"",actual:a,scenario:sc,tickets:ts.filter(t=>pattern(t,a)===p)});}}}
console.log(JSON.stringify(c,null,2));