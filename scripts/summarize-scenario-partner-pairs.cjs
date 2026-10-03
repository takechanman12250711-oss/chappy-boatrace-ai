'use strict';
// Result join is separate from score extraction and ticket construction.
const fs=require('node:fs'),path=require('node:path');
const {compare}=require('./build-hit-first-practical-report.cjs');
const dir=path.resolve(process.argv[2]),reference=path.resolve(process.argv[3]);
const predictions=JSON.parse(fs.readFileSync(path.join(dir,'predictions.json')));
const old=JSON.parse(fs.readFileSync(reference));
const official=new Map(old.rows.map(r=>[r.raceKey,r]));
const cohort=new Set(require('./open-partner-frozen-cohort.json').raceKeys);
const rows=predictions.rows.map(r=>{
 const o=official.get(r.raceKey);if(!o||JSON.stringify(o.base)!==JSON.stringify(r.base))throw Error('reference mismatch');
 return {...r,actual:o.actual,payout:o.payout,refund:o.refund,place:o.place};
});
const group=rs=>({...compare(rs),details:rs.filter(r=>r.base.includes(r.actual)!==r.candidate.includes(r.actual)).map(r=>({raceKey:r.raceKey,actual:r.actual,payout:r.payout,type:r.candidate.includes(r.actual)?'gain':'loss'}))});
const clean=rows.filter(r=>!r.refund);
const report={policy:predictions.policy,all144:group(rows),frozen100:group(rows.filter(r=>cohort.has(r.raceKey))),noRefunds:group(clean),
 byScenario:Object.fromEntries([...new Set(clean.map(r=>r.scenarioType))].map(s=>[s,group(clean.filter(r=>r.scenarioType===s))])),
 productionChanged:false,adoptionStatus:'NOT_APPROVED',unseenValidation:false,
 limitations:'Same already-used 144R. Subgroups are descriptive, not separate preregistered trials. all144/frozen100 money ignores refunds; use noRefunds.',rows};
fs.writeFileSync(path.join(dir,'ci-comparison.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({frozen100:report.frozen100.primary,noRefunds:report.noRefunds.primary,
 byScenario:Object.fromEntries(Object.entries(report.byScenario).map(([k,v])=>[k,v.primary]))},null,2));
