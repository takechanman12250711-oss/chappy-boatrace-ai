'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const input = require('./analysis-input-contract');
const protocol = require('../config/inside-third-hold-research-v1.json');
const { scenarioLabel } = require('../js/three-course-escape-rescue-fixed5');
const ticketOf = row => input.normalizeTicket(row?.ticket || row);

function replacement(record) {
  const p = record.prediction || {}, s = p.practicalSelection || {};
  if (record.practicalPriorityShadow?.sourceSelectionFingerprint !== protocol.sourceSelectionFingerprint) return null;
  if (!protocol.scenarioLabels.includes(scenarioLabel(p,s))) return null;
  const tickets = (p.practicalTickets || []).map(ticketOf);
  if (!tickets.length || tickets.length > 10 || tickets.some(t=>!t) || new Set(tickets).size !== tickets.length) return null;
  const basis = s.frameRiseFallReplayBasis;
  if (basis?.source !== 'pre-deadline-production-prediction' || basis.analyses?.length !== 6) return null;
  const scores = new Map(basis.analyses.map(a=>[Number(a.boatNo), Number(a.roleScores?.hold)]));
  const decisions = [...(s.candidateDecisions || []), ...(s.targetDecisions || []).flatMap(t=>t.candidateDecisions || [])];
  const candidates = new Map();
  for (const d of decisions) {
    const t = ticketOf(d), boat = Number(t[4]);
    if (!t || tickets.includes(t) || boat > protocol.candidateMaximumThirdBoat) continue;
    const head = scenarioLabel(p,s)==='3コース攻め' ? 3 : 4;
    if (Number(t[0])!==head) continue;
    if (!(d.roleLabels || []).some(r=>r.position===1 && r.boatNo===head && r.role==='head' && r.structured===true) ||
        !(d.roleLabels || []).some(r=>r.position===2 && r.boatNo===Number(t[2]) && r.role==='hold' && r.structured===true)) continue;
    if (!(d.roleLabels || []).some(r=>r.position===3 && r.boatNo===boat && r.role==='hold' && r.structured===true)) continue;
    if (!Number.isFinite(scores.get(boat)) || scores.get(boat)<protocol.minimumCandidateRoleScore) continue;
    candidates.set(t, scores.get(boat));
  }
  const options=[];
  for (const [add,score] of candidates) {
    tickets.forEach((remove,index)=>{
      if (index===0 || remove.slice(0,3)!==add.slice(0,3) || Number(remove[4])<protocol.replacedMinimumThirdBoat) return;
      if (!Number.isFinite(scores.get(Number(remove[4]))) || score<=scores.get(Number(remove[4]))) return;
      // Do not split an atomic formation or replace an adopted escape rescue.
      const source=p.practicalTickets[index];
      if (/フォーメーション|流し|救済/.test(String(source?.category || '')+' '+String(source?.displayCategory || ''))) return;
      options.push({add,remove,index,score});
    });
  }
  options.sort((a,b)=>b.score-a.score || Number(a.add[4])-Number(b.add[4]) || b.index-a.index || a.add.localeCompare(b.add));
  if (!options.length) return null;
  const choice=options[0], changed=tickets.slice();changed[choice.index]=choice.add;
  return {...choice,baseline:tickets,candidate:changed};
}

