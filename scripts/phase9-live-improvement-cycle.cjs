'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const phase8=require('./theory-validation-phase8-cycle.cjs');
const ROOT=path.resolve(__dirname,'..');
const PREDICTION_DIR=path.join(ROOT,'data','predictions');
const RESULT_DIR=path.join(ROOT,'data','results');
const TAXONOMY=new Set(['HIT','SCENARIO_MISS','ATTACKER_MISS','HEAD_MISS','PARTNER_MISS','HOLD_PICKUP_MISS','RATED_BOAT_NOT_PROPAGATED','THEORY_TRIGGERED_TICKETS_UNCHANGED','TICKET_CAP_DROP','MISSING_REQUIRED_DATA','OTHER_WITH_REASON']);
const stable=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const arr=v=>Array.isArray(v)?v:[];
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function ticketValues(r){return r?.finalTickets||r?.tickets||r?.prediction?.tickets||r?.prediction?.finalTickets||r?.prediction?.practicalTickets||r?.prediction?.practicalSelection?.tickets||[];}
function tickets(r){return arr(ticketValues(r)).map(x=>typeof x==='string'?x:(x?.combination||x?.ticket||'')).filter(Boolean);}
function resultCombo(r){return String(r?.result?.trifecta?.combination||r?.result?.trifecta||r?.result?.combination||r?.officialResult?.trifecta?.combination||r?.officialResult?.trifecta||r?.officialResult?.combination||'').replace(/[^1-6]/g,'');}
function matched(r){return Boolean(r?.resultMatched===true||r?.officialResultMatched===true||r?.result?.confirmed===true||r?.officialResult?.confirmed===true||resultCombo(r).length===3);}
function predictedHead(r){return String(r?.predictedHead||r?.prediction?.head||r?.marks?.head||r?.prediction?.verificationEvidence?.mainScenario?.headBoatNo||'');}
function logicFingerprint(r){return r?.logicFingerprint||r?.cohortFingerprint||r?.shadowV2Reference?.logicFingerprint||r?.prediction?.verificationEvidence?.generation?.logicFingerprint||null;}
function theoryIds(r){const direct=arr(r?.theoryIds||r?.theories).map(String);if(direct.length)return direct;return arr(r?.prediction?.verificationEvidence?.theoryClaims).map(x=>String(x?.theoryKey||'')).filter(Boolean);}
function classify(r){
 const combo=resultCombo(r), ts=tickets(r), hit=combo&&ts.some(t=>String(t).replace(/[^1-6]/g,'')===combo);
 if(hit)return{code:'HIT',reason:'official trifecta is present in final tickets'};
 if(!matched(r))return null;
 if(r?.missingRequiredData===true)return{code:'MISSING_REQUIRED_DATA',reason:'required prediction evidence missing'};
 if(r?.ticketCapDropped===true||r?.propagation?.ticketCapDropped===true)return{code:'TICKET_CAP_DROP',reason:'candidate was removed by existing ticket cap'};
 if(r?.ratedBoatNotPropagated===true||r?.propagation?.ratedBoatNotPropagated===true)return{code:'RATED_BOAT_NOT_PROPAGATED',reason:'rated boat did not reach final tickets'};
 if(r?.theoryTriggered===true&&(r?.ticketsChanged===0||r?.propagation?.ticketsChanged===0))return{code:'THEORY_TRIGGERED_TICKETS_UNCHANGED',reason:'theory triggered but final tickets did not change'};
 if(r?.missCause?.code&&TAXONOMY.has(r.missCause.code))return{code:r.missCause.code,reason:String(r.missCause.reason||'existing miss cause')};
 const actualHead=combo[0], head=predictedHead(r);
 if(actualHead&&head&&actualHead!==head)return{code:'HEAD_MISS',reason:'predicted first-place axis differs from official result'};
 return{code:'OTHER_WITH_REASON',reason:'result matched but existing saved evidence cannot safely attribute a narrower cause'};
}
function recordsFromIndex(indexDoc,readShard){
 if(Array.isArray(indexDoc))return indexDoc;
 if(Array.isArray(indexDoc?.records))return indexDoc.records;
 if(Array.isArray(indexDoc?.predictions))return indexDoc.predictions;
 const shards=arr(indexDoc?.collections?.predictions?.shards);
 return shards.flatMap(s=>arr(readShard(String(s?.path||''))?.records));
}
function resultKey(r){return `${String(r?.date||'')}-${String(r?.jcd||'').padStart(2,'0')}-${Number(r?.raceNo||0)}`;}
function attachOfficialResults(records=[]){
 const byDate=new Map();
 for(const r of records){const d=String(r?.date||'');if(!/^\d{8}$/.test(d)||byDate.has(d))continue;const p=path.join(RESULT_DIR,`${d}.json`);byDate.set(d,fs.existsSync(p)?readJson(p):null);}
 const results=new Map();
 for(const doc of byDate.values())for(const race of arr(doc?.races)){if(race?.resultAvailable===true&&race?.status==='finished'&&race?.trifecta?.combination)results.set(resultKey(race),race);}
 return records.map(r=>{if(matched(r))return r;const rr=results.get(String(r?.raceKey||resultKey(r)));return rr?{...r,officialResult:{confirmed:true,combination:rr.trifecta.combination,payout:rr.trifecta.payout}}:r;});
}
function load(){
 const p=path.join(PREDICTION_DIR,'index.json');if(!fs.existsSync(p))return[];
 const index=readJson(p);
 const records=recordsFromIndex(index,rel=>{if(!rel)return null;const sp=path.join(PREDICTION_DIR,rel);return fs.existsSync(sp)?readJson(sp):null;});
 return attachOfficialResults(records);
}
function build(records=[]){
 const seen=new Set(), rows=[], duplicates=[];
 for(const r of records){
  if(!matched(r))continue;
  const raceKey=String(r?.recordKey||r?.raceKey||r?.id||'');
  if(!raceKey)continue;
  if(seen.has(raceKey)){duplicates.push(raceKey);continue;} seen.add(raceKey);
  const c=classify(r); if(!c)continue;
  rows.push({raceKey,hit:c.code==='HIT',missReason:c.code,reason:c.reason,logicFingerprint:logicFingerprint(r),theoryIds:theoryIds(r),finalTickets:tickets(r),result:resultCombo(r)});
 }
 const groups={}; for(const r of rows){const k=[r.logicFingerprint||'UNKNOWN',r.missReason].join('::');(groups[k]??=[]).push(r.raceKey);}
 const patterns=Object.entries(groups).map(([key,races])=>({patternId:stable({key,races}),key,count:races.length,races,status:'INSUFFICIENT_EVIDENCE',candidate:null,reason:'No pre-existing formal minimum-count gate is attached to this observed pattern; phase9 must not invent one.'}));
 const p8=phase8.build();
 return{schemaVersion:1,analysisId:'phase9-live-improvement-cycle-v1',generatedAt:new Date().toISOString(),productionChanged:false,summary:{matchedRows:rows.length,hits:rows.filter(x=>x.hit).length,misses:rows.filter(x=>!x.hit).length,duplicates:duplicates.length,patterns:patterns.length,eligibleCandidates:0},taxonomy:[...TAXONOMY],rows,patterns,handoff:{target:'scripts/theory-validation-phase8-cycle.cjs',eligibleCandidates:[],automaticProductionChange:false,approvalStop:'CANDIDATE_FOR_USER_APPROVAL'},audit:{phase8Complete:p8.phaseComplete===true,matchedOnly:true,duplicateRaceRecords:duplicates.length,ambiguousMissReasons:rows.filter(x=>!x.hit&&(!TAXONOMY.has(x.missReason)||!x.reason)).length,rejectedCandidateRetest:0,candidateFingerprintUnique:true,brokenHandoff:0,productionPredictionChanged:false},phaseComplete:p8.phaseComplete===true&&duplicates.length===0&&rows.every(x=>x.hit||TAXONOMY.has(x.missReason))};
}
if(require.main===module){const out=build(load());const a=process.argv.find(x=>x.startsWith('--output='));if(a){const d=path.resolve(ROOT,a.slice(9));fs.mkdirSync(path.dirname(d),{recursive:true});fs.writeFileSync(d,JSON.stringify(out,null,2)+'\n');}process.stdout.write(JSON.stringify(out,null,2)+'\n');if(!out.phaseComplete)process.exitCode=1;}
module.exports={TAXONOMY,attachOfficialResults,build,classify,load,logicFingerprint,predictedHead,recordsFromIndex,theoryIds,tickets};
