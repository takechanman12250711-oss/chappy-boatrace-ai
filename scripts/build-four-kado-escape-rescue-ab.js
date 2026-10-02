"use strict";

const fs=require("node:fs");
const path=require("node:path");
const proposal=require("./build-improvement-proposal-report");
const root=path.resolve(__dirname,"..");
const output=path.join(root,"data","stats","four-kado-escape-rescue-ab-report.json");
const TARGET_LABEL="4カド攻め";
const DISCOVERY_RATIO=0.6;
const STAKE_PER_TICKET=100;
const MIN_HOLDOUT_TARGET=30;

function normalizeTicket(value){const boats=String(value?.ticket||value||"").match(/[1-6]/g)||[];if(boats.length<3)return"";const t=boats.slice(0,3);return new Set(t).size===3?t.join("-"):"";}
function practicalTickets(record={}){const rows=record?.prediction?.practicalTickets||record?.prediction?.practicalSelection?.tickets||[];return[...new Set((Array.isArray(rows)?rows:[]).map(normalizeTicket).filter(Boolean))];}
function scenarioLabel(record={}){const p=record.prediction||{},e=p.verificationEvidence||p?.practicalSelection?.verificationEvidence||{};return String(e?.mainScenario?.label||p?.predictedScenarioTitle||p?.raceFlow?.title||p?.raceFlow?.scenario?.title||"").trim();}
function resultTicket(record={}){return normalizeTicket(record?.result?.resultTicket||record?.result?.verification?.resultTicket||record?.result?.trifecta?.combination);}
function payout(record={}){return Math.max(0,Number(record?.result?.payout||record?.result?.verification?.payoutPer100||record?.result?.trifecta?.payout||0));}
function raceKey(record={}){return`${String(record.date||"")}-${String(record.jcd||"").padStart(2,"0")}-${String(Number(record.raceNo||0)).padStart(2,"0")}`;}
function targetRows(records){return records.filter(r=>r?.result?.settled===true).filter(r=>scenarioLabel(r)===TARGET_LABEL).filter(r=>resultTicket(r)).sort((a,b)=>raceKey(a).localeCompare(raceKey(b)));}
function split(rows){const cut=Math.max(1,Math.min(rows.length-1,Math.floor(rows.length*DISCOVERY_RATIO)));return{discovery:rows.slice(0,cut),holdout:rows.slice(cut),cut};}
function choose(discovery){const counts=new Map();for(const r of discovery){const t=resultTicket(r);if(!t.startsWith("1-"))continue;counts.set(t,(counts.get(t)||0)+1);}const ranking=[...counts.entries()].map(([ticket,count])=>({ticket,count})).sort((a,b)=>b.count-a.count||a.ticket.localeCompare(b.ticket));return{rescueTicket:ranking[0]?.ticket||"",ranking};}
function bTickets(record,rescue){const current=practicalTickets(record);if(!rescue||!current.length||current.includes(rescue))return current;return[...current.slice(0,-1),rescue];}
function settle(rows,mode,rescue){let betRaceCount=0,hitCount=0,stake=0,returned=0,replacedRaceCount=0;for(const r of rows){const a=practicalTickets(r),ts=mode==="B"?bTickets(r,rescue):a;if(!ts.length)continue;if(mode==="B"&&JSON.stringify(ts)!==JSON.stringify(a))replacedRaceCount++;betRaceCount++;stake+=ts.length*STAKE_PER_TICKET;const actual=resultTicket(r);if(ts.includes(actual)){hitCount++;returned+=payout(r);}}return{targetSettledCount:rows.length,betRaceCount,replacedRaceCount,hitCount,hitRate:betRaceCount?Math.round(hitCount/betRaceCount*1000)/10:null,stake,return:returned,profit:returned-stake,recoveryRate:stake?Math.round(returned/stake*1000)/10:null};}
function delta(a,b){return{hitCount:b.hitCount-a.hitCount,hitRate:a.hitRate!==null&&b.hitRate!==null?Math.round((b.hitRate-a.hitRate)*10)/10:null,profit:b.profit-a.profit,recoveryRate:a.recoveryRate!==null&&b.recoveryRate!==null?Math.round((b.recoveryRate-a.recoveryRate)*10)/10:null};}
function build(records){const rows=targetRows(records),{discovery,holdout,cut}=split(rows),selected=choose(discovery),da=settle(discovery,"A",selected.rescueTicket),db=settle(discovery,"B",selected.rescueTicket),ha=settle(holdout,"A",selected.rescueTicket),hb=settle(holdout,"B",selected.rescueTicket),hd=delta(ha,hb),ready=holdout.length>=MIN_HOLDOUT_TARGET,candidate=ready&&hd.hitCount>0&&hd.profit>0&&Number(hd.recoveryRate||0)>0;return{schemaVersion:1,generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,targetLabel:TARGET_LABEL,sourceContract:proposal.ANALYSIS_INPUT_CONTRACT,protocol:{discoveryRatio:DISCOVERY_RATIO,chronologicalSplit:true,discoveryCount:discovery.length,holdoutCount:holdout.length,splitIndex:cut,rescueTicketChosenFromDiscoveryOnly:true,holdoutUsedForTicketSelection:false,replacementPolicy:"同点数維持のため既存実戦券の末尾1点を救済券へ置換。救済券が既存なら変更なし。",minimumHoldoutTargetCount:MIN_HOLDOUT_TARGET},discoverySelection:selected,discovery:{a:da,b:db,delta:delta(da,db)},holdout:{a:ha,b:hb,delta:hd},decision:candidate?"candidate":ready?"reject":"continue",reason:!ready?`${holdout.length}/${MIN_HOLDOUT_TARGET}R`:candidate?"holdoutで的中数・収支・回収率がすべて改善":"holdoutで的中数・収支・回収率の同時改善を満たさない",policy:"分析専用。候補になっても本番予想へ自動反映しない。"};}
function main(){const report=build(proposal.collect());fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");console.log(`4カド攻め→イン逃げ救済A/B: discovery ${report.protocol.discoveryCount}R / holdout ${report.protocol.holdoutCount}R / ${report.decision}`);}
if(require.main===module)main();
module.exports={normalizeTicket,practicalTickets,scenarioLabel,resultTicket,payout,raceKey,targetRows,split,choose,bTickets,settle,delta,build};
