'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const h=require('./independent-weather-history-v1.cjs'),c=require('./independent-weather-context-v1.cjs');
const candidate=require('./independent-autonomous-candidate.cjs'),context=require('./independent-judgment-context.cjs');
const clone=structuredClone;
function fixture(){
  const p={date:'20300913',jcd:'23',raceNo:1,raceKey:'20300913-23-1',selectedAt:'2030-09-13T01:00:00Z',deadlineAt:'2030-09-13T01:10:00Z',prediction:{preRaceConditions:{schemaVersion:4,source:'boatrace-official',sourceTiming:'pre_deadline',officialResultUsed:false,sourceFetchedAt:'2030-09-13T00:59:00Z',
    weather:{windDirection:'向かい風',windSpeed:3,waveHeight:2,liveTideAvailable:false},boats:[1,2,3,4,5,6].map(boat=>({boatNo:boat,registerNo:String(5100+boat),course:boat,courseOfficial:true,courseMappingSource:'official-start-image'}))}}};
  const r={date:p.date,jcd:p.jcd,raceNo:1,raceKey:p.raceKey,source:'boatrace-official',checkedAt:'2030-09-13T01:20:00Z',resultAvailable:true,status:'finished',void:false,
    starts:[1,2,3,4,5,6].map(boat=>({boat,course:boat,marker:'',falseStart:false,lateStart:false})),finishers:[1,2,3,4,5,6].map(boat=>({boat,rank:boat,registerNo:String(5100+boat)})),trifecta:{combination:'1-2-3',payout:1200}};
  return {p,r};
}
function history(p,r){const out=h.create({asOfDate:'20300914',generatedAt:'2030-09-14T00:00:00Z',sourceCommit:'a'.repeat(40)});h.ingest(out,'20300913',{predictions:[p]},{races:[r]},[]);out.builderHash=h.hash(fs.readFileSync(require.resolve('./independent-weather-history-v1.cjs')));return out;}
function input(){const data={ok:true,source:'boatrace-official',date:'20300914',stadiumCode:'23',raceNo:1,fetchedAt:'2030-09-14T01:00:00Z',
  entryUrl:'https://www.boatrace.jp/owpc/pc/race/racelist?hd=20300914&jcd=23&rno=1',beforeInfoUrl:'https://www.boatrace.jp/owpc/pc/race/beforeinfo?hd=20300914&jcd=23&rno=1',
  entries:[1,2,3,4,5,6].map(boat=>({boat,registerNo:String(5100+boat),exhibition:{displayTime:6.7}})),
  startExhibition:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:.1,marker:'',mappingSource:'official-start-image'})),weather:{windDirection:'向かい風',windSpeed:3,waveHeight:2}};
  const i=candidate.officialInput(data,{jcd:'23',raceNo:1,deadlineAt:'2030-09-14T01:10:00Z'},Date.parse(data.fetchedAt));return {i,ctx:context.capture(data,i)};}
