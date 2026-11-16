'use strict';

// Review artifact only. Not registered with the publisher, claim recovery or
// result ledger. A production presentation needs a separately reviewed adapter.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const scenario=require('./note-scenario-presentation.cjs');
const category=require('./note-category-article');
const {seriesOfBundle}=require('./note-article-series');
const {savedMainHead}=require('./note-free-explanation.cjs');
const {FREE_NOTICE}=require('./note-readable-article');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function explanation(bundle) {
  const p=bundle.record.prediction,head=savedMainHead(p),s=p.verificationEvidence?.mainScenario;
  const labels={escape:`${head}号艇逃げ`,sashi:'2コース差し',threeAttack:'3コース攻め',fourAttack:'4カド攻め'};
  if (!head || !labels[s?.type] || s.label!==labels[s.type]) return {verified:false,text:'展開の根拠は確認中です。'};
  const source=scenario.sourceSections(bundle,'normal').find(g=>g.label===category.NORMAL_LABELS[0]);
  if (!source?.tickets.length || source.tickets.some(t=>Number(t[0])!==head)) return {verified:false,text:'展開の根拠は確認中です。'};
  // Saved structured identity, not arbitrary old ranking prose. Describe only
  // factual input values; do not infer an advantage from one number.
  const boat=p.preRaceConditions?.boats?.find(b=>Number(b.boatNo)===head);
  const facts=[];
  const numeric=(value,min,max)=>typeof value==='number' && Number.isFinite(value) && value>=min && value<=max;
  if (numeric(boat?.avgST,0,1)) facts.push(`平均STは${boat.avgST.toFixed(2)}`);
  if (numeric(boat?.exhibitionST,0,1)) facts.push(`展示STは${boat.exhibitionST.toFixed(2)}`);
  if (numeric(boat?.exhibitionTime,5,9)) facts.push(`展示タイムは${boat.exhibitionTime.toFixed(2)}秒`);
  const other=p.preRaceConditions?.boats?.find(b=>Number(b.course)===Number(boat?.course)+1 && Number(b.boatNo)!==head);
  const comparison=boat?.courseOfficial===true && other?.courseOfficial===true &&
    numeric(other.exhibitionST,0,1) && numeric(boat?.exhibitionST,0,1)
    ? `\n隣の${other.boatNo}号艇の展示STは${other.exhibitionST.toFixed(2)}。展示STと平均STは分けて確認します。` : '';
  return {verified:true,text:`中心となる展開は${s.label}。`+(facts.length?`\n${head}号艇の${facts.join('、')}。`:'')+comparison};
}
function build(bundle,{sourceSha256}={}) {
  if (seriesOfBundle(bundle)!=='normal') throw Error('reader_preview_normal_only');
  if (!/^[a-f0-9]{64}$/.test(sourceSha256||'')) throw Error('reader_preview_source_hash_required');
  const baseline=scenario.sourceSubset(bundle),source=scenario.sourceSections(bundle,'normal');
  const seen=new Set(baseline),groups=[{label:'🎯 本命',tickets:[...baseline]}];
  const add=(label,tickets)=>{
    const unique=[...new Set(tickets)].filter(t=>!seen.has(t));
    unique.forEach(t=>seen.add(t));if(unique.length)groups.push({label,tickets:unique});
  };
  // The saved practical selection is shown once at the top. The main, cover
  // and flow pools are additional candidates, never a second competing main.
  const primary=source.filter(g=>g.label!==category.REFERENCE);
  add('追加候補',primary.filter(g=>g.label!==category.NORMAL_LABELS[3]).flatMap(g=>g.tickets));
  add('穴候補（配当未確認）',primary.filter(g=>g.label===category.NORMAL_LABELS[3]).flatMap(g=>g.tickets));
  const primaryCount=seen.size;
  const references=source.find(g=>g.label===category.REFERENCE)?.tickets||[];
  add('参考予想（別集計）',references);
  const allSource=new Set([...baseline,...source.flatMap(g=>g.tickets)]);
  if (seen.size!==allSource.size || [...seen].some(t=>!allSource.has(t))) throw Error('reader_preview_union_changed');
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
  if(displayed.length!==seen.size||new Set(displayed).size!==displayed.length||displayed.some(t=>!seen.has(t)))throw Error('reader_preview_display_invalid');
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
