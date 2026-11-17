'use strict';
// Retrospective accounting on the already observed course path only. This is
// never a selector, a publication payload, or proof of an alternative wager.
const fs = require('node:fs');
const k = require('./note-korogashi-lifecycle.cjs');
const { allocate } = require('./note-korogashi-draft.cjs');
const VERSION = 'note-korogashi-comparison-v1';
const check = (ok, reason) => { if (!ok) throw Error(`korogashi_comparison_${reason}`); };
const amount = value => { check(Number.isSafeInteger(value) && value >= 0, 'amount_invalid'); return value; };
function policy(options = {}) {
  check(options && typeof options === 'object' && !Array.isArray(options), 'options_invalid');
  check(Object.keys(options).every(key => ['reserveBps', 'maxLegs', 'maxInitialTickets'].includes(key)), 'option_unknown');
  const { reserveBps = 0, maxLegs = 2, maxInitialTickets = 7 } = options;
  check(Number.isInteger(reserveBps) && reserveBps >= 0 && reserveBps <= 10000, 'reserve_invalid');
  check([2, 3].includes(maxLegs), 'max_legs_invalid');
  check(Number.isInteger(maxInitialTickets) && maxInitialTickets >= 1 && maxInitialTickets <= 7, 'initial_ticket_limit_invalid');
  return { reserveBps, maxLegs, maxInitialTickets };
}
function replay(plan, settings) {
  const view = k.project(plan), first = view.legs[0];
  const base = { id: plan.request.id, date: plan.request.date, targetYen: plan.request.targetYen,
    sourceStatus: view.status, registeredLegCount: view.legs.length, observedLegCount: 0,
    eligible: false, complete: false, initialYen: null, finalWealthYen: null,
    netBeforeFeesYen: null, returnRatePct: null, reservedYen: 0, lastResolvedWealthYen: null, legs: [] };
  if (!first?.publication) return { ...base, status: 'no_announced_initial_leg' };
  if (first.allocations.length > settings.maxInitialTickets)
    return { ...base, status: 'excluded_initial_ticket_count', initialTicketCount: first.allocations.length };
  const initialYen = first.allocations.length * 1000;
  let active = initialYen, reserved = 0, status = 'observed_path_ended', complete = false;
  const legs = [];
  for (const source of view.legs) {
    // Registration alone and late publication never supply an observed wager.
    if (!source.publication) { status = 'unverified_publication'; break; }
    const tickets = source.allocations.map(a => a.ticket).sort();
    let retainedYen = 0;
    if (legs.length) {
      // Use integer arithmetic, retaining only whole 100-yen units. The
      // remainder stays active; every original ticket must still be funded.
      retainedYen = Number(BigInt(active) * BigInt(settings.reserveBps) / 10000n / 100n * 100n);
      reserved = amount(reserved + retainedYen);
      active = amount(active - retainedYen);
    }
    if (Math.floor(active / 100) < tickets.length) {
      status = 'stopped_insufficient_funds'; complete = true; break;
    }
    // Whether the full published ticket set is affordable is known before
    // the race outcome. An unfundable alternative stops without needing it.
    if (!source.settlement) { status = 'waiting_result'; break; }
    if (!['hit', 'miss'].includes(source.settlement.status)) {
      status = `unresolved_${source.settlement.status}`; break;
    }
    const funding = allocate(active, tickets), winner = funding.allocations.find(a => a.ticket === source.settlement.combination);
    const payoutYen = winner ? amount(winner.stakeYen / 100 * source.settlement.payoutPer100Yen) : 0;
    active = amount(payoutYen + funding.remainderYen);
    const wealth = amount(active + reserved);
    legs.push({ number: source.number, raceKey: source.raceKey, sourceSha256: source.sourceSha256,
      evidenceHash: k.hash({ seal: source.seal, publication: source.publication, resultSha256: source.resultSha256 }),
      retainedYen, reservedYen: reserved, allocations: funding.allocations,
      stakeYen: funding.stakeYen, remainderYen: funding.remainderYen,
      settlementStatus: source.settlement.status, payoutYen, activeYen: active, wealthYen: wealth });
    if (source.settlement.status === 'miss') { status = 'stopped_miss'; complete = true; break; }
    if (wealth >= plan.request.targetYen) { status = 'target_reached'; complete = true; break; }
    if (legs.length >= settings.maxLegs) { status = 'stopped_max_legs'; complete = true; break; }
  }
  const lastResolvedWealthYen = amount(active + reserved);
  // A missing future leg is not a losing wager or an invented completion.
  // Even a known balance is not included in final ROI until a hypothetical
  // stopping condition has actually been determined on the observed prefix.
  const finalWealthYen = complete ? lastResolvedWealthYen : null;
  return { ...base, eligible: true, complete, initialYen, initialTicketCount: first.allocations.length,
    status, observedLegCount: legs.length, reservedYen: reserved, lastResolvedWealthYen, finalWealthYen,
    netBeforeFeesYen: complete ? finalWealthYen - initialYen : null,
    returnRatePct: complete ? finalWealthYen / initialYen * 100 : null, legs };
}
function compare(state, options = {}) {
  k.validateState(state);
  const settings = policy(options), courses = Object.values(state.plans).map(plan => replay(plan, settings));
  const completed = courses.filter(course => course.complete);
  const initial = completed.reduce((sum, course) => amount(sum + course.initialYen), 0);
  const final = completed.reduce((sum, course) => amount(sum + course.finalWealthYen), 0);
  const statuses = {};
  for (const course of courses) statuses[course.status] = (statuses[course.status] || 0) + 1;
  return { version: VERSION, mode: 'review_only', evidenceScope: 'hypothetical_observed_path',
    automaticApplication: false, usableForPrediction: false, canPublish: false, purchaseExecuted: false,
    articleFeesIncluded: false, stateHash: k.hash(state), optionsHash: k.hash(settings), options: settings,
    limitations: ['retrospective_not_forward_validation', 'no_race_reselection_or_ticket_trimming',
      'unobserved_continuation_is_incomplete', 'shared_races_are_correlated'],
    summary: { courseCount: courses.length, eligibleCount: courses.filter(c => c.eligible).length,
      excludedCount: courses.filter(c => !c.eligible).length, completedCount: completed.length,
      incompleteCount: courses.filter(c => c.eligible && !c.complete).length, statuses,
      completedInitialYen: completed.length ? initial : null,
      completedFinalWealthYen: completed.length ? final : null,
      completedNetBeforeFeesYen: completed.length ? final - initial : null,
      completedReturnRatePct: completed.length ? final / initial * 100 : null }, courses };
}

