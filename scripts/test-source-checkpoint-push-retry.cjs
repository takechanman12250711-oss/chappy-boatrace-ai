'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-push-retry-'));
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
function write(cwd, file, value) { fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); fs.writeFileSync(path.join(cwd, file), JSON.stringify(value) + '\n'); }
function commit(cwd, message) { git(cwd, ['add', '.']); git(cwd, ['commit', '-m', message]); }
function identity(cwd) { git(cwd, ['config', 'user.name', 'test']); git(cwd, ['config', 'user.email', 'test@example.invalid']); }
function retryBlock(workflow, step) {
  const source = fs.readFileSync('.github/workflows/' + workflow, 'utf8');
  const start = source.indexOf('- name: ' + step);
  const end = source.indexOf('\n      - name:', start + 1);
  const block = source.slice(start, end < 0 ? undefined : end);
  const match = block.match(/^(\s*)for attempt in 1 2 3; do\n[\s\S]*?^\1done$/m);
  assert.ok(match, `${workflow}: source save must retry at most three times`);
  const loop = match[0];
  assert.match(loop, /git pull --rebase --autostash origin main/);
  assert.match(loop, /if git push origin main; then\n\s+break/);
  assert.doesNotMatch(loop, /--force|checkout.*--ours|checkout.*--theirs|rebase.*--skip/);
  return loop;
}
try {
  // Advance another clone after destination refs were advertised, reproducing
  // the cannot-lock-ref production race without a network service.
  const advance = path.join(root, 'advance.cjs');
  fs.writeFileSync(advance, `
    const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
    const [other,marker,mode]=process.argv.slice(2);
    const count=fs.existsSync(marker)?Number(fs.readFileSync(marker,'utf8')):0;
    if(mode==='once'&&count>0)process.exit(0);
    fs.writeFileSync(marker,String(count+1));
    const file=mode==='conflict'?'data/results/source.json':'data/stats/other.json';
    fs.mkdirSync(path.dirname(path.join(other,file)),{recursive:true});
    fs.writeFileSync(path.join(other,file),JSON.stringify({concurrent:count+1})+'\\n');
    const git=args=>execFileSync('git',args,{cwd:other,stdio:'pipe'});
    git(['add','.']);git(['commit','-m','concurrent update']);git(['push','origin','main']);
  `);
  for (const [workflow, step] of [
    ['collect-results.yml', 'Save official results before calibration'],
    ['collect-predictions.yml', 'Save predictions and note drafts'],
  ]) {
    const loop = retryBlock(workflow, step);
    for (const mode of ['once', 'always', 'conflict']) {
      const dir = path.join(root, workflow + '-' + mode);
      const work = path.join(dir, 'work'), other = path.join(dir, 'other'), remote = path.join(dir, 'remote.git');
      fs.mkdirSync(work, { recursive: true }); git(work, ['init', '-b', 'main']); identity(work);
      write(work, 'data/results/source.json', { baseline: true });
      write(work, 'data/stats/local.json', { baseline: true }); commit(work, 'baseline');
      git(dir, ['clone', '--bare', work, remote]);
      git(work, ['remote', 'add', 'origin', 'file://' + remote]);
      git(dir, ['clone', 'file://' + remote, other]); identity(other);
      write(work, 'data/results/source.json', { official: true }); commit(work, 'collected source');
      write(work, 'data/stats/local.json', { unsavedLocal: true });
      const marker = path.join(dir, 'attempts');
      const hook = path.join(work, '.git/hooks/pre-push');
      fs.writeFileSync(hook, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(advance)} ${quote(other)} ${quote(marker)} ${quote(mode)}\n`, { mode: 0o755 });
      const result = spawnSync('bash', ['-e', '-c', loop], { cwd: work, encoding: 'utf8' });
      if (mode === 'once') {
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(git(remote, ['show', 'main:data/results/source.json'])), { official: true });
        assert.deepEqual(JSON.parse(git(remote, ['show', 'main:data/stats/other.json'])), { concurrent: 1 });
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(work, 'data/stats/local.json'))), { unsavedLocal: true });
        assert.deepEqual(JSON.parse(git(remote, ['show', 'main:data/stats/local.json'])), { baseline: true }, 'unstaged local data is not published');
      } else {
        assert.notEqual(result.status, 0, 'persistent conflict must remain a failed checkpoint');
        assert.equal(Number(fs.readFileSync(marker)), mode === 'always' ? 3 : 1, 'same-file conflicts stop immediately; remote advancement is bounded');
        assert.deepEqual(JSON.parse(git(remote, ['show', 'main:data/results/source.json'])), mode === 'conflict' ? { concurrent: 1 } : { baseline: true });
      }
    }
  }
  console.log('source checkpoint push retry: both workflows preserve concurrent changes, stop on conflicts, retain unstaged data and cap attempts');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
