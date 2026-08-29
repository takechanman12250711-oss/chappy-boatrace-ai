'use strict';
const input=require('./analysis-input-contract');
const suppression=require('./analyze-raceflow-attack-suppression.cjs');

const FIXED={st:0,roleAttack:0.25,exhibition:0.5};
function select(rows){return rows.filter(p=>p.attackSignal&&p.flowSuppressed&&p.st>=FIXED.st&&p.roleAttack>=FIXED.roleAttack&&p.exhibition>=FIXED.exhibition);}
function summarize(rows){const wins=rows.filter(r=>r.challengerWon).length;return{pairs:rows.length,wins,winRate:rows.length?Number((wins/rows.length).toFixed(4)):0};}
function group(rows,keyFn){const out={};for(const row of rows){const k=String(keyFn(row));(out[k] ||= []).push(row);}return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,summarize(v)]));}
function build(){const base=suppression.build();const rows=select(base.pairs);const resultMap=input.collectOfficialResults(require('node:path').resolve(__dirname,'..','data','results'),new Set(rows.map(r=>r.raceKey)));const byMethod=group(rows,r=>input.winningMethod(resultMap.get(r.raceKey))||'unknown');const byBoat=group(rows,r=>r.challengerNo);const byPlace=group(rows,r=>r.raceKey.split('-')[1]);const winnerPlaces=new Set(rows.filter(r=>r.challengerWon).map(r=>r.raceKey.split('-')[1]));const allPlaces=new Set(rows.map(r=>r.raceKey.split('-')[1]));return{schemaVersion:1,analysisId:'outer-attack-bias-audit-v1',scope:{dataset:'discovery-only',holdoutUsed:false,productionChanged:false,fixedCondition:FIXED},overall:summarize(rows),byChallengerBoat:byBoat,byPlace,byWinningMethod:byMethod,coverage:{placeCount:allPlaces.size,winningPlaceCount:winnerPlaces.size,boatCount:Object.keys(byBoat).length,winningMethodCount:Object.keys(byMethod).length}};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build,FIXED};
