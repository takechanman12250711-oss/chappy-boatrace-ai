'use strict';
const fs=require('node:fs'),path=require('node:path');
const {read}=require('./verification-coverage');
const research=require('./outer-attack-research');
const {validSource}=require('./outer-attack-live-source');
const contract=require('./analysis-input-contract');
const load=(file,fallback={})=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;
function metrics(){return {races:0,changedRaces:0,aHits:0,bHits:0,stakeYen:0,aReturnYen:0,bReturnYen:0};}
function build(root=process.cwd()){
  const sources=read(root,'outer-attack-sources').filter(validSource), observations=read(root,'verification-coverage');
  const resultDir=path.join(root,'data/results'), ledger=load(path.join(root,'data/stats/race-review-results.json'));
  const dates=new Set([...sources.map(s=>s.record.date),...observations.map(o=>o.date)]);
  const officials=new Map(), coverage={};
  for(const date of [...dates].sort()){
    const result=load(path.join(resultDir,date+'.json'));
    const seen=new Map(), attempts={};
    const runs=observations.filter(o=>o.date===date).sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
    for(const run of runs) for(const r of run.races||[]){seen.set(r.raceKey,r);(attempts[r.raceKey]||=[]).push(r.status);}
    for(const r of result.races||[]){const key=contract.raceKey(r,date);if(!key)continue;officials.set(key,r);if(!seen.has(key))seen.set(key,{raceKey:key,status:'no-collector-observation'});}
    const saved=new Set(sources.filter(s=>s.record.date===date).map(s=>s.record.raceKey));
    const reasons={},missing=[];
    for(const [key,row] of seen) if(!saved.has(key)){
      const history=attempts[key]||[];
      const reason=[...history].reverse().find(s=>!['closed-or-too-close','deferred-until-one-hour'].includes(s)) || row.status;
      reasons[reason]=(reasons[reason]||0)+1;missing.push({raceKey:key,reason});
    }
    coverage[date]={scheduledRaces:seen.size,scheduleComplete:runs.some(r=>r.scheduleComplete===true)||result.complete===true,
      observedRaces:Object.keys(attempts).length,savedRaces:saved.size,missingRaces:missing.length,reasons,missing,
      lastObservedAt:runs.at(-1)?.observedAt||null,venueFailures:runs.at(-1)?.failures||[]};
  }
  for(const [key,r] of Object.entries(ledger.races||{})){
    const prev=officials.get(key);
    if(!prev||!prev.resultAvailable||prev.status==='pending')officials.set(key,{...r,checkedAt:r.checkedAt||ledger.attempts?.[key]?.checkedAt});
  }
  const selected=new Map(),rejected={};
  for(const s of sources){if(!s.research)continue;if(!research.valid(s.research,s.record)){rejected['invalid-research']=(rejected['invalid-research']||0)+1;continue;}
    const previous=selected.get(s.record.raceKey);
    if(!previous || s.record.selectedAt<previous.record.selectedAt)selected.set(s.record.raceKey,s);
  }
  const groups={},rows=[];let pending=0,voidRaces=0,unknownPayout=0;
  for(const [key,s] of selected){
    const r=officials.get(key);if(!r||!contract.isOfficialResultSource(r)){pending++;continue;}
    if(r.void||r.status==='void'||r.refund||r.hasRefund||r.refundBoats?.length){voidRaces++;continue;}
    if(!r.resultAvailable){pending++;continue;}
    const ticket=contract.actualTicket(r), payout=Number(r.trifecta?.payout??r.officialPayoutPer100??r.payoutPer100Yen);
    if(!ticket||!(payout>0)){unknownPayout++;continue;}
    for(const [variant,v] of Object.entries(s.research.variants)){
      if(!['changed','already-covered','no-unprotected-ticket','no-grounded-candidate'].includes(v.status))continue;
      const id=`${s.research.method}:${variant}`,m=groups[id]||= {...metrics(),method:s.research.method,variant,changed:metrics()};
      const aHit=v.a.includes(ticket),bHit=v.b.includes(ticket),stake=v.a.length*100;
      for(const stat of [m,...(v.status==='changed'?[m.changed]:[])]){
        stat.races++;stat.changedRaces+=Number(v.status==='changed');stat.aHits+=Number(aHit);stat.bHits+=Number(bHit);
        stat.stakeYen+=stake;stat.aReturnYen+=aHit?payout:0;stat.bReturnYen+=bHit?payout:0;
      }
      rows.push({raceKey:key,method:s.research.method,variant,status:v.status,course:v.course,multipleAttackers:s.research.multipleAttackers,
        capturedAt:s.record.selectedAt,a:v.a,b:v.b,actual:ticket,payoutPer100:payout,aHit,bHit});
    }
  }
  for(const g of Object.values(groups))for(const m of [g,g.changed]){
    m.aHitRate=m.races?100*m.aHits/m.races:null;m.bHitRate=m.races?100*m.bHits/m.races:null;
    m.aRoi=m.stakeYen?100*m.aReturnYen/m.stakeYen:null;m.bRoi=m.stakeYen?100*m.bReturnYen/m.stakeYen:null;
    m.profitDeltaYen=m.bReturnYen-m.aReturnYen;
  }
  const diagnosticCounts={};
  for(const s of sources){const d=s.diagnostics;if(!d)continue;const reason=!d.poolCount?'pool-missing':!d.qualifiedCount?'no-qualified-candidate':d.signal;
    diagnosticCounts[reason]=(diagnosticCounts[reason]||0)+1;}
  return {version:research.VERSION,generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,
    adoptionStatus:'NOT_REGISTERED_FOR_PRODUCTION_ADOPTION',coverage,diagnosticCounts,
    capturedRaces:selected.size,settledRaces:new Set(rows.map(r=>r.raceKey)).size,pending,voidRaces,unknownPayout,rejected,groups,rows,
    note:'First valid prospective snapshot per race; methods and boat/position variants remain separate. Unchanged and changed-only denominators shown. No retrospective candidate generation.'};
}
function main(root=process.cwd()){
  const report=build(root),file=path.join(root,'data/stats/outer-attack-research-report.json'),old=load(file);
  const comparable=x=>JSON.stringify({...x,generatedAt:undefined});
  if(comparable(old)!==comparable(report)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(file+'.tmp',file);}
  console.log(JSON.stringify({capturedRaces:report.capturedRaces,settledRaces:report.settledRaces,coverage:Object.fromEntries(Object.entries(report.coverage).slice(-2).map(([k,v])=>[k,{...v,missing:undefined}]))}));return report;
}
if(require.main===module)main();module.exports={build,main};
