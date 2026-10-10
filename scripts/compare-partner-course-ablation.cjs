'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {selectPartners}=require('./partner-calibration.cjs');
const {select,VERSION}=require('./partner-course-ablation.cjs');
const protocol=require('./partner-course-ablation-protocol.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(file,expected) { const bytes=fs.readFileSync(file);assert.equal(hash(bytes),expected,'pinned-input-mismatch');return JSON.parse(bytes); }
function metrics(rows,key,reference) {
 let hits=0,cost=0,returned=0;const gained=[],lost=[];
 for(const r of rows){const hit=r[key].includes(r.actual),before=r[reference].includes(r.actual);hits+=Number(hit);cost+=100*r[key].length;returned+=hit?r.payout:0;if(hit!==before)(hit?gained:lost).push({raceKey:r.raceKey,actual:r.actual,removed:r[reference].filter(t=>!r[key].includes(t)),added:r[key].filter(t=>!r[reference].includes(t))});}
 return {races:rows.length,hits,hitRate:rows.length?100*hits/rows.length:null,cost,returned,recoveryRate:cost?100*returned/cost:null,gainedHits:gained.length,lostHits:lost.length,netHits:gained.length-lost.length,gained,lost};
}
function compare(root,out,experiment={select,VERSION,protocol}) {
 const {select,VERSION,protocol}=experiment;
 const model=read(path.join(root,'calibration/model.json'),protocol.modelSha256);
 const source=read(path.join(root,'calibration/scored-rows.json'),protocol.rowsSha256);
 assert.equal(new Set(source.map(r=>r.raceKey)).size,source.length);
 const rows=source.map(r=>{
  // Explicit allowlist: no labels, payout, original rank or result enters selection.
  const input={head:r.head,scenarioType:r.scenarioType,outcomes:r.outcomes,courseByBoat:r.courseByBoat,base:r.base};
  assert.ok(Date.parse(r.selectedAt)<Date.parse(r.deadlineAt),'source-not-predeadline');
  const control=selectPartners(input,model);assert.deepEqual(control.tickets,r.candidate,'frozen-control-not-reproduced');
  const candidate=select(input,model);assert.equal(candidate.tickets.length,r.base.length);
  r.base.forEach((t,i)=>{if(Number(t[0])!==r.head)assert.equal(candidate.tickets[i],t,'alternative-head-changed');});
  assert.ok(/^[1-6]-[1-6]-[1-6]$/.test(r.actual)&&new Set(r.actual.split('-')).size===3);
  assert.ok(Number.isFinite(r.payout)&&r.payout>0);
  return {raceKey:r.raceKey,date:r.date,scenarioType:r.scenarioType,head:r.head,courseByBoat:r.courseByBoat,courseFormal:r.courseFormal,base:r.base,control:control.tickets,ablation:candidate.tickets,actual:r.actual,payout:r.payout};
 });
 const summarize=rs=>({baseline:metrics(rs,'base','base'),control:metrics(rs,'control','base'),ablationVsBaseline:metrics(rs,'ablation','base'),ablationVsControl:metrics(rs,'ablation','control')});
 const periods=protocol.periods.map(([from,to],i)=>{const rs=rows.filter(r=>r.date>=from&&r.date<=to);assert.equal(rs.length,protocol.expectedRows[i]);const escape=rs.filter(r=>r.scenarioType==='escape');const outerTickets=key=>escape.flatMap(r=>r[key].filter(t=>Number(t[0])===r.head&&[5,6].includes(r.courseByBoat[t.split('-')[1]]))).length;return {from,to,all:summarize(rs),escape:summarize(escape),outerSecondTicketCounts:Object.fromEntries(['base','control','ablation'].map(k=>[k,outerTickets(k)])),formalCourseRaces:escape.filter(r=>r.courseFormal===true).length};});
 assert.equal(periods.reduce((s,p)=>s+p.all.baseline.races,0),rows.length);
 const report={version:VERSION,generatedAt:new Date().toISOString(),protocol,productionChanged:false,automaticAdoption:false,usableForPrediction:false,decision:'INSUFFICIENT_EVIDENCE',periods,rows};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({version:VERSION,periods:periods.map(p=>({from:p.from,to:p.to,all:[p.all.ablationVsBaseline.hits,p.all.ablationVsBaseline.netHits],escape:[p.escape.ablationVsBaseline.hits,p.escape.ablationVsBaseline.netHits],outerSecondTicketCounts:p.outerSecondTicketCounts})),decision:report.decision}));return report;
}
if(require.main===module)compare(process.argv[2],process.argv[3]);
module.exports={compare,metrics};
