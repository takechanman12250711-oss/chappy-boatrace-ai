'use strict';

// Review artifact only. Not registered with the publisher, claim recovery or
// result ledger. A production presentation needs a separately reviewed adapter.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const scenario=require('./note-scenario-presentation.cjs');
const category=require('./note-category-article');
const {seriesOfBundle}=require('./note-article-series');
const reader=require('../js/forecast-reader-contract');
const {FREE_NOTICE}=require('./note-readable-article');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function explanation(bundle) {
  const prediction=bundle.record.prediction;
  const source=scenario.sourceSections(bundle,'normal').find(g=>g.label===category.NORMAL_LABELS[0]);
  const head=reader.verifiedHead(prediction);
  if(!source?.tickets.length||!head||source.tickets.some(t=>Number(t[0])!==head))
    return {verified:false,text:'展開の根拠は確認中です。'};
  return reader.explanation(prediction);
}
function build(bundle,{sourceSha256}={}) {
  if (seriesOfBundle(bundle)!=='normal') throw Error('reader_preview_normal_only');
  if (!/^[a-f0-9]{64}$/.test(sourceSha256||'')) throw Error('reader_preview_source_hash_required');
  const baseline=scenario.sourceSubset(bundle),source=scenario.sourceSections(bundle,'normal');
  const primary=source.filter(g=>g.label!==category.REFERENCE);
  const references=source.find(g=>g.label===category.REFERENCE)?.tickets||[];
  const model=reader.groupTickets({
    centralTickets:baseline,
    additionalTickets:primary.filter(g=>g.label!==category.NORMAL_LABELS[3]).flatMap(g=>g.tickets),
    holeTickets:primary.filter(g=>g.label===category.NORMAL_LABELS[3]).flatMap(g=>g.tickets),
    referenceTickets:references
  });
  const {groups,primaryCount}=model;
  const allSource=new Set([...baseline,...source.flatMap(g=>g.tickets)]);
  if(model.allCount!==allSource.size||model.allTickets.some(t=>!allSource.has(t)))throw Error('reader_preview_union_changed');
  const e=explanation(bundle),record=bundle.record;
  if (!/^\d{8}$/.test(record.date)||!Number.isFinite(Date.parse(record.deadlineAt))) throw Error('reader_preview_identity_invalid');
  const deadline=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(Date.parse(record.deadlineAt));
  const heading=`${Number(record.date.slice(4,6))}月${Number(record.date.slice(6,8))}日 ${record.place}${record.raceNo}R｜締切 ${deadline}`;
  const section=g=>`${g.label}｜${g.tickets.length}点\n\n${category.formations(g.tickets)}`;
  const text=[heading,'展開予想\n'+e.text,section(groups[0]),
    ...groups.slice(1).map(section),
    `本命${baseline.length}点／追加候補を含む公開予想${primaryCount}点。すべて購入する前提ではありません。`,
    ...(references.length?[`参考予想は${references.length}点で別集計です。上記と同じ券は再掲していません。`]:[]),
    FREE_NOTICE].join('\n\n');
  const displayed=category.ticketsIn(text);
  if(displayed.length!==model.allCount||new Set(displayed).size!==displayed.length||displayed.some(t=>!model.allTickets.includes(t)))throw Error('reader_preview_display_invalid');
  return {version:'note-reader-preview-v1',previewOnly:true,publishable:false,sourceSha256,
    explanationVerified:e.verified,groups,primaryCount,referenceOriginalCount:references.length,
    referenceOverlapCount:references.filter(t=>primary.some(g=>g.tickets.includes(t))).length,
    sourceMembership:source,centralTickets:[...baseline],text};
}
if(require.main===module){
  const [source,output]=process.argv.slice(2);
  if(!source||!output||path.resolve(source)===path.resolve(output))throw Error('usage: node note-reader-preview.cjs BUNDLE OUTPUT');
  const bytes=fs.readFileSync(source),preview=build(JSON.parse(bytes),{sourceSha256:hash(bytes)});
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,preview.text+'\n');
  fs.writeFileSync(output+'.proof.json',JSON.stringify(preview,null,2)+'\n');
  console.log(JSON.stringify({previewOnly:true,publishable:false,explanationVerified:preview.explanationVerified,groups:preview.groups.map(g=>({label:g.label,count:g.tickets.length})),sourceSha256:preview.sourceSha256}));
}
module.exports={build,explanation};
