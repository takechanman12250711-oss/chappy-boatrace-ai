'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'review-save-'));
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
try {
  const remote = path.join(workspace, 'remote.git'), dir = path.join(workspace, 'work');
  fs.mkdirSync(dir); git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.invalid'); git(dir, 'config', 'user.name', 'Test');
  for (const p of ['data/predictions', 'data/stats']) fs.mkdirSync(path.join(dir,p), {recursive:true});
  fs.writeFileSync(path.join(dir,'data/predictions/20300101.json'), 'original source\n');
  for (const f of ['candidate24-report','race-review-progress','race-review-results']) fs.writeFileSync(path.join(dir,`data/stats/${f}.json`), '{}\n');
  git(dir,'add','.');git(dir,'commit','-m','original');
  execFileSync('git',['init','--bare',remote],{stdio:'ignore'});git(dir,'remote','add','origin',remote);git(dir,'push','-u','origin','main');
  fs.writeFileSync(path.join(dir,'data/predictions/20300101.json'), 'temporary archive restoration\n');
  for (const f of ['candidate24-report','race-review-progress','race-review-results']) fs.writeFileSync(path.join(dir,`data/stats/${f}.json`), '{"settled":5}\n');
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/candidate24-report.yml'),'utf8');
  const section=workflow.slice(workflow.indexOf('      - name: Save derived report only'));
  const body=section.slice(section.indexOf('        run: |')+'        run: |'.length).trimEnd().split('\n').filter(Boolean).map(l=>l.replace(/^          /,'')).join('\n');
  execFileSync('bash',['-e','-c',body],{cwd:dir,stdio:['ignore','pipe','pipe']});
  assert.equal(git(dir,'status','--porcelain'),'');
  assert.equal(git(dir,'show','origin/main:data/predictions/20300101.json'),'original source\n');
  assert.equal(git(dir,'show','origin/main:data/stats/race-review-progress.json'),'{"settled":5}\n');
  console.log('real git report save: restored scratch sources never block rebase or change published originals');
} finally { fs.rmSync(workspace,{recursive:true,force:true}); }
