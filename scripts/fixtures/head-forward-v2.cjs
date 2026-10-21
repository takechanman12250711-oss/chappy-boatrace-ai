'use strict';
// Complete, invented six-boat inputs; never reads a race archive or real result.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const contract=require('../head-forward-contract.cjs');
const frozen=require('../compare-escape-frozen.cjs');
const candidate=require('../compare-independent-head-coverage.cjs');
const ROOT=path.resolve(__dirname,'../..');
const DEFINED='2030-10-21T00:00:00Z',SELECTED='2030-10-21T00:01:00.000Z',DEADLINE='2030-10-21T00:20:00.000Z',NOW=Date.parse('2030-10-21T00:02:00.000Z');
const env={GITHUB_REPOSITORY:contract.REPOSITORY,GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'b'.repeat(40),GH_TOKEN:'synthetic-token'};
const identity={codeCommit:'a'.repeat(40),workflowHead:env.GITHUB_SHA,runId:'123',runAttempt:'1'};
const clone=value=>JSON.parse(JSON.stringify(value));
function temporary(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'head-v2-synthetic-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function setup(t){
  const root=temporary(t);
  for(const file of contract.SOURCE_PATHS){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(ROOT,file),target);}
  fs.mkdirSync(path.join(root,'config'),{recursive:true});
  fs.writeFileSync(path.join(root,contract.CONFIG),JSON.stringify(contract.createProtocol(root,1234),null,2)+'\n');
  return {root,p:contract.readProtocol(root),env:{...env},identity:{...identity}};
}
function syntheticRecord(root,{raceNo=1,selectedAt=SELECTED,deadlineAt=DEADLINE}={}){
  const sourceFetchedAt=new Date(Date.parse(selectedAt)-30000).toISOString();
  const conditions={schemaVersion:4,source:'boatrace-official',sourceTiming:'pre_deadline',officialResultUsed:false,sourceFetchedAt,
    newEngineMode:false,weather:{windSpeed:2,waveHeight:2,windDirection:'向かい風'},
    dataAvailability:{officialCourses:6,exhibitionST:6,exhibitionTime:6}};
  const evidence=conditions.escapeEvaluationEvidence={version:'escape-evaluation-evidence-v1',historyStatus:'captured',resultUsedForGeneration:false,
    aiCoreVersion:candidate.REQUIRED_CORE_VERSION,sourceFetchedAt,datasetVersion:'synthetic-v1',historyContext:{racers:[]},raceInfo:{deadline:'09:20'}};
  evidence.entries=Array.from({length:6},(_,index)=>({boat:index+1,registerNo:String(5000+index),racerName:'synthetic-'+(index+1),
    className:index===0?'A1':'B1',avgSt:index===0?0.12:0.18+index*0.01,nationalWinRate:index===0?7.5:4.8-index*0.1,
    national2Rate:index===0?55:30,national3Rate:index===0?70:45,localWinRate:index===0?7:4.7,localStarts:30,
    motor2Rate:index===0?45:33,motor3Rate:50,boat2Rate:35,currentRace:{stList:[index===0?0.05:0.13+index*0.02]},
    exhibition:{displayTime:6.72+index*0.03}}));
  evidence.beforeInfo=evidence.entries.map(e=>({boat:e.boat,exhibition:{displayTime:e.exhibition.displayTime}}));
  evidence.startExhibition=evidence.entries.map((e,i)=>({boat:e.boat,course:e.boat,st:i===0?0.05:0.13+i*0.02,isOfficialCourse:true,mappingSource:'official-start-image'}));
  evidence.raceScenarios={scenarios:[]};
  const record={publicationPolicy:'all-races-v1',raceKey:`20301021-01-${raceNo}`,date:'20301021',jcd:'01',raceNo,selectedAt,deadlineAt,
    prediction:{practicalTickets:['1-2-3'],verificationEvidence:{sourceCommit:'c'.repeat(40),marks:{honmei:{boatNo:1}}},preRaceConditions:conditions}};
  const row=frozen.snapshot(record,'all-race-note',{requiredCoreVersion:candidate.REQUIRED_CORE_VERSION}).row;
  const a=frozen.runner(root,'current',{freezeClock:true,includeSelectionEvidence:true})(row);
  record.prediction.practicalTickets=[...a.tickets];record.prediction.verificationEvidence.marks.honmei.boatNo=a.head;
  evidence.raceScenarios={scenarios:clone(a.scenarios)};return record;
}
function saveNote(root,record){
  const bytes=JSON.stringify({version:'note-draft-bundle-v1',record,article:{synthetic:true}},null,2)+'\n',sha=contract.hash(bytes);
  const relative=`data/note-drafts/${record.date}/${record.raceKey}-${sha}.json`,file=path.join(root,relative);
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return {relative,bytes,sha};
}
function githubFixture(root,p,{mutate=()=>{},server=NOW}={}){
  const treeId=prefix=>contract.hash('synthetic-tree:'+prefix).slice(0,40),trees=new Map();
  const put=(prefix,entry)=>{const key=treeId(prefix);if(!trees.has(key))trees.set(key,[]);const a=trees.get(key);if(!a.some(x=>x.path===entry.path))a.push(entry);};
  for(const file of [...contract.SOURCE_PATHS,contract.CONFIG]){
    const parts=file.split('/');let prefix='';
    for(let i=0;i<parts.length;i++){
      if(i===parts.length-1)put(prefix,{path:parts[i],type:'blob',mode:'100644',sha:contract.blob(fs.readFileSync(path.join(root,file)))});
      else{const next=prefix?prefix+'/'+parts[i]:parts[i];put(prefix,{path:parts[i],type:'tree',mode:'040000',sha:treeId(next)});prefix=next;}
    }
  }
  const calls=[];
  const fetcher=async(url,options)=>{
    const u=new URL(url),relative=u.pathname.replace('/repos/'+contract.REPOSITORY,'');calls.push({relative,options});let value;
    if(relative==='/pulls/1234')value={number:1234,merged:true,state:'closed',merged_at:DEFINED,merge_commit_sha:'d'.repeat(40),
      base:{ref:'main',repo:{full_name:contract.REPOSITORY}},head:{sha:'e'.repeat(40),repo:{full_name:contract.REPOSITORY}}};
    else if(relative==='/actions/runs/123')value={id:123,run_attempt:1,head_sha:env.GITHUB_SHA,head_branch:'main',path:'.github/workflows/live-note.yml',
      repository:{full_name:contract.REPOSITORY},event:'schedule',status:'in_progress',conclusion:null,created_at:'2030-10-21T00:00:01Z'};
    else if(relative==='/contents/'+contract.CONFIG){const raw=fs.readFileSync(path.join(root,contract.CONFIG));value={type:'file',encoding:'base64',size:raw.length,sha:contract.blob(raw),content:raw.toString('base64')};}
    else if(relative==='/git/commits/'+'d'.repeat(40))value={tree:{sha:treeId('')}};
    else if(relative.startsWith('/git/trees/'))value={tree:clone(trees.get(relative.slice('/git/trees/'.length))||[]),truncated:false};
    else throw Error('Unexpected synthetic request '+url);
    mutate(relative,value);
    return new Response(JSON.stringify(value),{status:200,headers:{date:new Date(server).toUTCString(),'content-type':'application/json'}});
  };
  return {fetcher,calls,trees};
}
function zip(bytes){return execFileSync('python3',['-c','import io,sys,zipfile\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w",compression=zipfile.ZIP_DEFLATED) as z: z.writestr("batch.json",sys.stdin.buffer.read())\nsys.stdout.buffer.write(b.getvalue())'],{input:bytes});}
function artifactFixture(bytes,{confirmed=Date.parse('2030-10-21T00:03:00Z')}={}){
  const archived=zip(bytes),digest='sha256:'+contract.hash(archived);let metadataCalls=0;
  const fetcher=async(url)=>{
    if(url.endsWith('/zip'))return new Response(archived,{status:200,headers:{'content-length':String(archived.length)}});
    if(!url.endsWith('/actions/artifacts/987'))throw Error('Unexpected artifact request '+url);
    metadataCalls++;
    return new Response(JSON.stringify({id:987,expired:false,name:'independent-head-v2-123-1',digest,created_at:'2030-10-21T00:02:01Z',
      size_in_bytes:archived.length,workflow_run:{id:123,head_sha:env.GITHUB_SHA}}),{status:200,headers:{date:new Date(metadataCalls===1?NOW+2000:confirmed).toUTCString()}});
  };
  return {fetcher,digest};
}
module.exports={ROOT,DEFINED,SELECTED,DEADLINE,NOW,env,identity,clone,temporary,setup,syntheticRecord,saveNote,githubFixture,artifactFixture};
