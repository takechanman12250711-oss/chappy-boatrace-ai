'use strict';

// Review-only accounting. This is neither a publication handoff nor proof of
// a pre-race commitment or an actual purchase. Never feed it to the publisher.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { receiptRow, jstDate } = require('./note-marketing-content');
const { settlePublished } = require('./note-marketing-reports');

const VERSION = 'note-korogashi-draft-v1';
const TARGETS = [100000, 200000, 300000];
const DISCLAIMER = '目標金額は達成を保証するものではありません。払戻を全額再投入するため、途中で外れると投入した資金を失います。初回の資金は点数×1,000円です。2回目以降は直前の払戻と未投入の端数の範囲で配分し、追加入金はしません。舟券は20歳以上の方が無理のない範囲で購入してください。';
const hash = value => createHash('sha256').update(value).digest('hex');
const money = value => `${value.toLocaleString('ja-JP')}円`;
function requireValue(ok, reason) { if (!ok) throw Error(`korogashi_${reason}`); }
function time(value) { const n = Date.parse(value); requireValue(Number.isFinite(n), 'time_invalid'); return n; }
function yen(value) { requireValue(Number.isSafeInteger(value) && value >= 0, 'amount_invalid'); return value; }

function allocate(balanceYen, tickets) {
  yen(balanceYen);
  const units = Math.floor(balanceYen / 100), n = tickets.length;
  requireValue(n > 0 && units >= n, 'insufficient_funds');
  // Spread all purchasable 100-yen units equally. Any extra units follow the
  // original saved ticket order, without looking at odds or changing picks.
  return { allocations: tickets.map((ticket, i) => ({ ticket,
    stakeYen: (Math.floor(units / n) + (i < units % n ? 1 : 0)) * 100 })),
  stakeYen: units * 100, remainderYen: balanceYen % 100 };
}

function loadLeg(input, rootDir, now) {
  requireValue(/^data\/note-drafts\/\d{8}\/\d{8}-\d{2}-\d{1,2}-[a-f0-9]{64}\.json$/.test(input.sourcePath || ''), 'source_path_invalid');
  return readLeg(input, fs.readFileSync(path.join(rootDir, input.sourcePath), 'utf8'), now);
}

function readLeg(input, bytes, now) {
  const match = /^data\/note-drafts\/(\d{8})\/\1-(\d{2})-(\d{1,2})-([a-f0-9]{64})\.json$/.exec(input.sourcePath || '');
  requireValue(match, 'source_path_invalid');
  requireValue(hash(bytes) === match[4] && input.receipt?.sourceSha256 === match[4], 'source_hash_mismatch');
  const planned = time(input.plannedAt);
  requireValue(planned <= now, 'future_plan');
  // Historical dates here are for a labelled rehearsal only. They must never
  // be treated as external evidence that this plan existed before the race.
  const row = receiptRow(input.receipt, bytes, planned);
  requireValue(row && row.raceKey === `${match[1]}-${match[2]}-${match[3]}`, 'source_identity_mismatch');
  requireValue(time(input.receipt.verifiedAt) <= planned && time(row.deadlineAt) - planned > 120000 &&
    jstDate(planned) === match[1], 'planning_deadline_invalid');
  const checked = settlePublished(row, bytes, null, planned);
  requireValue(checked.status === 'pending', checked.reason || 'source_unverified');
  const bundle = JSON.parse(bytes);
  requireValue(time(bundle.record.selectedAt) <= time(row.publishedAt), 'selection_after_publication');
  require('./note-exhibition').requireExhibition(bundle.record);
  const tickets = bundle.baselinePracticalTickets.map(t => typeof t === 'string' ? t : t.ticket);
  const settlement = settlePublished(row, bytes, input.result || null, now);
  return { row, tickets, settlement, planned, resultCheckedAt: input.result?.checkedAt || null,
    sourcePath: input.sourcePath, plannedAt: input.plannedAt,
    resultSha256: input.result ? hash(JSON.stringify(input.result)) : null };
}

