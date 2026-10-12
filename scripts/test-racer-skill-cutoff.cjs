'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const builder=path.join(__dirname,'build-race-stats.js');
const support=require('./independent-partner-context-v1.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'racer-cutoff-'));
const outputs = [
  'race-patterns.json', 'venue-race-patterns.json', 'racer-skill-patterns.json',
  'racer-venue-starts.json', 'course-structure-patterns.json', 'trifecta-by-venue-race.json'
];
const readOutputs = () => Object.fromEntries(outputs.map(name => [name,
  JSON.parse(fs.readFileSync(path.join(root, 'data/stats', name), 'utf8'))
]));
function assertCutoff(snapshots, expected) {
  for (const [name, value] of Object.entries(snapshots)) {
    assert.equal(value.lastDate, expected, `${name}: effective closed-day cutoff`);
    if (value.analysisWindow) assert.equal(value.analysisWindow.latestDate, expected, name);
  }
  const times = Object.values(snapshots).map(value => Date.parse(value.generatedAt));
  assert.ok(times.every(Number.isFinite));
  assert.ok(Math.max(...times) - Math.min(...times) <= 5000, 'one compatible bundle generation');
}
function comparable(value) {
  const result = structuredClone(value);
  delete result.generatedAt;
  delete result.sourceFileCount; // Counts discovered files, including excluded open days.
  return result;
}
const race=(date,raceNo)=>({date,jcd:'06',raceNo,source:'boatrace-official',resultAvailable:true,
  finishers:[1,2,3,4,5,6].map((boat,i)=>({boat,rank:i+1,registerNo:String(4000+boat)})),
  starts:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:0.1})),winningMethod:'逃げ',trifecta:{combination:'1-2-3',payout:1000}});
const day=(date,closed)=>({date,source:'boatrace-official',collectedAt:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}T03:00:00Z`,
  venues:[{jcd:'06'}],venueCount:1,raceCount:closed?12:1,completedRaces:closed?12:1,pendingRaces:0,failedRaces:0,
  races:Array.from({length:closed?12:1},(_,i)=>race(date,i+1))});
try{
  fs.mkdirSync(path.join(root,'data/results'),{recursive:true});
  const put=d=>fs.writeFileSync(path.join(root,'data/results',d.date+'.json'),JSON.stringify(d));
  const build=()=>{execFileSync(process.execPath,[builder],{cwd:root});return support.load(root);};
  put(day('20261010',true));
  const before=build().data;
  const beforeOutputs = readOutputs();
  assertCutoff(beforeOutputs, '20261010');
  put(day('20261011',false)); // A real result from an incomplete current day must stay excluded.
  const source=build(),after=source.data;
  const afterOutputs = readOutputs();
  assertCutoff(afterOutputs, '20261010');
  for (const name of outputs) {
    assert.deepEqual(comparable(afterOutputs[name]), comparable(beforeOutputs[name]),
      `${name}: excluded open day changes no aggregates or effective windows`);
  }
  const trifecta = afterOutputs['trifecta-by-venue-race.json'];
  assert.equal(trifecta.asOfDate, '20261011', 'display as-of remains the next day');
  assert.equal(trifecta.dataThroughDate, '20261010');
  assert.equal(trifecta.recentWindowDays, 30);
  assert.equal(trifecta.recentWindowStartDate, '20260911');
  assert.equal(trifecta.trifectaByVenue['06'].asOfDate, trifecta.asOfDate);
  assert.equal(trifecta.trifectaByVenue['06'].dataThroughDate, trifecta.dataThroughDate);
  assert.equal(trifecta.trifectaByVenue['06'].windowStartDate, trifecta.recentWindowStartDate);
  assert.equal(after.lastDate,'20261010');
  assert.equal(after.analysisWindow.latestDate,'20261010');
  assert.equal(after.raceCount,12);
  assert.deepEqual(after.racers,before.racers);
  const input={date:'20261011',jcd:'06',raceNo:1,raceKey:'20261011-06-1',observedAt:new Date(Date.now()+1000).toISOString(),
    rows:[1,2,3,4,5,6].map(boat=>({boat,course:boat}))};
  const context={inputHash:'test',contextHash:'test',officialEntries:input.rows.map(r=>({...r,registerNo:String(4000+r.boat)}))};
  const capture=s=>support.capture({entries:[]},input,context,s);
  const projected=capture(source);
  assert.equal(projected.history.status,'available');
  support.validate(projected,input,context);
  put(day('20261011',true));
  const closed=build();
  assertCutoff(readOutputs(), '20261011');
  assert.equal(closed.data.lastDate,'20261011');
  assert.equal(capture(closed).history.status,'unavailable','same-day closed history remains blocked');
  const future=structuredClone(source);future.data.generatedAt='2999-01-01T00:00:00Z';
  assert.equal(capture(future).history.status,'unavailable','future publication remains blocked');
  fs.rmSync(path.join(root,'data/results/20261010.json'));
  fs.rmSync(path.join(root,'data/results/20261011.json'));
  assert.equal(build().data.lastDate,null,'no closed day must not invent a cutoff');
  assertCutoff(readOutputs(), null);
  // The six-file contract and separate as-of date also hold across year boundaries.
  put(day('20261201', true)); // Outside the recent 30-day window.
  put(day('20261202', true)); // Inclusive first day of the recent window.
  put(day('20261231', true));
  put(day('20270101', false));
  build();
  const yearEnd = readOutputs();
  assertCutoff(yearEnd, '20261231');
  const yearEndTrifecta = yearEnd['trifecta-by-venue-race.json'];
  assert.equal(yearEndTrifecta.asOfDate, '20270101');
  assert.equal(yearEndTrifecta.dataThroughDate, '20261231');
  assert.equal(yearEndTrifecta.recentWindowStartDate, '20261202');
  assert.equal(yearEndTrifecta.trifectaByVenue['06'].all3Years.totalRaces, 36);
  assert.equal(yearEndTrifecta.trifectaByVenue['06'].recent30Days.totalRaces, 24,
    '30-day inclusion excludes the preceding day and current open day');
  console.log('all six statistics share cutoff; aggregates and 30-day boundaries: ok');
  console.log('racer skill effective cutoff + independent history integration: ok');
}finally{fs.rmSync(root,{recursive:true,force:true});}
