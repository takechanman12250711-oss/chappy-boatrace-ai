'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {settlePublic,raceReports,raceEvidenceId,hitText,publicRecapCopy,summarizePublicRows}=require('./note-public-results');
const {settlePublished,observeResult,markResultsVerified}=require('./note-marketing-reports');
const {LEGACY_READABLE}=require('./note-published-ticket-sections');
const {fixture}=require('./note-independent-monitor-fixture');
const {weight}=require('./note-marketing-social');
const {renderCard}=require('./note-result-card.cjs');
const marketing=require('../config/note-marketing.json');
const sha=value=>createHash('sha256').update(value).digest('hex');
function input() {
 const b=fixture();b.version='note-draft-bundle-v1';delete b.monitor;delete b.record.source;
 b.record.prediction.mainSheet={tickets:['1-2-3','1-3-2'],coverTickets:['2-1-3'],flowTickets:['3-1-2']};
 b.record.prediction.manshuSheet={tickets:['4-1-2']};b.record.prediction.candidate24Tickets=['6-5-4'];
 b.article.format='formation-v4';b.article.paidText='🔥 実戦厳選\n1-2-34\n計 2点\n\n本命とは別会計の参考予想\n5-1-2';
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
test('a published additional-section hit is new public hit while original center miss stays unchanged',async()=>{
 const f=input(),o=f.official('4-1-2'),center=settlePublished(f.row,f.bytes,o,f.now);assert.equal(center.status,'miss');
 const before=JSON.stringify(center),publicResult=settlePublic(f.row,f.bytes,center,f.now);
 assert.equal(publicResult.settlement.status,'hit');assert.equal(publicResult.settlement.publishedTicketCount,6);
 assert.deepEqual(publicResult.settlement.matchedSections,['高配当を狙うなら']);assert.equal(JSON.stringify(center),before);
 f.row.settlement=center;f.row.publishedSettlement=publicResult.settlement;
 f.row.publicResultObservation=observeResult(f.row,publicResult.settlement,o,f.now);
 const marked=markResultsVerified([f.row],f.now+1000);
 const reports=raceReports(marked,new Map([[f.row.publicationKey,publicResult.tickets]]));
 assert.equal(reports[0].status,'hit');assert.equal(reports[0].evidenceId,raceEvidenceId(reports[0]));
 const card=await renderCard(reports[0],{now:f.now+2000});assert.equal(card.content.scope,'published-main');assert.equal(card.content.publishedTicketCount,6);
 assert(!JSON.stringify(card.content).includes('6-5-4'));assert(!JSON.stringify(card.content).includes(f.row.url));
});
test('only excluded reference or internal candidate hit remains miss; unknown publication proof remains review',()=>{
 for(const result of ['5-1-2','6-5-4']){const f=input(),center=settlePublished(f.row,f.bytes,f.official(result),f.now);
  assert.equal(settlePublic(f.row,f.bytes,center,f.now).settlement.status,'miss');}
 const f=input(),center=settlePublished(f.row,f.bytes,f.official('4-1-2'),f.now);delete f.row.publicationEvidence;
 assert.equal(settlePublic(f.row,f.bytes,center,f.now).settlement.status,'review');
});
test('two article kinds for one race yield one hit and exact deduplicated stake-free count',()=>{
 const f=input(),o=f.official('4-1-2'),center=settlePublished(f.row,f.bytes,o,f.now),p=settlePublic(f.row,f.bytes,center,f.now);
 const a={...f.row,settlement:center,publishedSettlement:p.settlement},b={...a,publicationKey:f.row.raceKey+':escape',articleSeries:'escape'};
 const sets=new Map([[a.publicationKey,p.tickets],[b.publicationKey,['4-1-2','2-3-1']]]);
 const reports=raceReports([a,b],sets);assert.equal(reports.length,1);assert.equal(reports[0].publishedArticles,2);assert.equal(reports[0].publishedTicketCount,7);
 assert.equal(reports[0].matchedSections.length,2);assert(summarizePublicRows([a,b]).includes('公開1レース'));
 const text=hitText(reports[0],marketing.index.url,true);assert(text.includes('前日分'));assert(text.includes('掲載全券7点'));assert(weight(text)<=280);
 const recap=publicRecapCopy([a,b],reports,marketing.index.url,f.now,{date:f.row.raceKey.slice(0,8)});
 assert(recap.includes('2記事・1レース'));assert(recap.includes('1的中／0不的中'));assert(recap.includes('中心のみ（従来・記事別）：0的中／2不的中'));
 assert(!recap.includes('回収率'));assert(!recap.includes('利益'));
 assert.throws(()=>raceReports([a,a],sets),/duplicate_publication/);
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
  assert.equal(raceReports(rows,sets)[0].status,'review');assert(summarizePublicRows(rows).includes('0的中・0不的中'));
  assert(summarizePublicRows(rows).includes('確認中1'));
 }
});
