"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const archive=require('./daily-prediction-source-archive');
const temporaryBase=fs.realpathSync(os.tmpdir()),root=fs.realpathSync(fs.mkdtempSync(path.join(temporaryBase,'escape-rescue-source-parity-')));
assert.equal(path.dirname(root),temporaryBase);
const START='20260824',fixed='2026-11-17T06:00:00.000Z';
// Complete old monitor bytes frozen from f483d1f87966d293993965b0b54169ae0d597887.
const monitors=[['three-course','three-course-escape-rescue-post-adoption-monitor.json','427d03e5ee6e83582a533e8c1a170d1a315bdc4c313a1f18d1ceba375aca35da'],
 ['four-kado','four-kado-escape-rescue-post-adoption-monitor.json','8d9258fcb70ed7985cb9babcdf8468e728ade69b04df14181aad720137949969']];
const beforeShared=Object.fromEntries(['strong-escape-monitor-sources.cjs','daily-prediction-source-archive.js'].map(f=>[f,archive.sha256(fs.readFileSync(path.join(__dirname,f)))]));
let cases=0;
function daily(dir,date,data){const file=archive.sourcePathFor(dir,date);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data)+'\n');}
function archived(dir,date,data,keepRaw=false){daily(dir,date,data);archive.archivePredictionSource({rootDirectory:dir,date,rawSaveLimitBytes:1});if(!keepRaw)fs.unlinkSync(archive.sourcePathFor(dir,date));}
function snapshot(dir){const all={};if(!fs.existsSync(dir))return all;const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else all[path.relative(dir,f)]=archive.sha256(fs.readFileSync(f));}};walk(dir);return all;}
function metadata(dir,date,change){const f=archive.metadataPathFor(dir,date),m=JSON.parse(fs.readFileSync(f,'utf8'));change(m);fs.writeFileSync(f,JSON.stringify(m));}
function row(index=1,date=START,extra={}){return {date,jcd:'24',place:'大村',raceNo:index,raceKey:date+'-24-'+index,deadlineAt:'2026-08-24T10:00:00Z',
 preRaceConditions:{weather:{windSpeed:2,waveHeight:1},boats:[1,2,3,4,5,6].map(boatNo=>({boatNo,course:boatNo,name:'synthetic '+boatNo,
 avgST:0.12+boatNo*.01,winRate:7-boatNo*.4,localWinRate:6.5,motor2Rate:40,exhibitionTime:6.7+boatNo*.01}))},
 result:{settled:true,resultTicket:'1-2-3',payoutPer100:1200},...extra};}
