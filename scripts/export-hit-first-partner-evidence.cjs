'use strict';
// One-off read-only extraction for the approved partner-selection A/B review.
// No predictions, source snapshots, scheduled jobs, or production tickets are changed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-output/partner-evidence');
const source=require('./eight-ticket-promotion-report-source.cjs');
const input=require('./analysis-input-contract');
const helpers=require('./build-continuous-performance-ledger.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest={version:'hit-first-partner-evidence-v1',productionChanged:false,automaticApplication:false,generatedAt:new Date().toISOString(),files:[],days:[]};
function put(rel,bytes){const p=path.join(out,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);manifest.files.push({path:rel,bytes:bytes.length,sha256:hash(bytes)});}
function copy(rel){const p=path.join(root,rel);if(fs.existsSync(p))put(rel,fs.readFileSync(p));}
for(const date of ['20260924','20260925','20260926','20260927']){
 const {data,source:kind}=source.readDay(root,date);
 const rows=input.mergePredictionSources(data.predictions,data.verificationPredictions);
 // Persist the original canonical records, not newly generated predictions.
 const body=Buffer.from(JSON.stringify({date,updatedAt:data.updatedAt,source:kind,records:rows}));
 put('days/'+date+'.json.gz',zlib.gzipSync(body));
 const shapes=rows.slice(0,2).map(r=>({key:input.raceKey(r),top:Object.keys(r),prediction:Object.fromEntries(Object.entries(r.prediction||{}).map(([k,v])=>[k,Array.isArray(v)?'array:'+v.length:typeof v])),practical:Object.keys(r.prediction?.practicalSelection||{}),shadow:Object.keys(r.practicalPriorityShadow||{})}));
 manifest.days.push({date,source:kind,updatedAt:data.updatedAt,races:rows.length,uncompressedBytes:body.length,sourceSha256:hash(body),shapes});
 copy('data/results/'+date+'.json');
}
copy('data/stats/continuous-performance-ledger.json');
for(const dir of ['js','scripts'])for(const name of fs.readdirSync(path.join(root,dir))){if(/\.(?:js|cjs|json)$/.test(name)&&fs.statSync(path.join(root,dir,name)).isFile())copy(dir+'/'+name);}
copy('package.json');
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({evidenceFiles:manifest.files.length,days:manifest.days,productionChanged:false}));
