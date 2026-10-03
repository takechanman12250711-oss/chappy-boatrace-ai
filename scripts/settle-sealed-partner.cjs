'use strict';
// Result-only continuation of the immutable 2026-09-28 candidate artifact.
// No capture, inference, fitting, ticket regeneration, or production writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {settle}=require('./partner-frozen-day.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const EXPECTED=Object.freeze({
  id:10951677542,run:36378589197,head:'3954d1eb1827c2e228b3ba56cb893524ed034dc8',
  createdAt:'2026-09-28T04:38:53Z',name:'partner-frozen-candidates',
  digest:'sha256:98f0dd7f733aee6a9bd1b04f2b9430ff09ea7a20f4cc13b30343bd798045222d',
  files:{
    'snapshots.json':'77287290397cbf3f7804409b032486bf4c681823b2a771331df55c7583ee1cc8',
    'capture-manifest.json':'250597a40df65ac2257a0df2fdfa69f26a60fb0876fbc11b15197d98e4977164',
    'frozen-model.json':'be7e3ab7ee30b06b722924f549c8e5481aa5f42c930009ba861110c1de9f2965'
  },
  officialSourceCommit:'6a6a4cd12e36a90f0c84fb6f6d549cf1b790f8ca',
  officialSha256:'c6f0e102f2e7e73b98b0c40cf240551d68818aa3f378cab719b1edd1f830091b'
});
function verifyMetadata(meta){
  if(meta?.id!==EXPECTED.id||meta.name!==EXPECTED.name||meta.created_at!==EXPECTED.createdAt||
     meta.digest!==EXPECTED.digest||meta.workflow_run?.id!==EXPECTED.run||meta.workflow_run?.head_sha!==EXPECTED.head||
     meta.workflow_run?.repository_id!==1274947506||meta.workflow_run?.head_repository_id!==1274947506)
    throw Error('sealed-artifact-provenance-mismatch');
  return meta.created_at;
}
function verifyFiles(dir){
  for(const [name,expected] of Object.entries(EXPECTED.files)){
    const file=path.join(dir,name);
    if(fs.lstatSync(file).isSymbolicLink()||sha(fs.readFileSync(file))!==expected)throw Error('sealed-file-changed:'+name);
  }
}
function evaluate(dir,officialFile,metadata){
  const sealedAt=verifyMetadata(metadata);verifyFiles(dir);
  const bytes=fs.readFileSync(officialFile);
  if(sha(bytes)!==EXPECTED.officialSha256)throw Error('official-source-changed');
  const doc=JSON.parse(fs.readFileSync(path.join(dir,'snapshots.json')));
  const report=settle(doc,JSON.parse(bytes).races,sealedAt);
  if(report.canonicalRaces!==22||report.settledRaces!==22||report.excluded.length||report.prospective.base.races!==3)
    throw Error('sealed-cohort-incomplete');
  verifyFiles(dir);
  report.sealedSnapshotFileSha256=EXPECTED.files['snapshots.json'];
  report.resultSource={commit:EXPECTED.officialSourceCommit,sha256:EXPECTED.officialSha256};
  report.artifact={id:EXPECTED.id,run:EXPECTED.run,createdAt:sealedAt,digest:EXPECTED.digest};
  report.prospectiveDiagnosis=report.rows.filter(r=>r.prospective).map(r=>({
    raceKey:r.raceKey,actual:r.actual,mainHead:r.rankingInput.head,actualHead:Number(r.actual[0]),
    mainHeadMatched:r.rankingInput.head===Number(r.actual[0]),
    actualHeadTicketsUnchanged:JSON.stringify(r.base.filter(t=>t[0]===r.actual[0]))===JSON.stringify(r.candidate.filter(t=>t[0]===r.actual[0])),
    baseHit:r.base.includes(r.actual),candidateHit:r.candidate.includes(r.actual)
  }));
  report.adoptionStatus='NOT_APPROVED';
  report.limitations=['Three pre-deadline research snapshots only; not final exhibition predictions.',
    'Nineteen retrospective replays remain separate from three sealed prospective observations.',
    'The candidate changes main-head partners only and preserves alternative-head tickets.'];
  return report;
}
if(require.main===module){
  const [dir,official,metadata,out]=process.argv.slice(2);
  const report=evaluate(path.resolve(dir),path.resolve(official),JSON.parse(fs.readFileSync(metadata)));
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({prospective:report.prospective,retrospective:report.retrospective,diagnosis:report.prospectiveDiagnosis,adoptionStatus:report.adoptionStatus}));
}
module.exports={EXPECTED,verifyMetadata,verifyFiles,evaluate};
