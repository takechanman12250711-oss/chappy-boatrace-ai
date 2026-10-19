'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const frozen = require('./compare-escape-frozen.cjs');
const archive = require('./daily-prediction-source-archive');
const candidate = require('./compare-alternate-escape-partners.cjs');

const replay = tickets => ({head:1,tickets,mainTickets:['1-2-4'],scenarios:[{type:'escape',score:80}]});
const row = (key='20261017-01-1',source='daily-primary') => ({key,source,sourceCommit:'saved-sha',
  selectedAt:'2026-10-17T00:01:00Z',deadlineAt:'2026-10-17T00:20:00Z',
  savedHead:1,savedTickets:['1-2-3','1-2-4'],savedScenarios:[{type:'escape',score:80}]});
const official = (key,ticket,payout) => {const [date,jcd,raceNo]=key.split('-');return {date,jcd,raceNo:Number(raceNo),
  source:'boatrace-official',resultAvailable:true,trifecta:{combination:ticket,payout}};};

test('VM research merge option does not affect the baseline or saved frozen input',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-partner-vm-'));
  try {
    fs.mkdirSync(path.join(root,'js'));
    fs.writeFileSync(path.join(root,'js/fixture.js'),`
      window.ChappyTheoryInput={VERSION:'fixture'};
      window.ChappyBoatIdentity={inspectEntries(){return {}}};
      window.ChappyAICore={mergeWithPrediction(p,data,options){
        if(options?.researchAlternateEscapePartnerRoles===true)p.tickets=['1-3-2'];
        return p;
      }};
      window.ChappyPracticalSelection={select(p,options){return {tickets:(options?.researchAlternateEscapePartnerRoles===true?p.tickets:['1-2-3']).map(ticket=>({ticket}))}}};
      function createPrediction(data){return ChappyAICore.mergeWithPrediction({mainSheet:{honmei:{boatNo:1}},
        tickets:['1-2-3'],aiCore:{raceScenarios:{scenarios:[{type:'escape',score:80}]},racerSkillTheory:{ranking:[]}}},data)}
    `);
    const frozenRow={...row(),conditions:{source:'boatrace-official',weather:{},escapeEvaluationEvidence:{
      sourceFetchedAt:'2026-10-17T00:00:00Z',datasetVersion:'fixture',entries:[],beforeInfo:[],startExhibition:[],historyContext:{},raceInfo:{}}}};
    const before=JSON.stringify(frozenRow);
    const current=frozen.runner(root,'current',{modules:['fixture']});
    const research=frozen.runner(root,'current',{modules:['fixture'],mergeOptions:candidate.MERGE_OPTIONS,selectionOptions:candidate.SELECTION_OPTIONS});
    const mergeOnly=frozen.runner(root,'current',{modules:['fixture'],mergeOptions:candidate.MERGE_OPTIONS});
    assert.deepEqual(current(frozenRow).tickets,['1-2-3']);
    assert.deepEqual(research(frozenRow).tickets,['1-3-2']);
    assert.deepEqual(mergeOnly(frozenRow).tickets,['1-2-3']);
    assert.deepEqual(current(frozenRow).tickets,['1-2-3']);
    assert.equal(JSON.stringify(frozenRow),before);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('frozen reader verifies archive hashes without restoring or changing original files',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-partner-archive-'));
  try {
    const e={version:'escape-evaluation-evidence-v1',historyStatus:'captured',resultUsedForGeneration:false,
      sourceFetchedAt:'2026-10-17T00:00:00Z',aiCoreVersion:'ai-core-v4.8.8-adjacent-start-rank',
      entries:Array(6).fill({}),beforeInfo:Array(6).fill({}),startExhibition:Array(6).fill({}),raceScenarios:{scenarios:[]}};
    const record={raceKey:'20261017-01-1',date:'20261017',jcd:'01',raceNo:1,selectedAt:'2026-10-17T00:01:00Z',deadlineAt:'2026-10-17T00:20:00Z',
      prediction:{practicalTickets:['1-2-3'],mainSheet:{honmei:{boatNo:1}},preRaceConditions:{schemaVersion:4,sourceTiming:'pre_deadline',
        officialResultUsed:false,source:'boatrace-official',sourceFetchedAt:e.sourceFetchedAt,
        dataAvailability:{officialCourses:6,exhibitionST:6,exhibitionTime:6},escapeEvaluationEvidence:e}}};
    const parsed={predictions:[record],verificationPredictions:[{...record,selectedAt:'2026-10-17T00:02:00Z'}]},raw=Buffer.from(JSON.stringify(parsed)),compressed=zlib.gzipSync(raw);
    fs.mkdirSync(archive.archiveDirectoryFor(root),{recursive:true});
    fs.writeFileSync(archive.archivePathFor(root,'20261017'),compressed);
    fs.writeFileSync(archive.metadataPathFor(root,'20261017'),JSON.stringify(archive.metadataFor({date:'20261017',raw,archive:compressed,parsed})));
    const checksum=crypto.createHash('sha256').update(compressed).digest('hex');
    const loaded=await frozen.loadFrozenInputs(root,'20261015',{readOnlySources:true,acceptedCoreVersions:candidate.ACCEPTED_CORE_VERSIONS});
    assert.equal(loaded.chosen.size,1);
    assert.equal(loaded.chosen.get(record.raceKey).source,'daily-primary');
    assert.equal(loaded.chosen.get(record.raceKey).selectedAt,record.selectedAt);
    assert.equal(fs.existsSync(archive.sourcePathFor(root,'20261017')),false);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive.archivePathFor(root,'20261017'))).digest('hex'),checksum);
    assert.equal(frozen.snapshot(record,'daily-primary').reason,'different-core-generation');
    fs.writeFileSync(archive.archivePathFor(root,'20261017'),Buffer.from('tampered'));
    await assert.rejects(()=>frozen.loadFrozenInputs(root,'20261015',{readOnlySources:true,acceptedCoreVersions:candidate.ACCEPTED_CORE_VERSIONS}),/fingerprint mismatch/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('comparison excludes changed ticket counts and baseline mismatches rather than counting them',()=>{
  const source=row(),baseline=replay(source.savedTickets);
  assert.equal(candidate.compareRow(source,baseline,replay(['1-3-2']),null).reason,'candidate-ticket-count-mismatch');
  assert.equal(candidate.compareRow(source,replay(['1-2-3']),replay(['1-3-2']),null).reason,'baseline-tickets-mismatch');
  assert.equal(candidate.compareRow(source,baseline,{...baseline,head:4},null).reason,'candidate-head-changed');
  assert.equal(candidate.compareRow(source,baseline,{...baseline,mainTickets:['1-2-3']},null).reason,'candidate-main-tickets-changed');
  assert.equal(candidate.compareRow(source,baseline,{...baseline,scenarios:[{type:'escape',score:81}]},null).reason,'candidate-scenarios-changed');
  assert.equal(candidate.compareRow(source,baseline,replay(['1-2-3','1-2-3']),null).reason,'invalid-compared-tickets');
});

test('report keeps gained/lost hits, source separation, pending and refund exclusions with equal stakes',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-partner-report-'));
  try {
    fs.mkdirSync(path.join(root,'js'));for(const name of frozen.MODULES)fs.writeFileSync(path.join(root,'js',name+'.js'),'// fixture\n');
    const saved=[row(),row('20261017-01-2','daily-verification'),row('20261017-01-3','all-race-note'),row('20261017-01-4'),row('20261017-01-5')];
    const results=new Map([[saved[0].key,official(saved[0].key,'1-3-2',1000)],[saved[1].key,official(saved[1].key,'1-2-3',500)],
      [saved[3].key,{...official(saved[3].key,'1-3-2',1000),refund:true}]]);
    const loaded={chosen:new Map(saved.map(record=>[record.key,record])),exclusions:{'incomplete-frozen-input':2},files:[],results,resultAttempts:[]};
    const run={current:record=>replay(record.savedTickets),candidate:record=>replay(record.key===saved[4].key?['1-3-2']:['1-3-2','1-2-4'])};
    const before=JSON.stringify(saved),report=await candidate.build(root,{loaded,run,sourceCommit:'test-head'});
    assert.equal(report.sourceCommit,'test-head');
    assert.equal(report.baselineReproduction.reproduced,5);
    assert.equal(report.summary.replayed,4);
    assert.equal(report.exclusions['candidate-ticket-count-mismatch'],1);
    assert.equal(report.summary.pending,1);
    assert.equal(report.summary.excludedResults,1);
    assert.equal(report.summary.gainedHits,1);assert.equal(report.summary.lostHits,1);assert.equal(report.summary.netHitChange,0);
    assert.equal(report.summary.current.stake,400);assert.equal(report.summary.candidate.stake,400);
    assert.equal(report.summary.current.recoveryRate,125);assert.equal(report.summary.candidate.recoveryRate,250);
    assert.equal(report.bySource['daily-primary'].settled,1);assert.equal(report.bySource['daily-verification'].settled,1);
    assert.equal(report.bySource['all-race-note'].pending,1);
    assert.equal(report.byPeriod['post-definition-replay'].total.current.hitRate,null);
    assert.equal(report.byVenue.length,24);
    assert.equal(report.contract.formalForwardEvidence,false);
    assert.equal(JSON.stringify(saved),before);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('empty evidence uses null rates, not successful zero-loss claims',()=>{
  const summary=candidate.summarize([]);
  assert.equal(summary.current.hitRate,null);assert.equal(summary.candidate.recoveryRate,null);
  assert.equal(summary.recoveryRateDelta,null);assert.equal(summary.gainedHits,0);
});
