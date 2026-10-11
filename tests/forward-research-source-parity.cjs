'use strict';
// Read-only proof against the checkout's actual saved inputs. Run once in the
// existing combined-forward workflow; do not restore or regenerate old inputs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const input = require('../scripts/analysis-input-contract.js');
const exp = require('../scripts/analyze-ticket-expansion-7-12-18-24.cjs');
const overlay = require('../scripts/analyze-outer-head-signal-overlay.cjs');
const { compactForwardResearchRecord: compact, compactOuterAttackRecord: outer } = require('../scripts/report-input-projection.cjs');
const root = path.resolve(__dirname, '..');
const predictionDir = path.join(root, 'data/predictions');
const reportPath = path.join(root, 'data/stats/local-water-priority-selector-shadow-replay.json');
const replay = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const times = r => [r?.selectedAt,r?.capturedAt,r?.savedAt,r?.createdAt,r?.generatedAt,r?.prediction?.selectedAt,r?.prediction?.capturedAt,r?.prediction?.savedAt,r?.prediction?.createdAt];
function signals(r) {
  const c = r?.prediction?.preRaceConditions || r?.preRaceConditions || null;
  const b = Array.isArray(c?.boats) ? c.boats : [];
  const w = c?.weather || {};
  return { sourceTiming: c?.sourceTiming, officialResultUsed: c?.officialResultUsed,
    boats: b.map(x => [x?.boatNo,x?.boat,x?.frameNo,x?.attackStrength,x?.raceFlowPower,x?.totalScore,x?.exhibitionST]),
    water: [w.windSpeed,w.wind,w.waveHeight,w.wave,c?.windSpeed,c?.waveHeight] };
}
function stable(report) { const out={...report};delete out.generatedAt;return out; }
const files=[];let rows=0,candidates=0;
for(const name of fs.readdirSync(predictionDir).filter(n=>/^\d{8}\.json$/.test(n)).sort()) {
  const filename=path.join(predictionDir,name);
  const bytes=fs.readFileSync(filename), digest=hash(bytes);
  const doc=JSON.parse(bytes.toString('utf8'));
  const all=['predictions','verificationPredictions'].flatMap(key=>Array.isArray(doc[key])?doc[key]:[]);
  for(const r of all) {
    const c=compact(r);
    assert.equal(input.raceKey(c),input.raceKey(r),name+': race identity');
    assert.equal(input.preDeadlineReason(c),input.preDeadlineReason(r),name+': eligibility');
    assert.deepEqual(times(c),times(r),name+': capture precedence');
    assert.deepEqual(signals(c),signals(r),name+': frozen signals');
    const rawPool=exp.collectTicketPool(r);
    assert.deepEqual(exp.collectTicketPool(c),rawPool,name+': complete saved pool and ordering');
    candidates+=rawPool.length;rows++;
  }
  // This loader intentionally retains the first matching raw row, unlike the
  // canonical cohort's primary/last-duplicate policy. Its order is unchanged.
  assert.deepEqual(stable(overlay.build(replay,all.map(outer))),stable(overlay.build(replay,all)),name+': outer joins and component values');
  assert.equal(hash(fs.readFileSync(filename)),digest,name+': original bytes');
  files.push({path:'data/predictions/'+name,sha256:digest,bytes:bytes.length,rows:all.length});
}
assert.ok(files.length>0 && rows>0,'actual saved inputs required');
process.stdout.write(JSON.stringify({schemaVersion:1,check:'forward-research-source-projection-parity',
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),generatedAt:new Date().toISOString(),
  complete:true,sourceUnchanged:true,files:files.length,rows,candidateItems:candidates,
  checks:['race-key','pre-deadline-reasons','all-capture-time-fallbacks','complete-saved-pool-order-and-scores','frozen-boat-and-weather-signals','outer-first-row-join-and-components'],
  manifest:files,outerReplaySha256:hash(fs.readFileSync(reportPath)),productionChanged:false,automaticApplication:false,usableForPrediction:false},null,2)+'\n');
