'use strict';
const { createHash } = require('node:crypto');
const { SERIES, seriesOfBundle, publicationKey } = require('./note-article-series');
const {statusLabel,statusCounts,RESULT_SERIES_LABELS}=require('./note-result-presentation');
const {validatedRowOrigins}=require('./note-result-provenance');
const digest = text => createHash('sha256').update(text).digest('hex');
const pending = reason => ({ status: 'pending', reason });
const review = reason => ({ status: 'review', reason });
const ticketsOf = items => Array.isArray(items) ? items.map(t => typeof t === 'string' ? t : t?.ticket) : null;
const sameTickets = (a, b) => a && b && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const validTicket = t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;

// Input rows originate exclusively from verified note-publication receipts.
// Always recheck their immutable source; never use a regenerated prediction.
function settlePublished(row, bytes, result, now = Date.now()) {
  if (digest(bytes) !== row.sourceSha256) return review('source_hash_mismatch');
  let bundle;
  try { bundle = JSON.parse(bytes); } catch { return review('source_json_invalid'); }
  const r = bundle.record, series = seriesOfBundle(bundle);
  const deadline = Date.parse(row.deadlineAt), published = Date.parse(row.publishedAt);
  const captured = Date.parse(bundle.capturedAt);
  if (r?.raceKey !== row.raceKey || r.deadlineAt !== row.deadlineAt || r.place !== row.place || Number(r.raceNo) !== row.raceNo ||
      series !== (row.articleSeries || 'normal') || row.publicationKey !== publicationKey(row.raceKey, series) ||
      !Number.isFinite(deadline) || !Number.isFinite(published) || !Number.isFinite(captured) || captured > published ||
      published >= deadline || published > now) return review('source_identity_mismatch');
  const tickets = ticketsOf(bundle.baselinePracticalTickets), saved = ticketsOf(r.prediction?.practicalTickets);
  if (!tickets?.length || tickets.length > 7 || tickets.length !== row.ticketCount || tickets.some(t => !validTicket(t)) ||
      new Set(tickets).size !== tickets.length || !sameTickets(tickets, saved)) return review('published_tickets_unverified');
  if (series !== 'normal' && (!sameTickets(tickets, ticketsOf(bundle.monitor?.tickets)) ||
      !sameTickets(tickets, ticketsOf(bundle.article?.practicalTickets)))) return review('monitor_tickets_mismatch');
  if (now <= deadline || !result) return pending('official_result_pending');
  const [date, jcd, rno] = row.raceKey.split('-');
  const checked = Date.parse(result.checkedAt);
  const resultUrl = `https://www.boatrace.jp/owpc/pc/race/raceresult?hd=${date}&jcd=${jcd}&rno=${Number(rno)}`;
  if (result.ok !== true || result.source !== 'boatrace-official' || result.date !== date || result.jcd !== jcd ||
      Number(result.raceNo) !== Number(rno) || result.resultUrl !== resultUrl || !Number.isFinite(checked) || checked > now) return review('official_result_identity_mismatch');
  // A correctly identified pre-race snapshot is merely stale, not a foreign
  // result. Never accept a resolved result captured before the deadline.
  if (checked <= deadline) return !result.resultAvailable && result.status === 'not_finished' && !result.void && !result.trifecta
    ? pending('official_result_stale') : review('official_result_identity_mismatch');
  if (result.void === true || result.status === 'void') return { status: 'void', resultUrl };
  if (!result.resultAvailable || result.status !== 'finished') return pending('official_result_pending');
  const t = result.trifecta;
  if (!validTicket(t?.combination) || !Number.isSafeInteger(t.payout) || t.payout <= 0) return review('official_payout_unverified');
  // The existing parser exposes one trifecta. Do not misreport dead heats or
  // refunds as a simple hit/miss until all combinations/refunds are supported.
  const finishers = result.finishers || [];
  const top = [1, 2, 3].map(rank => finishers.filter(f => f.rank === rank));
  if (top.some(v => v.length !== 1) || top.map(v => v[0].boat).join('-') !== t.combination ||
      (result.starts || []).some(s => s.falseStart || s.lateStart) || result.refund || result.refunded || result.refunds?.length) return review('refund_or_ambiguous_result');
  return { status: tickets.includes(t.combination) ? 'hit' : 'miss', combination: t.combination,
    payoutPer100Yen: t.payout, resultUrl,
    evidenceId: digest([row.publicationKey, row.sourceSha256, t.combination, t.payout].join('|')) };
}
function counts(rows) {
  const c = { published: rows.length, hit: 0, miss: 0, pending: 0, void: 0, review: 0 };
  for (const r of rows) {
    const status = r.settlement?.status || 'pending';
    if (!Object.hasOwn(c, status) || status === 'published') throw new Error('marketing_settlement_status_invalid');
    c[status]++;
  }
  c.settled = c.hit + c.miss;
  return c;
}
function summaryLine(rows) {
  const c = counts(rows);
  return c.published ? `公開${c.published}件｜判定済み${c.settled}件\n${statusCounts(c)}` : '公開なし';
}
function outcomeLine(row) {
  const s = row.settlement;
  if (s?.status === 'hit' || s?.status === 'miss') return `${statusLabel(s.status)}｜確定 ${s.combination}｜公式払戻（100円あたり）${s.payoutPer100Yen.toLocaleString('ja-JP')}円`;
  return statusLabel(s?.status || 'pending');
}
function dailySummary(rows, date) {
  const selected = rows.filter(r => r.raceKey.startsWith(date + '-'));
  return Object.entries(SERIES).flatMap(([key, s]) => {
    const subset=selected.filter(r => (r.articleSeries || 'normal') === key);
    return subset.length ? [`${s.label}：${summaryLine(subset)}`] : [];
  }).join('\n') || '公開なし';
}
function distributionDrafts(rows, config, date, { previousDay = false } = {}) {
  const current = rows.filter(r => r.raceKey.startsWith(date + '-')).sort((a, b) => Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt) || a.publicationKey.localeCompare(b.publicationKey));
  const hits = current.filter(r => r.settlement?.status === 'hit');
  const label = `${Number(date.slice(4,6))}/${Number(date.slice(6,8))}`;
  const x = hits.map(r => {
    const s = r.settlement;
    return { id: `x:${s.evidenceId}`, status: 'awaiting_connection', publicationKey: r.publicationKey,
      text: `${previousDay ? '前日分 ' : ''}${label} ${SERIES[r.articleSeries || 'normal'].label}｜${r.place}${r.raceNo}R 的中\n${r.ticketCount}点で ${s.combination}\n公式払戻（100円あたり）${s.payoutPer100Yen.toLocaleString('ja-JP')}円\n公式結果\n${s.resultUrl || r.resultUrl}\n全結果一覧（無料）\n${config.index.url}` };
  });
  // 2026-09-29: owner requested the same hit report on both channels together.
  // Drafts never assert delivery; the sender keeps independent durable receipts.
  return { version: 'note-distribution-drafts-v2', mode: 'paired-hit', date, deliveryEnabled: false,
    x: { status: 'awaiting_connection', items: x },
    line: { status: 'awaiting_connection', items: x.map(item => ({ ...item, id: item.id.replace(/^x:/, 'line:') })) } };
}

