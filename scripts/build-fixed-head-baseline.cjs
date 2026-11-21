'use strict';

// Compare existing audited captures; never rerun an engine on later results.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const valid = t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
// Diagnostic benchmark, NOT an optimized forecast. Frozen independently of
// the outcomes: boat 1 first, then ascending second/third boat numbers.
const FIXED_ORDER = Object.freeze([2,3,4,5,6].flatMap(b =>
  [2,3,4,5,6].filter(c => c !== b).map(c => `1-${b}-${c}`)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pct = (a,b) => b ? Math.round(a / b * 10000) / 100 : null;
function verify(row) {
  if (!/^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(row.raceKey || '') ||
      !Number.isFinite(Date.parse(row.selectedAt)) || !row.generation ||
      !Array.isArray(row.selected) || row.selected.length < 1 || row.selected.length > 10 ||
      !row.selected.every(valid) || new Set(row.selected).size !== row.selected.length ||
      !valid(row.actual) || !Number.isFinite(row.payout) || row.payout <= 0 ||
      typeof row.practicalHit !== 'boolean' || row.practicalHit !== row.selected.includes(row.actual)) {
    throw Error('fixed_baseline_audit_row_invalid');
  }
}
function evaluate(row) {
  verify(row);
  const fixed = FIXED_ORDER.slice(0, row.selected.length);
  const currentHit = row.selected.includes(row.actual), fixedHit = fixed.includes(row.actual);
  const actualHead = row.actual[0], pair = row.actual.slice(0,3);
  const miss = currentHit ? 'hit' : !row.selected.some(t => t[0] === actualHead) ? 'head-missing'
    : !row.selected.some(t => t.slice(0,3) === pair) ? 'second-missing' : 'third-missing';
  return { raceKey: row.raceKey, selectedAt: row.selectedAt, generation: row.generation,
    source: row.source, mainHead: row.head, ticketCount: fixed.length, stakeYen: fixed.length * 100,
    currentHit, fixedHit, currentReturnYen: currentHit ? row.payout : 0,
    fixedReturnYen: fixedHit ? row.payout : 0, identical: [...row.selected].sort().join() === [...fixed].sort().join(), miss,
    selectedHeadCounts:Object.fromEntries([1,2,3,4,5,6].map(h=>[h,row.selected.filter(t=>Number(t[0])===h).length]).filter(([,n])=>n)),
    winningHead:currentHit?Number(row.actual[0]):null };
}
function summarize(rows) {
  const stakeYen = rows.reduce((n,r) => n+r.stakeYen,0);
  const metric = prefix => {
    const hits = rows.filter(r => r[`${prefix}Hit`]).length;
    const returnYen = rows.reduce((n,r) => n+r[`${prefix}ReturnYen`],0);
    const largestReturnYen = rows.reduce((largest,r)=>Math.max(largest,r[`${prefix}ReturnYen`]),0);
    return { hits, hitRate: pct(hits,rows.length), returnYen, profitYen: returnYen-stakeYen,
      roi: pct(returnYen,stakeYen), largestReturnYen };
  };
  const current = metric('current'), fixed = metric('fixed');
  const misses = {}, mainHeads = {};
  const selectedHeadCoverage={boat1Races:0,boat1OnlyRaces:0,mixedHeadRaces:0,formalHeadMissingRaces:0,formalHeadUnknownRaces:0};
  const allocation=()=>({tickets:0,hits:0,stakeYen:0,returnYen:0,largestReturnYen:0});
  const selectedHeadAllocation={boat1Head:allocation(),otherHeads:allocation()};
  for (const r of rows) {
    misses[r.miss] = (misses[r.miss] || 0)+1;
    mainHeads[r.mainHead ?? 'unknown'] = (mainHeads[r.mainHead ?? 'unknown'] || 0)+1;
    const heads=r.selectedHeadCounts,keys=Object.keys(heads||{});
    if(!keys.length||keys.some(h=>!/^[1-6]$/.test(h)||!Number.isInteger(heads[h])||heads[h]<1)||
        Object.values(heads).reduce((a,n)=>a+n,0)!==r.ticketCount)throw Error('fixed_baseline_selected_heads_invalid');
    const one=heads[1]||0,formal=Number(r.mainHead);
    if(one)selectedHeadCoverage.boat1Races++;
    if(keys.length===1&&one)selectedHeadCoverage.boat1OnlyRaces++;
    if(keys.length>1)selectedHeadCoverage.mixedHeadRaces++;
    if(!Number.isInteger(formal)||formal<1||formal>6)selectedHeadCoverage.formalHeadUnknownRaces++;
    else if(!heads[formal])selectedHeadCoverage.formalHeadMissingRaces++;
    selectedHeadAllocation.boat1Head.tickets+=one;
    selectedHeadAllocation.otherHeads.tickets+=r.ticketCount-one;
    if(r.currentHit){
      if(!Number.isInteger(r.winningHead)||r.winningHead<1||r.winningHead>6||!heads[r.winningHead])throw Error('fixed_baseline_winning_head_invalid');
      const group=r.winningHead===1?selectedHeadAllocation.boat1Head:selectedHeadAllocation.otherHeads;
      group.hits++;group.returnYen+=r.currentReturnYen;group.largestReturnYen=Math.max(group.largestReturnYen,r.currentReturnYen);
    }
  }
  for(const group of Object.values(selectedHeadAllocation)){
    group.stakeYen=group.tickets*100;group.profitYen=group.returnYen-group.stakeYen;group.roi=pct(group.returnYen,group.stakeYen);
  }
  return { races: rows.length, stakeYen, current, fixed,selectedHeadCoverage,selectedHeadAllocation,
    paired: { currentOnlyHits: rows.filter(r=>r.currentHit&&!r.fixedHit).length,
      fixedOnlyHits: rows.filter(r=>r.fixedHit&&!r.currentHit).length,
      netHits: current.hits-fixed.hits, returnDeltaYen: current.returnYen-fixed.returnYen,
      identicalRaces: rows.filter(r=>r.identical).length }, mainHeads, misses };
}
function build(audit, { sourceSha256, historical } = {}) {
  if (audit.version !== 'escape-main-audit-v1' || audit.analysisInputContract !== 'official-pre-deadline-cohort-v1' ||
      !Array.isArray(audit.rows) || !audit.rows.length || audit.total?.races !== audit.rows.length ||
      !/^[a-f0-9]{64}$/.test(sourceSha256 || '')) throw Error('fixed_baseline_audit_invalid');
  const seen = new Set();
  const rows = audit.rows.map(r => {
    if (seen.has(r.raceKey)) throw Error('fixed_baseline_duplicate_race');
    seen.add(r.raceKey); return evaluate(r);
  }).sort((a,b)=>Date.parse(a.selectedAt)-Date.parse(b.selectedAt)||a.raceKey.localeCompare(b.raceKey));
  const group = key => Object.fromEntries([...new Set(rows.map(r=>r[key]))].sort()
    .map(value=>[value,summarize(rows.filter(r=>r[key]===value))]));
  return { version: 'fixed-head-baseline-v1', generatedAt: new Date().toISOString(),
    productionChanged: false, usableForPrediction: false, automaticApplication: false,
    input: { auditVersion:audit.version, auditGeneratedAt:audit.generatedAt, sourceSha256,
      sourceCommit:audit.sourceCommit, excluded:audit.diagnostics?.excluded || {},
      ...(historical ? { historicalResultRaces:historical.raceCount, historicalGeneratedAt:historical.generatedAt,
        historicalUsage:'inventory only; not joined into the paired prediction cohort' } : {}) },
    policy: { benchmark:'fixed-boat1-ascending-v1', tickets:FIXED_ORDER, unitYen:100,
      sameRaces:true, sameTicketsPerRace:true, outcomeBasedTicketSelection:false,
      note:'Historical diagnostic, not an untouched holdout or evidence of a deployable improvement.',
      mainHeadsMeaning:'Saved formal main-scenario head, not the heads of every selected ticket.' },
    total:summarize(rows), latest100:summarize(rows.slice(-100)), byGeneration:group('generation'),
    bySource:group('source'),
    byGenerationAndSource:Object.fromEntries([...new Set(rows.map(r=>r.generation))].sort().map(generation=>[generation,
      Object.fromEntries([...new Set(rows.filter(r=>r.generation===generation).map(r=>r.source))].sort()
        .map(source=>[source,summarize(rows.filter(r=>r.generation===generation&&r.source===source))]))])),
    allocationNote:'Saved-ticket allocation is descriptive; head groups use different stakes and are not an equal-budget replacement experiment.',
    byMonth:Object.fromEntries([...new Set(rows.map(r=>r.raceKey.slice(0,6)))].sort()
      .map(month=>[month,summarize(rows.filter(r=>r.raceKey.startsWith(month)))])),
    rows };
}
if (require.main === module) {
  const [source,output] = process.argv.slice(2);
  if (!source || !output || path.resolve(source)===path.resolve(output)) throw Error('usage: node build-fixed-head-baseline.cjs INPUT OUTPUT');
  const bytes = fs.readFileSync(source), historyPath=path.join(path.dirname(source),'race-patterns.json');
  const report=build(JSON.parse(bytes),{sourceSha256:hash(bytes),
    historical:fs.existsSync(historyPath)?JSON.parse(fs.readFileSync(historyPath)):undefined});
  fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({total:report.total,latest100:report.latest100,input:report.input}));
}
module.exports={FIXED_ORDER,evaluate,summarize,build};
