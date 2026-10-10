'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {hash,json,validSeal,protocol}=require('./partner-forward.cjs');
const {replay}=require('./research-partner-third-coverage.cjs');
const evidence=require('./partner-exchange-evidence.cjs');
function build(root,ref,comparisonBytes,readAt) {
  const comparison=JSON.parse(comparisonBytes),raw=readAt('data/stats/partner-forward-report.json'),saved=JSON.parse(raw);
  assert.equal(comparison.inputCommit,ref,'wrong comparison input');
  assert.equal(comparison.version,'partner-third-evidence-guard-v1','wrong comparison version');
  assert.equal(hash(raw),comparison.sourceReport.sha256,'wrong source report');
  assert.equal(comparison.sealed,100);assert.equal(comparison.replayed,100);
  assert.equal(saved.rows.length,100);assert.equal(saved.method,comparison.method);
  const keys=[...comparison.rows.map(r=>r.raceKey),...comparison.excluded.map(r=>r.raceKey),...comparison.pending];
  assert.equal(keys.length,100);assert.equal(new Set(keys).size,100);
  assert.deepEqual([...keys].sort(),saved.rows.map(r=>r.snapshot.raceKey).sort(),'cohort mismatch');
  const byKey=new Map(comparison.rows.map(r=>[r.raceKey,r]));
  // No outcomes enter project. Every source retains the existing replay gate.
  const projected=saved.rows.map(receipt=>{
    const s=receipt.snapshot;
    assert(validSeal(receipt,protocol(root,s.method)),'invalid seal');
    assert.deepEqual(JSON.parse(readAt(`data/partner-forward/${s.date}/${s.raceKey}-${hash(json(receipt))}.json`)),receipt);
    const bytes=readAt(s.sourcePath),replayed=replay(root,receipt,bytes),previous=byKey.get(s.raceKey);
    if(previous)for(const key of ['sourceSha256','snapshotHash','baseline','control','guarded','thirdGuard'])assert.deepEqual(previous[key],replayed[key],`comparison ${key} mismatch`);
    return evidence.project(JSON.parse(bytes).record,s);
  });
  return {version:'partner-exchange-evidence-v1',generatedAt:new Date().toISOString(),inputCommit:ref,
    comparisonSha256:hash(comparisonBytes),sourceReportSha256:hash(raw),method:saved.method,sourceSlots:projected.length,
    ...evidence.summarize(projected,comparison),productionChanged:false,usableForPrediction:false,automaticApplication:false,
    selectionChanged:false,untouchedHoldout:false,
    limitations:['Diagnostic only; no new selector or causal race reconstruction.',
      'Unknown eligibility is not false; expansion eligibility is not ordinary purchase eligibility.',
      'Scenario references and prose are not a complete scenario-conditioned third-place score.',
      'Mixed groups concern the stated coarse descriptors, not all available ST, exhibition or scenario information.']};
}
if(require.main===module) {
  const [ref,comparisonFile,out]=process.argv.slice(2),root=path.resolve(__dirname,'..');
  assert(/^[a-f0-9]{40}$/.test(ref||'')&&comparisonFile&&out,'fixed input commit, comparison file and new output required');
  const readAt=file=>execFileSync('git',['show',`${ref}:${file}`],{cwd:root,maxBuffer:128*1024*1024});
  const result=build(root,ref,fs.readFileSync(comparisonFile),readAt),target=path.resolve(out);
  assert(!target.startsWith(path.join(root,'data')+path.sep),'saved data output forbidden');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({...result,details:undefined},null,2));
}
module.exports={build};
