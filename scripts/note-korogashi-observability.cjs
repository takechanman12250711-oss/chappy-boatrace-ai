'use strict';
// Read-only observations. Never register, reserve, publish, settle, or mutate a
// course here. The lifecycle remains the authority for every state transition.
const k = require('./note-korogashi-lifecycle.cjs');
const { performance } = require('node:perf_hooks');
const { jstDate } = require('./note-marketing-content');
const VERSION = 'note-korogashi-observability-v1';
const MAX_SOURCE_CHECKS = 3;
const PREVIEW_BUDGET_MS = 3000;
const TERMINAL = new Set(['target_reached','stopped_miss','stopped_max_legs','stopped_insufficient_funds',
  'stopped_void','review_required','stopped_no_suitable_race','stopped_publication_late','not_started']);
const LABELS = {not_registered:'登録待ち',not_started:'開始できず終了',waiting_publication:'掲載確認中',
  waiting_result:'公式結果待ち',waiting_next:'次の対象待ち',target_reached:'目標到達',stopped_miss:'不的中で終了',
  stopped_max_legs:'最大回数で終了',stopped_insufficient_funds:'資金不足で終了',stopped_void:'不成立で停止',
  review_required:'照合確認中',stopped_no_suitable_race:'次の対象なしで終了',stopped_publication_late:'掲載期限切れで終了'};
