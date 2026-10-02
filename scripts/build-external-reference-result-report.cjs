'use strict';
const fs=require('node:fs'),path=require('node:path');
const {listCaptures}=require('./external-reference-three-source.cjs');
const {collectOfficialResults,actualTicket,winningMethod}=require('./analysis-input-contract.js');
function pct(n,d){return d?Math.round(n*1000/d)/10:null;}
function build(root=process.cwd()){
 const captures=listCaptures(root).filter(x=>!x.invalid), keys=new Set(captures.map(x=>x.raceKey));
 const results=collectOfficialResults(path.join(root,'data','results'),keys), rows=[];
 for(const c of captures){
  const r=results.get(c.raceKey); if(!r){rows.push({source:c.source,raceKey:c.raceKey,status:'pending'});continue;}
  const order=actualTicket(r).split('-').map(Number), f=c.features||{}, candidate=Number(f.boat||f.frame)||null;
  rows.push({source:c.source,raceKey:c.raceKey,status:'settled',signal:f.signal||null,candidate,
   actualTicket:order.join('-'),winningMethod:winningMethod(r)||null,
   headHit:candidate?order[0]===candidate:null,top3Hit:candidate?order.includes(candidate):null,
   escapeHit:f.signal==='escape70_release50'?order[0]===1:null});
 }
 const bySource={};
 for(const source of ['hiyori','macour','br']){
  const settled=rows.filter(x=>x.source===source&&x.status==='settled');
  const head=settled.filter(x=>x.headHit!==null), top3=settled.filter(x=>x.top3Hit!==null), escape=settled.filter(x=>x.escapeHit!==null);
  bySource[source]={captures:captures.filter(x=>x.source===source).length,settled:settled.length,
   candidateHead:{n:head.length,hits:head.filter(x=>x.headHit).length,ratePercent:pct(head.filter(x=>x.headHit).length,head.length)},
   candidateTop3:{n:top3.length,hits:top3.filter(x=>x.top3Hit).length,ratePercent:pct(top3.filter(x=>x.top3Hit).length,top3.length)},
   escapeSignal:{n:escape.length,hits:escape.filter(x=>x.escapeHit).length,ratePercent:pct(escape.filter(x=>x.escapeHit).length,escape.length)}};
 }
 return {version:'external-reference-result-report-v1',generatedAt:new Date().toISOString(),
  productionChanged:false,automaticApplication:false,usableForPrediction:false,
  minimumForwardRacesPerFeature:120,bySource,rows};
}
if(require.main===module){const r=build();const out=path.join(process.cwd(),'data','stats','external-reference-result-report-v1.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r.bySource,null,2));}
module.exports={build};