const source=d=>({sha256:h.hash(h.json(d)),data:d});
test('weather preserves missing, zero, exact numeric units and unknown tide',()=>{
  assert.equal(h.weatherKey(h.condition({windSpeed:0,waveHeight:0})), 'calm|0|0');
  for(const w of [{},{windSpeed:'3',waveHeight:2,windDirection:'向かい風'},{windSpeed:3,waveHeight:null,windDirection:'向かい風'},{windSpeed:3,waveHeight:2,windDirection:'north'}])assert.equal(h.weatherKey(h.condition(w)),null);
  assert.equal(h.condition({tideFlow:'上げ潮',liveTideAvailable:false}).tidePhase,null);
  assert.equal(h.condition({tideFlow:'上げ潮',liveTideAvailable:true}).tidePhase,'上げ潮');
});
test('identity join retains separate first/second/third counts and exact condition groups',()=>{
  const {p,r}=fixture(),before=clone(p),out=history(p,r);
  assert.equal(out.coverage.acceptedRaces,1);assert.equal(out.coverage.acceptedBoats,6);
  assert.equal(out.racers['5102'].groups['23|2'].byWeather['head|3|2'].stats.second,1);
  assert.equal(out.racers['5102'].groups['23|2'].allWeather.third,0);assert.deepEqual(p,before);
  assert.equal(out.evidence[0].predictionHash,h.hash(h.json(h.project(p,p.date).value)));
});
test('primary and verification duplicates count once; scores tickets results and odds do not affect projection',()=>{
  const {p,r}=fixture(),out=history(p,r),before=h.project(p,p.date);
  Object.assign(p.prediction,{practicalTickets:['6-5-4'],scores:[99],odds:{'6-5-4':999}});p.result={trifecta:'6-5-4'};
  assert.deepEqual(h.project(p,p.date),before);
  const a=h.create({asOfDate:'20300914',generatedAt:'2030-09-14T00:00:00Z'});h.ingest(a,p.date,{predictions:[p,p],verificationPredictions:[p]},{races:[r]},[]);
  assert.equal(a.coverage.acceptedRaces,1);assert.equal(a.evidence[0].predictionKind,'predictions');assert.deepEqual(a.racers,out.racers);
});
test('changed entry uses result actual course and verifies registration, never boat number',()=>{
  const {p,r}=fixture();[r.starts[0].course,r.starts[2].course]=[3,1];const out=history(p,r);
  assert.equal(out.evidence[0].courseChanged,true);assert.equal(out.racers['5101'].groups['23|3'].allWeather.first,1);
  r.finishers[0].registerNo='9999';assert.equal(history(p,r).coverage.rejected['registration-mismatch'],1);
});
for(const [name,change] of Object.entries({late:p=>p.selectedAt=p.deadlineAt,futureFetch:p=>p.prediction.preRaceConditions.sourceFetchedAt=p.deadlineAt,
  retrospective:p=>p.isRetrospective=true,inferred:p=>p.prediction.preRaceConditions.boats[0].courseOfficial=false,
  duplicateRacer:p=>p.prediction.preRaceConditions.boats[0].registerNo='5102',missingWeather:p=>p.prediction.preRaceConditions.weather.waveHeight=null,
  futureSchema:p=>p.prediction.preRaceConditions.schemaVersion=99}))test(`history excludes ${name} inputs`,()=>{const {p,r}=fixture();change(p);assert.equal(history(p,r).coverage.acceptedRaces,0);});
for(const [name,change] of Object.entries({pending:r=>r.resultAvailable=false,void:r=>r.void=true,F:r=>r.starts[0].marker='F',duplicateCourse:r=>r.starts[0].course=2,
  deadHeat:r=>r.finishers[0].rank=2,missingFinisher:r=>r.finishers.pop(),preDeadline:r=>r.checkedAt='2030-09-13T01:00:00Z',futureChecked:r=>r.checkedAt='2031-09-13T01:20:00Z',unofficial:r=>r.source='other',inconsistent:r=>r.trifecta.combination='6-5-4'}))test(`history excludes ${name} results`,()=>{const {p,r}=fixture();change(r);assert.equal(history(p,r).coverage.acceptedRaces,0);});