function exactP(gains,losses) {
  const n=gains+losses;if (!n) return 1;
  let probability=Math.pow(0.5,n),sum=0;
  for(let k=0;k<=n;k++){if(k>=gains)sum+=probability;probability*= (n-k)/(k+1);}
  return sum;
}
function metrics(rows) {
  const m={races:rows.length,affected:0,aHits:0,bHits:0,stake:0,aReturn:0,bReturn:0,gains:0,losses:0,largestGain:0};
  for(const r of rows){m.affected+=Number(r.changed);m.stake+=r.a.length*100;
    const a=r.a.includes(r.actual),b=r.b.includes(r.actual);
    m.aHits+=Number(a);m.bHits+=Number(b);m.aReturn+=a?r.payout:0;m.bReturn+=b?r.payout:0;
    if(b&&!a){m.gains++;m.largestGain=Math.max(m.largestGain,r.payout);}if(a&&!b)m.losses++;
  }
  return {...m,hitDelta:m.bHits-m.aHits,returnDelta:m.bReturn-m.aReturn,
    returnDeltaWithoutLargestGain:m.bReturn-m.aReturn-m.largestGain,
    aHitRate:m.races?m.aHits/m.races*100:null,bHitRate:m.races?m.bHits/m.races*100:null,
    aRecovery:m.stake?m.aReturn/m.stake*100:null,bRecovery:m.stake?m.bReturn/m.stake*100:null,
    oneSidedP:exactP(m.gains,m.losses)};
}
function main(root=process.cwd()) {
  const diagnostics=JSON.parse(fs.readFileSync(path.join(root,'data/stats/candidate24-selection-loss.json')));
  const inspected=new Set(diagnostics.rows.map(r=>r.raceKey));
  const selected=[],excluded={};
  function reject(reason){excluded[reason]=(excluded[reason]||0)+1;}
  for(const file of fs.readdirSync(path.join(root,'data/predictions')).filter(f=>/^\d{8}\.json$/.test(f)).sort()) {
    const data=JSON.parse(fs.readFileSync(path.join(root,'data/predictions',file)));
    for(const r of input.mergePredictionSources(data.predictions,data.verificationPredictions)) {
      const key=input.raceKey(r),reason=input.preDeadlineReason(r);
      if(reason){reject(reason);continue;}
      if(r.practicalPriorityShadow?.sourceSelectionFingerprint!==protocol.sourceSelectionFingerprint){reject('different-or-unrecorded-generation');continue;}
      if(inspected.has(key)){reject('already-inspected-diagnostic-race');continue;}
      const a=(r.prediction?.practicalTickets || []).map(ticketOf);
      if(!a.length || a.length>10 || a.some(t=>!t) || new Set(a).size!==a.length){reject('invalid-practical');continue;}
      const c=replacement(r);
      selected.push({raceKey:key,date:r.date,a,b:c?.candidate || a,changed:Boolean(c),replacement:c?{add:c.add,remove:c.remove,index:c.index}:null});
    }
  }
  const official=input.collectOfficialResults(path.join(root,'data/results'),new Set(selected.map(r=>r.raceKey))),rows=[];
  for(const r of selected){const result=official.get(r.raceKey);
    if(!result){reject('official-result-missing');continue;}
    if(result.void || result.status==='void' || result.refund || result.refunded || result.refunds?.length || result.starts?.some(s=>s.falseStart||s.lateStart) || (result.finishers?.length && result.finishers.length!==6)){reject('refund-or-void');continue;}
    const actual=input.actualTicket(result),payout=result.trifecta?.payout;
    if(!actual || !Number.isFinite(payout) || payout<=0){reject('invalid-result-or-payout');continue;}
    rows.push({...r,actual,payout});
  }
  const discovery=metrics(rows.filter(r=>r.date<=protocol.discoveryEndDate));
  const evaluation=metrics(rows.filter(r=>r.date>=protocol.evaluationStartDate));
  const checks={enoughEvaluation: evaluation.affected>=protocol.minimumEvaluationAffectedRaces,
    discoveryPositive:discovery.hitDelta>0 && discovery.returnDelta>0,
    evaluationPositive:evaluation.hitDelta>0 && evaluation.returnDelta>0,
    noLargestGainDependence:evaluation.returnDeltaWithoutLargestGain>0,
    exactTest:evaluation.oneSidedP<=protocol.maximumOneSidedBinomialPValue};
  const report={id:protocol.id,sourceCommit:process.env.GITHUB_SHA || null,protocol,
    protocolFingerprint:crypto.createHash('sha256').update(JSON.stringify(protocol)).digest('hex'),
    generatedAt:new Date().toISOString(),retrospective:true,productionChanged:false,
    excluded,discovery,evaluation,checks,decision:Object.values(checks).every(Boolean)?'review-candidate':'reject-fixed-candidate',
    rows:rows.filter(r=>r.changed)};
  fs.writeFileSync(path.join(root,'data/stats/inside-third-hold-research-v1.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,rows:undefined}));return report;
}
if(require.main===module)main();
module.exports={replacement,metrics,exactP,main};
