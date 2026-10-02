"use strict";

const fs=require("node:fs");
const path=require("node:path");
const snapshot=require("../js/theory-tag-snapshot");

const root=path.resolve(__dirname,"..");
const predictionDir=path.join(root,"data","predictions");
const resultDir=path.join(root,"data","results");
const output=path.join(root,"data","stats","wall-boat-branch-profit-report.json");
const STAKE_PER_TICKET=100;
const PROSPECTIVE_CUTOFF="2026-08-17T03:57:48Z";
const STORAGE_SOURCE_COMMIT="def6199bbadaf4b006bc0b4409cf49c528ed61f0";

function ticket(v){const s=String(v?.ticket||v||"").trim();return /^[1-6]-[1-6]-[1-6]$/.test(s)&&new Set(s.split("-")).size===3?s:"";}
function tickets(v){return [...new Set((Array.isArray(v)?v:[]).map(ticket).filter(Boolean))];}
function raceKey(r={}){return `${String(r.date||"")}-${String(r.jcd||"").padStart(2,"0")}-${Number(r.raceNo||0)}`;}
function load(dir){if(!fs.existsSync(dir))return[];return fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort().map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));}
function resultMap(docs){const map=new Map();for(const d of docs)for(const r of(Array.isArray(d.races)?d.races:[]))if(r.resultAvailable&&r.status==="finished")map.set(raceKey(r),r);return map;}
function practicalTickets(record={}){return tickets(record?.prediction?.practicalTickets||record?.prediction?.practicalSelection?.tickets);}
function wallEvidence(record={}){return snapshot.wallEvidence(record?.prediction||record||{});}
function scoreBand(score){const n=Number(score);if(!Number.isFinite(n))return"unknown";if(n>=85)return"85+";if(n>=75)return"75-84";if(n>=65)return"65-74";return"<65";}
function selectedEpoch(record={}){const value=Date.parse(String(record.selectedAt||record.capturedAt||""));return Number.isFinite(value)?value:null;}
function isProspective(record={}){const value=selectedEpoch(record);return value!==null&&value>=Date.parse(PROSPECTIVE_CUTOFF);}
function normalizeEmbeddedResult(record={},results=new Map()){
  const embedded=record.result||{};
  if(embedded.settled&&ticket(embedded.resultTicket))return{trifecta:{combination:ticket(embedded.resultTicket),payout:Math.max(0,Number(embedded.payout||0))}};
  return results.get(raceKey(record))||null;
}
function summarize(rows){let settledCount=0,stake=0,returned=0,hits=0;for(const row of rows){if(!row.result)continue;settledCount++;const ts=practicalTickets(row.record);if(!ts.length)continue;const actual=ticket(row.result?.trifecta?.combination);const payout=Math.max(0,Number(row.result?.trifecta?.payout||0));stake+=ts.length*STAKE_PER_TICKET;if(actual&&ts.includes(actual)){hits++;returned+=payout;}}return{raceCount:rows.length,settledCount,hitCount:hits,hitRate:settledCount?Math.round(hits/settledCount*1000)/10:null,stake,return:returned,profit:returned-stake,recoveryRate:stake?Math.round(returned/stake*1000)/10:null};}
function diagnose(records){const out={raceCount:records.length,formalWallEvidenceRaceCount:0,prospectiveFormalWallEvidenceRaceCount:0,states:{},grades:{},scoreBands:{},attackerCounts:{},wallCandidateCounts:{}};for(const record of records){const e=wallEvidence(record);if(!e.formal)continue;out.formalWallEvidenceRaceCount++;if(isProspective(record))out.prospectiveFormalWallEvidenceRaceCount++;out.states[e.state]=(out.states[e.state]||0)+1;out.grades[e.grade]=(out.grades[e.grade]||0)+1;const band=scoreBand(e.score);out.scoreBands[band]=(out.scoreBands[band]||0)+1;out.attackerCounts[e.attackerNo]=(out.attackerCounts[e.attackerNo]||0)+1;out.wallCandidateCounts[e.wallCandidateNo]=(out.wallCandidateCounts[e.wallCandidateNo]||0)+1;}return out;}
function build(predDocs,resultDocs){
  const results=resultMap(resultDocs);
  const selected=predDocs.flatMap(d=>Array.isArray(d.predictions)?d.predictions:[]);
  const verification=predDocs.flatMap(d=>Array.isArray(d.verificationPredictions)?d.verificationPredictions:[]);
  const rows=[...selected,...verification].map(record=>({record,evidence:wallEvidence(record),result:normalizeEmbeddedResult(record,results)})).filter(row=>row.evidence.formal&&isProspective(row.record));
  const selectedKeys=new Set(selected.map(r=>raceKey(r)));
  const dedup=new Map();for(const row of rows){const k=raceKey(row.record);const current=dedup.get(k);if(!current||selectedKeys.has(k))dedup.set(k,row);}
  const formalRows=[...dedup.values()];
  const branches={all:formalRows,wallEstablished:formalRows.filter(r=>r.evidence.state==="壁成立"),even:formalRows.filter(r=>r.evidence.state==="互角"),wallBroken:formalRows.filter(r=>r.evidence.state==="壁崩れ"),score65to74:formalRows.filter(r=>scoreBand(r.evidence.score)==="65-74"),score75to84:formalRows.filter(r=>scoreBand(r.evidence.score)==="75-84"),score85plus:formalRows.filter(r=>scoreBand(r.evidence.score)==="85+")};
  const summaries=Object.fromEntries(Object.entries(branches).map(([k,v])=>[k,summarize(v)]));
  const stateRanking=["wallEstablished","even","wallBroken"].map(branch=>({branch,...summaries[branch]})).filter(r=>r.settledCount>=10&&r.recoveryRate!==null).sort((a,b)=>a.recoveryRate-b.recoveryRate).map((r,i)=>({rank:i+1,...r}));
  const firstEvidence=formalRows.length?{raceKey:raceKey(formalRows[0].record),selectedAt:String(formalRows[0].record.selectedAt||formalRows[0].record.capturedAt||""),state:formalRows[0].evidence.state,score:formalRows[0].evidence.score,grade:formalRows[0].evidence.grade,settled:Boolean(formalRows[0].result)}:null;
  return{schemaVersion:2,version:"wall-boat-branch-profit-v2-prospective",generatedAt:new Date().toISOString(),source:"post-storage-cutoff saved predictions + official results",stakePerTicket:STAKE_PER_TICKET,productionChanged:false,prospectiveProtocol:{cutoffSelectedAtInclusive:PROSPECTIVE_CUTOFF,storageSourceCommit:STORAGE_SOURCE_COMMIT,oldRecordsBackfilled:false,actualPurchase:false},diagnostics:{selected:diagnose(selected),verification:diagnose(verification),prospectiveDeduplicatedFormalRaceCount:formalRows.length,firstEvidence},summaries,weakStateRanking:stateRanking,interpretation:{minimumBranchSettledCount:10,retrospectiveClassificationAllowed:false,automaticApplication:false,usableForPrediction:false}};
}
function main(){const report=build(load(predictionDir),load(resultDir));fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");console.log(`wall prospective selected ${report.diagnostics.selected.prospectiveFormalWallEvidenceRaceCount}R / verification ${report.diagnostics.verification.prospectiveFormalWallEvidenceRaceCount}R / dedup ${report.diagnostics.prospectiveDeduplicatedFormalRaceCount}R`);}
if(require.main===module)main();
module.exports={ticket,tickets,raceKey,scoreBand,selectedEpoch,isProspective,wallEvidence,summarize,diagnose,build,PROSPECTIVE_CUTOFF,STORAGE_SOURCE_COMMIT};
