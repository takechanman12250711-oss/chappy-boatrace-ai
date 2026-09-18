'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const phase8=require('./theory-validation-phase8-cycle.cjs');
const ROOT=path.resolve(__dirname,'..');
const TAXONOMY=new Set(['HIT','SCENARIO_MISS','ATTACKER_MISS','HEAD_MISS','PARTNER_MISS','HOLD_PICKUP_MISS','RATED_BOAT_NOT_PROPAGATED','THEORY_TRIGGERED_TICKETS_UNCHANGED','TICKET_CAP_DROP','MISSING_REQUIRED_DATA','OTHER_WITH_REASON']);
const stable=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const arr=v=>Array.isArray(v)?v:[];
function tickets(r){return arr(r?.finalTickets||r?.tickets||r?.prediction?.tickets||r?.prediction?.finalTickets).map(x=>typeof x==='string'?x:(x?.combination||x?.ticket||'')).filter(Boolean);}
function resultCombo(r){return String(r?.result?.trifecta||r?.result?.combination||r?.officialResult?.trifecta||r?.officialResult?.combination||'').replace(/[^1-6]/g,'');}
function matched(r){return Boolean(r?.resultMatched===true||r?.officialResultMatched===true||r?.result?.confirmed===true||r?.officialResult?.confirmed===true||resultCombo(r).length===3);}
function classify(r){
 const combo=resultCombo(r), ts=tickets(r), hit=combo&&ts.some(t=>String(t).replace(/[^1-6]/g,'')===combo);
 if(hit)return{code:'HIT',reason:'official trifecta is present in final tickets'};
 if(!matched(r))return null;
 if(r?.missingRequiredData===true)return{code:'MISSING_REQUIRED_DATA',reason:'required prediction evidence missing'};
 if(r?.ticketCapDropped===true||r?.propagation?.ticketCapDropped===true)return{code:'TICKET_CAP_DROP',reason:'candidate was removed by existing ticket cap'};
 if(r?.ratedBoatNotPropagated===true||r?.propagation?.ratedBoatNotPropagated===true)return{code:'RATED_BOAT_NOT_PROPAGATED',reason:'rated boat did not reach final tickets'};
 if(r?.theoryTriggered===true&&(r?.ticketsChanged===0||r?.propagation?.ticketsChanged===0))return{code:'THEORY_TRIGGERED_TICKETS_UNCHANGED',reason:'theory triggered but final tickets did not change'};
 if(r?.missCause?.code&&TAXONOMY.has(r.missCause.code))return{code:r.missCause.code,reason:String(r.missCause.reason||'existing miss cause')};
 const actualHead=combo[0], predictedHead=String(r?.predictedHead||r?.prediction?.head||r?.marks?.head||'');
 if(actualHead&&predictedHead&&actualHead!==predictedHead)return{code:'HEAD_MISS',reason:'predicted first-place axis differs from official result'};
 return{code:'OTHER_WITH_REASON',reason:'result matched but existing saved evidence cannot safely attribute a narrower cause'};
}
function build(records=[]){
 const seen=new Set(), rows=[], duplicates=[];
 for(const r of records){
  if(!matched(r))continue;
  const raceKey=String(r?.recordKey||r?.raceKey||r?.id||'');
  if(!raceKey)continue;
  if(seen.has(raceKey)){duplicates.push(raceKey);continue;} seen.add(raceKey);
  const c=classify(r); if(!c)continue;
  rows.push({raceKey,hit:c.code==='HIT',missReason:c.code,reason:c.reason,logicFingerprint:r?.logicFingerprint||r?.cohortFingerprint||null,theoryIds:arr(r?.theoryIds||r?.theories).map(String),finalTickets:tickets(r),result:resultCombo(r)});
 }
 const groups={}; for(const r of rows){const k=[r.logicFingerprint||'UNKNOWN',r.missReason].join('::');(groups[k]??=[]).push(r.raceKey);}
 const patterns=Object.entries(groups).map(([key,races])=>({patternId:stable({key,races}),key,count:races.length,races,status:'INSUFFICIENT_EVIDENCE',candidate:null,reason:'No pre-existing formal minimum-count gate is attached to this observed pattern; phase9 must not invent one.'}));
 const p8=phase8.build();
 return{schemaVersion:1,analysisId:'phase9-live-improvement-cycle-v1',generatedAt:new Date().toISOString(),productionChanged:false,summary:{matchedRows:rows.length,hits:rows.filter(x=>x.hit).length,misses:rows.filter(x=>!x.hit).length,duplicates:duplicates.length,patterns:patterns.length,eligibleCandidates:0},taxonomy:[...TAXONOMY],rows,patterns,handoff:{target:'scripts/theory-validation-phase8-cycle.cjs',eligibleCandidates:[],automaticProductionChange:false,approvalStop:'CANDIDATE_FOR_USER_APPROVAL'},audit:{phase8Complete:p8.phaseComplete===true,matchedOnly:true,duplicateRaceRecords:duplicates.length,ambiguousMissReasons:rows.filter(x=>!x.hit&&(!TAXONOMY.has(x.missReason)||!x.reason)).length,rejectedCandidateRetest:0,candidateFingerprintUnique:true,brokenHandoff:0,productionPredictionChanged:false},phaseComplete:p8.phaseComplete===true&&duplicates.length===0&&rows.every(x=>x.hit||TAXONOMY.has(x.missReason))};
}
function load(){const p=path.join(ROOT,'data/predictions/index.json');if(!fs.existsSync(p))return[];const x=JSON.parse(fs.readFileSync(p,'utf8'));return Array.isArray(x)?x:(x.records||x.predictions||[]);}
if(require.main===module){const out=build(load());const a=process.argv.find(x=>x.startsWith('--output='));if(a){const d=path.resolve(ROOT,a.slice(9));fs.mkdirSync(path.dirname(d),{recursive:true});fs.writeFileSync(d,JSON.stringify(out,null,2)+'\n');}process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.phaseComplete)process.exitCode=1;}
module.exports={TAXONOMY,classify,build};
