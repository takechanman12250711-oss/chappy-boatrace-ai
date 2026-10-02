'use strict';
const missReport=require('./build-effective-score-miss-attribution-report');
const suppression=require('./analyze-raceflow-attack-suppression.cjs');
const input=require('./analysis-input-contract');
const path=require('node:path');
const FIXED={st:0,roleAttack:0.25,exhibition:0.5};
function match(p){return p.attackSignal&&p.flowSuppressed&&p.st>=FIXED.st&&p.roleAttack>=FIXED.roleAttack&&p.exhibition>=FIXED.exhibition;}
function ticket(v){const s=String(v?.ticket||v?.combination||v||'').trim();return /^([1-6])-([1-6])-([1-6])$/.test(s)&&new Set(s.split('-')).size===3?s:'';}
function formationArrays(pred){const f=pred?.formations||pred?.prediction?.formations||{};const out={};for(const [k,v] of Object.entries(f)){if(!Array.isArray(v))continue;const ts=v.map(ticket).filter(Boolean);if(ts.length)out[k]=[...new Set(ts)];}return out;}
function build(){const {settled}=missReport.loadDiscovery();const pairs=suppression.build().pairs.filter(match);const byKey=new Map();for(const p of pairs){if(!byKey.has(p.raceKey))byKey.set(p.raceKey,[]);byKey.get(p.raceKey).push(p);}const results=input.collectOfficialResults(path.join(__dirname,'..','data','results'),new Set(byKey.keys()));const rows=[];const categoryCounts={};for(const row of settled.rows){const ps=byKey.get(row.raceKey);if(!ps)continue;const arrays=formationArrays(row.record||row.sourceRecord||row.prediction||row);for(const [k,ts] of Object.entries(arrays))categoryCounts[k]=(categoryCounts[k]||0)+1;rows.push({raceKey:row.raceKey,challengers:[...new Set(ps.map(p=>p.challenger))],actual:input.actualTicket(results.get(row.raceKey)),formations:arrays});}return{schemaVersion:1,analysisId:'outer-attack-ticket-surface-v1',scope:{dataset:'discovery-only',holdoutUsed:false,productionChanged:false,fixedSignal:FIXED},signalRaceCount:rows.length,categoryCounts,rows};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build};
