'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {settlePublic,raceReports,raceEvidenceId,hitText,publicRecapCopy,summarizePublicRows,summarizeRaceReports,HEADINGS,VERSION}=require('./note-public-results');
const {settlePublished,observeResult,markResultsVerified,publishedOutcomeLine}=require('./note-marketing-reports');
const {LEGACY_READABLE}=require('./note-published-ticket-sections');
const {fixture}=require('./note-independent-monitor-fixture');
const {weight}=require('./note-marketing-social');
const {publicContent,altText}=require('./note-result-card.cjs');
const marketing=require('../config/note-marketing.json');
const sha=value=>createHash('sha256').update(value).digest('hex');
function input(changeBundle=()=>{}) {
 const b=fixture();b.version='note-draft-bundle-v1';delete b.monitor;delete b.record.source;
 b.record.prediction.mainSheet={tickets:['1-2-3','1-3-2'],coverTickets:['2-1-3'],flowTickets:['3-1-2']};
 b.record.prediction.manshuSheet={tickets:['4-1-2']};b.record.prediction.candidate24Tickets=['6-5-4'];
 b.article.format='formation-v4';b.article.paidText='🔥 実戦厳選\n1-2-34\n計 2点\n\n本命とは別会計の参考予想\n5-1-2';
 changeBundle(b);
 const bytes=JSON.stringify(b),deadline=Date.parse(b.record.deadlineAt),now=deadline+3600000;
 const row={raceKey:b.record.raceKey,publicationKey:b.record.raceKey+':normal',articleSeries:'normal',place:b.record.place,raceNo:b.record.raceNo,
  sourceSha256:sha(bytes),ticketCount:2,deadlineAt:b.record.deadlineAt,publishedAt:new Date(deadline-180000).toISOString(),
  url:'https://note.com/great_robin3243/n/nabcdef'};
 const [date,jcd,race]=row.raceKey.split('-');row.resultUrl=`https://www.boatrace.jp/owpc/pc/race/raceresult?hd=${date}&jcd=${jcd}&rno=${race}`;
 row.publicationEvidence={version:'note-publication-evidence-v1',receiptCommitSha:'a'.repeat(40),publisherCommitSha:'b'.repeat(40),sourceSha256:row.sourceSha256,...LEGACY_READABLE};
 function official(combination){return {ok:true,source:'boatrace-official',date,jcd,raceNo:Number(race),checkedAt:new Date(deadline+1800000).toISOString(),
  resultAvailable:true,status:'finished',resultUrl:row.resultUrl,trifecta:{combination,payout:2000},finishers:combination.split('-').map((boat,i)=>({rank:i+1,boat:Number(boat)}))};}
 return {b,bytes,row,now,official};
}
test('a published additional-section hit is new public hit while original center miss stays unchanged',()=>{
 const f=input(),o=f.official('4-1-2'),center=settlePublished(f.row,f.bytes,o,f.now);assert.equal(center.status,'miss');
 const before=JSON.stringify(center),publicResult=settlePublic(f.row,f.bytes,center,f.now);
 assert.equal(publicResult.settlement.status,'hit');assert.equal(publicResult.settlement.publishedTicketCount,6);
 assert.deepEqual(publicResult.settlement.matchedSections,['高配当を狙うなら']);assert.equal(JSON.stringify(center),before);
 f.row.settlement=center;f.row.publishedSettlement=publicResult.settlement;
 f.row.publicResultObservation=observeResult(f.row,publicResult.settlement,o,f.now);
 const marked=markResultsVerified([f.row],f.now+1000);
 const reports=raceReports(marked,new Map([[f.row.publicationKey,publicResult.tickets]]));
 assert.equal(reports[0].status,'hit');assert.equal(reports[0].evidenceId,raceEvidenceId(reports[0]));
 // Content contracts run before note UI without Python/fonts; PNG rendering has its own suite.
 const content=publicContent(reports[0],{now:f.now+2000});assert.equal(content.scope,'published-main');assert.equal(content.publishedTicketCount,6);
 assert(!JSON.stringify(content).includes('6-5-4'));assert(!JSON.stringify(content).includes(f.row.url));
});
test('only excluded reference or internal candidate hit remains miss; unknown publication proof remains review',()=>{
 for(const result of ['5-1-2','6-5-4']){const f=input(),center=settlePublished(f.row,f.bytes,f.official(result),f.now);
  assert.equal(settlePublic(f.row,f.bytes,center,f.now).settlement.status,'miss');}
 const f=input(),center=settlePublished(f.row,f.bytes,f.official('4-1-2'),f.now);delete f.row.publicationEvidence;
 assert.equal(settlePublic(f.row,f.bytes,center,f.now).settlement.status,'review');
});
test('verified original category leads the hit while exact published heading and article family remain visible',()=>{
 const f=input(),center=settlePublished(f.row,f.bytes,f.official('4-1-2'),f.now),result=settlePublic(f.row,f.bytes,center,f.now);
 assert(result.provenance);assert.equal(center.status,'miss');assert.equal(result.settlement.status,'hit');
 assert.deepEqual(result.provenance.origins,[{categoryId:'manshu',sourceField:'record.prediction.manshuSheet.tickets'}]);
 const plain={...f.row,settlement:center,publishedSettlement:result.settlement};
 const proven={...plain,winningProvenance:result.provenance},sets=new Map([[f.row.publicationKey,result.tickets]]);
 const before=JSON.stringify({f,center,result,plain,proven}),literalReport=raceReports([plain],sets)[0],report=raceReports([proven],sets)[0];
 assert.equal(report.publicationKey,literalReport.publicationKey);assert.equal(report.sourceSha256,literalReport.sourceSha256);
 assert.equal(report.evidenceId,literalReport.evidenceId);assert.deepEqual(report.matchedSections,literalReport.matchedSections);
 const text=hitText(report,marketing.index.url),note=publishedOutcomeLine(proven);
 assert(text.startsWith('🎯 万舟狙いで的中！\n🚤 '));assert(text.includes('｜AI展開予想\n📌 掲載欄「高配当を狙うなら」'));
 assert(note.startsWith('🎯 万舟狙いで的中！\n📌 的中した予想：AI展開予想\n「高配当を狙うなら」'));
 const index=require('./note-marketing-content').indexBody([proven],marketing,f.now);
 assert(index.includes(`🎯 万舟狙いで的中！｜${f.row.place}${f.row.raceNo}R\n📌 的中した予想：AI展開予想\n「高配当を狙うなら」`));
 assert(index.includes('中心のみの従来成績（記事別）'));assert(index.includes('❌ 不的中 1件'));
 const content=publicContent({...report,winningCategories:[{articleSeries:'escape',categoryId:'independent-escape',label:'独立本命'}]}, {now:f.now}),alt=altText(content);
 assert.deepEqual(content.winningCategories,[{articleSeries:'normal',categoryId:'manshu',label:'万舟狙い'}]);
 assert(alt.includes('的中欄：AI展開予想・高配当を狙うなら'));
 assert(alt.includes('元の予想区分：AI展開予想・万舟狙い'));assert(!alt.includes('独立本命'));
 const cloned=structuredClone(report),clonedContent=publicContent(cloned,{now:f.now}),clonedAlt=altText(clonedContent);
 assert.equal(cloned.status,'hit');assert.equal(clonedContent.status,'hit');assert.equal(cloned.evidenceId,report.evidenceId);
 assert(!Object.hasOwn(clonedContent,'winningCategories'));assert(!clonedAlt.includes('元の予想区分'));
 assert(clonedAlt.includes('的中欄：AI展開予想・高配当を狙うなら'));
 for(const value of [text,note]) {
  assert(value.includes('✅ 的中買い目 4-1-2'));assert.equal((value.match(/2,000円/g)||[]).length,1);
  assert(!value.includes('万舟的中'));assert(!value.includes('万舟配当'));assert(!value.includes('利益'));
  assert(!value.includes('回収率'));assert(!value.includes('6-5-4'));assert(!value.includes('5-1-2'));
 }
 assert(text.includes(f.row.resultUrl));assert(text.endsWith(marketing.index.url));assert(!text.includes(f.row.url));assert(weight(text)<=280);
 assert.equal(JSON.stringify({f,center,result,plain,proven}),before);
});
test('multiple verified original categories are explicit without renaming the published section',()=>{
 const f=input(b=>b.record.prediction.mainSheet.flowTickets.push('4-1-2'));
 const center=settlePublished(f.row,f.bytes,f.official('4-1-2'),f.now),result=settlePublic(f.row,f.bytes,center,f.now);
 assert.deepEqual(result.provenance.origins.map(o=>o.categoryId),['flow','manshu']);
 assert.deepEqual(result.settlement.matchedSections,['別の展開を考えるなら']);
 const row={...f.row,settlement:center,publishedSettlement:result.settlement,winningProvenance:result.provenance};
 const report=raceReports([row],new Map([[row.publicationKey,result.tickets]]))[0],before=JSON.stringify({row,report});
 for(const value of [hitText(report,marketing.index.url),publishedOutcomeLine(row)]) {
  assert(value.startsWith('🎯 流し・万舟狙いで的中！'));assert(value.includes('AI展開予想'));
  assert(value.includes('「別の展開を考えるなら」'));assert(!value.includes('独立万舟'));assert(!value.includes('万舟的中'));
 }
 assert(weight(hitText(report,marketing.index.url))<=280);assert.equal(JSON.stringify({row,report}),before);
});
test('missing or cloned provenance falls back to literal headings without changing established result identities',()=>{
 const f=input(),center=settlePublished(f.row,f.bytes,f.official('4-1-2'),f.now),result=settlePublic(f.row,f.bytes,center,f.now);
 const row={...f.row,settlement:center,publishedSettlement:result.settlement,winningProvenance:result.provenance};
 const sets=new Map([[row.publicationKey,result.tickets]]),verified=raceReports([row],sets)[0];
 for(const winningProvenance of [undefined,structuredClone(result.provenance),{...result.provenance,origins:[{categoryId:'main',sourceField:'record.prediction.mainSheet.tickets'}]}]) {
  const unproven={...row,winningProvenance},report=raceReports([unproven],sets)[0];
  assert.equal(report.evidenceId,verified.evidenceId);assert.equal(report.sourceSha256,verified.sourceSha256);
  const text=hitText(report,marketing.index.url),note=publishedOutcomeLine(unproven);
  assert(text.startsWith('🎯「高配当を狙うなら」で的中！'));assert(text.includes('｜AI展開予想'));
  assert(note.startsWith('🎯 的中\n📌 的中した予想：AI展開予想\n「高配当を狙うなら」'));
  for(const value of [text,note]){assert(!value.includes('万舟狙いで的中'));assert(!value.includes('本命で的中'));}
 }
 const persisted=structuredClone(verified);
 assert.equal(persisted.evidenceId,verified.evidenceId);assert(hitText(persisted,marketing.index.url).startsWith('🎯「高配当を狙うなら」で的中！'));
});
test('multiple winning article families keep their literal headings prominent when they fit',()=>{
 const f=input(),center=settlePublished(f.row,f.bytes,f.official('1-2-3'),f.now),result=settlePublic(f.row,f.bytes,center,f.now);
 const rows=['normal','escape'].map(articleSeries=>({...f.row,articleSeries,publicationKey:f.row.raceKey+':'+articleSeries,publishedSettlement:result.settlement}));
 const report=raceReports(rows,new Map(rows.map(r=>[r.publicationKey,result.tickets])))[0],text=hitText(report,marketing.index.url);
 assert(text.startsWith('🎯 複数の掲載欄で的中！\n🚤 '));
 assert(text.includes('📌 AI展開予想「中心の買い目」'));assert(text.includes('📌 独立本命予想「中心の買い目」'));
 assert(text.indexOf('📌 AI展開予想')<text.indexOf('✅ 的中買い目'));
 assert(text.indexOf('📌 独立本命予想')<text.indexOf('✅ 的中買い目'));assert(!text.includes('画像・無料一覧へ'));
 assert(weight(text)<=280);assert.equal(report.publishedArticles,2);
});
test('two article kinds for one race yield one hit and exact deduplicated stake-free count',()=>{
 const f=input(),o=f.official('4-1-2'),center=settlePublished(f.row,f.bytes,o,f.now),p=settlePublic(f.row,f.bytes,center,f.now);
 const a={...f.row,settlement:center,publishedSettlement:p.settlement},b={...a,publicationKey:f.row.raceKey+':escape',articleSeries:'escape'};
 const sets=new Map([[a.publicationKey,p.tickets],[b.publicationKey,['4-1-2','2-3-1']]]);
 const reports=raceReports([a,b],sets);assert.equal(reports.length,1);assert.equal(reports[0].publishedArticles,2);assert.equal(reports[0].publishedTicketCount,7);
 assert.equal(reports[0].matchedSections.length,2);assert(summarizePublicRows([a,b]).includes('公開1レース'));
 const text=hitText(reports[0],marketing.index.url,true);
 const date=f.row.raceKey.slice(0,8),day=`${Number(date.slice(4,6))}/${Number(date.slice(6,8))}`;
 assert(text.startsWith('🎯 '));assert(text.includes(`🚤 前日分 ${day} ${f.row.place}${f.row.raceNo}R`));
 assert(text.includes('AI展開'));assert(text.includes('独立本命'));
 if(text.includes('的中した掲載欄は画像・無料一覧へ')) {
  assert(text.includes('AI展開／独立本命'));
 } else {
  assert(text.includes('AI展開予想「高配当を狙うなら」'));assert(text.includes('独立本命予想「高配当を狙うなら」'));
 }
 assert(text.includes('掲載全券7点'));assert(weight(text)<=280);
 assert.equal((text.match(/公式払戻（100円(?:あたり)?）2,000円/g)||[]).length,1);
 assert.equal((text.match(/✅ 的中買い目 4-1-2/g)||[]).length,1);
 assert(text.includes(f.row.resultUrl));assert(text.includes(marketing.index.url));assert(!text.includes(f.row.url));
 assert(!text.includes('5-1-2'));assert(!text.includes('6-5-4'));
 const recap=publicRecapCopy([a,b],reports,marketing.index.url,f.now,{date:f.row.raceKey.slice(0,8)});
 assert(recap.includes('2記事・1レース'));assert(recap.includes('🎯 的中 1R'));assert(!recap.includes('不的中'));assert(!recap.includes('0的中'));
 assert(recap.includes('種類別・中心のみの従来成績も無料一覧に掲載。'));assert(recap.includes(marketing.index.url));
 assert(!recap.includes('回収率'));assert(!recap.includes('利益'));
 assert.throws(()=>raceReports([a,a],sets),/duplicate_publication/);
});
test('public summaries preserve every positive result state and omit only zero categories',()=>{
 const labels={hit:'🎯 的中',miss:'❌ 不的中',pending:'⏳ 結果待ち',void:'➖ 不成立',review:'🔎 照合確認中'};
 const f=input(),date=f.row.raceKey.slice(0,8),day=`${Number(date.slice(4,6))}/${Number(date.slice(6,8))}`;
 for(const [status,label] of Object.entries(labels)) {
  const reports=[1,2].map(raceNo=>({raceKey:`${date}-13-${raceNo}`,status}));
  const rows=reports.map(r=>({...r,articleSeries:'normal',settlement:{status},publishedSettlement:{status}}));
  const before=JSON.stringify({rows,reports});
  assert.equal(summarizeRaceReports(reports),`公開2レース｜判定済み${['hit','miss'].includes(status)?2:0}R\n${label} 2R`);
  const recap=publicRecapCopy(rows,reports,marketing.index.url,f.now,{date});
  assert(recap.startsWith(`📊 ${day} 結果まとめ\n2記事・2レース（重複なし）`));
  assert(recap.includes(`${label} 2R`));assert(weight(recap)<=280);
  for(const other of Object.keys(labels).filter(s=>s!==status))assert(!recap.includes(labels[other]));
  assert(recap.includes('🕒 '));assert(recap.includes('時点'));assert(recap.endsWith(marketing.index.url));
  assert.equal(JSON.stringify({rows,reports}),before);
 }
 const reports=Object.keys(labels).map((status,i)=>({raceKey:`${date}-13-${i+1}`,status}));
 const rows=reports.flatMap(r=>['normal','escape','manshu'].map(articleSeries=>({...r,articleSeries,settlement:{status:r.status}})));
 const summary=summarizeRaceReports(reports),recap=publicRecapCopy(rows,reports,marketing.index.url,f.now,{date,late:true,supplement:true});
 assert(summary.startsWith('公開5レース｜判定済み2R\n'));
 assert(recap.startsWith(`📊 前日分 ${day} 結果追記\n15記事・5レース（重複なし）`));
 for(const label of Object.values(labels)){assert(summary.includes(`${label} 1R`));assert(recap.includes(`${label} 1R`));}
 assert(weight(recap)<=280);assert(!recap.includes('中心のみ（従来・記事別）：'));
 assert.equal(publicRecapCopy([],[],marketing.index.url,f.now,{date}),null);
 assert.equal(summarizeRaceReports([]),'公開を確認できたレースはありません。');
});
test('mixed article states deduplicate one race without hiding misses or unresolved races',()=>{
 const f=input(),center=settlePublished(f.row,f.bytes,f.official('4-1-2'),f.now),publicResult=settlePublic(f.row,f.bytes,center,f.now);
 const labels={hit:'🎯 的中',miss:'❌ 不的中',pending:'⏳ 結果待ち',void:'➖ 不成立',review:'🔎 照合確認中'};
 for(const [statuses,expected] of [[['hit','miss'],'hit'],[['miss','miss'],'miss'],[['miss','pending'],'pending'],
   [['pending','pending'],'pending'],[['hit','review'],'review'],[['void','void'],'void'],[['miss','void'],'review']]) {
  const rows=statuses.map((status,i)=>({...f.row,articleSeries:i?'escape':'normal',publicationKey:f.row.raceKey+(i?':escape':':normal'),
    publishedSettlement:{...publicResult.settlement,status,matchedSections:status==='hit'?['高配当を狙うなら']:[]}}));
  const before=JSON.stringify(rows),sets=new Map(rows.map(r=>[r.publicationKey,publicResult.tickets]));
  const reports=raceReports(rows,sets);
  assert.equal(reports.length,1);assert.equal(reports[0].publishedArticles,2);assert.equal(reports[0].status,expected);
  const summary=summarizePublicRows(rows);
  assert.equal(summary,`公開1レース｜判定済み${['hit','miss'].includes(expected)?1:0}R\n${labels[expected]} 1R`);
  assert.equal(summary,summarizeRaceReports(reports));assert.equal(JSON.stringify(rows),before);
 }
});
test('maximum supported hit values retain every essential fact within X length',()=>{
 const report={version:VERSION,status:'hit',raceKey:'20261031-12-12',place:'住之江',raceNo:12,
  sourceSha256:'a'.repeat(64),publishedTicketCount:120,combination:'6-5-4',payoutPer100Yen:99999999,
  resultUrl:'https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20261031&jcd=12&rno=12',
  matchedSections:['normal','escape','manshu'].flatMap(articleSeries=>HEADINGS.map(label=>({articleSeries,label})))};
 report.evidenceId=raceEvidenceId(report);
 const before=JSON.stringify(report),text=hitText(report,marketing.index.url,true);
 assert(text.startsWith('🎯 的中\n🚤 前日分 10/31 住之江12R'));
 assert(text.includes('✅ 的中買い目 6-5-4'));assert(text.includes('掲載全券120点（重複なし・参考別集計）'));
 assert.equal((text.match(/99,999,999円/g)||[]).length,1);
 assert(text.includes('AI展開／独立本命／独立万舟'));
 assert(text.includes('📌 的中した掲載欄は画像・無料一覧へ'));
 assert(text.includes(report.resultUrl));assert(text.endsWith(marketing.index.url));assert(weight(text)<=280);
 assert.equal(JSON.stringify(report),before);assert.equal(report.matchedSections.length,12);
});
test('three-digit counts preserve every public status, date and denominator within X length',()=>{
 const labels={hit:'🎯 的中',miss:'❌ 不的中',pending:'⏳ 結果待ち',void:'➖ 不成立',review:'🔎 照合確認中'};
 // These report-shaped rows stress display width; settlement validation is tested separately.
 const reports=Object.keys(labels).flatMap((status,j)=>Array.from({length:100},(_,i)=>({raceKey:`20261031-${j}-${i+1}`,status})));
 const rows=reports.flatMap(r=>['normal','escape','manshu'].map(articleSeries=>({...r,articleSeries})));
 const before=JSON.stringify({rows,reports});
 for(const options of [{date:'20261031'},{date:'20261031',late:true},{date:'20261031',late:true,supplement:true}]) {
  const text=publicRecapCopy(rows,reports,marketing.index.url,Date.parse('2026-11-01T00:05:00+09:00'),options);
  assert(text.startsWith('📊 '));assert(text.includes('10/31'));assert(text.includes('1500記事・500レース（重複なし）'));
  for(const label of Object.values(labels))assert(text.includes(`${label} 100R`));
  assert(text.includes('11/1 00:05時点'));assert.match(text,/参考(?:(?:は)?別集計|除外)/);
  assert(text.includes('中心'));assert(text.includes('無料一覧'));assert(text.endsWith(marketing.index.url));assert(weight(text)<=280);
 }
 assert.equal(JSON.stringify({rows,reports}),before);
});
test('pending, refund review, void and conflicting official facts never become a normal race hit',()=>{
 const f=input(),center=settlePublished(f.row,f.bytes,f.official('4-1-2'),f.now),p=settlePublic(f.row,f.bytes,center,f.now);
 const a={...f.row,publishedSettlement:p.settlement},sets=new Map([[a.publicationKey,p.tickets]]);
 for(const status of ['pending','review','void']){const r={...a,publishedSettlement:{...p.settlement,status}};assert.equal(raceReports([r],sets)[0].status,status);}
 const b={...a,publicationKey:a.raceKey+':escape',articleSeries:'escape',publishedSettlement:{...p.settlement,combination:'1-2-3'}};
 sets.set(b.publicationKey,p.tickets);assert.equal(raceReports([a,b],sets)[0].status,'review');
 assert.equal(raceReports([a],new Map())[0].status,'review');
 assert.deepEqual(raceReports([],new Map()),[]);
});
test('note totals and X race reports agree on conflicting metadata and official result evidence',()=>{
 const f=input(),o=f.official('4-1-2'),center=settlePublished(f.row,f.bytes,o,f.now),p=settlePublic(f.row,f.bytes,center,f.now);
 const a={...f.row,publishedSettlement:p.settlement},base={...a,articleSeries:'escape',publicationKey:a.raceKey+':escape'};
 for(const change of [{deadlineAt:new Date(Date.parse(a.deadlineAt)+60000).toISOString()},
  {publishedSettlement:{...p.settlement,combination:'1-2-3'}}]) {
  const b={...base,...change},rows=[a,b],sets=new Map(rows.map(r=>[r.publicationKey,p.tickets]));
  assert.equal(raceReports(rows,sets)[0].status,'review');assert(!summarizePublicRows(rows).includes('0的中'));
  assert(summarizePublicRows(rows).includes('公開1レース｜判定済み0R\n🔎 照合確認中 1R'));
 }
});