function controlledRow(index,label,tickets,actual,status='selected'){const r=row(index);r.preRaceConditions.fixtureCase={label,tickets,status};r.result={settled:true,resultTicket:actual,payoutPer100:index*1000};return r;}
// The same fixed Date and same real modules are loaded in separate children.
// Controlled cases below additionally isolate report accounting with explicit
// synthetic generator/selection outputs; the real rescue implementation stays.
const runner=String.raw`
 const fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
 const OriginalDate=Date,fixed='2026-11-17T06:00:00.000Z';
 global.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return new OriginalDate(fixed).getTime();}};
 const current=process.argv[1],source=process.argv[2],mode=process.argv[3];
 if(mode==='restored')require(path.join(path.dirname(current),'restore-daily-prediction-source')).restorePredictionSources({rootDirectory:process.cwd(),all:true});
 const isolated=new Module(current,module);isolated.filename=current;isolated.paths=Module._nodeModulePaths(path.dirname(current));isolated._compile(fs.readFileSync(source,'utf8'),current);
 if(process.argv[4]==='controlled'){
  global.createPrediction=input=>({fixtureCase:input.fixtureCase});
  require(path.join(path.dirname(current),'..','js','practical-selection')).select=p=>({status:p.fixtureCase.status,tickets:p.fixtureCase.tickets.map(ticket=>({ticket})),verificationEvidence:{mainScenario:{label:p.fixtureCase.label}}});
 }
 isolated.exports.build({canonicalSources:mode==='canonical'});
`;
function execute(dir,name,source,mode,controlled=false){const current=path.join(__dirname,'monitor-'+name+'-escape-rescue.js');return execFileSync(process.execPath,['-e',runner,current,source,mode,controlled?'controlled':'real'],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000});}
function compare(name,setup,{error=false,controlled=false}={}){
 const input=path.join(root,name,'input');fs.mkdirSync(input,{recursive:true});setup(input);const reports=[];
 for(const [kind,reportName,sha] of monitors){
  const current=path.join(__dirname,'monitor-'+kind+'-escape-rescue.js'),frozen=path.join(__dirname,'fixtures',kind+'-escape-rescue-before-source-streaming.js');
  assert.equal(archive.sha256(fs.readFileSync(frozen)),sha,'complete frozen old monitor bytes');
  const direct=path.join(root,name,kind+'-direct'),prior=path.join(root,name,kind+'-prior');fs.cpSync(input,direct,{recursive:true});fs.cpSync(input,prior,{recursive:true});
  const before=snapshot(direct);let directError,priorError;
  try{execute(direct,kind,current,'canonical',controlled);}catch(e){directError=e;}
  try{execute(prior,kind,frozen,'restored',controlled);}catch(e){priorError=e;}
  assert.equal(Boolean(directError),Boolean(priorError),name+': error parity '+kind);assert.equal(Boolean(directError),error,name+': expected failure '+kind);
  const relative=path.join('data','stats',reportName),after=snapshot(direct);
  if(error){assert.equal(fs.existsSync(path.join(direct,relative)),false,name+': no partial report');}
  else{
   const a=fs.readFileSync(path.join(direct,relative)),b=fs.readFileSync(path.join(prior,relative));assert.deepEqual(a,b,name+': full report bytes/order '+kind);
   const report=JSON.parse(a);assert.equal(report.generatedAt,fixed);assert.equal(report.startDate,START);reports.push(report);
   delete after[relative];
  }
  assert.deepEqual(after,before,name+': direct reader may only write derived report '+kind);cases++;
 }
 return reports;
}
try{
 const mixed=compare('mixed-real-generator',dir=>{
  archived(dir,'20260823',{predictions:[row(12,'20260823')]});
  daily(dir,START,{predictions:[row(1),row(2),row(1),row(3,START,{result:{settled:false}})],verificationPredictions:[row(2),row(4,START,{preRaceConditions:null}),row(5,START,{result:{settled:true}})]});
  archived(dir,'20260825',{predictions:[row(1),row(6,'20260825')],verificationPredictions:[row(7,'20260825')]});
  daily(dir,'20260825',{predictions:[]});
  daily(dir,'20260826',{predictions:[row(8,'20260826')],verificationPredictions:[]});
  fs.writeFileSync(archive.archivePathFor(dir,'20260826'),'orphan gzip ignored');
  fs.writeFileSync(path.join(archive.predictionDirectory(dir),'index.json'),'derived ignored');
 });
 for(const report of mixed){assert.deepEqual(Object.keys(report.byDate),[START,'20260825','20260826']);assert.equal(report.total.observedRows,11);assert.equal(report.total.settledPostAdoptionRaces,7);assert.equal(report.total.comparableRaces,5);assert.equal(report.latestDate,'20260826');}
 const accounting=compare('controlled-accounting-and-samples',dir=>{
  const a=controlledRow(1,'3コース攻め',['3-1-5','3-2-5','2-1-5'],'1-3-4'),b=controlledRow(2,'4カド攻め',['4-1-5','4-2-5','2-1-5'],'2-1-5');
  const present=controlledRow(3,'4カド攻め',['1-2-4','4-2-5','2-1-5'],'1-2-4'),skipped=controlledRow(4,'4カド攻め',[],'1-2-4','skip');
  daily(dir,START,{predictions:[a,b,a,present,skipped],verificationPredictions:[b,controlledRow(5,'1号艇逃げ',['1-2-3','1-3-2'],'1-2-3')]});
  archived(dir,'20260825',{predictions:[{...a,date:'20260825'},controlledRow(6,'4カド攻め',['4-1-5','4-2-5','2-1-5'],'1-2-4')]});
 },{controlled:true});
 assert.equal(accounting[0].total.gains,1);assert.equal(accounting[0].total.rescueAppliedRaces,1);assert.equal(accounting[0].appliedSamples[0].raceNo,1);
 assert.equal(accounting[1].total.losses,1);assert.equal(accounting[1].total.gains,1);assert.equal(accounting[1].total.rescueAppliedRaces,2);
 assert.deepEqual(accounting[1].targetScenarioSamples.map(s=>s.raceNo),[2,3,4,6]);
 assert.deepEqual(accounting[1].appliedSamples.map(s=>s.raceNo),[2,6]);
 compare('missing-directory',()=>{});compare('empty-directory',dir=>fs.mkdirSync(archive.predictionDirectory(dir),{recursive:true}));
 compare('bad-raw-before-start-is-ignored',dir=>{daily(dir,'20260823',{});fs.writeFileSync(archive.sourcePathFor(dir,'20260823'),'invalid JSON before start');});
 compare('gzip-without-meta',dir=>{fs.mkdirSync(archive.archiveDirectoryFor(dir),{recursive:true});fs.writeFileSync(archive.archivePathFor(dir,START),'orphan');});
 compare('bad-current-raw',dir=>{daily(dir,START,{});fs.writeFileSync(archive.sourcePathFor(dir,START),'invalid JSON');},{error:true});
 for(const field of ['schemaVersion','date','archiveBytes','archiveSha256','sourceBytes','sourceSha256'])compare('bad-meta-'+field,dir=>{
  archived(dir,START,{predictions:[]});metadata(dir,START,m=>m[field]=field==='date'?'20260825':field.endsWith('Sha256')?'0'.repeat(64):999);
 },{error:true});
 compare('missing-gzip',dir=>{archived(dir,START,{});fs.unlinkSync(archive.archivePathFor(dir,START));},{error:true});
 compare('invalid-meta-json',dir=>{archived(dir,START,{});fs.writeFileSync(archive.metadataPathFor(dir,START),'not JSON');},{error:true});
 compare('corrupt-before-start',dir=>{archived(dir,'20260823',{});fs.writeFileSync(archive.archivePathFor(dir,'20260823'),'corrupt');},{error:true});
 compare('invalid-json-matching-hashes',dir=>{archived(dir,START,{});const raw=Buffer.from('not JSON'),gzip=zlib.gzipSync(raw);fs.writeFileSync(archive.archivePathFor(dir,START),gzip);metadata(dir,START,m=>{m.sourceBytes=raw.length;m.sourceSha256=archive.sha256(raw);m.archiveBytes=gzip.length;m.archiveSha256=archive.sha256(gzip);});},{error:true});
 // A central caller may have repaired raw results after restoration. Its default
 // must keep reading those raw bytes, not silently replace them with the archive.
 for(const [kind,reportName] of monitors){
  const input=path.join(root,'repaired-'+kind),current=path.join(__dirname,'monitor-'+kind+'-escape-rescue.js'),frozen=path.join(__dirname,'fixtures',kind+'-escape-rescue-before-source-streaming.js');
  archived(input,START,{predictions:[row(1)]});daily(input,START,{predictions:[row(1,START,{result:{settled:true,resultTicket:'1-2-3',payoutPer100:7777}}),row(2)]});
  const prior=input+'-prior',canonical=input+'-canonical';fs.cpSync(input,prior,{recursive:true});fs.cpSync(input,canonical,{recursive:true});const before=snapshot(input);
  execute(input,kind,current,'default');execute(prior,kind,frozen,'default');execute(canonical,kind,current,'canonical');
  const file=dir=>path.join(dir,'data','stats',reportName);assert.deepEqual(fs.readFileSync(file(input)),fs.readFileSync(file(prior)),'default entire report keeps repaired raw');
  assert.notDeepEqual(fs.readFileSync(file(input)),fs.readFileSync(file(canonical)),'fixture must distinguish repaired raw from archive');
  assert.equal(JSON.parse(fs.readFileSync(file(input))).total.observedRows,2);assert.equal(JSON.parse(fs.readFileSync(file(canonical))).total.observedRows,1);
  const after=snapshot(input);delete after[path.join('data','stats',reportName)];assert.deepEqual(after,before,'default source unchanged');cases++;
 }
 // Exercise the actual dedicated CLI flag, with a fixed-clock preload only.
 const clock=path.join(root,'fixed-clock.cjs');fs.writeFileSync(clock,'const O=Date,f='+JSON.stringify(fixed)+';global.Date=class extends O{constructor(...a){super(...(a.length?a:[f]));}static now(){return new O(f).getTime();}};');
 for(const [kind,reportName] of monitors){const dir=path.join(root,'cli-'+kind);archived(dir,START,{predictions:[row(1)]});const before=snapshot(dir);
  execFileSync(process.execPath,['--require',clock,path.join(__dirname,'monitor-'+kind+'-escape-rescue.js'),'--canonical-sources'],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000});
  const file=path.join('data','stats',reportName),report=fs.readFileSync(path.join(dir,file));execute(dir,kind,path.join(__dirname,'monitor-'+kind+'-escape-rescue.js'),'canonical');assert.deepEqual(fs.readFileSync(path.join(dir,file)),report,'CLI flag equals canonical API');
  assert.equal(fs.existsSync(archive.sourcePathFor(dir,START)),false,'canonical CLI never restores raw');const after=snapshot(dir);delete after[file];assert.deepEqual(after,before);cases++;
 }
 for(const [f,h] of Object.entries(beforeShared))assert.equal(archive.sha256(fs.readFileSync(path.join(__dirname,f))),h,'shared canonical/archive modules unchanged');
 console.log(JSON.stringify({cases,fixedClock:fixed,fullReportBytesEqual:true,defaultRepairedRawPreserved:true,canonicalRawWrites:0,actualPostStartSourceChecked:false}));
}finally{assert.equal(path.dirname(root),temporaryBase);assert(path.basename(root).startsWith('escape-rescue-source-parity-'));fs.rmSync(root,{recursive:true,force:true});}
