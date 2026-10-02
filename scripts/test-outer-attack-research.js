'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const research=require('./outer-attack-research'), {build}=require('./build-outer-attack-research-report');
const {saveSource}=require('./outer-attack-live-source'), old=require('../js/outer-attack-ticket-shadow');
const {save:saveCoverage}=require('./verification-coverage');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'outer-research-'));
const date='20300923',at='2030-09-23T01:00:00Z',deadline='2030-09-23T01:15:00Z';
const baseline=[{ticket:'1-2-3',category:'本線'},{ticket:'1-3-2',category:'押さえ'},{ticket:'1-2-4',category:'flow'},{ticket:'1-2-5',category:'flow'}];
const record={raceKey:date+'-01-1',date,jcd:'01',raceNo:1,selectedAt:at,deadlineAt:deadline,
 reviewEvidence:{version:'race-review-evidence-v1',method:'a'.repeat(64),predictionMode:'server_pre_deadline',officialResultUsedForPrediction:false},
 exhibitionSnapshot:{version:'note-exhibition-v1',ready:true,capturedAt:at,
 entries:[1,2,3,4,5,6].map(boat=>({boat,exhibition:{displayTime:6.8}})),
 startExhibition:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:0.12,mappingSource:'official-start-image'}))}};
const built={branches:[{id:'five',qualified:true,attackerBoatNo:5},{id:'six',qualified:true,attackerBoatNo:6}],candidatePool:[
 {ticket:'5-1-2',evidenceQualified:true,branchIds:['five'],priorityScore:88},
 {ticket:'1-5-2',evidenceQualified:true,branchIds:['five'],priorityScore:85},
 {ticket:'6-1-2',evidenceQualified:true,branchIds:['six'],priorityScore:90},
 {ticket:'5-6-1',evidenceQualified:false,branchIds:['five'],priorityScore:100}]};
try{
 const original=JSON.stringify({record,baseline,built});const r=research.capture(record,baseline,built);
 assert.equal(JSON.stringify({record,baseline,built}),original);assert.equal(r.multipleAttackers,true);
 assert.equal(r.variants['boat5-position1'].status,'changed');assert.equal(r.variants['boat6-position1'].status,'changed');
 assert.deepEqual(r.variants['boat5-position1'].b,['1-2-3','5-1-2','1-2-4','1-2-5']);
 assert.equal(r.variants['boat6-position3'].status,'no-grounded-candidate');
 assert.equal(research.valid(r,{...record,practicalTickets:baseline}),true);
 const invalid=structuredClone(r);invalid.variants['boat5-position1'].b[0]='5-2-1';assert.equal(research.valid(invalid,{...record,practicalTickets:baseline}),false);
 assert.throws(()=>research.capture({...record,deadlineAt:at},baseline,built),/exhibition/);
 const input={...record,practicalTickets:baseline,evaluatedScenarioCandidates:{candidatePool:[{ticket:'5-1-2',sourceCategory:'cover',evidenceQualified:true}]}};
 assert.equal(research.diagnose(input).poolCount,1);
 record.outerAttackShadow=old.buildSnapshot(input,{now:at});record.outerAttackResearch=r;
 saveSource(record,baseline,{rootDir:root,now:Date.parse(at)});
 const obs={version:'verification-coverage-v1',date,observedAt:at,scheduleComplete:true,failures:[],races:[
 {raceKey:record.raceKey,status:'evidence-saved',deadlineAt:deadline},{raceKey:date+'-01-2',status:'waiting-exhibition',deadlineAt:deadline}]};
 saveCoverage(root,obs);saveCoverage(root,{...obs,observedAt:deadline,races:obs.races.map(x=>({...x,status:'closed-or-too-close'}))});
 let report=build(root);assert.equal(report.capturedRaces,1);assert.equal(report.pending,1);assert.equal(report.coverage[date].reasons['waiting-exhibition'],1);
 fs.mkdirSync(path.join(root,'data/results'),{recursive:true});
 fs.writeFileSync(path.join(root,'data/results',date+'.json'),JSON.stringify({races:[{...record,source:'boatrace-official',resultAvailable:false}]}));
 fs.mkdirSync(path.join(root,'data/stats'),{recursive:true});
 const result={date,jcd:'01',raceNo:1,source:'boatrace-official',resultAvailable:true,trifecta:{combination:'5-1-2',payout:3000}};
 const writeResult=r=>fs.writeFileSync(path.join(root,'data/stats/race-review-results.json'),JSON.stringify({races:{[record.raceKey]:r}}));
 writeResult(result);report=build(root);assert.equal(report.settledRaces,1);assert.equal(report.groups['a'.repeat(64)+':boat5-position1'].bHits,1);assert.equal(report.groups['a'.repeat(64)+':boat5-position1'].stakeYen,400);
 assert.equal(report.groups['a'.repeat(64)+':boat6-position3'].changed.races,0);
 writeResult({...result,trifecta:{combination:'5-1-2',payout:null}});assert.equal(build(root).unknownPayout,1);
 writeResult({...result,starts:[{falseStart:true}]});assert.equal(build(root).voidRaces,1);
 writeResult({...result,status:'void',void:true});assert.equal(build(root).voidRaces,1);assert.equal(build(root).settledRaces,0);
 console.log('outer research: grounded 5/6 heads, multiple attackers, protected tickets, predeadline identity, coverage, independent official priority and void/payout handling passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