// These aggregates may be shown as a labelled research summary. They contain
// no ticket instructions or publication payload and cannot change live policy.
function overview(state) {
  const definitions = [
    { id: 'baseline', label: '現行相当（最大3段・全額再投入）', options: { reserveBps: 0, maxLegs: 3, maxInitialTickets: 7 } },
    { id: 'two_leg', label: '最大2段で終了（比較用）', options: { reserveBps: 0, maxLegs: 2, maxInitialTickets: 7 } },
    { id: 'reserve_half', label: '次段前に50%確保（比較用の固定条件）', options: { reserveBps: 5000, maxLegs: 3, maxInitialTickets: 7 } },
    { id: 'initial_four', label: '初回4点以下の既存コースだけ（比較用）', options: { reserveBps: 0, maxLegs: 3, maxInitialTickets: 4 } }
  ];
  const reports = definitions.map(definition => compare(state, definition.options));
  const baseline = new Map(reports[0].courses.map(course => [course.id, course]));
  const sumNet = courses => courses.reduce((sum, course) => {
    const next = sum + course.netBeforeFeesYen;
    check(Number.isSafeInteger(next), 'amount_invalid'); return next;
  }, 0);
  const variants = reports.map((report, index) => {
    const paired = report.courses.filter(course => course.complete && baseline.get(course.id)?.complete);
    return { id: definitions[index].id, label: definitions[index].label,
      options: report.options, optionsHash: report.optionsHash,
      courseCount: report.summary.courseCount, eligibleCount: report.summary.eligibleCount,
      completedCount: report.summary.completedCount, incompleteCount: report.summary.incompleteCount,
      excludedCount: report.summary.excludedCount,
      observedMultiLegCount: report.courses.filter(course => course.observedLegCount >= 2).length,
      pairedCount: paired.length,
      pairedMultiLegCount: paired.filter(course => course.observedLegCount >= 2 && baseline.get(course.id).observedLegCount >= 2).length,
      baselineNetYen: paired.length ? sumNet(paired.map(course => baseline.get(course.id))) : null,
      variantNetYen: paired.length ? sumNet(paired) : null };
  });
  return { version: 'note-korogashi-comparison-overview-v1', mode: 'review_only',
    evidenceScope: 'hypothetical_observed_path', automaticApplication: false, usableForPrediction: false,
    canPublish: false, purchaseExecuted: false, articleFeesIncluded: false,
    stateHash: reports[0].stateHash, courseCount: reports[0].summary.courseCount,
    observedMultiLegCount: variants[0].observedMultiLegCount, variants };
}
function renderOverview(report) {
  check(report?.version === 'note-korogashi-comparison-overview-v1', 'overview_invalid');
  if (!report.courseCount) return '';
  const yen = value => value.toLocaleString('ja-JP') + '円';
  return ['コロがし方式の比較（研究）',
    '過去の観測経路を再計算・未使用期間の検証前・自動採用なし',
    '事前登録と掲載確認がある経路だけの仮定計算です。実購入の利益や、新しい方式の成績を証明するものではありません。50%確保は比較用の固定条件です。',
    '全' + report.courseCount + 'コース｜2段目以降まで結果を照合できたコース ' + report.observedMultiLegCount + '件',
    ...report.variants.map(variant => [variant.label,
      '計算完了 ' + variant.completedCount + '件｜未完了 ' + variant.incompleteCount + '件｜対象外 ' + variant.excludedCount + '件',
      '現行相当と両方計算完了した共通コース ' + variant.pairedCount + '件',
      '2段目以降まで照合できた共通コース ' + variant.pairedMultiLegCount + '件',
      variant.pairedCount ? '同じ共通コースの開始資金差引：現行相当 ' + yen(variant.baselineNetYen) + '｜この条件 ' + yen(variant.variantNetYen) : '共通コースがないため差額比較は未実施です。',
      variant.pairedMultiLegCount ? '' : '2段目以降の方式の違いを判断するデータが不足しています。'
    ].filter(Boolean).join('\n')),
    '未完了を外れや0円にせず、差額比較は両方で計算完了した同じコースだけです。同じレースを使う複数目標の結果は連動し、独立した試行ではありません。記事代等は含まず、優劣や推奨を決める集計ではありません。'
  ].join('\n\n');
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2), allowed = new Set(['--input', '--reserve-bps', '--max-legs', '--max-initial-tickets']);
    check(args.length >= 2 && args.length % 2 === 0, 'usage');
    const flags = {};
    for (let index = 0; index < args.length; index += 2) {
      check(allowed.has(args[index]) && !Object.hasOwn(flags, args[index]), 'argument_invalid');
      flags[args[index]] = args[index + 1];
    }
    check(typeof flags['--input'] === 'string' && flags['--input'].length > 0, 'input_required');
    const settings = {};
    for (const [flag, key] of [['--reserve-bps', 'reserveBps'], ['--max-legs', 'maxLegs'], ['--max-initial-tickets', 'maxInitialTickets']]) {
      if (Object.hasOwn(flags, flag)) {
        check(/^\d+$/.test(flags[flag]), 'argument_invalid'); settings[key] = Number(flags[flag]);
      }
    }
    process.stdout.write(JSON.stringify(compare(JSON.parse(fs.readFileSync(flags['--input'], 'utf8')), settings), null, 2) + '\n');
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
module.exports = { VERSION, compare, overview, renderOverview };
