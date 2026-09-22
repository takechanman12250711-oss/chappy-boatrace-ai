'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
function save(root,coverage){
  const bytes=JSON.stringify(coverage)+'\n', digest=createHash('sha256').update(bytes).digest('hex');
  const file=path.join(root,'data/verification-coverage',coverage.date,digest+'.json');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  try{fs.writeFileSync(file,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||fs.readFileSync(file,'utf8')!==bytes)throw e;}
  return file;
}
function read(root,directory){
  const base=path.join(root,'data',directory),out=[];
  for(const date of fs.existsSync(base)?fs.readdirSync(base).filter(d=>/^\d{8}$/.test(d)):[])
    for(const file of fs.readdirSync(path.join(base,date)).filter(f=>f.endsWith('.json')))
      out.push(JSON.parse(fs.readFileSync(path.join(base,date,file),'utf8')));
  return out;
}
module.exports={save,read};
