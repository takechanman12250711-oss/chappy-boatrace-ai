"use strict";
const fs=require("node:fs"),path=require("node:path");
global.window=global;require("../js/boat-identity");require("../js/ai-core");require("../js/prediction");
const selector=require("../js/practical-selection"),core=global.ChappyAICore,dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
function tk(v){const m=String(v?.ticket||v||"").match(/[1-6]/g)||[];return m.length>=3?m.slice(0,3).join("-"):"";}
function list(v){return(Array.isArray(v)?v:[]).map(x=>tk(x?.ticket||x)).filter(Boolean);}
function dataOf(r){const s=r?.prediction?.preRaceConditions||r?.preRaceConditions;if(!s||!Array.isArray(s.boats)||s.boats.length<5)return null;return{...s,entries:s.boats,boats:s.boats,jcd:r.jcd,stadiumCode:r.jcd,venueCode:r.jcd,placeName:r.place,venueName:r.place,raceNo:r.raceNo,rno:r.raceNo,weather:s.weather||{}};}
function pay(r){return Number(r?.result?.payout||r?.result?.officialPayoutPer100||r?.result?.review?.payout||0);}
function ranks(fm,t){const o={};for(const k of ["main","safety","flow","longshot"]){const i=list(fm?.[k]).indexOf(t);if(i>=0)o[k]=i+1;}return o;}
function make(){return{n:0,baseHits:0,newHits:0,gains:0,added:0,ret:0};}function finish(x){return{...x,baseHitRate:x.n?+(x.baseHits/x.n*100).toFixed(2):0,hitRate:x.n?+(x.newHits/x.n*100).toFixed(2):0,roi:x.added?+(x.ret/(x.added*100)*100).toFixed(2):0};}
const rules={
 head1MainFlow80_84:x=>x.head===1&&x.hasMain&&x.hasFlow&&x.priority>=80&&x.priority<85,
 head1MainFlow80_89:x=>x.head===1&&x.hasMain&&x.hasFlow&&x.priority>=80&&x.priority<90,
 head1Flow70_84:x=>x.head===1&&x.hasFlow&&!x.hasMain&&x.priority>=70&&x.priority<85,
 head1Flow70_84Cov3:x=>x.head===1&&x.hasFlow&&!x.hasMain&&x.priority>=70&&x.priority<85&&x.covered>=3,
 head1Formal70_89Cov3:x=>x.head===1&&(x.hasFlow||x.hasMain)&&x.priority>=70&&x.priority<90&&x.covered>=3,
 head1FlowRank8_12P70_84:x=>x.head===1&&x.hasFlow&&!x.hasMain&&x.r.flow>=8&&x.r.flow<=12&&x.priority>=70&&x.priority<85,
 head1FlowRank9P70_89:x=>x.head===1&&x.hasFlow&&!x.hasMain&&x.r.flow===9&&x.priority>=70&&x.priority<90,
 head1MainFlowRank6P80_89:x=>x.head===1&&x.hasMain&&x.hasFlow&&x.r.main<=6&&x.priority>=80&&x.priority<90
};
const stats=Object.fromEntries(Object.keys(rules).map(k=>[k,{all:make(),train:make(),test:make(),pre:make(),targetUnique:make(),days:{}}]));
function evalRace(r,date){const data=dataOf(r),actual=tk(r?.result?.resultTicket||r?.result?.review?.resultTicket);if(!data||!actual)return null;const p=global.createPrediction(data),sel=selector.select(p),base=list(sel?.tickets),ai=core.buildPredictionData(data),fm=ai?.formations||{};const ex=(Array.isArray(sel?.excludedCandidates)?sel.excludedCandidates:[]).filter(x=>String(x?.reasonCode||"")==="CANDIDATE_ONLY_EVALUATION").map(x=>{const ticket=tk(x?.ticket),ranksObj=ranks(fm,ticket),covered=(Array.isArray(x?.coveredEvaluationIds)?x.coveredEvaluationIds:[]).length;return{ticket,priority:Number(x?.priorityScore||0),head:Number(ticket.split("-")[0]),covered,r:ranksObj,hasMain:!!ranksObj.main,hasFlow:!!ranksObj.flow,hasSafety:!!ranksObj.safety,hasLongshot:!!ranksObj.longshot};}).filter(x=>x.ticket&&Object.keys(x.r).length);return{actual,base,baseHit:base.includes(actual),payout:pay(r),raceKey:r?.raceKey||`${date}-${r.jcd}-${r.raceNo}`,ex};}
function add(s,e,pred){s.n++;if(e.baseHit)s.baseHits++;const cap=Math.max(0,10-e.base.length),seen=new Set(),added=e.ex.filter(pred).filter(x=>!e.base.includes(x.ticket)&&!seen.has(x.ticket)&&(seen.add(x.ticket),true)).sort((a,b)=>b.priority-a.priority||a.ticket.localeCompare(b.ticket)).slice(0,cap);const hit=e.baseHit||added.some(x=>x.ticket===e.actual);if(hit)s.newHits++;s.added+=added.length;if(!e.baseHit&&hit){s.gains++;s.ret+=e.payout;}}
const uniq=new Set();
for(const f of fs.readdirSync(dir).filter(x=>/^\d{8}\.json$/.test(x)).sort()){const date=f.slice(0,8),n=Number(date),d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;const e=evalRace(r,date);if(!e)continue;if(n>=20260807&&n<=20260810){for(const [k,pred] of Object.entries(rules)){const s=stats[k];add(s.all,e,pred);add(n<=20260808?s.train:s.test,e,pred);s.days[date]??=make();add(s.days[date],e,pred);}}if(uniq.has(e.raceKey))continue;uniq.add(e.raceKey);for(const [k,pred] of Object.entries(rules)){const s=stats[k];if(n<20260807)add(s.pre,e,pred);else if(n<=20260810)add(s.targetUnique,e,pred);}}}
const ranking=[];for(const [k,s] of Object.entries(stats)){for(const x of ["all","train","test","pre","targetUnique"])s[x]=finish(s[x]);for(const d of Object.keys(s.days))s.days[d]=finish(s.days[d]);ranking.push({key:k,robust:Math.min(s.train.roi,s.test.roi),...s});}ranking.sort((a,b)=>b.robust-a.robust||b.all.roi-a.all.roi||a.all.added-b.all.added);const out={ranking};fs.mkdirSync("tmp-analysis-output",{recursive:true});fs.writeFileSync("tmp-analysis-output/formal-structured-rules.json",JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));