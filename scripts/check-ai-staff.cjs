'use strict';

// Validate the small, deliberately restricted subset used by our project
// profiles. This does not launch a model or claim that an agent has executed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, '.claude', 'agents');
const roster = {
  kai: 'カイ', minato: 'ミナト', homura: 'ホムラ', ruri: 'ルリ', kohaku: 'コハク',
  wakaba: 'ワカバ', sora: 'ソラ', shizuku: 'シズク', hinata: 'ヒナタ', tsumugi: 'ツムギ'
};
const readTools = ['Glob', 'Grep', 'Read'];
const developmentTools = ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'];
const expected = Object.keys(roster).map(id => `chappy-${id}.md`).sort();
const files = fs.readdirSync(directory).filter(file => /^chappy-.*\.md$/.test(file)).sort();
assert.deepEqual(files, expected, 'AI staff roster differs from the approved ten members');
const staff = fs.readFileSync(path.join(root, 'staff.html'), 'utf8');
assert(fs.existsSync(path.join(root, 'docs', 'ai-staff-operations.md')));

for (const [id, label] of Object.entries(roster)) {
  const file = path.join(directory, `chappy-${id}.md`);
  assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), `${id}: regular file required`);
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(text);
  assert(match, `${id}: missing frontmatter or instructions`);
  const fields = Object.create(null);
  for (const line of match[1].split('\n')) {
    const item = /^(name|description|tools|model): (.+)$/.exec(line);
    assert(item && !Object.hasOwn(fields, item[1]), `${id}: unsupported or duplicate frontmatter`);
    fields[item[1]] = item[2];
  }
  assert.deepEqual(Object.keys(fields).sort(), ['description', 'model', 'name', 'tools']);
  assert.equal(fields.name, `chappy-${id}`);
  assert.equal(fields.model, 'inherit', `${id}: inherit the active session model`);
  assert(fields.description.includes(label) && staff.includes(`<b>${label}</b>`), `${id}: unknown employee`);
  const tools = fields.tools.split(',').map(value => value.trim()).sort();
  assert.deepEqual(tools, id === 'wakaba' ? developmentTools : readTools, `${id}: tool boundary changed`);
  assert(match[2].includes('`AGENTS.md`') && match[2].includes('`docs/ai-staff-operations.md`'), `${id}: shared instructions missing`);
  for (const skill of text.matchAll(/`(?:\.claude\/skills\/)?((?:chappy-|claude-codex-)[a-z-]+)(?:\/SKILL\.md)?`/g)) {
    assert(fs.existsSync(path.join(root, '.claude', 'skills', skill[1], 'SKILL.md')), `${id}: unknown skill ${skill[1]}`);
  }
}

console.log('10 AI staff profiles validated: existing names, inherited model, tool boundaries and skill references');
