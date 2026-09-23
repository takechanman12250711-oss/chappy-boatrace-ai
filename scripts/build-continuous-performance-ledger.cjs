'use strict';
const fs=require('node:fs'),path=require('node:path');
const input=require('./analysis-input-contract');
const evaluator=require('./final-ticket-candidate-evaluator.cjs');
const calibration=require('../js/prediction-calibration');
const ROOT=path.resolve(__dirname,'..');
function generationOf(record){const p=record?.prediction||record||{};const e=p.verificationEvidence||p.practicalSelection?.verificationEvidence||{};return calibration.generationKey(e.generation)||'unknown';}
function ts(record){return Date.parse(record?.selectedAt||record?.capturedAt||'')||0;}
function evaluate(record){const prediction=record?.prediction||record||{};const tickets=evaluator.ticketList(prediction);const actual=input.actualTicket(record.__officialResult);const hit=Boolean(actual&&tickets.includes(actual));const payout=evaluator.payout(record.__officialResult);return{raceKey:record.__analysisRaceKey,selectedAt:record.selectedAt||record.capturedAt||'',generationKey:generationOf(record),ticketCount:tickets.length,actualTicket:actual,hit,stakeYen:tickets.length*100,returnYen:hit?payout:0};}
function summary(rows){const stake=rows.reduce((n,r)=>n+r.stakeYen,0),ret=rows.reduce((n,r)=>n+r.returnYen,0),hits=rows.filter(r=>r.hit).length;return{races:rows.length,hits,hitRate:rows.length?Math.round(hits/rows.length*10000)/100:0,stakeYen:stake,returnYen:ret,profitYen:ret-stake,roi:stake?Math.round(ret/stake*10000)/100:0};}
function build(options={}){const cohort=input.buildDefaultCohort(options);const rows=cohort.records.map(evaluate).filter(r=>r.ticketCount>0).sort((a,b)=>ts(a)-ts(b)||a.raceKey.localeCompare(b.raceKey));const byGeneration={};for(const row of rows)(byGeneration[row.generationKey]??=[]).push(row);return{schemaVersion:1,analysisId:'continuous-performance-ledger-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticProductionChange:false,policy:{population:'saved-pre-deadline-predictions-with-official-results',generationHandling:'continuous-ledger-with-generation-breakdown',fixedTheoryABUnaffected:true,stakePerTicketYen:100},diagnostics:cohort.diagnostics,cumulative:summary(rows),rolling100:summary(rows.slice(-100)),generationBreakdown:Object.entries(byGeneration).map(([generationKey,items])=>({generationKey,...summary(items)})).sort((a,b)=>b.races-a.races),rows};}
if(require.main===module){const out=path.join(ROOT,'data','stats','continuous-performance-ledger.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(build(),null,2)+'\n');}
module.exports={build,summary,evaluate,generationOf};
