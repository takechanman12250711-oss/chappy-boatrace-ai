'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
// Fingerprint prediction code, not result updates, UI edits or daily reference data.
const roots = ['js/ai-core.js', 'js/prediction.js', 'js/practical-selection.js',
  'js/three-course-escape-rescue-fixed5.js', 'js/history-insights.js',
  'js/motor-maintenance-insights.js', 'js/local-water-v2-tiebreak.js',
  'js/prediction-simple-evaluation.js', 'js/theory-input.js', 'js/note-generator.js',
  'config/chappy-charter.json'];
let cached;
function methodFingerprint(root = path.resolve(__dirname, '..')) {
  const files = new Map();
  function visit(relative) {
    if (files.has(relative)) return;
    const content = fs.readFileSync(path.join(root, relative), 'utf8');
    files.set(relative, content);
    for (const match of content.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      let dependency = path.normalize(path.join(path.dirname(relative), match[1]));
      if (!path.extname(dependency)) dependency += '.js';
      if (/^(js|config)\//.test(dependency)) visit(dependency);
    }
  }
  roots.forEach(visit);
  const hash = createHash('sha256');
  [...files].sort(([a], [b]) => a.localeCompare(b)).forEach(([name, content]) => hash.update(name + '\0' + content + '\0'));
  return hash.digest('hex');
}
function reviewEvidence(prediction) {
  cached ||= methodFingerprint();
  return { version: 'race-review-evidence-v1', method: cached,
    predictionMode: prediction.predictionMode,
    officialResultUsedForPrediction: prediction.officialResultUsedForPrediction === true };
}
module.exports = { methodFingerprint, reviewEvidence };
