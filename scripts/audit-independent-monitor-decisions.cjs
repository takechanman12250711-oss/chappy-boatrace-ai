'use strict';
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const { independentArticle } = require('./note-independent-monitor-source');
const { requireExhibition } = require('./note-exhibition');
const { validateDecisionEvidence } = require('./independent-monitor-decision.cjs');
function auditFiles(files, rootDir = process.cwd()) {
  const rows = [...new Set(files)].sort().map(file => {
    try {
      const raw = fs.readFileSync(path.join(rootDir,file),'utf8');
      const sha256 = createHash('sha256').update(raw).digest('hex');
      if (!file.endsWith(`-${sha256}.json`)) throw Error('source_hash_mismatch');
      const bundle = JSON.parse(raw);
      independentArticle(bundle); requireExhibition(bundle.record);
      const decision = validateDecisionEvidence(bundle);
      return { sourcePath:file, sourceSha256:sha256, raceKey:bundle.record.raceKey, kind:bundle.monitor.kind, ...decision };
    } catch(error) { return { sourcePath:file,status:'invalid_source',reason:error.message,automaticReady:false }; }
  });
  return { version:'independent-monitor-readiness-v1', generatedAt:new Date().toISOString(),
    scope:'explicit source files only; not all races or all historical independent articles',
    sourceFiles:rows.length, uniqueRaces:new Set(rows.filter(r=>r.raceKey).map(r=>r.raceKey)).size,
    structured:rows.filter(r=>r.recorded).length, legacy:rows.filter(r=>r.status==='legacy_unstructured').length,
    invalid:rows.filter(r=>r.status==='invalid_source').length,
    productionChanged:false, automaticProductionChange:false, usableForPrediction:false, rows };
}
if(require.main===module){const files=process.argv.slice(2);if(!files.length)throw Error('explicit_source_paths_required');console.log(JSON.stringify(auditFiles(files),null,2));}
module.exports={auditFiles};
