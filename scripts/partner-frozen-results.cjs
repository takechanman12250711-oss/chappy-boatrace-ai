'use strict';
// Bounded read-only refresh after a snapshots artifact has already been uploaded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function collect(out){
 const file=path.join(out,'snapshots.json'),before=fs.readFileSync(file),doc=JSON.parse(before);
 if(doc.protocol.cohortDate!=='20260928'||doc.rows.length>100)throw Error('unexpected-cohort');
 const parser=require('../api/result').parseResult;
 const rows=doc.rows,results=Array(rows.length),trace=Array(rows.length);let next=0;
 fs.mkdirSync(path.join(out,'official-html'),{recursive:true});
 async function worker(){while(next<rows.length){const i=next++,r=rows[i],parts=r.raceKey.match(/^(\d{8})-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/);
   if(!parts||parts[1]!==doc.protocol.cohortDate)throw Error('invalid-request-key');
   const [date,jcd,rno]=parts.slice(1),url=`https://www.boatrace.jp/owpc/pc/race/raceresult?hd=${date}&jcd=${jcd}&rno=${rno}`;
   const base={raceKey:r.raceKey,date,jcd,raceNo:Number(rno),place:r.place,source:'boatrace-official',resultUrl:url};
   if(Date.parse(r.deadlineAt)>Date.now()){results[i]={...base,resultAvailable:false,status:'before-deadline-not-fetched'};trace[i]={raceKey:r.raceKey,requested:false};continue;}
   try{const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 ChappyBoatRaceAI/1.0'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const html=await response.text(),htmlFile=`official-html/${r.raceKey}.html`;fs.writeFileSync(path.join(out,htmlFile),html);
    results[i]={...base,ok:true,checkedAt:new Date().toISOString(),...parser(html)};
    trace[i]={raceKey:r.raceKey,requested:true,url,htmlFile,sha256:sha(Buffer.from(html)),checkedAt:results[i].checkedAt,httpStatus:response.status};
   }catch(e){results[i]={...base,ok:false,resultAvailable:false,error:e.message,checkedAt:new Date().toISOString()};trace[i]={raceKey:r.raceKey,requested:true,url,error:e.message};}
   await new Promise(resolve=>setTimeout(resolve,250));
 }}
 await Promise.all([worker(),worker(),worker()]);
 if(sha(fs.readFileSync(file))!==sha(before))throw Error('snapshots-changed-during-result-fetch');
 fs.writeFileSync(path.join(out,'official-refreshed.json'),JSON.stringify({date:doc.protocol.cohortDate,checkedAt:new Date().toISOString(),races:results},null,2));
 fs.writeFileSync(path.join(out,'official-refresh-manifest.json'),JSON.stringify({snapshotFileSha256:sha(before),attempted:trace.filter(t=>t.requested).length,
  available:results.filter(r=>r.resultAvailable).length,errors:trace.filter(r=>r.error),requests:trace,productionChanged:false},null,2));
 console.log(JSON.stringify({records:rows.length,available:results.filter(r=>r.resultAvailable).length,errors:trace.filter(r=>r.error).length}));
}
if(require.main===module)collect(path.resolve(process.argv[2]||'')).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={collect};
