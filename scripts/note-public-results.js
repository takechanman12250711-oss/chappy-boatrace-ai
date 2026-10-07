'use strict';
const {createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(value).digest('hex');
const VERSION='published-main-race-result-v1';
const METHOD='published-main-sections-v1';
const LABELS={normal:'AI展開',escape:'本命',manshu:'万舟'};
const HEADINGS=['中心の買い目','相手を広げるなら','別の展開を考えるなら','高配当を狙うなら'];
function raceEvidenceId(report) {
  return digest([report.version,report.raceKey,report.sourceSha256,report.combination,
    report.payoutPer100Yen,report.publishedTicketCount,JSON.stringify(report.matchedSections)].join('|'));
}
// Preserve row.settlement as the old center-only ledger. This is a separate,
// versioned result, based solely on proof of the actual published primary set.
function settlePublic(row,bytes,center,now) {
  const {publishedTicketSections}=require('./note-published-ticket-sections');
  if(center.status==='review')return {settlement:{status:'review',reason:center.reason,method:METHOD}};
  const section=publishedTicketSections(row,bytes,now);
  if(section.status!=='verified')return {settlement:{status:section.status,reason:section.reason,method:METHOD}};
  const common={method:METHOD,publishedTicketCount:section.publishedTicketCount,sectionsSha256:section.sectionsSha256,
    referenceTicketCount:section.referenceTicketCount||0};
  if(!['hit','miss'].includes(center.status))return {settlement:{...center,...common},tickets:section.unionTickets};
  const matchedSections=section.sections.filter(s=>s.tickets.includes(center.combination)).map(s=>s.label);
  const evidenceId=digest([METHOD,row.publicationKey,row.sourceSha256,section.sectionsSha256,center.combination,center.payoutPer100Yen].join('|'));
  return {settlement:{...center,...common,status:matchedSections.length?'hit':'miss',matchedSections,evidenceId},tickets:section.unionTickets};
}
function combinedStatus(settlements) {
  const values=new Set(settlements.map(s=>s?.status||'review'));
  if(values.has('review'))return 'review';
  if(values.has('pending'))return 'pending';
  if(values.size===1&&values.has('void'))return 'void';
  if(values.has('void'))return 'review';
  return values.has('hit')?'hit':'miss';
}
function validatedRaceStatus(members) {
  const first=members[0],settlements=members.map(r=>r.publishedSettlement||{status:'review'});
  let status=combinedStatus(settlements);
  const resolved=settlements.filter(s=>['hit','miss'].includes(s.status));
  if(new Set(resolved.map(s=>[s.combination,s.payoutPer100Yen,s.resultUrl].join('|'))).size>1)status='review';
  if(members.some(r=>r.place!==first.place||r.raceNo!==first.raceNo||r.deadlineAt!==first.deadlineAt))status='review';
  if(resolved.some(s=>!Number.isInteger(s.publishedTicketCount)||s.publishedTicketCount<1||s.publishedTicketCount>120))status='review';
  return status;
}
function summarizePublicRows(rows) {
  const groups=new Map();for(const row of rows){if(!groups.has(row.raceKey))groups.set(row.raceKey,[]);groups.get(row.raceKey).push(row);}
  return summarizeRaceReports([...groups.values()].map(group=>({status:validatedRaceStatus(group)})));
}
function raceReports(rows,ticketSets) {
  if(new Set(rows.map(r=>r.publicationKey)).size!==rows.length)throw Error('public_results_duplicate_publication');
  const groups=new Map();
  for(const row of rows){if(!groups.has(row.raceKey))groups.set(row.raceKey,[]);groups.get(row.raceKey).push(row);}
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([raceKey,members])=>{
    members.sort((a,b)=>a.publicationKey.localeCompare(b.publicationKey));
    const first=members[0],settlements=members.map(r=>r.publishedSettlement||{status:'review',reason:'published_evidence_missing'});
    let status=validatedRaceStatus(members);
    const resolved=settlements.filter(s=>['hit','miss'].includes(s.status));
    const allKnown=members.every(r=>Array.isArray(ticketSets.get(r.publicationKey)));
    const union=allKnown?[...new Set(members.flatMap(r=>ticketSets.get(r.publicationKey)))].sort():[];
    if(['hit','miss'].includes(status)&&(!allKnown||!union.length||union.length>120))status='review';
    const matchedSections=members.flatMap(r=>(r.publishedSettlement?.matchedSections||[]).map(label=>({articleSeries:r.articleSeries,label})));
    if(matchedSections.some(s=>!Object.hasOwn(LABELS,s.articleSeries)||!HEADINGS.includes(s.label)))status='review';
    const sources=members.map(r=>({publicationKey:r.publicationKey,sourceSha256:r.sourceSha256,publishedAt:r.publishedAt,
      sectionsSha256:r.publishedSettlement?.sectionsSha256||null,status:r.publishedSettlement?.status||'review',
      evidenceId:r.publishedSettlement?.evidenceId||null}));
    const firstSeen=members.map(r=>r.publicResultObservation?.firstResultSeenAt).filter(t=>Number.isFinite(Date.parse(t))).sort();
    const noteTimes=members.map(r=>r.publicResultObservation?.noteVerifiedAt).filter(t=>Number.isFinite(Date.parse(t))).sort();
    const report={version:VERSION,publicationKey:raceKey+':published-main',raceKey,place:first.place,raceNo:first.raceNo,
      deadlineAt:first.deadlineAt,publishedAt:members.map(r=>r.publishedAt).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1),
      articleSeries:[...new Set(members.map(r=>r.articleSeries))].sort(),publishedArticles:members.length,
      publishedTicketCount:allKnown?union.length:null,status,matchedSections,
      sources,sourceSha256:digest(JSON.stringify(sources)),
      combination:resolved[0]?.combination||null,payoutPer100Yen:resolved[0]?.payoutPer100Yen||null,resultUrl:first.resultUrl,
      firstResultSeenAt:firstSeen.at(-1)||null,noteVerifiedAt:noteTimes.length===members.length?noteTimes.at(-1):null};
    if(['hit','miss'].includes(status))report.evidenceId=raceEvidenceId(report);
    return report;
  });
}
function summarizeRaceReports(reports) {
  const c={races:reports.length,hit:0,miss:0,pending:0,void:0,review:0};
  for(const report of reports){if(!Object.hasOwn(c,report.status)||report.status==='races')throw Error('public_results_status_invalid');c[report.status]++;}
  return `公開${c.races}レース｜判定済み${c.hit+c.miss}R中${c.hit}的中・${c.miss}不的中｜結果待ち${c.pending}・不成立${c.void}・確認中${c.review}`;
}
function matchedLabel(report) {
  return report.matchedSections.map(s=>`${LABELS[s.articleSeries]}・${s.label}`).join('／');
}
function hitText(report,indexUrl,previousDay=false) {
  if(report.status!=='hit'||report.evidenceId!==raceEvidenceId(report))throw Error('public_results_hit_unverified');
  const d=report.raceKey.slice(0,8),date=`${Number(d.slice(4,6))}/${Number(d.slice(6,8))}`;
  const head=`${previousDay?'前日分 ':''}${date} ${report.place}${report.raceNo}R 的中`;
  const base=[head,`掲載全券${report.publishedTicketCount}点（参考別集計）`,`確定 ${report.combination}`,
    `公式払戻（100円あたり）${report.payoutPer100Yen.toLocaleString('ja-JP')}円`];
  const tail=['公式結果',report.resultUrl,'全結果一覧（無料）',indexUrl];
  const {weight}=require('./note-marketing-social');
  let text=[...base,`的中欄：${matchedLabel(report)}`,...tail].join('\n');
  if(weight(text)>280)text=[...base,'的中欄は画像・全結果一覧に掲載',...tail].join('\n');
  if(weight(text)>280)throw Error('public_results_text_too_long');
  return text;
}
function publicRecapCopy(rows,reports,indexUrl,now,{date,late=false,supplement=false}={}) {
  const {dateOf,timeOf,weight}=require('./note-marketing-social');
  date ||=dateOf(now);
  const selected=reports.filter(r=>r.raceKey.startsWith(date+'-'));
  if(!selected.length)return null;
  const c=status=>selected.filter(r=>r.status===status).length;
  const centerRows=rows.filter(r=>r.raceKey.startsWith(date+'-'));
  const centerHit=centerRows.filter(r=>r.settlement?.status==='hit').length;
  const centerMiss=centerRows.filter(r=>r.settlement?.status==='miss').length;
  const label=d=>`${Number(d.slice(4,6))}/${Number(d.slice(6,8))}`;
  const text=[`${late?'前日分 ':''}${label(date)} 全掲載券の${supplement?'結果追記':'結果まとめ'}`,
    `${centerRows.length}記事・${selected.length}レース（重複なし）`,
    `${c('hit')}的中／${c('miss')}不的中`,`確認中${c('review')}・結果待ち${c('pending')}・不成立${c('void')}`,
    '本命・押さえ・展開・万舟の掲載券で判定。参考は別集計。',
    `中心のみ（従来・記事別）：${centerHit}的中／${centerMiss}不的中`,
    `${label(dateOf(now))} ${timeOf(now)}時点｜種類・的中欄は無料一覧へ`,indexUrl].join('\n');
  if(weight(text)>280)throw Error('public_results_recap_too_long');return text;
}
module.exports={validatedRaceStatus,combinedStatus,summarizePublicRows,VERSION,METHOD,HEADINGS,LABELS,raceEvidenceId,settlePublic,raceReports,summarizeRaceReports,matchedLabel,hitText,publicRecapCopy};