test('duplicate official results are unresolved and dates outside the past window never enter',()=>{
  const {p,r}=fixture(),out=h.create({asOfDate:'20300914',generatedAt:'2030-09-14T00:00:00Z'});
  h.ingest(out,p.date,{predictions:[p]},{races:[r,r]},[]);assert.equal(out.coverage.rejected['duplicate-result'],1);
  h.ingest(out,'20300914',{predictions:[p]},{races:[r]},[]);h.ingest(out,'20290101',{predictions:[p]},{races:[r]},[]);assert.equal(out.coverage.canonicalRaces,1);
});
test('saved context matches registration venue and actual course; missing and zero are separate',()=>{
  const {p,r}=fixture(),{i,ctx}=input(),d=history(p,r),v=c.capture(i,ctx,source(d));
  assert.equal(v.rows[1].matchedWeather.secondRate,1);assert.equal(v.rows[1].matchedWeather.thirdRate,0);assert.equal(v.rows[0].matchedTide,null);assert.equal(c.validate(v,i,ctx),true);
  ctx.weather.windSpeed=4;const mismatch=c.capture(i,ctx,source(d));assert.equal(mismatch.rows[0].status,'no-matched-weather');assert.equal(mismatch.rows[0].matchedWeather.firstRate,null);assert.equal(c.validate(mismatch,i,ctx),true);
  i.jcd='02';const noLocal=c.capture(i,ctx,source(d));assert.equal(noLocal.rows[0].status,'no-history');assert.equal(noLocal.rows[0].allWeather,null);
});
test('known tide matches only the saved phase; missing phase is not zero or inferred',()=>{
  const {p,r}=fixture(),{i,ctx}=input();Object.assign(p.prediction.preRaceConditions.weather,{liveTideAvailable:true,tidePhase:'上げ潮'});
  Object.assign(ctx.weather,{liveTideAvailable:true,tideFlow:'上げ潮'});let v=c.capture(i,ctx,source(history(p,r)));assert.equal(v.rows[0].matchedTide.starts,1);assert.equal(c.validate(v,i,ctx),true);
  ctx.weather.tideFlow='下げ潮';v=c.capture(i,ctx,source(history(p,r)));assert.equal(v.rows[0].matchedTide.starts,0);assert.equal(c.validate(v,i,ctx),true);
});
test('missing/future/invalid history stays unavailable, and altered evidence fails replay',()=>{
  const {p,r}=fixture(),{i,ctx}=input(),d=history(p,r);let v=c.capture(i,ctx,null);assert.equal(v.history.status,'missing');assert.equal(c.validate(v,i,ctx),true);
  for(const alter of [x=>x.generatedAt='2031-01-01T00:00:00Z',x=>x.window.lastDate='20300914',x=>x.builderHash='b'.repeat(64),x=>x.sourceCommit='']){const copy=clone(d);alter(copy);v=c.capture(i,ctx,source(copy));assert.equal(v.history.status,'unavailable');assert.equal(c.validate(v,i,ctx),true);}
  v=c.capture(i,ctx,source(d));v.rows[0].matchedWeather.firstRate=.5;assert.throws(()=>c.validate(v,i,ctx),/hash/);
  const {evidenceHash,...body}=v;v.evidenceHash=h.hash(h.json(body));assert.throws(()=>c.validate(v,i,ctx),/replay/);
});
test('CLI uses archive canonical bytes, records both source hashes, and bounds its dates',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'weather-history-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const {p,r}=fixture();fs.mkdirSync(path.join(root,'data/predictions'),{recursive:true});fs.mkdirSync(path.join(root,'data/results'),{recursive:true});
  const prediction=JSON.stringify({date:p.date,predictions:[p]});fs.writeFileSync(path.join(root,'data/predictions',p.date+'.json'),prediction);
  fs.writeFileSync(path.join(root,'data/results',p.date+'.json'),JSON.stringify({races:[r]}));
  require('./daily-prediction-source-archive').archivePredictionSource({rootDirectory:root,date:p.date,rawSaveLimitBytes:1});
  fs.writeFileSync(path.join(root,'data/predictions',p.date+'.json'),'{}');
  const d=h.build(root,{now:new Date('2030-09-14T00:00:00Z'),sourceCommit:'a'.repeat(40)});
  assert.equal(d.coverage.acceptedRaces,1);assert.equal(d.sourceFiles[0].sha256,h.hash(prediction));assert.equal(d.sourceFiles.length,2);
  const s=c.load(root),{i,ctx}=input();assert.equal(c.capture(i,ctx,s).rows[0].matchedWeather.starts,1);
});
test('existing daily workflow saves only the new derived history and has no new schedule',()=>{
  const w=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/escape-main-audit.yml'),'utf8');assert.equal((w.match(/- cron:/g)||[]).length,1);
  assert.ok(w.includes('node scripts/independent-weather-history-v1.cjs'));assert.ok(w.includes('git add data/stats/independent-weather-history.json'));
});