// These are observation times, never the time the official provider finalized
// a result. Preserve the first local sighting only for the same verified fact.
function observeResult(row, settlement, official, now) {
  if (!['hit','miss','void'].includes(settlement.status)) return row.resultObservation;
  const evidenceId = settlement.evidenceId || digest([row.publicationKey, row.sourceSha256, settlement.status].join('|'));
  const old = row.resultObservation;
  const seen = old?.evidenceId === evidenceId && Number.isFinite(Date.parse(old.firstResultSeenAt)) &&
    Date.parse(old.firstResultSeenAt) <= now ? old.firstResultSeenAt : new Date(now).toISOString();
  const noteVerifiedAt = old?.evidenceId === evidenceId && Number.isFinite(Date.parse(old.noteVerifiedAt)) &&
    Date.parse(old.noteVerifiedAt) >= Date.parse(seen) && Date.parse(old.noteVerifiedAt) <= now ? old.noteVerifiedAt : null;
  return { version: 'note-result-observation-v1', evidenceId, firstResultSeenAt: seen,
    officialSourceCheckedAt: official.checkedAt, noteVerifiedAt };
}
function markResultsVerified(rows, now) {
  return rows.map(row=>{
    let next={...row};
    for(const [settled,observed] of [['settlement','resultObservation'],['publishedSettlement','publicResultObservation']]) {
      const s=row[settled],o=row[observed];
      if(o&&['hit','miss','void'].includes(s?.status)&&o.evidenceId===(s.evidenceId||digest([row.publicationKey,row.sourceSha256,s.status].join('|')))) {
        next[observed]={...o,noteVerifiedAt:o.noteVerifiedAt||new Date(now).toISOString()};
      }
    }
    return next;
  });
}
function publishedOutcomeLine(row) {
  const s=row.publishedSettlement;
  const categories=[...new Set(validatedRowOrigins(row).map(o=>o.label))];
  const lines=[categories.length?`🎯 ${categories.join('・')}で的中！`:statusLabel(s?.status||'review')];
  if(s?.status==='hit'&&s.matchedSections?.length)lines.push(`📌 的中した予想：${RESULT_SERIES_LABELS[row.articleSeries||'normal']}\n「${s.matchedSections.join('／')}」`);
  if(['hit','miss'].includes(s?.status)) {
    lines.push(`${s.status==='hit'?'✅ 的中買い目':'🏁 確定出目'} ${s.combination}`,`💴 公式払戻（100円あたり）${s.payoutPer100Yen.toLocaleString('ja-JP')}円`);
  }
  if(Number.isInteger(s?.publishedTicketCount))lines.push(`📌 掲載全券${s.publishedTicketCount}点（重複なし・参考別集計）`);
  return lines.join('\n');
}
function dailyPublishedSummary(rows,date,{includeRaces=true}={}) {
  const selected=rows.filter(r=>r.raceKey.startsWith(date+'-'));
  const {summarizePublicRows}=require('./note-public-results');
  const lines=Object.entries(SERIES).flatMap(([key,s])=>{
    const subset=selected.filter(r=>(r.articleSeries||'normal')===key);
    if(!subset.length)return [];
    const c=counts(subset.map(r=>({...r,settlement:r.publishedSettlement||{status:'review'}})));
    return [`${s.label}：${c.published}記事\n${statusCounts(c)}`];
  });
  return [includeRaces?summarizePublicRows(selected):'',...lines].filter(Boolean).join('\n') || '公開なし';
}

module.exports = { publishedOutcomeLine,dailyPublishedSummary,observeResult, markResultsVerified, settlePublished, counts, summaryLine, outcomeLine, dailySummary, distributionDrafts };
