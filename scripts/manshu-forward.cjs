'use strict';
// ツムギ：万舟狙いを分けた場合の前向き記録（読み取りのみ）
// 使い方: chappy-boatrace-ai の最新 main のフォルダで
//   git fetch -q origin 'refs/tags/note-published/*:refs/tags/note-published/*'
//   node scripts/manshu-forward.cjs [開始日YYYYMMDD=20261029] [終了日YYYYMMDD=今日]
// 公開記録（note-published）と保存原稿・公式結果だけを使う。本番の記事・予想は変えない。
const fs=require('fs'),path=require('path'),Module=require('module'),{execFileSync}=require('child_process');
const root=process.cwd(),from=process.argv[2]||'20261029',to=process.argv[3]||'99999999';
const file=path.join(root,'scripts/note-published-ticket-sections.js');
const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
m._compile(fs.readFileSync(file,'utf8')+'\nmodule.exports.__reconstruct=reconstructDisplay;',file);
const reconstruct=m.exports.__reconstruct;
const audit=require(path.join(root,'scripts/audit-escape-main.cjs'));
const input=require(path.join(root,'scripts/analysis-input-contract'));
const results=new Map();
function resultFor(key){const date=key.slice(0,8);if(!results.has(date)){const f=path.join(root,'data/results',date+'.json');const mm=new Map();if(fs.existsSync(f))for(const r of JSON.parse(fs.readFileSync(f,'utf8')).races||[]){const k=input.raceKey(r,date);mm.set(k,audit.chooseOfficialResult(mm.get(k),r));}results.set(date,mm);}return audit.resultOf(results.get(date).get(key));}
const tags=execFileSync('git',['tag','-l','note-published/*'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const rows=[],issues={};const bump=k=>issues[k]=(issues[k]||0)+1;
for(const t of tags){
  let r;try{r=JSON.parse(execFileSync('git',['show',`${t}:receipt.json`],{encoding:'utf8'}));}catch{bump('receiptUnreadable');continue;}
  const date=r.raceKey.slice(0,8);if(date<from||date>to)continue;
  if(r.articleSeries!=='normal'){bump('notNormal');continue;}
  const proof=r.publishedDisplayProof;if(!proof){bump('noProof');continue;}
  const src=path.join(root,'data/note-drafts',date,`${r.raceKey}-${r.sourceSha256}.json`);
  if(!fs.existsSync(src)){bump('sourceMissing');continue;}
  const bundle=JSON.parse(fs.readFileSync(src,'utf8'));
  const central=[...new Set((bundle.baselinePracticalTickets||[]).map(x=>typeof x==='string'?x:x.ticket))];
  let rec;try{rec=reconstruct({bundle,series:'normal',central},proof.presentationVersion,r.sourceSha256);}catch(e){bump('reconstructError');continue;}
  if(rec.proof.sectionsSha256!==proof.sectionsSha256){bump('proofMismatch');continue;}
  const inc=new Set(proof.sections.filter(s=>s.includedInPublishedResult).map(s=>s.label));
  rows.push({key:r.raceKey,price:r.price,secs:rec.sections.filter(s=>inc.has(s.label)),result:resultFor(r.raceKey)});
}
const isManshu=s=>/万舟|高配当/.test(s.label);
function sum(pick){let stake=0,ret=0,hits=0,races=0;
  for(const r of rows.filter(r=>r.result&&!r.result.excluded)){const t=[...new Set(r.secs.filter(pick).flatMap(s=>s.tickets))];if(!t.length)continue;races++;stake+=t.length*100;if(t.includes(r.result.actual)){hits++;ret+=r.result.payout;}}
  return {races,tickets:stake/100,hits,hitRate:races?+(100*hits/races).toFixed(1):null,stake,returned:ret,roi:stake?+(100*ret/stake).toFixed(1):null};}
const keys=rows.map(r=>r.key).sort();
console.log(JSON.stringify({period:{from,to,first:keys[0]||null,last:keys[keys.length-1]||null},articles:rows.length,
  settled:rows.filter(r=>r.result&&!r.result.excluded).length,pending:rows.filter(r=>!r.result).length,excluded:rows.filter(r=>r.result&&r.result.excluded).length,issues,
  A_asPublished:sum(()=>true),B_withoutManshu:sum(s=>!isManshu(s)),manshuOnly:sum(isManshu),
  races:rows.map(r=>({key:r.key,price:r.price,actual:r.result?.actual??null,excluded:!!r.result?.excluded,hitSections:r.result?r.secs.filter(s=>s.tickets.includes(r.result.actual)).map(s=>s.label):[]}))},null,1));
