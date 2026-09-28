'use strict';
// Research-only conditional ranking; never imported by the browser or collector.
// Finite softmax weights do not constitute validated winning probabilities.
const crypto = require('node:crypto');
const VERSION = 'conditional-partner-rank-calibration-v1';
const SCENARIOS = ['escape', 'sashi', 'threeAttack', 'fourAttack'];
const DIMENSION = 50;
const SETTINGS = Object.freeze({ridge:0.05, learningRate:0.2, iterations:1500, minimumTrainingRaces:100});
const isBoat = n => Number.isInteger(n) && n >= 1 && n <= 6;
const exact = t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
const sha = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function pairsFromInput({head, scenarioType, outcomes, courseByBoat} = {}) {
  if (!isBoat(head) || !SCENARIOS.includes(scenarioType)) throw Error('invalid-head-or-scenario');
  if (!Array.isArray(outcomes) || outcomes.length !== 6) throw Error('six-outcomes-required');
  const byBoat = new Map();
  for (const r of outcomes) {
    if (!isBoat(r?.boatNo) || byBoat.has(r.boatNo)) throw Error('invalid-or-duplicate-boat');
    for (const k of ['secondScore', 'thirdScore']) if (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] < 0 || r[k] > 100) throw Error('invalid-positional-score');
    byBoat.set(r.boatNo, {boatNo:r.boatNo, secondScore:r.secondScore, thirdScore:r.thirdScore});
  }
  const courses = [1,2,3,4,5,6].map(b => courseByBoat?.[b]);
  if (!courses.every(isBoat) || new Set(courses).size !== 6) throw Error('invalid-recorded-course-map');
  const eligible = [...byBoat.values()].filter(r => r.boatNo !== head).sort((a,b) => a.boatNo-b.boatNo);
  const mean2 = eligible.reduce((s,r) => s+r.secondScore, 0)/5;
  const mean3 = eligible.reduce((s,r) => s+r.thirdScore, 0)/5;
  const offset = 2 + SCENARIOS.indexOf(scenarioType)*12, pairs = [];
  for (const a of eligible) for (const b of eligible) {
    if (a.boatNo === b.boatNo) continue;
    pairs.push({ticket:`${head}-${a.boatNo}-${b.boatNo}`, second:a.boatNo, third:b.boatNo,
      x2:(a.secondScore-mean2)/100, x3:(b.thirdScore-mean3)/100,
      c2:offset+courseByBoat[a.boatNo]-1, c3:offset+6+courseByBoat[b.boatNo]-1,
      secondScore:a.secondScore, thirdScore:b.thirdScore});
  }
  return pairs;
}
function validateModel(model) {
  if (model?.version !== VERSION || !Array.isArray(model.weights) || model.weights.length !== DIMENSION ||
      !model.weights.every(w => typeof w === 'number' && Number.isFinite(w)) || model.weights[0] < 0 || model.weights[1] < 0) throw Error('invalid-model');
}
function logit(p, w) { return w[0]*p.x2 + w[1]*p.x3 + w[p.c2] + w[p.c3]; }
function distribution(pairs, w) {
  const logits = pairs.map(p => logit(p, w)), max = Math.max(...logits);
  const exps = logits.map(v => Math.exp(v-max)), sum = exps.reduce((a,b) => a+b,0);
  return {logits, weights:exps.map(v => v/sum), logNormalizer:max+Math.log(sum)};
}
function rankPairs(input, model) {
  validateModel(model);
  const pairs = pairsFromInput(input), d = distribution(pairs, model.weights);
  return pairs.map((p,i) => ({...p, rankingScore:d.logits[i], modelWeight:d.weights[i]}))
    .sort((a,b) => b.rankingScore-a.rankingScore ||
      (b.secondScore+b.thirdScore)-(a.secondScore+a.thirdScore) ||
      Math.min(b.secondScore,b.thirdScore)-Math.min(a.secondScore,a.thirdScore) || a.second-b.second || a.third-b.third)
    .map((p,i) => ({...p, rank:i+1}));
}
function selectPartners({base, ...input}, model) {
  if (!Array.isArray(base) || !base.length || base.length > 10 || !base.every(exact) || new Set(base).size !== base.length) throw Error('invalid-base-tickets');
  const pairs = rankPairs(input, model), count = base.filter(t => Number(t[0]) === input.head).length;
  if (!count) throw Error('head-not-in-base');
  let k=0;
  const tickets = base.map(t => Number(t[0]) === input.head ? pairs[k++].ticket : t);
  if (tickets.length !== base.length || new Set(tickets).size !== tickets.length) throw Error('count-or-duplicate-invariant');
  return {version:VERSION, tickets, rankedPairs:pairs, headCount:count,
    added:tickets.filter(t => !base.includes(t)), removed:base.filter(t => !tickets.includes(t)), automaticAdoption:false};
}
function fitModel(records, labels) {
  if (!Array.isArray(records) || !Array.isArray(labels)) throw Error('arrays-required');
  if (new Set(records.map(r=>r.raceKey)).size !== records.length || new Set(labels.map(r=>r.raceKey)).size !== labels.length) throw Error('duplicate-race-key');
  const byKey = new Map(labels.map(r => [r.raceKey,r])), rows=[], excluded=[];
  for (const r of records) {
    // Validation/results after the cutoff cannot affect fitting, including errors in those rows.
    if (typeof r.date !== 'string' || r.date < '20260901' || r.date > '20260917') continue;
    const y = byKey.get(r.raceKey);
    if (!y || y.unavailable || y.refund || !exact(y.actual)) { excluded.push({raceKey:r.raceKey,reason:'unavailable-or-refund'}); continue; }
    if (!Number.isFinite(Date.parse(r.selectedAt)) || !Number.isFinite(Date.parse(r.deadlineAt)) || Date.parse(r.selectedAt)>=Date.parse(r.deadlineAt)) throw Error('training-not-pre-deadline');
    const pairs = pairsFromInput(r);
    if (Number(y.actual[0]) !== r.head) { excluded.push({raceKey:r.raceKey,reason:'actual-head-different-training-only'}); continue; }
    const target = pairs.findIndex(p => p.ticket === y.actual);
    if (target < 0) throw Error('actual-pair-not-in-twenty');
    rows.push({raceKey:r.raceKey,date:r.date,pairs,target});
  }
  rows.sort((a,b)=>a.raceKey.localeCompare(b.raceKey));
  if (rows.length < SETTINGS.minimumTrainingRaces) throw Error(`insufficient-training-races:${rows.length}`);
  const w = Array(DIMENSION).fill(0), trace = [];
  function objectiveGradient() {
    const g = w.map(x => SETTINGS.ridge*x); let loss = SETTINGS.ridge*w.reduce((s,x)=>s+x*x,0)/2;
    for (const r of rows) {
      const d=distribution(r.pairs,w); loss += (d.logNormalizer-d.logits[r.target])/rows.length;
      for (let j=0;j<r.pairs.length;j++) {
        const p=r.pairs[j], residual=(d.weights[j]-(j===r.target?1:0))/rows.length;
        g[0]+=residual*p.x2;g[1]+=residual*p.x3;g[p.c2]+=residual;g[p.c3]+=residual;
      }
    }
    return {loss,g};
  }
  for (let i=0;i<SETTINGS.iterations;i++) {
    const {loss,g}=objectiveGradient();
    if (!Number.isFinite(loss) || !g.every(Number.isFinite)) throw Error('nonfinite-optimization');
    if (i%100===0) trace.push({iteration:i,loss});
    for (let j=0;j<DIMENSION;j++) w[j]-=SETTINGS.learningRate*g[j];
    w[0]=Math.max(0,w[0]);w[1]=Math.max(0,w[1]);
  }
  const final=objectiveGradient();trace.push({iteration:SETTINGS.iterations,loss:final.loss});
  const projectedGradient = final.g.map((g,i) => i<2 && w[i]===0 ? Math.min(0,g):g);
  return {version:VERSION, weights:w, settings:SETTINGS, trainingRange:['20260901','20260917'],
    trainingRaceCount:rows.length, trainingRaceIds:rows.map(r=>r.raceKey), trainingRowsSha256:sha(rows),
    optimization:{trace,projectedGradientMax:Math.max(...projectedGradient.map(Math.abs))}, excluded,
    features:['centered-secondScore/100','centered-thirdScore/100','scenario-position-course-one-hot'],
    validatedProbability:false, automaticAdoption:false};
}
module.exports={VERSION,SCENARIOS,DIMENSION,SETTINGS,pairsFromInput,rankPairs,selectPartners,fitModel};
