'use strict';
const {build:buildSuppression}=require('./analyze-raceflow-attack-suppression.cjs');

const ST=[0,0.25,0.5,0.75,1];
const ROLE=[0,0.25,0.5,0.75,1];
const EX=[null,0,0.25,0.5,0.75,1];
const FLOW=[0,0.1,0.25,0.5,0.75,1];
const MIN_PAIRS=5;
function pct(n,d){return d?Number((n/d).toFixed(4)):0;}
function summarize(rows){const wins=rows.filter(x=>x.challengerWon).length;return{pairs:rows.length,wins,winRate:pct(wins,rows.length)};}
function match(p,c){return p.attackSignal&&p.flowSuppressed&&p.st>=c.st&&p.roleAttack>=c.roleAttack&&(c.exhibition===null||p.exhibition>=c.exhibition)&&(-p.raceFlow)>=c.flowMagnitude;}
function evaluate(pairs,c){const selected=pairs.filter(p=>match(p,c));const other=pairs.filter(p=>p.attackSignal&&p.flowSuppressed&&!match(p,c));const s=summarize(selected),o=summarize(other);const all=summarize(pairs.filter(p=>p.attackSignal&&p.flowSuppressed));const dates=[...new Set(pairs.map(p=>p.raceKey.slice(0,8)))].sort();const q=Math.ceil(dates.length/4);const quartiles=[];for(let i=0;i<4;i++){const dateSet=new Set(dates.slice(i*q,(i+1)*q));const rows=selected.filter(p=>dateSet.has(p.raceKey.slice(0,8)));quartiles.push(summarize(rows));}return{...c,selected:s,other:o,all,selectedVsOtherLift:o.winRate?Number((s.winRate/o.winRate).toFixed(3)):null,selectedVsAllLift:all.winRate?Number((s.winRate/all.winRate).toFixed(3)):null,quartiles};}
function build(){const base=buildSuppression();const pairs=base.pairs;const candidates=[];for(const st of ST)for(const roleAttack of ROLE)for(const exhibition of EX)for(const flowMagnitude of FLOW){const r=evaluate(pairs,{st,roleAttack,exhibition,flowMagnitude});if(r.selected.pairs>=MIN_PAIRS)candidates.push(r);}candidates.sort((a,b)=>b.selected.winRate-a.selected.winRate||b.selected.wins-a.selected.wins||b.selected.pairs-a.selected.pairs);const stable=candidates.filter(c=>c.selected.pairs>=8&&c.quartiles.filter(q=>q.pairs>0).length>=3&&c.quartiles.filter(q=>q.pairs>0).every(q=>q.winRate>=0.2)).sort((a,b)=>(b.selectedVsAllLift??-1)-(a.selectedVsAllLift??-1)||b.selected.wins-a.selected.wins||b.selected.pairs-a.selected.pairs);return{schemaVersion:1,analysisId:'raceflow-suppression-risk-bands-v1',scope:{dataset:'discovery-only',holdoutUsed:false,productionChanged:false,sourceSuppressedPairs:base.pairSummary.suppressed.pairs,sourceSuppressedWinRate:base.pairSummary.suppressed.challengerWinRate},grid:{ST,ROLE,EX,FLOW,MIN_PAIRS},candidateCount:candidates.length,bestByWinRate:candidates[0]||null,bestStable:stable[0]||null,stableCandidateCount:stable.length,topStable:stable.slice(0,20)};}
if(require.main===module)process.stdout.write(JSON.stringify(build(),null,2)+'\n');module.exports={build,evaluate,match};
