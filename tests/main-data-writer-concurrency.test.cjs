'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
const writerGroup = 'chappy-main-data-writers';
const workflows = fs.readdirSync(workflowsDir)
  .filter(file => /\.ya?ml$/.test(file))
  .map(file => ({ file, source: fs.readFileSync(path.join(workflowsDir, file), 'utf8') }))
  .filter(({ source }) => new RegExp(`^\\s+group:\\s*["']?${writerGroup}["']?\\s*$`, 'm').test(source));

assert.ok(workflows.length > 0, `expected at least one workflow in ${writerGroup}`);

for (const { file, source } of workflows) {
  const lines = source.split(/\r?\n/);
  const groupIndex = lines.findIndex(line => new RegExp(`^\\s+group:\\s*["']?${writerGroup}["']?\\s*$`).test(line));
  const indent = lines[groupIndex].match(/^\s*/)[0].length;
  const concurrencyLines = [];
  for (let index = groupIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() && line.match(/^\s*/)[0].length < indent) break;
    concurrencyLines.push(line);
  }
  const block = concurrencyLines.join('\n');
  assert.match(block, /^\s*queue:\s*max\s*$/m,
    `${file}: shared writer group must use queue: max so pending runs are not replaced`);
  assert.match(block, /^\s*cancel-in-progress:\s*false\s*$/m,
    `${file}: shared writer group must preserve cancel-in-progress: false`);
  assert.doesNotMatch(block, /^\s*cancel-in-progress:\s*true\s*$/m,
    `${file}: shared writer runs must never cancel in-progress work`);
}

console.log(`main data writer concurrency invariant passed (${workflows.length} workflows)`);
