'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const frozen = require('./compare-escape-frozen.cjs');
const compare = require('./compare-selected-escape-partners.cjs');

const ticketRows=tickets=>tickets.map((ticket,index)=>({ticket,category:index===0?'本線':'押さえ',displayCategory:index===0?'本命':'押さえ'}));
const current=()=>({head:3,tickets:['3-1-5','1-2-3','1-2-4'],mainTickets:['3-1-5'],flowTickets:[],
  ticketRows:ticketRows(['3-1-5','1-2-3','1-2-4']),scenarios:[{type:'threeAttack',score:90},{type:'escape',score:80}],insideSkill:{boatNo:1}});
const candidate=()=>({...current(),tickets:['3-1-5','1-4-2','1-3-2'],ticketRows:ticketRows(['3-1-5','1-4-2','1-3-2']),
  researchSelection:{changed:true,reasonCode:'REORDER_SELECTED_ESCAPE_PARTNERS',targetHead:1}});

test('additional module and transformer run only in the candidate VM after ordinary baseline selection',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-selected-vm-'));
  try {
    fs.mkdirSync(path.join(root,'js'));
    fs.writeFileSync(path.join(root,'js/fixture.js'),`
      window.ChappyTheoryInput={VERSION:'fixture'};
      window.ChappyBoatIdentity={inspectEntries(){return {}}};
      window.ChappyAICore={getRaceEntries(data){return data.entries.map(row=>({...row,enriched:true}))},buildFormations(analyses,scenarios,entries,data,options){
        if(options?.researchAlternateEscapePartnerRoles!==true||analyses.length!==1||entries.length!==1||entries[0].enriched!==true)throw Error('wrong formation inputs');
        return {safety:['1-4-2']};
      }};
      window.ChappyPracticalSelection={select(p,options){if(options)throw Error('baseline research options leaked');return {tickets:p.tickets}}};
      function createPrediction(data){return {mainSheet:{honmei:{boatNo:3}},tickets:[{ticket:'3-1-5',category:'本線'},{ticket:'1-2-3',category:'押さえ'}],
        aiCore:{analyses:[{}],raceScenarios:{scenarios:[{type:'threeAttack',score:90}]},racerSkillTheory:{ranking:[{course:1,boatNo:1}]}}}}
    `);
    fs.writeFileSync(path.join(root,'js/research-selected-escape-partners.js'),`
      window.ChappyResearchSelectedEscapePartners={select(p,selection,formation){
        return {changed:true,reasonCode:'fixture',targetHead:1,tickets:[selection.tickets[0],{ticket:formation.safety[0],category:'押さえ'}]};
      }};
    `);
    const row={key:'20261017-01-1',conditions:{source:'boatrace-official',weather:{},escapeEvaluationEvidence:{
      sourceFetchedAt:'2026-10-17T00:00:00Z',datasetVersion:'fixture',entries:[{}],beforeInfo:[],startExhibition:[],historyContext:{},raceInfo:{}}}};
    const before=JSON.stringify(row),baseline=frozen.runner(root,'current',{modules:['fixture']});
    const research=frozen.runner(root,'current',{modules:['fixture'],additionalModules:[compare.HELPER_MODULE],selectionTransformer:compare.TRANSFORMER,includeSelectionDetails:true});
    assert.deepEqual(baseline(row).tickets,['3-1-5','1-2-3']);
    assert.equal(Object.hasOwn(baseline(row),'ticketRows'),false);
    const changed=research(row);assert.deepEqual(changed.tickets,['3-1-5','1-4-2']);
    assert.equal(changed.researchSelection.targetHead,1);
    assert.deepEqual(baseline(row).tickets,['3-1-5','1-2-3']);assert.equal(JSON.stringify(row),before);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('v2 guards preserve each head count, non-target tickets, actual inside head, and protected rows',()=>{
  assert.equal(compare.invariantReason(current(),candidate()),'');
  const counts=candidate();counts.tickets[1]='2-4-1';
  assert.equal(compare.invariantReason(current(),counts),'candidate-head-ticket-counts-changed');
  const flow=candidate();flow.flowTickets=['1-4-2'];
  assert.equal(compare.invariantReason(current(),flow),'candidate-flow-tickets-changed');
  const protectedRows=candidate();protectedRows.ticketRows[0].category='穴';
  assert.equal(compare.invariantReason(current(),protectedRows),'candidate-protected-ticket-rows-changed');
  const nonTarget=candidate();nonTarget.tickets[0]='3-2-5';
  assert.equal(compare.invariantReason(current(),nonTarget),'candidate-nontarget-head-tickets-changed');
  const wrongHead=candidate();wrongHead.researchSelection.targetHead=3;
  assert.equal(compare.invariantReason(current(),wrongHead),'candidate-target-not-actual-inside-head');
});

test('v2 report reuses exact replay and settlement, keeps its own definition, and excludes invariant failures',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-selected-report-'));
  try {
    fs.mkdirSync(path.join(root,'js'));fs.mkdirSync(path.join(root,'scripts'));
    for(const name of [...frozen.MODULES,compare.HELPER_MODULE])fs.writeFileSync(path.join(root,'js',name+'.js'),'// fixture\n');
    for(const name of ['compare-escape-frozen.cjs','compare-alternate-escape-partners.cjs'])fs.writeFileSync(path.join(root,'scripts',name),'// comparison fixture\n');
    const saved=[1,2,3].map(raceNo=>({key:'20261017-01-'+raceNo,source:raceNo===1?'daily-primary':'daily-verification',
      selectedAt:'2026-10-17T00:01:00Z',deadlineAt:'2026-10-17T00:20:00Z',savedHead:3,
      savedTickets:current().tickets,savedScenarios:current().scenarios}));
    const outcome=(raceNo,actual,payout)=>({date:'20261017',jcd:'01',raceNo,source:'boatrace-official',resultAvailable:true,trifecta:{combination:actual,payout}});
    const loaded={chosen:new Map(saved.map(row=>[row.key,row])),files:[],exclusions:{},results:new Map([
      [saved[0].key,outcome(1,'1-4-2',2000)],[saved[1].key,outcome(2,'1-2-3',1000)],[saved[2].key,outcome(3,'1-4-2',2000)]])};
    const run={current:()=>current(),candidate:row=>{const next=candidate();if(row.key===saved[2].key)next.flowTickets=['1-4-2'];return next;}};
    const report=await compare.build(root,{loaded,run,sourceCommit:'v2-head'});
    assert.equal(report.candidate.id,'selected-escape-partner-order-v2');
    assert.equal(report.candidate.definedAt,'2026-10-19T02:17:17.000Z');
    assert.equal(report.summary.replayed,2);assert.equal(report.summary.gainedHits,1);assert.equal(report.summary.lostHits,1);
    assert.equal(report.summary.current.stake,600);assert.equal(report.summary.candidate.stake,600);
    assert.equal(report.exclusions['candidate-flow-tickets-changed'],1);
    assert.equal(report.bySource['daily-primary'].gainedHits,1);assert.equal(report.bySource['daily-verification'].lostHits,1);
    assert.equal(report.summary.selectionReasons.REORDER_SELECTED_ESCAPE_PARTNERS,2);
    assert.equal(report.byPeriod['discovery'].total.replayed,2);
    assert.equal(report.byPeriod['post-definition-replay'].total.candidate.recoveryRate,null);
    assert.equal(report.contract.formalForwardEvidence,false);
    assert.equal(report.predictionSources.at(-1).path,'js/research-selected-escape-partners.js');
    assert.equal(report.baselineReproduction.reproduced,3);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
