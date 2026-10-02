'use strict';
const { createHash } = require('node:crypto');
const { SERIES, seriesOfBundle, publicationKey } = require('./note-article-series');
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
      Number(result.raceNo) !== Number(rno) || result.resultUrl !== resultUrl || !Number.isFinite(checked) || checked <= deadline || checked > now) return review('official_result_identity_mismatch');
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
  return `公開${c.published}件｜判定済み${c.settled}件中${c.hit}件的中・${c.miss}件不的中｜結果待ち${c.pending}件・不成立${c.void}件・確認中${c.review}件`;
}
function outcomeLine(row) {
  const s = row.settlement;
  if (s?.status === 'hit' || s?.status === 'miss') return `${s.status === 'hit' ? '的中' : '不的中'}｜確定 ${s.combination}｜公式払戻（100円あたり）${s.payoutPer100Yen.toLocaleString('ja-JP')}円`;
  return ({ void: '不成立', review: '照合確認中', pending: '公式結果との照合待ち' })[s?.status || 'pending'];
}
function dailySummary(rows, date) {
  const selected = rows.filter(r => r.raceKey.startsWith(date + '-'));
  return Object.entries(SERIES).map(([key, s]) => `${s.label}：${summaryLine(selected.filter(r => (r.articleSeries || 'normal') === key))}`).join('\n');
}
function distributionDrafts(rows, config, date) {
  const current = rows.filter(r => r.raceKey.startsWith(date + '-')).sort((a, b) => Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt) || a.publicationKey.localeCompare(b.publicationKey));
  const hits = current.filter(r => r.settlement?.status === 'hit');
  const label = `${Number(date.slice(4,6))}/${Number(date.slice(6,8))}`;
  const x = hits.map(r => {
    const s = r.settlement;
    return { id: `x:${s.evidenceId}`, status: 'awaiting_connection', publicationKey: r.publicationKey,
      text: `${label} ${SERIES[r.articleSeries || 'normal'].label}｜${r.place}${r.raceNo}R 的中\n${r.ticketCount}点で ${s.combination}\n公式払戻（100円あたり）${s.payoutPer100Yen.toLocaleString('ja-JP')}円\n事前公開の記事\n${r.url}\n全成績・今日の予想\n${config.index.url}` };
  });
  // 2026-09-29: owner requested the same hit report on both channels together.
  // Drafts never assert delivery; the sender keeps independent durable receipts.
  return { version: 'note-distribution-drafts-v2', mode: 'paired-hit', date, deliveryEnabled: false,
    x: { status: 'awaiting_connection', items: x },
    line: { status: 'awaiting_connection', items: x.map(item => ({ ...item, id: item.id.replace(/^x:/, 'line:') })) } };
}
module.exports = { settlePublished, counts, summaryLine, outcomeLine, dailySummary, distributionDrafts };