const finiteMoney = value => Number.isSafeInteger(value) && value >= 0;
const difference = (later, earlier) => {
  const a = Date.parse(later), b = Date.parse(earlier);
  return Number.isFinite(a) && Number.isFinite(b) && a >= b ? a-b : null;
};
const sum = (rows, field) => rows.reduce((total,row)=>total+row[field],0);
function summarize(state) {
  k.validateState(state);
  const perCourse = Object.values(state.plans).map(plan=>{
    const v = k.project(plan), announced = v.legs.filter(leg=>leg.publication);
    const settled = announced.filter(leg=>leg.settlement);
    const knownFinal = announced.length>0 && TERMINAL.has(v.status) && finiteMoney(v.initialYen) && finiteMoney(v.balanceYen);
    return {id:plan.request.id,date:plan.request.date,firstPublicationKey:plan.request.firstPublicationKey,
      targetYen:plan.request.targetYen,maxLegs:plan.request.maxLegs,status:v.status,stopReason:v.stopReason||null,
      pendingRegistration:!!plan.pending,started:announced.length>0,knownFinal,
      registeredLegCount:v.legs.length,publishedLegCount:announced.length,settledLegCount:settled.length,
      hitLegCount:settled.filter(leg=>leg.settlement.status==='hit').length,
      missLegCount:settled.filter(leg=>leg.settlement.status==='miss').length,
      // Registration without an anonymous announcement is never a model wager.
      initialYen:announced.length?v.initialYen:null,
      publishedStakeYen:sum(announced,'stakeYen'),
      settledPayoutYen:sum(settled.filter(leg=>finiteMoney(leg.payoutYen)),'payoutYen'),
      unresolvedLegCount:announced.filter(leg=>!finiteMoney(leg.payoutYen)).length,
      finalBalanceYen:knownFinal?v.balanceYen:null,
      netYen:knownFinal?v.balanceYen-v.initialYen:null,
      returnRatePercent:knownFinal?100*v.balanceYen/v.initialYen:null,
      timing:v.legs.map((leg,index)=>({number:leg.number,
        resultToNextRegistrationMs:index?difference(leg.seal.confirmedAt,v.legs[index-1].checkedAt):null,
        planningToRegistrationMs:difference(leg.seal.confirmedAt,leg.plannedAt),
        registrationToPublicationMs:leg.publication?difference(leg.publication.verifiedAt,leg.seal.confirmedAt):null,
        registrationMarginMs:difference(leg.deadlineAt,leg.seal.confirmedAt),
        publicationMarginMs:leg.publication?difference(leg.deadlineAt,leg.publication.verifiedAt):null}))};
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const byStatus={};
  const groups = new Map();
  for(const course of perCourse) {
    byStatus[course.status]=(byStatus[course.status]||0)+1;
    const firstRaceKey=course.firstPublicationKey.split(':')[0];
    if(!groups.has(firstRaceKey))groups.set(firstRaceKey,{firstRaceKey,firstPublicationKey:course.firstPublicationKey,firstPublicationKeys:[],requestCount:0,startedCount:0,knownFinalCount:0});
    const group=groups.get(firstRaceKey);
    if(!group.firstPublicationKeys.includes(course.firstPublicationKey))group.firstPublicationKeys.push(course.firstPublicationKey);
    group.requestCount++;if(course.started)group.startedCount++;if(course.knownFinal)group.knownFinalCount++;
  }
  const known=perCourse.filter(course=>course.knownFinal), started=perCourse.filter(course=>course.started);
  const timings=perCourse.flatMap(course=>course.timing);
  const registrationToPublication=timings.map(t=>t.registrationToPublicationMs).filter(Number.isFinite);
  const resultToNextRegistration=timings.map(t=>t.resultToNextRegistrationMs).filter(Number.isFinite);
  const initialYen=sum(known,'initialYen'),finalBalanceYen=sum(known,'finalBalanceYen');
  return {version:VERSION,mode:'read_only',purchaseExecuted:false,
    coverage:'専用状態に記録された全要求。記録のない日の見送り件数は含まない。',
    requestedCount:perCourse.length,startedCount:started.length,unannouncedCount:perCourse.length-started.length,
    pendingRegistrationCount:perCourse.filter(course=>course.pendingRegistration).length,
    registeredLegCount:sum(perCourse,'registeredLegCount'),publishedLegCount:sum(perCourse,'publishedLegCount'),
    settledLegCount:sum(perCourse,'settledLegCount'),
    registrationFailureCount:perCourse.filter(course=>course.stopReason==='registration_expired').length,
    publicationFailureCount:byStatus.stopped_publication_late||0,
    byStatus,knownFinalCount:known.length,unknownFinalCount:started.length-known.length,
    distinctFirstRaceCount:groups.size,
    distinctStartedFirstRaceCount:[...groups.values()].filter(group=>group.startedCount).length,
    correlatedGroupCount:[...groups.values()].filter(group=>group.requestCount>1).length,
    knownFinalTotals:{scope:'目標別のモデルコース合算。相関する複数目標を含むため実購入額ではない。',
      initialYen:known.length?initialYen:null,finalBalanceYen:known.length?finalBalanceYen:null,
      netYen:known.length?finalBalanceYen-initialYen:null,
      returnRatePercent:known.length?100*finalBalanceYen/initialYen:null},
    observedRegistrationToPublicationCount:registrationToPublication.length,
    observedRegistrationToPublicationMaxMs:registrationToPublication.length?Math.max(...registrationToPublication):null,
    observedResultToNextRegistrationCount:resultToNextRegistration.length,
    observedResultToNextRegistrationMaxMs:resultToNextRegistration.length?Math.max(...resultToNextRegistration):null,
    groups:[...groups.values()],perCourse};
}
function budgeted(promise, milliseconds) {
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('preview_budget_exhausted')),milliseconds);
  })]).finally(()=>clearTimeout(timer));
}
async function preview(state,{rows,source,now,clock=Date.now}={}) {
  k.validateState(state);
  if(!Number.isFinite(now)||typeof clock!=='function')throw Error('korogashi_observation_clock_invalid');
  const start=clock(),wallStart=performance.now();
  if(!Number.isFinite(start))throw Error('korogashi_observation_clock_invalid');
  const elapsed=()=>{
    const current=clock();
    if(!Number.isFinite(current))throw Error('korogashi_observation_clock_invalid');
    // The injected clock can be fixed or move backwards. Monotonic elapsed
    // wall time still enforces one shared budget and advances the deadline.
    return Math.max(0,current-start,performance.now()-wallStart);
  };
  const out={version:VERSION,mode:'read_only',status:'no_active_course',checkedAt:new Date(now).toISOString(),sourceChecks:0,plans:[]};
  // Do not spend any additional network time while registration is waiting for
  // anonymous publication. Existing publication safeguards take priority.
  if(k.needsPublication(state))return {...out,status:'publication_priority'};
  if(!Array.isArray(rows)||typeof source!=='function')return {...out,status:'source_unavailable'};
  const active=Object.values(state.plans).map(plan=>({plan,view:k.project(plan)}))
    .filter(({plan,view})=>plan.request.date===jstDate(now) && !plan.pending &&
      ['waiting_result','waiting_next'].includes(view.status) && view.legs.length<plan.request.maxLegs)
    .sort((a,b)=>a.plan.request.id.localeCompare(b.plan.request.id));
  if(!active.length)return out;
  out.status='checked';
  for(const {plan,view} of active) {
    const item={id:plan.request.id,status:view.status,candidates:[],checkedCount:0,unverifiedCount:0};
    out.plans.push(item);
    const series=plan.request.firstPublicationKey.split(':')[1],seen=new Set();
    const candidates=rows.filter(row=>row && typeof row.raceKey==='string' && row.raceKey.startsWith(plan.request.date+'-') &&
      row.articleSeries===series && typeof row.publicationKey==='string' &&
      !view.legs.some(leg=>leg.raceKey===row.raceKey) && Number.isFinite(Date.parse(row.deadlineAt)) &&
      Date.parse(row.deadlineAt)-now>k.NEXT_LEG_MIN_MARGIN_MS)
      .sort((a,b)=>Date.parse(a.deadlineAt)-Date.parse(b.deadlineAt)||a.publicationKey.localeCompare(b.publicationKey));
    for(const row of candidates) {
      if(seen.has(row.publicationKey))continue;
      seen.add(row.publicationKey);
      const spent=elapsed();
      if(out.sourceChecks>=MAX_SOURCE_CHECKS||spent>=PREVIEW_BUDGET_MS){out.status='bounded';break;}
      if(Date.parse(row.deadlineAt)-(now+spent)<=k.NEXT_LEG_MIN_MARGIN_MS)continue;
      out.sourceChecks++;item.checkedCount++;
      try {
        const evidence=await budgeted(Promise.resolve().then(()=>source(row)),PREVIEW_BUDGET_MS-spent);
        const after=elapsed();
        if(after>=PREVIEW_BUDGET_MS){out.status='bounded';break;}
        const observedNow=now+after;
        if(Date.parse(row.deadlineAt)-observedNow<=k.NEXT_LEG_MIN_MARGIN_MS)continue;
        // This validates the immutable source and published model subset. The
        // temporary funding value is discarded; a pending result funds nothing.
        const leg=k.makeLeg(row,evidence.receipt,evidence.bytes,{balanceYen:null,legs:view.legs},observedNow);
        if(view.status==='waiting_next' && (!finiteMoney(view.balanceYen)||view.balanceYen<leg.allocations.length*100))continue;
        item.candidates.push({publicationKey:row.publicationKey,place:String(leg.place).replace(/[\r\n]/g,' '),raceNo:leg.raceNo,
          deadlineAt:leg.deadlineAt,remainingMs:Date.parse(leg.deadlineAt)-observedNow,ticketCount:leg.allocations.length,
          label:'予定・未登録'});
      } catch (error) {
        item.unverifiedCount++;
        if(error?.message==='preview_budget_exhausted'||elapsed()>=PREVIEW_BUDGET_MS){out.status='bounded';break;}
      }
    }
  }
  // Slow reads or a clock advance cannot leave an expired candidate displayed.
  const finished=elapsed(),observedNow=now+finished;
  out.checkedAt=new Date(observedNow).toISOString();
  for(const item of out.plans)item.candidates=item.candidates.filter(candidate=>{
    candidate.remainingMs=Date.parse(candidate.deadlineAt)-observedNow;
    return candidate.remainingMs>k.NEXT_LEG_MIN_MARGIN_MS;
  });
  return out;
}
const yen=value=>value===null?'未確定':`${value.toLocaleString('ja-JP')}円`;
function renderSummary(summary) {
  if(!summary.requestedCount)return '';
  const statuses=Object.entries(summary.byStatus).map(([status,count])=>`${LABELS[status]||'確認中'} ${count}件`).join('／');
  const totals=summary.knownFinalTotals;
  const duration=value=>value===null?'実測なし':`最長${Math.ceil(value/1000)}秒`;
  return ['コロがしの全記録（モデル集計）',
    `記録された要求 ${summary.requestedCount}件｜締切前掲載を確認して開始 ${summary.startedCount}件｜開始掲載未確認 ${summary.unannouncedCount}件`,
    `掲載確認済み ${summary.publishedLegCount}段｜結果照合済み ${summary.settledLegCount}段｜登録失効 ${summary.registrationFailureCount}件｜掲載失効 ${summary.publicationFailureCount}件`,
    statuses,
    `過去記録の実測：登録から掲載確認 ${duration(summary.observedRegistrationToPublicationMaxMs)}｜前段の公式結果照合から次段登録 ${duration(summary.observedResultToNextRegistrationMaxMs)}。過去例であり、今後の所要時間を保証するものではありません。`,
    `最終保有額が確定した ${summary.knownFinalCount}コースのモデル集計：開始資金 ${yen(totals.initialYen)}｜最終保有額 ${yen(totals.finalBalanceYen)}｜開始資金差引 ${yen(totals.netYen)}（記事代別）`,
    `開始後の最終保有額が未確定 ${summary.unknownFinalCount}件。未確定・不成立・照合確認中を0円や不的中へ置き換えていません。`,
    `初回レースの異なる群 ${summary.distinctFirstRaceCount}件｜複数目標・種類で同じ初回レースを使う群 ${summary.correlatedGroupCount}件。同じレースの結果は連動し、目標別の合算は実購入額・実利益ではありません。`,
    summary.coverage].join('\n');
}
function renderPreview(observation) {
  if(!observation.plans?.length)return '';
  const stamp=value=>new Date(Date.parse(value)+9*3600000).toISOString().slice(5,16).replace('T',' ');
  return ['次の段の候補（予定・未登録）',
    '一覧の更新時点の予定です。現在の余裕は登録時に再判定します。前段の公式結果と現在の証拠を照合した後に選定するため、候補の掲載は登録・購入・継続の確約ではありません。',
    '次段候補は締切まで5分超のものだけです。登録・掲載確認には、それぞれ締切まで120秒超の余裕が必要です。時刻は日本時間であり、必要な処理が終わる時刻を示していません。',
    ...observation.plans.map(item=>[
      `コース ${item.id}｜${LABELS[item.status]||'確認中'}`,
      ...(item.candidates.length?item.candidates.map(candidate=>`${candidate.label}：${candidate.place}${candidate.raceNo}R｜締切 ${stamp(candidate.deadlineAt)}｜候補判定は${stamp(new Date(Date.parse(candidate.deadlineAt)-k.NEXT_LEG_MIN_MARGIN_MS).toISOString())}より前｜${candidate.ticketCount}点`):
        ['この確認範囲で案内できる候補はありません。']),
      item.unverifiedCount?'元記事や証拠を確認できない候補は案内していません。':''].filter(Boolean).join('\n')),
    observation.status==='bounded'?'確認件数・時間の上限に達したため、一部候補は未確認です。':'',
    '結果照合後の登録と掲載確認が必要です。候補表示だけでは処理時間や期限内掲載を保証しません。'].filter(Boolean).join('\n\n');
}
module.exports={summarize,preview,renderSummary,renderPreview};