function buildDraft(input, { rootDir = process.cwd(), now = Date.now() } = {}) {
  requireValue(Number.isFinite(now), 'clock_invalid');
  requireValue(input?.version === VERSION, 'version_invalid');
  const targetYen = yen(input.targetYen), maxLegs = input.maxLegs ?? 3;
  requireValue(targetYen >= 100000 && targetYen % 100000 === 0, 'target_invalid');
  requireValue(maxLegs === 2 || maxLegs === 3, 'max_legs_invalid');
  requireValue(Array.isArray(input.legs) && input.legs.length >= 1 && input.legs.length <= maxLegs, 'leg_count_invalid');
  requireValue(input.stopReason === undefined || input.stopReason === 'no_suitable_race', 'stop_reason_invalid');
  let initialYen = null, balanceYen = null, status = 'ready_for_next', readyAfter = null, date = null;
  const seen = new Set(), legs = [];
  for (const entry of input.legs) {
    requireValue(status === 'ready_for_next', 'continuation_blocked');
    const leg = loadLeg(entry, rootDir, now), raceDate = leg.row.raceKey.slice(0, 8);
    requireValue(!seen.has(leg.row.raceKey), 'duplicate_race');
    requireValue(date === null || date === raceDate, 'different_day');
    requireValue(readyAfter === null || leg.planned >= readyAfter, 'previous_result_not_available');
    date = raceDate; seen.add(leg.row.raceKey);
    if (initialYen === null) initialYen = balanceYen = yen(leg.tickets.length * 1000);
    const funding = allocate(balanceYen, leg.tickets), { settlement } = leg;
    let payoutYen = null, closingYen = null;
    if (settlement.status === 'hit' || settlement.status === 'miss') {
      const winner = funding.allocations.find(a => a.ticket === settlement.combination);
      payoutYen = settlement.status === 'hit' ? yen(winner.stakeYen / 100 * settlement.payoutPer100Yen) : 0;
      closingYen = yen(payoutYen + funding.remainderYen);
      balanceYen = closingYen;
      readyAfter = time(leg.resultCheckedAt);
      status = settlement.status === 'miss' ? 'stopped_miss' : closingYen >= targetYen ? 'target_reached' :
        legs.length + 1 === maxLegs ? 'stopped_max_legs' : closingYen < 100 ? 'stopped_insufficient_funds' : 'ready_for_next';
    } else {
      // Pending, refund/dead heat, void and questionable official evidence
      // cannot fund another race. Do not invent a payout or call them losses.
      status = settlement.status === 'pending' ? 'waiting_result' : settlement.status === 'void' ? 'stopped_void' : 'review_required';
      balanceYen = null;
    }
    legs.push({ number: legs.length + 1, raceKey: leg.row.raceKey, articleSeries: leg.row.articleSeries,
      place: leg.row.place, raceNo: leg.row.raceNo, sourcePath: leg.sourcePath, sourceSha256: leg.row.sourceSha256,
      sourceArticleUrl: leg.row.url, deadlineAt: leg.row.deadlineAt, plannedAt: leg.plannedAt,
      openingYen: funding.stakeYen + funding.remainderYen, ...funding, settlement,
      resultCheckedAt: leg.resultCheckedAt, resultSha256: leg.resultSha256, payoutYen, closingYen });
  }
  if (input.stopReason) {
    requireValue(status === 'ready_for_next', 'stop_reason_not_applicable');
    status = 'stopped_no_suitable_race';
  }
  return { version: VERSION, mode: 'review_only', canPublish: false, purchaseExecuted: false,
    preRaceCommitVerified: false, generatedAt: new Date(now).toISOString(), date,
    targetYen, maxLegs, initialYen, status, balanceYen,
    netBeforeFeesYen: balanceYen === null ? null : balanceYen - initialYen,
    articleFeesIncluded: false, legs, disclaimer: DISCLAIMER };
}

function renderDraft(draft) {
  const states = { ready_for_next: '次の候補を確認', waiting_result: '公式結果待ち', target_reached: '試算上の目標達成',
    stopped_miss: '不的中で終了', stopped_max_legs: '最大回数で終了', stopped_insufficient_funds: '資金不足で終了',
    stopped_void: '不成立で停止', review_required: '照合確認中', stopped_no_suitable_race: '次の対象なしで終了' };
  const result = { hit: '的中', miss: '不的中', pending: '結果待ち', void: '不成立', review: '確認中' };
  return [`コロがし下書き｜目標 ${money(draft.targetYen)}`,
    '確認用の試算です。このコースの事前公開・実購入・運用実績を証明するものではありません。',
    draft.disclaimer,
    `目標は最終保有額（最後の払戻＋未投入の端数）で、利益額ではありません。初回を含め最大${draft.maxLegs}レース。`,
    `開始資金 ${money(draft.initialYen)}｜初回1点1,000円`,
    ...draft.legs.map(leg => [`${leg.number}レース目｜${leg.place}${leg.raceNo}R｜締切 ${leg.deadlineAt}`,
      `元記事 ${leg.sourceArticleUrl}`,
      ...leg.allocations.map(a => `${a.ticket.replaceAll('-', ' → ')}：${money(a.stakeYen)}`),
      `投入 ${money(leg.stakeYen)}｜未投入の端数 ${money(leg.remainderYen)}`,
      `判定 ${result[leg.settlement.status]}｜払戻 ${leg.payoutYen === null ? '未確定' : money(leg.payoutYen)}`].join('\n')),
    `状態：${states[draft.status]}`,
    `現時点の保有額 ${draft.balanceYen === null ? '未確定' : money(draft.balanceYen)}｜開始資金差引 ${draft.netBeforeFeesYen === null ? '未確定' : money(draft.netBeforeFeesYen)}`,
    '記事代などは含まない試算です。目標に合わせた買い目の追加・削除、追加入金は行いません。'].join('\n\n');
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    requireValue(args.length === 2 && args[0] === '--input', 'usage_node_script_--input_session.json');
    const draft = buildDraft(JSON.parse(fs.readFileSync(args[1], 'utf8')));
    process.stdout.write(JSON.stringify({ ...draft, draftText: renderDraft(draft) }, null, 2) + '\n');
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
module.exports = { VERSION, TARGETS, DISCLAIMER, allocate, readLeg, buildDraft, renderDraft };
