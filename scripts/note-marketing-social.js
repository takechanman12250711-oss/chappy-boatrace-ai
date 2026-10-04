'use strict';
const {createHash}=require('node:crypto');
const {ticketsIn}=require('./note-readable-article');
const {counts}=require('./note-marketing-reports');
const labels={normal:'AI展開',escape:'本命',manshu:'万舟'};
const articleContents='展開・注目艇・狙う理由まで無料で解説！\n有料の買い目はフォーメーション・点数付き。';
const dateOf=now=>new Date(now+9*3600000).toISOString().slice(0,10).replaceAll('-','');
const timeOf=now=>new Date(now+9*3600000).toISOString().slice(11,16);
const dayLabel=date=>`${Number(date.slice(4,6))}/${Number(date.slice(6,8))}`;
const weight=text=>[...text.replace(/https:\/\/\S+/g,'x'.repeat(23))].reduce((n,c)=>n+(c.codePointAt(0)>127?2:1),0);
const short=(text,length)=>[...text].length>length?[...text].slice(0,length-1).join('')+'…':text;
function safePreview(text) {
  return String(text||'').normalize('NFKC').split(/(?<=[。！？])|\n/)
    .map(s=>s.trim()).filter(s=>s && !/^【[^】]+】$/.test(s) && !ticketsIn(s).length &&
      !/https?:|[@#]|買い目|計\s*\d+点|監視の根拠|確実|絶対|必ず|保証/.test(s))[0]||'';
}
function sourceContext(row,bytes) {
  if(typeof bytes!=='string'||createHash('sha256').update(bytes).digest('hex')!==row.sourceSha256)return null;
  let b;try{b=JSON.parse(bytes);}catch{return null;}
  const r=b.record, captured=Date.parse(b.capturedAt), published=Date.parse(row.publishedAt);
  const tickets=(b.baselinePracticalTickets||[]).map(t=>typeof t==='string'?t:t.ticket);
  const saved=(r?.prediction?.practicalTickets||[]).map(t=>typeof t==='string'?t:t.ticket);
  if(r?.raceKey!==row.raceKey||r.deadlineAt!==row.deadlineAt||!Number.isFinite(captured)||captured>published||
    !(published<Date.parse(row.deadlineAt))||!tickets.length||tickets.length>7||
    tickets.some(t=>!/^([1-6])-([1-6])-([1-6])$/.test(t)||new Set(t.split('-')).size!==3)||
    JSON.stringify([...tickets].sort())!==JSON.stringify([...saved].sort()))return null;
  const explanation=String(b.article?.paidText||'').split(/^買い目\s*$/m)[0];
  const flow=explanation.match(/【想定展開】\s*([^【]*)/);
  const raw=b.version==='independent-monitor-note-v1'
    ? flow?.[1]||explanation
    : r.prediction?.raceFlow?.summary||b.article?.rangeSummary||'';
  return {version:'source-context-v1',sourceSha256:row.sourceSha256,
    preview:short(safePreview(raw),60),firstBoats:[...new Set(tickets.map(t=>t[0]))]};
}
function contextOf(row) {
  const c=row.socialContext;
  return c?.version==='source-context-v1'&&c.sourceSha256===row.sourceSha256?c:null;
}
function announcementCopy(rows,indexUrl,now) {
  const ordered=[...rows].sort((a,b)=>Date.parse(a.deadlineAt)-Date.parse(b.deadlineAt)||a.publicationKey.localeCompare(b.publicationKey));
  if(!ordered.length)throw Error('social_announcement_empty');
  const first=ordered[0],url=ordered.length===1?first.url:indexUrl;
  const preview=short(safePreview(contextOf(first)?.preview),36);
  for(let n=Math.min(3,ordered.length);n>=1;n--) {
    const lines=[`${dayLabel(dateOf(now))} 締切前の予想`,...ordered.slice(0,n).map(r=>
      `${labels[r.articleSeries]}｜${r.place}${r.raceNo}R ${timeOf(Date.parse(r.deadlineAt))}締切${[200,300].includes(r.price)?`｜${r.price}円`:''}`),
      preview?`${first.place}${first.raceNo}Rの注目：${preview}`:'',
      ordered.length>n?`ほか${ordered.length-n}記事は一覧へ`:'',
      articleContents,url].filter(Boolean);
    if(weight(lines.join('\n'))<=280)return lines.join('\n');
  }
  const result=[`${dayLabel(dateOf(now))} ${labels[first.articleSeries]}｜${first.place}${first.raceNo}R`,
    `${timeOf(Date.parse(first.deadlineAt))}締切｜価格は記事で確認`, articleContents,url].join('\n');
  if(weight(result)>280)throw Error('social_announcement_too_long');
  return result;
}
function recapCopy(rows,indexUrl,now) {
  const date=dateOf(now),current=rows.filter(r=>r.raceKey.startsWith(date+'-'));
  if(!current.length)return null;
  const totals=counts(current);
  const lines=[`${dayLabel(date)} 公開予想の振り返り`,...Object.entries(labels).flatMap(([key,label])=>{
    const c=counts(current.filter(r=>r.articleSeries===key));
    return c.published?[`${label}：${c.hit}的中／${c.miss}不的中`]:[];
  }),`確認中${totals.review}・結果待ち${totals.pending}・不成立${totals.void}`];
  // Explain a miss without inventing the actual race development from a result.
  const missed=current.filter(r=>r.settlement?.status==='miss'&&contextOf(r)?.firstBoats?.length)
    .sort((a,b)=>a.deadlineAt.localeCompare(b.deadlineAt)||a.publicationKey.localeCompare(b.publicationKey))[0];
  const example=missed?`${missed.place}${missed.raceNo}R：${contextOf(missed).firstBoats.includes(missed.settlement.combination[0])?'1着は想定内、組み合わせが不的中。':'1着の想定が外れたレース。'}`:'';
  const tail=[`公開時の中心買い目で判定。${timeOf(now)}時点`, '全記事・公式結果',indexUrl];
  let text=[...lines,example,...tail].filter(Boolean).join('\n');
  if(weight(text)>280)text=[...lines,...tail].join('\n');
  if(weight(text)>280)throw Error('social_recap_too_long');
  return text;
}
module.exports={sourceContext,contextOf,safePreview,announcementCopy,recapCopy,weight,dateOf,timeOf};
