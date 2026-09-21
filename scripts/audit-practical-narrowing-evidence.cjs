'use strict';
// Read-only diagnosis. Never infer removal reasons from the official winner.
const fs = require('node:fs');
const path = require('node:path');
const value = x => typeof x === 'string' ? x : x?.ticket;
const tickets = a => (Array.isArray(a) ? a : []).map(value).sort();
function diagnose(review, bundle, originals) {
  const record = bundle?.record;
  if (!record || record.raceKey !== review.raceKey || record.selectedAt !== review.selectedAt)
    return {raceKey:review.raceKey,status:'BUNDLE_TIMESTAMP_MISMATCH'};
  const practical = record.prediction?.practicalTickets || [];
  const exact = originals.filter(r => r.raceKey === record.raceKey && r.selectedAt === record.selectedAt &&
    JSON.stringify(tickets(r.prediction?.practicalTickets)) === JSON.stringify(tickets(practical)));
  const saved = exact.flatMap(r => {
    const p = r.prediction || {}, s = p.practicalSelection || {};
    return [...(s.candidateDecisions || []),...(s.excludedCandidates || []),
      ...(s.targetDecisions || []).flatMap(t => t.candidateDecisions || [])];
  }).filter(d => value(d) === review.actual);
  const reasons = [...new Set(saved.map(d => d.reasonCode).filter(Boolean))];
  const candidate = record.prediction?.candidate24Tickets?.find(t => value(t) === review.actual);
  return {raceKey:review.raceKey,selectedAt:review.selectedAt,classification:review.classification,
    actual:review.actual,originalMatchCount:exact.length,
    status:reasons.length?'SAVED_REASON_FOUND':exact.length?'MATCHED_SOURCE_REASON_MISSING':'EXACT_SOURCE_NOT_FOUND',
    candidateCategory:candidate?.category || null,recordedReasons:reasons,
    practical:practical.map(t=>({ticket:value(t),category:t.category,priorityScore:t.priorityScore})),
    decisionEvidence:saved.map(d=>({ticket:value(d),selected:d.selected,reasonCode:d.reasonCode,reason:d.reason}))};
}
function main(root=path.resolve(__dirname,'..')) {
  const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
  const progress=read('data/stats/race-review-progress.json');
  const cohort=progress.cohorts.find(c=>c.active && !c.legacy);
  if(!cohort)throw Error('No active cohort');
  const rows=[];
  // Process one date at a time; never retain all large daily originals.
  const targets=cohort.selectionLoss.rows;
  for(const date of [...new Set(targets.map(r=>r.raceKey.slice(0,8)))]){
    const daily=read(`data/predictions/${date}.json`);
    const originals=[...(daily.predictions||[]),...(daily.verificationPredictions||[])];
    const dir=path.join(root,'data/note-drafts',date);
    const files=fs.existsSync(dir)?fs.readdirSync(dir):[];
    for(const target of targets.filter(r=>r.raceKey.startsWith(date))){
      const bundles=files.filter(f=>f.startsWith(target.raceKey+'-')&&f.endsWith('.json')).map(f=>read(`data/note-drafts/${date}/${f}`));
      const bundle=bundles.find(b=>b.record?.selectedAt===target.selectedAt);
      rows.push(diagnose(target,bundle,originals));
    }
  }
  const out={schemaVersion:1,generatedAt:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA,
    sourceReportGeneratedAt:progress.generatedAt,method:cohort.method,productionChanged:false,
    candidateDefined:false,performanceImprovementVerified:false,rows};
  const output=path.join(root,'data/stats/practical-narrowing-evidence-audit.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output+'.tmp',JSON.stringify(out,null,2)+'\n');fs.renameSync(output+'.tmp',output);
  console.log(JSON.stringify({...out,rows:rows.map(r=>({...r,practical:undefined,decisionEvidence:undefined}))}));
}
if(require.main===module)main();
module.exports={diagnose};
