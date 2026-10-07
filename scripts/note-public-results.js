'use strict';
const {createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(value).digest('hex');
const {statusCounts,winningGroups,winningLabel,isPublishedSectionLabel}=require('./note-result-presentation');
const VERSION='published-main-race-result-v1';
const METHOD='published-main-sections-v1';
const LABELS={normal:'AI展開',escape:'本命',manshu:'万舟'};
const HEADINGS=['中心の買い目','相手を広げるなら','別の展開を考えるなら','高配当を狙うなら'];
const {winningProvenance,validatedReportOrigins}=require('./note-result-provenance');
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
  const settlement={...center,...common,status:matchedSections.length?'hit':'miss',matchedSections,evidenceId};
  return {settlement,tickets:section.unionTickets,provenance:winningProvenance(row,bytes,settlement,section,now)};
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
    if(matchedSections.some(s=>!Object.hasOwn(LABELS,s.articleSeries)||!isPublishedSectionLabel(s.articleSeries,s.label)))status='review';
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
    if(status==='hit')report.winningProvenance=members.map(r=>r.winningProvenance).filter(Boolean);
    return report;
  });
}
function summarizeRaceReports(reports) {
  const c={races:reports.length,hit:0,miss:0,pending:0,void:0,review:0};
  for(const report of reports){if(!Object.hasOwn(c,report.status)||report.status==='races')throw Error('public_results_status_invalid');c[report.status]++;}
  return c.races ? `公開${c.races}レース｜判定済み${c.hit+c.miss}R\n${statusCounts(c,'R')}` : '公開を確認できたレースはありません。';
}
function matchedLabel(report) {
  return winningLabel(report.matchedSections);
}
function hitText(report,indexUrl,previousDay=false) {
  if(report.status!=='hit'||report.evidenceId!==raceEvidenceId(report))throw Error('public_results_hit_unverified');
  const d=report.raceKey.slice(0,8),date=`${Number(d.slice(4,6))}/${Number(d.slice(6,8))}`;
  const groups=winningGroups(report.matchedSections);
  const single=report.matchedSections.length===1;
  const origins=validatedReportOrigins(report),categories=[...new Set(origins.map(o=>o.label))];
  const head=categories.length?`🎯 ${categories.join('・')}で的中！`:single?`🎯「${report.matchedSections[0].label}」で的中！`:'🎯 複数の掲載欄で的中！';
  const race=`🚤 ${previousDay?'前日分 ':''}${date} ${report.place}${report.raceNo}R`;
  const details=[`\n✅ 的中買い目 ${report.combination}`,`💴 公式払戻（100円あたり）${report.payoutPer100Yen.toLocaleString('ja-JP')}円`,
    `掲載全券${report.publishedTicketCount}点（重複なし・参考別集計）`];
  const tail=['\n公式結果',report.resultUrl,'📋 全結果一覧（無料）',indexUrl];
  const {weight}=require('./note-marketing-social');
  let text=[head,single?`${race}｜${groups[0].family}`:race,
    ...(!single?groups.map(g=>`📌 ${g.family}「${g.labels.join('／')}」`):categories.length?[`📌 掲載欄「${report.matchedSections[0].label}」`]:[]),...details,...tail].join('\n');
  // Every winning article family remains named; all exact section names are
  // always in the attached image and free index when X cannot hold them all.
  if(weight(text)>280)text=['🎯 的中',race,groups.map(g=>g.family.replace('予想','')).join('／'),
    '📌 的中した掲載欄は画像・無料一覧へ',`✅ 的中買い目 ${report.combination}`,
    `💴 公式払戻（100円）${report.payoutPer100Yen.toLocaleString('ja-JP')}円`,
    `掲載全券${report.publishedTicketCount}点（重複なし・参考別集計）`,
    '公式結果',report.resultUrl,'📋 全結果（無料）',indexUrl].join('\n');
  if(weight(text)>280)throw Error('public_results_text_too_long');
  return text;
}
function publicRecapCopy(rows,reports,indexUrl,now,{date,late=false,supplement=false}={}) {
  const {dateOf,timeOf,weight}=require('./note-marketing-social');
  date ||=dateOf(now);
  const selected=reports.filter(r=>r.raceKey.startsWith(date+'-'));
  if(!selected.length)return null;
  const centerRows=rows.filter(r=>r.raceKey.startsWith(date+'-'));
  const label=d=>`${Number(d.slice(4,6))}/${Number(d.slice(6,8))}`;
  const tally=Object.fromEntries(['hit','miss','review','pending','void'].map(status=>[status,selected.filter(r=>r.status===status).length]));
  let text=[`📊 ${late?'前日分 ':''}${label(date)} ${supplement?'結果追記':'結果まとめ'}`,
    `${centerRows.length}記事・${selected.length}レース（重複なし）`,
    '',statusCounts(tally,'R'),'',
    '本命・押さえ・展開・万舟の掲載券で判定。参考は別集計。',
    '種類別・中心のみの従来成績も無料一覧に掲載。',
    `🕒 ${label(dateOf(now))} ${timeOf(now)}時点`,indexUrl].join('\n');
  if(weight(text)>280)text=[`📊 ${late?'前日分 ':''}${label(date)} ${supplement?'結果追記':'結果まとめ'}`,
    `${centerRows.length}記事・${selected.length}レース（重複なし）`,statusCounts(tally,'R'),
    '掲載全券で判定（参考別集計）。種類別・中心のみは無料一覧へ。',
    `🕒 ${label(dateOf(now))} ${timeOf(now)}時点`,indexUrl].join('\n');
  if(weight(text)>280)throw Error('public_results_recap_too_long');return text;
}
module.exports={validatedRaceStatus,combinedStatus,summarizePublicRows,VERSION,METHOD,HEADINGS,LABELS,raceEvidenceId,settlePublic,raceReports,summarizeRaceReports,matchedLabel,hitText,publicRecapCopy};
