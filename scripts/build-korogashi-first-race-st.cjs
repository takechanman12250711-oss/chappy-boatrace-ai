'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const input = require('./analysis-input-contract');
const ledger = require('./build-continuous-performance-ledger.cjs');
const evaluator = require('./final-ticket-candidate-evaluator.cjs');
const protocol = require('../config/korogashi-first-race-st-v1.json');
const REPO = 'takechanman12250711-oss/chappy-boatrace-ai';
const strictDate = value => /^\d{8}$/.test(String(value));
const pOf = record => record.prediction || record;
const eOf = record => pOf(record).verificationEvidence || pOf(record).practicalSelection?.verificationEvidence || {};

// Retain all contract flags and envelope fields; discard only large, unused model pools.
function compact(record) {
  const p = pOf(record), e = eOf(record);
  const evidence = {generation:e.generation, roles:e.roles, stSlit:e.stSlit};
  const fields = {preRaceConditions:p.preRaceConditions, practicalTickets:p.practicalTickets,
    practicalSelection:p.practicalSelection && {tickets:p.practicalSelection.tickets,
      purchaseDecision:p.practicalSelection.purchaseDecision, verificationEvidence:evidence},
    verificationEvidence:evidence, isRetrospective:p.isRetrospective, predictionMode:p.predictionMode,
    officialResultUsedForPrediction:p.officialResultUsedForPrediction,
    officialResultUsedForEvaluation:p.officialResultUsedForEvaluation};
  const out = Object.fromEntries(['raceKey','date','raceDate','targetDate','jcd','placeCode','raceNo','rno','race',
    'selectedAt','capturedAt','createdAt','deadlineAt','deadline','verificationMode','isRetrospective',
    'officialResultUsedForPrediction','officialResultUsedForEvaluation','preRaceConditions','__analysisInputKind','__file']
    .map(key => [key, record[key]]));
  if (record.prediction) out.prediction = fields;
  else Object.assign(out, fields);
  return out;
}
function canonical(records) {
  const byKey = new Map();
  const priority = r => r.__analysisInputKind === 'primary-prediction' ? 3 : r.__analysisInputKind === 'verification-prediction' ? 2 : 1;
  for (const r of records) {
    if (!(r.prediction?.preRaceConditions || r.preRaceConditions)) continue;
    const key = input.raceKey(r); if (!key) continue;
    const prior = byKey.get(key);
    if (!prior || priority(r) > priority(prior) || (priority(r) === priority(prior) &&
      Date.parse(r.selectedAt || r.capturedAt || r.createdAt) > Date.parse(prior.selectedAt || prior.capturedAt || prior.createdAt))) byKey.set(key, r);
  }
  return [...byKey].map(([key, r]) => ({...r, __analysisRaceKey:key}));
}
function classify(record) {
  const p = pOf(record), tickets = ledger.practicalTickets(p), evidence = eOf(record);
  const raw = Array.isArray(p.practicalTickets) ? p.practicalTickets : p.practicalSelection?.tickets;
  if (!Array.isArray(raw) || raw.length > 7 || raw.some(t => !input.normalizeTicket(typeof t==='string'?t:t?.ticket||t?.combination||t?.text))) return {baseline:false, reason:'original-ticket-count-or-format-invalid'};
  if (tickets.length < 1 || tickets.length > 7 || tickets.some(t => input.normalizeTicket(t) !== t)) return {baseline:false, reason:'original-ticket-count-or-format-invalid'};
  if (p.practicalSelection?.purchaseDecision?.status === 'skip') return {baseline:false, reason:'existing-purchase-skip'};
  const attacker = evidence.roles?.attackerBoatNo;
  const roles = evidence.stSlit?.roles;
  const validAttacker = Number.isInteger(attacker) && attacker >= 1 && attacker <= 6;
  const matches = validAttacker && Array.isArray(roles) ? roles.filter(r => r.boatNo === attacker) : [];
  const formal = matches.some(r => r.isFormal === true);
  return {baseline:true, candidate:formal, stEvidence:formal ? 'formal' : matches.some(r => r.isFormal === false) ? 'not-formal' : 'unknown',
    stConflicting:matches.some(r=>r.isFormal===true) && matches.some(r=>r.isFormal===false),
    purchaseStatus:p.practicalSelection?.purchaseDecision?.status ?? null};
}
function officialMap(records) {
  const map = new Map();
  for (const r of records) {
    if (r.__analysisInputKind !== 'official-result' || !input.isOfficialResultSource(r)) continue;
    const key = input.raceKey(r); if (key) map.set(key, r);
  }
  return map;
}
function settlement(row, results) {
  const result = results.get(row.__analysisRaceKey);
  if (!result) return {status:'result-unknown'};
  if ((Array.isArray(result.refunds) && result.refunds.length) || result.refund === true || result.refunded === true || result.deadHeat === true || result.void === true || ['void','cancelled','canceled'].includes(result.status) || result.starts?.some(r=>r.falseStart===true || r.lateStart===true || ['F','L'].includes(r.marker))) return {status:'special-result-excluded'};
  if (result.resultAvailable !== true || result.status !== 'finished' || !input.actualTicket(result)) return {status:'result-unknown'};
  const finished = input.orderFromFinishers(result.finishers);
  if (finished.length && finished.join('-') !== input.actualTicket(result)) return {status:'result-conflict'};
  const source=result.officialResult || result.raceResult || (typeof result.result==='object' && result.result) || result;
  const rawPayout=source.trifecta?.payout ?? source.trifectaPayout ?? source.payout3t ?? source.payout;
  if(typeof rawPayout!=='number')return {status:'payout-unknown'};
  const payout = evaluator.payout(result);
  if (!Number.isSafeInteger(payout) || payout <= 0) return {status:'payout-unknown'};
  return {status:'settled', ...ledger.evaluate({...row, __officialResult:result})};
}
function summary(rows) {
  const settled = rows.filter(r => r.status === 'settled');
  const sum = ledger.summary(settled);
  return {selected:rows.length, settled:settled.length, unknown:rows.length-settled.length,
    ...sum, hitRate:settled.length ? sum.hitRate : null, roi:sum.stakeYen ? sum.roi : null,
    complete:rows.every(r => r.status === 'settled'),
    totalProfitYen:rows.length && rows.every(r => r.status === 'settled') ? sum.profitYen : null};
}
function byFirst(rows) {
  const days = new Map();
  for (const r of rows.slice().sort((a,b) => Date.parse(a.deadlineAt || a.deadline) - Date.parse(b.deadlineAt || b.deadline) || a.__analysisRaceKey.localeCompare(b.__analysisRaceKey))) {
    const day = r.__analysisRaceKey.slice(0,8);
    if (!days.has(day)) days.set(day,r);
  }
  return days;
}
function pair(firstA, firstB, results, dates) {
  const rows = dates.map(date => {
    const a=firstA.get(date), b=firstB.get(date), av=a?settlement(a,results):null, bv=b?settlement(b,results):null;
    return {date, baselineKey:a?.__analysisRaceKey || null, candidateKey:b?.__analysisRaceKey || null,
      baseline:av, candidate:bv, profitDifferenceYen:av?.status==='settled' && bv?.status==='settled' ?
        bv.returnYen-bv.stakeYen-av.returnYen+av.stakeYen : null};
  });
  const known = rows.filter(r => r.profitDifferenceYen !== null);
  return {rows, pairedSettledDays:known.length, sameRaceDays:known.filter(r=>r.baselineKey===r.candidateKey).length,
    differentRaceDays:known.filter(r=>r.baselineKey!==r.candidateKey).length,
    pairedProfitDifferenceYen:known.reduce((s,r)=>s+r.profitDifferenceYen,0),
    noBaselineSelectionDays:rows.filter(r=>!r.baselineKey).length,
    noCandidateSelectionDays:rows.filter(r=>!r.candidateKey).length,
    incompleteSelectedDays:rows.filter(r=>(r.baselineKey && r.baseline.status!=='settled') || (r.candidateKey && r.candidate.status!=='settled')).length};
}
function aggregate(rows, results, dates) {
  const a=rows.filter(r=>r.classification.baseline), b=a.filter(r=>r.classification.candidate);
  const aSettled=a.map(r=>settlement(r,results)), bSettled=b.map(r=>settlement(r,results));
  const missing={}; for(const r of a) missing[r.classification.stEvidence]=(missing[r.classification.stEvidence]||0)+1;
  const mid=Math.ceil(dates.length/2), halves=[dates.slice(0,mid),dates.slice(mid)];
  const sensitivity = group => {
    const sorted=group.filter(r=>r.status==='settled').slice().sort((l,r)=>r.returnYen-l.returnYen || l.raceKey.localeCompare(r.raceKey));
    return {removedRaceKey:sorted[0]?.raceKey||null, ...summary(sorted.slice(1))};
  };
  return {baseline:summary(aSettled), candidate:summary(bSettled), candidateDates:new Set(b.map(r=>r.__analysisRaceKey.slice(0,8))).size,
    stEvidence:missing, stConflicting:a.filter(r=>r.classification.stConflicting).length, purchaseStatusUnknown:a.filter(r=>r.classification.purchaseStatus===null).length,
    chronologicalHalves:halves.map(days=>({from:days[0]||null,to:days.at(-1)||null,
      baseline:summary(a.filter(r=>days.includes(r.__analysisRaceKey.slice(0,8))).map(r=>settlement(r,results))),
      candidate:summary(b.filter(r=>days.includes(r.__analysisRaceKey.slice(0,8))).map(r=>settlement(r,results)))})),
    withoutLargestPayout:{baseline:sensitivity(aSettled),candidate:sensitivity(bSettled)},
    dailyFirstProxy:pair(byFirst(a),byFirst(b),results,dates)};
}
function datesBetween(from,to) {
  if (!strictDate(from)||!strictDate(to)||from>to) throw Error('invalid_date_range');
  const out=[], end=Date.parse(`${to.slice(0,4)}-${to.slice(4,6)}-${to.slice(6,8)}T00:00:00Z`);
  for(let t=Date.parse(`${from.slice(0,4)}-${from.slice(4,6)}-${from.slice(6,8)}T00:00:00Z`); t<=end; t+=86400000) out.push(new Date(t).toISOString().slice(0,10).replaceAll('-',''));
  return out;
}
function build(records, period, manifest=[]) {
  const dates=datesBetween(period.from,period.to), results=officialMap(records), reasons={};
  const all=canonical(records).filter(r=>dates.includes(r.__analysisRaceKey.slice(0,8)));
  const eligible=[];
  for(const r of all) {
    const reason=input.preDeadlineReason(r); if(reason){reasons[reason]=(reasons[reason]||0)+1;continue;}
    eligible.push({...r, classification:classify(r)});
  }
  const generations={}; for(const r of eligible)(generations[ledger.generationOf(r)]??=[]).push(r);
  const grouped=Object.entries(generations).map(([generationKey,rows])=>({generationKey,...aggregate(rows,results,dates)}));
  const pooled=aggregate(eligible,results,dates), min=protocol.minimumEvidence;
  const blockers=[];
  if(pooled.purchaseStatusUnknown)blockers.push('purchase-status-unknown');
  if(pooled.stConflicting)blockers.push('st-role-conflicting');
  if(pooled.candidate.settled<min.candidateRaces)blockers.push('candidate-races-below-minimum');
  if(pooled.candidateDates<min.candidateDates)blockers.push('candidate-dates-below-minimum');
  if(pooled.dailyFirstProxy.pairedSettledDays<min.pairedDailySelections)blockers.push('paired-daily-selections-below-minimum');
  if(!pooled.baseline.complete||!pooled.candidate.complete)blockers.push('result-unknown');
  if(pooled.stEvidence.unknown)blockers.push('st-selection-unknown');
  if(grouped.length!==1||grouped[0]?.generationKey==='unknown')blockers.push('multiple-or-unknown-generations');
  if(!(pooled.candidate.roi>100 && pooled.candidate.roi>pooled.baseline.roi))blockers.push('candidate-roi-not-over-100-and-baseline');
  if(pooled.chronologicalHalves.some(h=>!(h.candidate.roi!==null && h.baseline.roi!==null && h.candidate.roi>h.baseline.roi)))blockers.push('improvement-not-repeated-in-both-halves');
  if(!(pooled.dailyFirstProxy.pairedProfitDifferenceYen>0))blockers.push('no-positive-paired-daily-difference');
  if(!(pooled.withoutLargestPayout.candidate.roi!==null && pooled.withoutLargestPayout.baseline.roi!==null && pooled.withoutLargestPayout.candidate.roi>pooled.withoutLargestPayout.baseline.roi))blockers.push('largest-payout-sensitivity-not-passed');
  return {period,manifest,diagnostics:{canonicalPredictions:all.length,preDeadlinePredictions:eligible.length,excludedReasons:reasons,
    nonBaseline:eligible.filter(r=>!r.classification.baseline).reduce((o,r)=>(o[r.classification.reason]=(o[r.classification.reason]||0)+1,o),{})},
    pooled,generations:grouped,review:{minimumEvidenceSatisfied:!blockers.some(b=>b.endsWith('below-minimum')),blockers,
      productionAdoptionAllowed:false,reason:'retrospective-proxy-needs-separate-forward-validation-and-owner-approval'},
    selectionRows:eligible.filter(r=>r.classification.baseline).map(r=>({raceKey:r.__analysisRaceKey,selectedAt:r.selectedAt||r.capturedAt,deadlineAt:r.deadlineAt||r.deadline,
      generationKey:ledger.generationOf(r),...r.classification,...settlement(r,results)}))};
}
async function loadPeriod(period, ref) {
  const records=[],manifest=[];
  for(const date of datesBetween(period.from,period.to)) {
    for(const kind of ['predictions','results']) {
      const relative=`data/${kind}/${date}.json`;
      const response=await fetch(`https://raw.githubusercontent.com/${REPO}/${ref}/${relative}`,{signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw Error(`source_http_${response.status}:${relative}`);
      let text=await response.text(); const sha256=crypto.createHash('sha256').update(text).digest('hex'),bytes=Buffer.byteLength(text);
      let data=JSON.parse(text); text=null;
      if(kind==='results' && data.complete!==true)throw Error(`incomplete_results:${date}`);
      const envelope=kind==='predictions'?{predictions:data.predictions||[],verificationPredictions:data.verificationPredictions||[]}:
        {races:(data.races||[]).map(r=>({...r,date:r.date||data.date||date}))};
      records.push(...input.flattenInputRecords(envelope,relative,kind==='predictions'?'primary-prediction':'official-result').map(r=>kind==='predictions'?compact(r):r));
      manifest.push({path:relative,ref,bytes,sha256}); data=null;
      if(global.gc)global.gc();
    }
    process.stderr.write(`loaded ${date}\n`);
  }
  return build(records,period,manifest);
}
async function main() {
  const outArg=process.argv.indexOf('--out'); if(outArg<0 || !process.argv[outArg+1])throw Error('usage: node --expose-gc --max-old-space-size=3072 scripts/build-korogashi-first-race-st.cjs --out <research-report.json>');
  const explored=await loadPeriod(protocol.explored,protocol.explored.previousRef);
  const validation=await loadPeriod(protocol.validation,protocol.sourceRef);
  const sourceFiles=['scripts/build-korogashi-first-race-st.cjs','scripts/analysis-input-contract.js','scripts/build-continuous-performance-ledger.cjs','scripts/final-ticket-candidate-evaluator.cjs','js/prediction-calibration.js'];
  const implementation=sourceFiles.map(file=>({path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8').replaceAll('\r\n','\n')).digest('hex')}));
  const report={schemaVersion:1,...protocol,implementationHashEncoding:'utf8-normalized-lf',protocolHash:crypto.createHash('sha256').update(JSON.stringify(protocol)).digest('hex'),implementation,generatedAt:new Date().toISOString(),explored,validation};
  const target=path.resolve(process.argv[outArg+1]);
  const root=path.resolve(__dirname,'..');
  if(!target.startsWith(path.join(root,'data','stats')+path.sep))throw Error('research_output_must_be_under_data_stats');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({out:target,explored:{baseline:explored.pooled.baseline,candidate:explored.pooled.candidate},validation:{baseline:validation.pooled.baseline,candidate:validation.pooled.candidate,dailyDifferenceYen:validation.pooled.dailyFirstProxy.pairedProfitDifferenceYen},review:validation.review},null,2)+'\n');
}
if(require.main===module)main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
module.exports={protocol,compact,canonical,classify,settlement,summary,byFirst,aggregate,build,datesBetween,loadPeriod};
