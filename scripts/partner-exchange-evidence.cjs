'use strict';
// Diagnostic projection only: no ticket selection, thresholds, odds or results.
const {groundedPositions}=require('./research-escape-partners.cjs');
const list=x=>Array.isArray(x)?x:[];
const unique=x=>[...new Set(x)].sort();
const ticketOf=x=>typeof x==='string'?x:x?.ticket;
function exchangeKind(baseline,proposed) {
  const removed=baseline.filter(t=>!proposed.includes(t)),added=proposed.filter(t=>!baseline.includes(t));
  if(!removed.length&&!added.length)return 'unchanged';
  const pairs=ts=>ts.map(t=>t.slice(0,3)).sort().join('|');
  return pairs(removed)===pairs(added)?'third-only':'first-second-reallocation';
}
function observations(prediction,ticket) {
  // Named ticket-bearing contracts only. Do not borrow manshu boat-wide role
  // scores or parse Japanese prose into structured scenario-specific evidence.
  const locations=[['practicalTickets',prediction.practicalTickets],['candidate24Tickets',prediction.candidate24Tickets],
    ...['tickets','coverTickets','flowTickets'].map(k=>['mainSheet.'+k,prediction.mainSheet?.[k]])];
  return locations.flatMap(([source,rows])=>list(rows).flatMap((r,index)=>ticketOf(r)===ticket&&typeof r==='object'?[{source:`prediction.${source}[${index}]`,row:r}]:[]));
}
function flag(rows,key) {
  const values=unique(rows.map(x=>x.row[key]).filter(x=>typeof x==='boolean'));
  return values.length>1?'conflicting':values.length===0?'unknown':values[0]?'true':'false';
}
function detail(record,ticket) {
  const decisions=list(record.practicalSelectionEvidence?.candidateDecisions).filter(d=>d.ticket===ticket);
  const obs=observations(record.prediction,ticket);
  const positions=decisions.map(d=>groundedPositions(d));
  const ids=unique(obs.flatMap(x=>list(x.row.validScenarioIds).concat(typeof x.row.scenarioId==='string'?[x.row.scenarioId]:[])).filter(x=>typeof x==='string'&&x));
  return {ticket,reasonCodes:unique(decisions.map(d=>d.reasonCode).filter(Boolean)),
    priorities:unique(decisions.map(d=>d.priorityScore).filter(Number.isFinite)),
    anyThirdRole:positions.some(p=>p.includes(3)),anyCompleteObservation:positions.some(p=>p.length===3),
    allObservationsComplete:positions.length>0&&positions.every(p=>p.length===3),
    purchaseEligible:flag(obs,'purchaseEligible'),expansionEligible:flag(obs,'expansionEligible'),
    preservationRequired:flag(obs,'preservationRequired'),scenarioReferences:ids,
    hasIndependentReferences:obs.some(x=>list(x.row.validIndependentBranchIds).length>0||list(x.row.independentBranchIds).length>0),
    hasRequirementReferences:decisions.some(d=>list(d.requirementIds).length>0),
    hasNarrativeEvidence:obs.some(x=>list(x.row.evidenceReasons).length>0),
    // These are explicit stored fields, not numbers parsed from a comment.
    hasStructuredThirdScore:obs.some(x=>Number.isFinite(x.row.thirdScore)||list(x.row.physicalCoverage).some(c=>Number(c.position)===3&&Number(c.boatNo)===Number(ticket[4])&&Number.isFinite(c.score))),
    sources:obs.map(x=>x.source)};
}
function project(record,snapshot) {
  const baseline=snapshot.baseline,proposed=snapshot.guarded;
  const removed=baseline.filter(t=>!proposed.includes(t)).map(t=>detail(record,t));
  const added=proposed.filter(t=>!baseline.includes(t)).map(t=>detail(record,t));
  const scenario=record.prediction.preRaceConditions?.escapeEvaluationEvidence?.raceScenarios?.mainScenario;
  const kind=exchangeKind(baseline,proposed);
  // Deliberately coarse, pre-outcome descriptors. A mixed outcome group only
  // establishes that THESE flags do not perfectly separate gains and losses.
  const structuralProfile={kind,mainScenario:scenario?.type||'unknown',
    allAddedComplete:added.length>0&&added.every(x=>x.allObservationsComplete),
    allRemovedHaveThird:removed.length>0&&removed.every(x=>x.anyThirdRole),
    allAddedCandidateOnly:added.length>0&&added.every(x=>x.reasonCodes.length===1&&x.reasonCodes[0]==='CANDIDATE_ONLY_EVALUATION')};
  return {raceKey:snapshot.raceKey,sourcePath:snapshot.sourcePath,sourceSha256:snapshot.sourceSha256,
    kind,removed,added,structuralProfile,profileKey:JSON.stringify(structuralProfile)};
}
function summarize(projected,comparison) {
  const settled=new Map(comparison.rows.map(r=>[r.raceKey,r]));
  const excluded=new Map(comparison.excluded.map(r=>[r.raceKey,r.reason]));
  const pending=new Set(comparison.pending),counts={},groups=new Map(),details=[];
  for(const row of projected) {
    const r=settled.get(row.raceKey);
    const outcome=r?(r.baseline.includes(r.actual)?r.guarded.includes(r.actual)?'both-hit':'lost':r.guarded.includes(r.actual)?'gained':'both-miss')
      :excluded.has(row.raceKey)?'excluded':pending.has(row.raceKey)?'pending':'unmatched';
    if(outcome==='unmatched')throw Error('comparison row missing');
    counts[row.kind]=(counts[row.kind]||0)+1;
    if(row.kind==='unchanged')continue;
    if(!groups.has(row.profileKey))groups.set(row.profileKey,{profile:row.structuralProfile,races:0,outcomes:{},raceKeys:[]});
    const g=groups.get(row.profileKey);g.races++;g.outcomes[outcome]=(g.outcomes[outcome]||0)+1;g.raceKeys.push(row.raceKey);
    details.push({...row,outcome,actual:r?.actual||null,exclusion:excluded.get(row.raceKey)||null});
  }
  const changed=projected.filter(r=>r.kind!=='unchanged');
  const ticketCoverage=side=>{
    const tickets=changed.flatMap(r=>r[side]);
    return {occurrences:tickets.length,purchaseEligibility:Object.fromEntries(['true','false','unknown','conflicting'].map(k=>[k,tickets.filter(t=>t.purchaseEligible===k).length])),
      withScenarioReferences:tickets.filter(t=>t.scenarioReferences.length>0).length,
      withThirdRole:tickets.filter(t=>t.anyThirdRole).length,withStructuredThirdScore:tickets.filter(t=>t.hasStructuredThirdScore).length,
      withNarrativeEvidence:tickets.filter(t=>t.hasNarrativeEvidence).length,withRequirementReferences:tickets.filter(t=>t.hasRequirementReferences).length};
  };
  const profiles=[...groups.values()];
  return {raceCounts:counts,changedRaces:changed.length,ticketCoverage:{removed:ticketCoverage('removed'),added:ticketCoverage('added')},
    mixedGainLossProfiles:profiles.filter(g=>g.outcomes.gained&&g.outcomes.lost).length,profiles,details};
}
module.exports={exchangeKind,observations,detail,project,summarize};
