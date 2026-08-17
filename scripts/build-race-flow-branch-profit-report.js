"use strict";

const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const predictionDir=path.join(root,"data","predictions");
const resultDir=path.join(root,"data","results");
const output=path.join(root,"data","stats","race-flow-branch-profit-report.json");
const STAKE_PER_TICKET=100;

function ticket(v){const s=String(v?.ticket||v||"").trim();return /^[1-6]-[1-6]-[1-6]$/.test(s)&&new Set(s.split("-")).size===3?s:"";}
function tickets(v){return [...new Set((Array.isArray(v)?v:[]).map(ticket).filter(Boolean))];}
function raceKey(r={}){return `${String(r.date||"")}-${String(r.jcd||"").padStart(2,"0")}-${Number(r.raceNo||0)}`;}
function load(dir){if(!fs.existsSync(dir))return[];return fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort().map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));}
function resultMap(docs){const map=new Map();for(const d of docs)for(const r of(Array.isArray(d.races)?d.races:[]))if(r.resultAvailable&&r.status==="finished")map.set(raceKey(r),r);return map;}
function practicalTickets(record={}){return tickets(record?.prediction?.practicalTickets||record?.prediction?.practicalSelection?.tickets);}
function normalizeLabel(v){const s=String(v||"").trim();return s&&s!=="-"&&s!=="不明"?s:"";}
function scenarioEvidence(record={}){
  const p=record.prediction||{};
  const candidates=[
    [record.scenarioLabel,"record.scenarioLabel"],
    [record?.shadowSelectionV2?.scenarioLabel,"record.shadowSelectionV2.scenarioLabel"],
    [record?.shadowSelectionV2?.evaluation?.scenarioLabel,"record.shadowSelectionV2.evaluation.scenarioLabel"],
    [p.scenarioLabel,"prediction.scenarioLabel"],
    [p?.raceFlow?.scenarioLabel,"prediction.raceFlow.scenarioLabel"],
    [p?.raceFlow?.label,"prediction.raceFlow.label"],
    [p?.raceFlow?.name,"prediction.raceFlow.name"],
    [p?.raceFlow?.type,"prediction.raceFlow.type"]
  ];
  for(const [value,source] of candidates){const label=normalizeLabel(value);if(label)return{label,source};}
  return{label:"",source:""};
}
function embeddedResult(record={}){const r=record.result||{};if(r.settled&&ticket(r.resultTicket))return{trifecta:{combination:ticket(r.resultTicket),payout:Math.max(0,Number(r.payout||0))}};return null;}
function summarize(rows){let settledCount=0,stake=0,returned=0,hits=0;for(const row of rows){if(!row.result)continue;settledCount++;const ts=practicalTickets(row.record);if(!ts.length)continue;const actual=ticket(row.result?.trifecta?.combination);const payout=Math.max(0,Number(row.result?.trifecta?.payout||0));stake+=ts.length*STAKE_PER_TICKET;if(actual&&ts.includes(actual)){hits++;returned+=payout;}}return{raceCount:rows.length,settledCount,hitCount:hits,hitRate:settledCount?Math.round(hits/settledCount*1000)/10:null,stake,return:returned,profit:returned-stake,recoveryRate:stake?Math.round(returned/stake*1000)/10:null};}
function diagnose(records){const out={raceCount:records.length,labeledRaceCount:0,unlabeledRaceCount:0,labels:{},sources:{}};for(const r of records){const e=scenarioEvidence(r);if(!e.label){out.unlabeledRaceCount++;continue;}out.labeledRaceCount++;out.labels[e.label]=(out.labels[e.label]||0)+1;out.sources[e.source]=(out.sources[e.source]||0)+1;}return out;}
function build(predDocs,resultDocs){
  const results=resultMap(resultDocs);
  const selected=predDocs.flatMap(d=>Array.isArray(d.predictions)?d.predictions:[]);
  const verification=predDocs.flatMap(d=>Array.isArray(d.verificationPredictions)?d.verificationPredictions:[]);
  const selectedKeys=new Set(selected.map(r=>raceKey(r)));
  const rows=[...selected,...verification].map(record=>({record,evidence:scenarioEvidence(record),result:embeddedResult(record)||results.get(raceKey(record))||null})).filter(r=>r.evidence.label);
  const dedup=new Map();for(const row of rows){const k=raceKey(row.record);const current=dedup.get(k);if(!current||selectedKeys.has(k))dedup.set(k,row);}
  const labeled=[...dedup.values()];
  const labels=[...new Set(labeled.map(r=>r.evidence.label))].sort((a,b)=>a.localeCompare(b,"ja"));
  const summaries={all:summarize(labeled)};for(const label of labels)summaries[label]=summarize(labeled.filter(r=>r.evidence.label===label));
  const ranking=labels.map(label=>({label,...summaries[label]})).filter(r=>r.settledCount>=10&&r.recoveryRate!==null).sort((a,b)=>a.recoveryRate-b.recoveryRate).map((r,i)=>({rank:i+1,...r}));
  return{schemaVersion:1,version:"race-flow-branch-profit-v1",generatedAt:new Date().toISOString(),source:"saved scenario labels + official results",stakePerTicket:STAKE_PER_TICKET,productionChanged:false,diagnostics:{selected:diagnose(selected),verification:diagnose(verification),deduplicatedLabeledRaceCount:labeled.length,distinctLabels:labels},summaries,weakBranchRanking:ranking,interpretation:{minimumBranchSettledCount:10,labelsAreStoredValuesOnly:true,retrospectiveInferenceAllowed:false,automaticApplication:false,usableForPrediction:false,actualPurchase:false}};
}
function main(){const report=build(load(predictionDir),load(resultDir));fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");console.log(`race-flow labels ${report.diagnostics.deduplicatedLabeledRaceCount}R / ${report.diagnostics.distinctLabels.length} labels`);}
if(require.main===module)main();
module.exports={ticket,tickets,raceKey,scenarioEvidence,summarize,diagnose,build};
