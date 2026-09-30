'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'external-reference-v1';
const SOURCES = new Set(['hiyori','macour','br']);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function validateCapture(v) {
  if (!v || v.version !== VERSION) throw new Error('version_invalid');
  if (!/^\d{8}-\d{2}-([1-9]|1[0-2])$/.test(v.raceKey || '')) throw new Error('race_key_invalid');
  if (!SOURCES.has(v.source)) throw new Error('source_invalid');
  if (!v.sourceUrl || !/^https:\/\//.test(v.sourceUrl)) throw new Error('source_url_invalid');
  if (!Number.isFinite(Date.parse(v.capturedAt))) throw new Error('captured_at_invalid');
  if (v.beforeResult !== true) throw new Error('post_result_capture_forbidden');
  if (!v.sourceSha256 || !/^[a-f0-9]{64}$/.test(v.sourceSha256)) throw new Error('source_hash_invalid');
  if (!v.features || typeof v.features !== 'object' || Array.isArray(v.features)) throw new Error('features_invalid');
  if (v.productionChanged !== false || v.automaticApplication !== false || v.usableForPrediction !== false)
    throw new Error('safety_lock_invalid');
  return v;
}

function saveCapture(root, value) {
  const v = validateCapture(value);
  const date = v.raceKey.slice(0,8);
  const body = JSON.stringify(v) + '\n';
  const digest = sha256(body);
  const dir = path.join(root,'data','external-reference',date);
  fs.mkdirSync(dir,{recursive:true});
  const file = path.join(dir, `${v.raceKey}-${v.source}-${digest}.json`);
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file,'utf8') !== body) throw new Error('immutable_conflict');
    return file;
  }
  fs.writeFileSync(file,body,{flag:'wx',mode:0o600});
  return file;
}

function listCaptures(root) {
  const base = path.join(root,'data','external-reference');
  if (!fs.existsSync(base)) return [];
  const out=[];
  for (const date of fs.readdirSync(base).filter(v=>/^\d{8}$/.test(v)).sort()) {
    for (const name of fs.readdirSync(path.join(base,date)).filter(v=>v.endsWith('.json')).sort()) {
      const file=path.join(base,date,name);
      try { out.push({...validateCapture(JSON.parse(fs.readFileSync(file,'utf8'))),file:path.relative(root,file)}); }
      catch (error) { out.push({file:path.relative(root,file),invalid:error.message}); }
    }
  }
  return out;
}

function buildReport(root) {
  const rows=listCaptures(root), valid=rows.filter(v=>!v.invalid);
  const bySource={};
  for(const source of SOURCES){
    const xs=valid.filter(v=>v.source===source);
    bySource[source]={captured:xs.length,races:new Set(xs.map(v=>v.raceKey)).size};
  }
  return {
    version:VERSION,
    generatedAt:new Date().toISOString(),
    productionChanged:false,
    automaticApplication:false,
    usableForPrediction:false,
    totalCaptures:valid.length,
    invalidCaptures:rows.filter(v=>v.invalid).length,
    bySource,
    adoptionGate:{minimumForwardRacesPerFeature:120,automaticAdoption:false,humanApprovalRequired:true}
  };
}

if(require.main===module) console.log(JSON.stringify(buildReport(process.cwd()),null,2));
module.exports={VERSION,SOURCES,sha256,validateCapture,saveCapture,listCaptures,buildReport};
