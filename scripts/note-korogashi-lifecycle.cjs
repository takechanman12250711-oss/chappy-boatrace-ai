'use strict';
const { createHash } = require('node:crypto');
const { readLeg, allocate, DISCLAIMER } = require('./note-korogashi-draft.cjs');
const { jstDate, recentDates, validUrl } = require('./note-marketing-content');
const VERSION = 'note-korogashi-state-v1';
const POLICY = 'published-same-series-deadline-order-v1';
const json = x => JSON.stringify(x);
const hash = x => createHash('sha256').update(typeof x === 'string' ? x : json(x)).digest('hex');
const copy = x => JSON.parse(json(x));
const check = (ok, reason) => { if (!ok) throw Error('korogashi_' + reason); };
const ms = x => { const t = Date.parse(x); check(Number.isFinite(t), 'timestamp_invalid'); return t; };
const iso = x => new Date(x).toISOString();
const endOf = date => Date.parse(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T23:59:59+09:00`) + 1000;
function request(value) {
  check(value && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value.id || ''), 'request_id_invalid');
  check(/^\d{8}$/.test(value.date || '') && jstDate(endOf(value.date) - 1) === value.date, 'request_date_invalid');
  check(new RegExp(`^${value.date}-(0[1-9]|1[0-9]|2[0-4])-([1-9]|1[0-2]):(normal|escape|manshu)$`).test(value.firstPublicationKey || ''), 'request_first_race_invalid');
  check(Number.isSafeInteger(value.targetYen) && value.targetYen >= 100000 && value.targetYen % 100000 === 0, 'request_target_invalid');
  check([2,3].includes(value.maxLegs) && value.selectionPolicy === POLICY, 'request_policy_invalid');
  return { id: value.id, date: value.date, firstPublicationKey: value.firstPublicationKey,
    targetYen: value.targetYen, maxLegs: value.maxLegs, selectionPolicy: POLICY };
}
function requests(config) {
  check(config?.version === 'note-korogashi-requests-v1' && Array.isArray(config.requests), 'config_invalid');
  const rows = config.requests.map(request);
  check(new Set(rows.map(r=>r.id)).size === rows.length, 'duplicate_request');
  return rows;
}
function initialState() { return { version: VERSION, plans: {} }; }
function chain(plan) { return plan.events.at(-1)?.hash || hash(plan.request); }
function append(plan, type, data, at) {
  const body = { sequence: plan.events.length + 1, previous: chain(plan), type, at: iso(at), data };
  plan.events.push({ ...body, hash: hash(body) });
}
function project(plan) {
  const r = request(plan.request);
  let previous = hash(r), state = { status: 'not_registered', initialYen: null, balanceYen: null, legs: [], lastAt: null, eventCount:0 };
  for (const event of plan.events) {
    const { hash: digest, ...body } = event;
    check(body.previous === previous && body.sequence === state.eventCount + 1, 'event_chain_invalid');
    check(hash(body) === digest && (!state.lastAt || ms(body.at) >= ms(state.lastAt)), 'event_hash_or_time_invalid');
    if (body.type === 'registered') {
      check(['not_registered','waiting_next'].includes(state.status), 'registration_transition_invalid');
      const { leg, seal } = body.data;
      check(Array.isArray(leg.allocations) && leg.allocations.length>=1 && leg.allocations.length<=7 &&
        leg.allocations.every(a=>/^[1-6]-[1-6]-[1-6]$/.test(a.ticket) && new Set(a.ticket.split('-')).size===3) &&
        new Set(leg.allocations.map(a=>a.ticket)).size===leg.allocations.length, 'registered_tickets_invalid');
      check(leg.number === state.legs.length + 1 && leg.number <= r.maxLegs &&
        leg.articleSeries === r.firstPublicationKey.split(':')[1] &&
        leg.raceKey.startsWith(r.date + '-') && !state.legs.some(l=>l.raceKey===leg.raceKey), 'registration_identity_invalid');
      check(Number.isSafeInteger(seal.id) && seal.id > 0 && /^sha256:[a-f0-9]{64}$/.test(seal.digest) &&
        /^\d+$/.test(seal.runId) && /^[a-f0-9]{40}$/.test(seal.headSha) &&
        ms(leg.plannedAt) <= ms(seal.confirmedAt) && ms(seal.createdAt) <= ms(seal.confirmedAt) &&
        ms(seal.confirmedAt) <= ms(body.at) && ms(leg.deadlineAt) - ms(seal.confirmedAt) > 120000, 'seal_invalid');
      check(seal.snapshotHash === hash({ request: r, previous, leg }), 'snapshot_mismatch');
      const opening = state.balanceYen ?? leg.allocations.length * 1000;
      check(json(allocate(opening,leg.allocations.map(a=>a.ticket))) === json({ allocations:leg.allocations,stakeYen:leg.stakeYen,remainderYen:leg.remainderYen }), 'funding_mismatch');
      check(leg.openingYen === opening && (!state.lastAt || ms(leg.plannedAt) >= ms(state.lastAt)), 'registration_timing_invalid');
      state = { ...state, status:'waiting_publication', initialYen: state.initialYen ?? opening, balanceYen:null,
        legs:[...state.legs,{ ...leg, seal, publication:null, settlement:null, payoutYen:null, closingYen:null }] };
    } else if (body.type === 'announced') {
      check(state.status === 'waiting_publication', 'publication_transition_invalid');
      const last=state.legs.at(-1), publication=body.data;
      check(publication.number===last.number && validUrl(publication.url) && /^[a-f0-9]{64}$/.test(publication.contentHash) &&
        ms(publication.verifiedAt) >= ms(last.seal.confirmedAt) && ms(publication.verifiedAt) <= ms(body.at) &&
        ms(last.deadlineAt)-ms(publication.verifiedAt)>120000, 'publication_invalid');
      state={...state,status:'waiting_result',legs:[...state.legs.slice(0,-1),{...last,publication}]};
    } else if (body.type === 'settled') {
      check(state.status === 'waiting_result', 'settlement_transition_invalid');
      const last = state.legs.at(-1), { settlement, resultSha256, checkedAt } = body.data;
      check(body.data.number === last.number && /^[a-f0-9]{64}$/.test(resultSha256) &&
        ms(checkedAt) > ms(last.deadlineAt) && ms(checkedAt) <= ms(body.at) &&
        ['hit','miss','void','review'].includes(settlement.status), 'settlement_invalid');
      let payoutYen = null, closingYen = null, status = settlement.status === 'void' ? 'stopped_void' : 'review_required';
      if (['hit','miss'].includes(settlement.status)) {
        const winner = last.allocations.find(a=>a.ticket===settlement.combination);
        check((settlement.status === 'hit') === !!winner && Number.isSafeInteger(settlement.payoutPer100Yen) && settlement.payoutPer100Yen > 0, 'settlement_payout_invalid');
        payoutYen = winner ? winner.stakeYen / 100 * settlement.payoutPer100Yen : 0;
        closingYen = payoutYen + last.remainderYen;
        check(Number.isSafeInteger(closingYen) && closingYen >= 0, 'amount_invalid');
        status = settlement.status === 'miss' ? 'stopped_miss' : closingYen >= r.targetYen ? 'target_reached' :
          last.number === r.maxLegs ? 'stopped_max_legs' : closingYen < 100 ? 'stopped_insufficient_funds' : 'waiting_next';
      }
      state = { ...state, status, balanceYen:closingYen, legs:[...state.legs.slice(0,-1),
        { ...last, settlement, payoutYen, closingYen, resultSha256, checkedAt }] };
    } else if (body.type === 'stopped') {
      const late=state.status==='waiting_publication' && body.data.reason==='publication_expired';
      check(late || (['not_registered','waiting_next'].includes(state.status) && ['day_ended','registration_expired'].includes(body.data.reason)), 'stop_transition_invalid');
      state = { ...state, status:late ? 'stopped_publication_late' : state.legs.length ? 'stopped_no_suitable_race' : 'not_started',
        balanceYen:late ? state.legs.at(-1).openingYen : state.balanceYen, stopReason:body.data.reason };
    } else throw Error('korogashi_event_type_invalid');
    previous = digest; state.lastAt = body.at; state.eventCount = body.sequence;
  }
  return { ...state, netBeforeFeesYen:state.balanceYen === null ? null : state.balanceYen - state.initialYen };
}
function validateState(state) {
  check(state?.version === VERSION && state.plans && !Array.isArray(state.plans), 'state_invalid');
  for (const [id,p] of Object.entries(state.plans)) {
    check(p.request?.id === id && Array.isArray(p.events), 'plan_invalid');
    const view=project(p);
    if(p.pending) check(['not_registered','waiting_next'].includes(view.status) && p.pending.previous===chain(p) &&
      json(p.pending.request)===json(p.request) && p.pending.snapshotHash===hash({request:p.request,previous:chain(p),leg:p.pending.leg}) &&
      /^\d+$/.test(p.pending.runId) && /^\d+$/.test(p.pending.runAttempt) && /^[a-f0-9]{40}$/.test(p.pending.headSha), 'pending_invalid');
  }
  return state;
}
function assertAppendOnly(before, after) {
  validateState(before); validateState(after);
  for(const [id,p] of Object.entries(before.plans)) {
    const next=after.plans[id];check(next && json(next.request)===json(p.request) &&
      json(next.events.slice(0,p.events.length))===json(p.events), 'history_rewrite');
    if(p.pending && next.pending) check(json(p.pending)===json(next.pending), 'pending_rewrite');
    if(p.pending && !next.pending) check(next.events.length===p.events.length+1 && ['registered','stopped'].includes(next.events.at(-1).type), 'pending_dropped');
  }
}
function makeLeg(row, receipt, bytes, view, now) {
  const sourcePath=`data/note-drafts/${row.raceKey.slice(0,8)}/${row.raceKey}-${row.sourceSha256}.json`;
  const input={sourcePath,receipt,plannedAt:iso(now)};
  const verified=readLeg(input,bytes,now);
  check(json(verified.row)===json(Object.fromEntries(Object.keys(verified.row).map(k=>[k,row[k]]))), 'publication_row_mismatch');
  const openingYen=view.balanceYen ?? verified.tickets.length*1000;
  return { number:view.legs.length+1, ...input, raceKey:row.raceKey, articleSeries:row.articleSeries,
    sourceSha256:row.sourceSha256, sourceArticleUrl:row.url, place:row.place, raceNo:row.raceNo, deadlineAt:row.deadlineAt,
    // The public readable article may reorder formations. A numeric ticket
    // order lets a buyer reproduce the allocation from those paid picks.
    openingYen, ...allocate(openingYen,[...verified.tickets].sort()) };
}
async function prepare(state, config, { rows, source, result, now, context }) {
  validateState(state);const next=copy(state), day=jstDate(now);
  check(/^\d+$/.test(context.runId) && /^\d+$/.test(context.runAttempt) && /^[a-f0-9]{40}$/.test(context.headSha), 'run_context_invalid');
  for(const r of requests(config)) {
    if(next.plans[r.id]) check(json(next.plans[r.id].request)===json(r),'request_changed');
    else if(r.date===day) next.plans[r.id]={request:r,events:[],pending:null};
  }
  const staged=[],skipped=[];
  for(const p of Object.values(next.plans)) {
    let view=project(p);
    if(p.pending) {
      // An interrupted previous run has no confirmed registration. Never
      // substitute another race or backdate it; stop this course explicitly.
      if(p.pending.runId!==context.runId || p.pending.runAttempt!==context.runAttempt || ms(p.pending.leg.deadlineAt)-now<=120000) {
        append(p,'stopped',{reason:'registration_expired'},now);p.pending=null;
      } else staged.push(copy(p.pending));
      continue;
    }
    if(view.status==='waiting_publication') {
      if(ms(view.legs.at(-1).deadlineAt)-now<=120000) append(p,'stopped',{reason:'publication_expired'},now);
      continue;
    }
    if(view.status==='waiting_result') {
      const last=view.legs.at(-1), official=await result(last.raceKey);
      if(official) {
        const {bytes}=await source(last);
        const verified=readLeg({...last,result:official},bytes,now);
        check(json(last.allocations)===json(allocate(last.openingYen,[...verified.tickets].sort()).allocations), 'saved_funding_source_mismatch');
        const settlement=verified.settlement;
        if(settlement.status!=='pending') {
          // Invalid result timestamps must not get persisted as a resolved
          // event; retain waiting state and report the rejection.
          if(!Number.isFinite(Date.parse(official.checkedAt)) || ms(official.checkedAt)<=ms(last.deadlineAt) || ms(official.checkedAt)>now) skipped.push({id:p.request.id,reason:'result_time_unverified'});
          else {append(p,'settled',{number:last.number,settlement,resultSha256:hash(official),checkedAt:official.checkedAt},now);view=project(p);}
        }
      }
    }
    if(!['not_registered','waiting_next'].includes(view.status)) continue;
    if(p.request.date!==day) {append(p,'stopped',{reason:'day_ended'},now);continue;}
    const series=p.request.firstPublicationKey.split(':')[1];
    const candidates=rows.filter(r=>r.raceKey.startsWith(day+'-') && r.articleSeries===series &&
      !view.legs.some(l=>l.raceKey===r.raceKey) && ms(r.deadlineAt)-now>120000 &&
      (view.legs.length || r.publicationKey===p.request.firstPublicationKey))
      .sort((a,b)=>ms(a.deadlineAt)-ms(b.deadlineAt)||a.publicationKey.localeCompare(b.publicationKey));
    for(const row of candidates) {
      try {
        const {receipt,bytes}=await source(row);
        const leg=makeLeg(row,receipt,bytes,view,now), snapshot={request:p.request,previous:chain(p),leg};
        p.pending={...snapshot,snapshotHash:hash(snapshot),...context};staged.push(copy(p.pending));break;
      } catch(e) {skipped.push({id:p.request.id,publicationKey:row.publicationKey,reason:e.message});}
    }
  }
  assertAppendOnly(state,next);return {state:next,staged,skipped};
}
function confirm(state, snapshots, artifact, now) {
  const next=copy(validateState(state));
  check(Number.isSafeInteger(artifact.id) && artifact.id>0 && /^sha256:[a-f0-9]{64}$/.test(artifact.digest) &&
    ms(artifact.createdAt)<=ms(artifact.confirmedAt) && ms(artifact.confirmedAt)<=now, 'artifact_invalid');
  for(const s of snapshots) {
    const p=next.plans[s.request.id];check(p && json(p.pending)===json(s),'pending_snapshot_mismatch');
    check(s.runId===artifact.runId && s.headSha===artifact.headSha &&
      artifact.name===`note-korogashi-${s.runId}-${s.runAttempt}` &&
      ms(s.leg.plannedAt)<ms(artifact.createdAt)+1000, 'artifact_context_mismatch');
    if(ms(s.leg.deadlineAt)-ms(artifact.confirmedAt)<=120000) append(p,'stopped',{reason:'registration_expired'},now);
    else append(p,'registered',{leg:s.leg,seal:{...artifact,snapshotHash:s.snapshotHash}},now);
    p.pending=null;
  }
  assertAppendOnly(state,next);return next;
}
function needsPublication(state) {
  return Object.values(validateState(state).plans).some(p=>project(p).status==='waiting_publication');
}
// Call only after an anonymous browser has verified the complete index body
// and its source links. Artifact registration alone is not publication proof.
function announce(state, {url,contentHash}, now) {
  check(validUrl(url) && /^[a-f0-9]{64}$/.test(contentHash), 'index_receipt_invalid');
  const next=copy(validateState(state));
  for(const p of Object.values(next.plans)) {
    const v=project(p);if(v.status!=='waiting_publication')continue;
    const last=v.legs.at(-1);
    if(!recentDates(now).includes(p.request.date) || ms(last.deadlineAt)-now<=120000)
      append(p,'stopped',{reason:'publication_expired'},now);
    else append(p,'announced',{number:last.number,url,contentHash,verifiedAt:iso(now)},now);
  }
  assertAppendOnly(state,next);return next;
}
function publicText(state, now) {
  const plans=Object.values(validateState(state).plans).filter(p=>recentDates(now).includes(p.request.date) && p.events.length);
  if(!plans.length)return '';
  const amount=n=>n===null?'未確定':`${n.toLocaleString('ja-JP')}円`;
  const stamp=value=>new Date(ms(value)+9*3600000).toISOString().slice(5,16).replace('T',' ');
  const statuses={not_registered:'登録待ち',not_started:'開始できず終了',waiting_publication:'掲載確認中',waiting_result:'公式結果待ち',waiting_next:'次の対象待ち',
    target_reached:'モデル資金が目標に到達',stopped_miss:'不的中で終了',stopped_max_legs:'最大回数で終了',stopped_insufficient_funds:'資金不足で終了',
    stopped_void:'不成立で停止',review_required:'照合確認中',stopped_no_suitable_race:'次の対象なしで終了',stopped_publication_late:'締切前の掲載確認が間に合わず終了（当該段は実績に算入せず）'};
  return ['コロがしコースの登録と経過',DISCLAIMER,
    '時刻は日本時間です。各段の締切2分前以降は参加しないでください。次の段が掲載されるまで資金を投入せず、最終段を終えるか目標に達したら終了します。',
    '以下は事前登録したモデル配分の記録です。実際の舟券購入・利益を表すものではありません。目標は最後の払戻と未投入端数の合計で、記事代は含みません。同じレースを使うコースは結果も連動します。',
    ...plans.map(p=>{const v=project(p);return [`${p.request.date}｜目標 ${amount(p.request.targetYen)}｜初回を含む最大${p.request.maxLegs}レース\nコースID：${p.request.id}`,
      `状態：${statuses[v.status]}｜開始資金 ${amount(v.initialYen)}`,
      ...v.legs.map(l=>[`${l.number}段目 ${l.place}${l.raceNo}R｜締切 ${stamp(l.deadlineAt)}`,
        `締切前登録 ${stamp(l.seal.confirmedAt)}｜${l.allocations.length}点｜モデル配分 ${amount(l.stakeYen)}｜未投入端数 ${amount(l.remainderYen)}`,
        l.publication ? `一覧での掲載確認 ${stamp(l.publication.verifiedAt)}` : '締切前の掲載確認記録なし。この段は的中・払戻の実績に算入していません。',
        `元記事の中心買い目を艇番の数字が小さい順に並べ、上から ${l.allocations.map(a=>amount(a.stakeYen)).join('・')} と配分します。追加候補は含みません。`,
        `結果：${({hit:'的中',miss:'不的中',void:'不成立',review:'確認中'})[l.settlement?.status]||'結果待ち'}｜モデル払戻 ${amount(l.payoutYen)}`,
        l.sourceArticleUrl].join('\n')),
      `モデル保有額 ${amount(v.balanceYen)}｜開始資金差引 ${amount(v.netBeforeFeesYen)}（記事代別）`].join('\n\n');})].join('\n\n');
}
module.exports={VERSION,POLICY,hash,json,request,requests,initialState,project,validateState,assertAppendOnly,makeLeg,prepare,confirm,needsPublication,announce,publicText};
