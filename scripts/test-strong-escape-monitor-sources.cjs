"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const {execFileSync} = require("node:child_process");
const archiveApi = require("./daily-prediction-source-archive");
const {restorePredictionSources} = require("./restore-daily-prediction-source");
const {readMonitorSources} = require("./strong-escape-monitor-sources.cjs");
const temporaryBase = fs.realpathSync(os.tmpdir());
const root = fs.realpathSync(fs.mkdtempSync(path.join(temporaryBase, "strong-monitor-source-parity-")));
assert.equal(path.dirname(root), temporaryBase);
const startDate = "20260813";
let cases = 0;
function daily(directory, date, value) {
  const file = archiveApi.sourcePathFor(directory, date);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, JSON.stringify(value) + "\n");
}
function archived(directory, date, value, keepRaw = false) {
  daily(directory, date, value);
  archiveApi.archivePredictionSource({rootDirectory:directory, date, rawSaveLimitBytes:1});
  if (!keepRaw) fs.unlinkSync(archiveApi.sourcePathFor(directory, date));
}
function snapshot(directory) {
  if (!fs.existsSync(directory)) return {};
  const result = {};
  function walk(current) {
    for (const item of fs.readdirSync(current, {withFileTypes:true})) {
      const file = path.join(current, item.name);
      if (item.isDirectory()) walk(file);
      else result[path.relative(directory, file)] = archiveApi.sha256(fs.readFileSync(file));
    }
  }
  walk(directory); return result;
}
function priorRead(directory) {
  restorePredictionSources({rootDirectory:directory, all:true});
  return fs.readdirSync(archiveApi.predictionDirectory(directory))
    .filter(name => /^\d{8}\.json$/.test(name)).sort()
    .filter(name => name.slice(0, 8) >= startDate)
    .map(name => ({date:name.slice(0, 8), data:JSON.parse(fs.readFileSync(path.join(archiveApi.predictionDirectory(directory), name), "utf8"))}));
}
function compare(name, setup, shouldThrow = false) {
  const input = path.join(root, name, "input"), prior = path.join(root, name, "prior");
  fs.mkdirSync(input, {recursive:true}); setup(input);
  fs.cpSync(input, prior, {recursive:true});
  const before = snapshot(input);
  let actual, expected, actualError, priorError;
  try { actual = [...readMonitorSources({rootDirectory:input, startDate})]; } catch (error) { actualError = error; }
  try { expected = priorRead(prior); } catch (error) { priorError = error; }
  assert.deepEqual(snapshot(input), before, name + ": reader must not write raw, archive or metadata");
  assert.equal(Boolean(actualError), Boolean(priorError), name + ": failure parity");
  assert.equal(Boolean(actualError), shouldThrow, name + ": expected corruption status");
  if (!shouldThrow) assert.deepStrictEqual(actual, expected, name + ": entire ordered documents must match restored raw scan");
  cases += 1;
  return actual;
}
function mutateMetadata(directory, date, change) {
  const file = archiveApi.metadataPathFor(directory, date);
  const metadata = JSON.parse(fs.readFileSync(file, "utf8")); change(metadata);
  fs.writeFileSync(file, JSON.stringify(metadata));
}
try {
  const values = compare("mixed", directory => {
    archived(directory, "20260812", {skip:"valid archive before start"});
    daily(directory, "20260813", {predictions:[{raceKey:"first"},{raceKey:"duplicate"}], verificationPredictions:[{raceKey:"duplicate"}], missing:null});
    archived(directory, "20260814", {predictions:[{raceKey:"archive-only"}], unicode:"展示F0.02"});
    archived(directory, "20260815", {predictions:[{raceKey:"canonical"}]}, true);
    daily(directory, "20260815", {predictions:[{raceKey:"stale tracked raw"}]});
    daily(directory, "20260816", {predictions:[{raceKey:"raw plus orphan gzip"}]});
    fs.writeFileSync(archiveApi.archivePathFor(directory, "20260816"), "orphan gzip ignored by prior restore");
    fs.writeFileSync(path.join(archiveApi.predictionDirectory(directory), "index.json"), "ignored derived");
  });
  assert.deepEqual(values.map(value => value.date), ["20260813","20260814","20260815","20260816"]);
  assert.equal(values[2].data.predictions[0].raceKey, "canonical");
  compare("empty", directory => fs.mkdirSync(archiveApi.predictionDirectory(directory), {recursive:true}));
  compare("missing-directory", () => {}, true);
  compare("raw-before-start", directory => {daily(directory,"20260812",{});fs.writeFileSync(archiveApi.sourcePathFor(directory,"20260812"),"not JSON");});
  compare("bad-raw", directory => {daily(directory,startDate,{});fs.writeFileSync(archiveApi.sourcePathFor(directory,startDate),"not JSON");}, true);
  compare("orphan-gzip", directory => {fs.mkdirSync(archiveApi.archiveDirectoryFor(directory),{recursive:true});fs.writeFileSync(archiveApi.archivePathFor(directory,startDate),"ignored");});
  for (const field of ["schemaVersion","date","archiveBytes","archiveSha256","sourceBytes","sourceSha256"]) {
    compare("metadata-" + field, directory => {
      archived(directory,startDate,{predictions:[]});
      mutateMetadata(directory,startDate, metadata => {metadata[field] = field === "date" ? "20260814" : field.endsWith("Sha256") ? "0".repeat(64) : 999;});
    }, true);
  }
  compare("missing-gzip", directory => {archived(directory,startDate,{});fs.unlinkSync(archiveApi.archivePathFor(directory,startDate));}, true);
  compare("bad-metadata-json", directory => {archived(directory,startDate,{});fs.writeFileSync(archiveApi.metadataPathFor(directory,startDate),"bad JSON");}, true);
  compare("corrupt-archive", directory => {archived(directory,startDate,{});fs.writeFileSync(archiveApi.archivePathFor(directory,startDate),"corrupt");}, true);
  compare("invalid-gzip-matching-hash", directory => {
    archived(directory,startDate,{});const raw=Buffer.from("not gzip");fs.writeFileSync(archiveApi.archivePathFor(directory,startDate),raw);
    mutateMetadata(directory,startDate,metadata=>{metadata.archiveBytes=raw.length;metadata.archiveSha256=archiveApi.sha256(raw);});
  }, true);
  compare("invalid-json-matching-hashes", directory => {
    archived(directory,startDate,{});const raw=Buffer.from("not JSON"),archive=zlib.gzipSync(raw);
    fs.writeFileSync(archiveApi.archivePathFor(directory,startDate),archive);
    mutateMetadata(directory,startDate,metadata=>{metadata.archiveBytes=archive.length;metadata.archiveSha256=archiveApi.sha256(archive);metadata.sourceBytes=raw.length;metadata.sourceSha256=archiveApi.sha256(raw);});
  }, true);
  compare("corrupt-before-start", directory => {archived(directory,"20260812",{});fs.writeFileSync(archiveApi.archivePathFor(directory,"20260812"),"corrupt");}, true);
  // Frozen pre-change builder remains an independent oracle for complete reports.
  const priorBuilder = path.join(__dirname, "fixtures", "strong-escape-monitor-before-source-streaming.js");
  assert.equal(archiveApi.sha256(fs.readFileSync(priorBuilder)), "390a066fcf474fa70dac3a1aa90767d908846f84e29932b18c7d427be7790b5f");
  const seed = {
    date:startDate,jcd:"24",place:"大村",raceNo:1,raceKey:startDate+"-24-1",deadlineAt:"2026-08-13T10:00:00Z",
    preRaceConditions:{weather:{windSpeed:2,waveHeight:1},boats:[1,2,3,4,5,6].map(boatNo=>({boatNo,course:boatNo,name:"fixture"+boatNo,avgST:0.12+boatNo*0.01,winRate:7-boatNo*0.4,localWinRate:6.5,motor2Rate:40,exhibitionTime:6.7+boatNo*0.01}))},
    result:{settled:true,resultTicket:"1-2-3",payoutPer100:1200}
  };
  const integrationSource = path.join(root,"report-input"), integrationPrior=path.join(root,"report-prior");
  const rows=Array.from({length:8},(_,index)=>({...structuredClone(seed),raceNo:index+1,raceKey:startDate+"-24-"+(index+1)}));
  daily(integrationSource,startDate,{predictions:[...rows,rows[0],{...rows[1],result:{settled:false}}],verificationPredictions:[rows[0],{...rows[0],raceKey:"missing-input",preRaceConditions:null}]});
  archived(integrationSource,"20260814",{predictions:[rows[0],{...rows[2],date:"20260814",raceKey:"later-unique"}],verificationPredictions:[]});
  daily(integrationSource,"20260814",{predictions:[]}); // stale raw must not replace the archive
  fs.cpSync(integrationSource,integrationPrior,{recursive:true});
  for(const directory of [integrationSource,integrationPrior]){
    fs.mkdirSync(path.join(directory,"js"),{recursive:true});
    fs.copyFileSync(path.join(__dirname,"..","js","practical-selection.js"),path.join(directory,"js","practical-selection.js"));
  }
  const beforeReport=snapshot(integrationSource);
  restorePredictionSources({rootDirectory:integrationPrior,all:true});
  const runner=String.raw`
    const fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
    const OriginalDate=Date,fixed="2026-11-17T06:00:00.000Z";
    global.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[fixed]));}static now(){return new OriginalDate(fixed).getTime();}};
    const current=process.argv[1],source=process.argv[2];
    const isolated=new Module(current,module);isolated.filename=current;isolated.paths=Module._nodeModulePaths(path.dirname(current));
    isolated._compile(fs.readFileSync(source,"utf8"),current);isolated.exports.build();
  `;
  const currentBuilder=path.join(__dirname,"build-strong-escape-post-adoption-monitor.js");
  for(const [directory,source] of [[integrationSource,currentBuilder],[integrationPrior,priorBuilder]]){
    execFileSync(process.execPath,["-e",runner,currentBuilder,source],{cwd:directory,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  }
  const reportPath=directory=>path.join(directory,"data","stats","strong-escape-post-adoption-monitor.json");
  assert.deepEqual(fs.readFileSync(reportPath(integrationSource)),fs.readFileSync(reportPath(integrationPrior)),"complete report bytes must equal frozen pre-change builder");
  const report=JSON.parse(fs.readFileSync(reportPath(integrationSource),"utf8"));
  assert.equal(report.total.observedRows,14);assert.equal(report.total.comparableRaces,9);
  assert.equal(report.latestDate,"20260814");
  const afterReport=snapshot(integrationSource);delete afterReport[path.relative(integrationSource,reportPath(integrationSource))];
  assert.deepEqual(afterReport,beforeReport,"only the derived report may be written");
  cases+=1;
  console.log("strong monitor canonical reader: " + cases + " full-document/ordering/nonmutation/corruption parity cases passed");
} finally {
  assert.equal(path.dirname(root), temporaryBase);
  assert(path.basename(root).startsWith("strong-monitor-source-parity-"));
  fs.rmSync(root, {recursive:true, force:true});
}
