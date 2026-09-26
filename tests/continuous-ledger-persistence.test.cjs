'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { OUTPUT, BUILDER, persist, command, buildLedger } = require('../scripts/persist-continuous-performance-ledger.cjs');
const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chappy-persist-test-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const remote = path.join(dir,'remote.git'), seed = path.join(dir,'seed'), root = path.join(dir,'worker');
  git(dir,'init','--bare','--initial-branch=main',remote); git(dir,'clone',remote,seed);
  git(seed,'config','user.name','test'); git(seed,'config','user.email','test@example.invalid');
  fs.mkdirSync(path.join(seed,'scripts')); fs.mkdirSync(path.join(seed,'data/stats'),{recursive:true});
  fs.writeFileSync(path.join(seed,'data/stats/.keep'),'');
  fs.writeFileSync(path.join(seed,'source.json'),JSON.stringify({value:1}));
  fs.writeFileSync(path.join(seed,'keep.txt'),'original\n');
  // Real child process and Git remote. This small deterministic builder is a
  // transport fixture, not a substitute for the unchanged production evaluator.
  fs.writeFileSync(path.join(seed,BUILDER), `const fs=require('fs');const n=JSON.parse(fs.readFileSync('source.json')).value;fs.writeFileSync('${OUTPUT}',JSON.stringify({schemaVersion:1,analysisId:'continuous-performance-ledger-v1',cumulative:{races:n},rows:Array.from({length:n},(_,i)=>({raceKey:String(i)}))}));`);
  git(seed,'add','.'); git(seed,'commit','-m','seed'); git(seed,'push','origin','main'); git(dir,'clone',remote,root);
  return {dir,remote,seed,root,head:()=>git(seed,'ls-remote','origin','refs/heads/main').split(/\s/)[0],
    remoteFile:p=>JSON.parse(execFileSync('git',['--git-dir',remote,'show','main:'+p],{encoding:'utf8'})),
    advance(n,overwriteLedger=false) {
      git(seed,'pull','--ff-only','origin','main');
      fs.writeFileSync(path.join(seed,'source.json'),JSON.stringify({value:n}));
      fs.writeFileSync(path.join(seed,'keep.txt'),`other writer ${n}\n`);
      if(overwriteLedger) fs.writeFileSync(path.join(seed,OUTPUT),JSON.stringify({schemaVersion:1,analysisId:'continuous-performance-ledger-v1',rows:[],cumulative:{races:0}}));
      git(seed,'add','.');git(seed,'commit','-m','concurrent source '+n);git(seed,'push','origin','main');
    }};
}
function cleanupVerified(f) { assert.equal(git(f.root,'worktree','list','--porcelain').split('\n').filter(l=>l.startsWith('worktree ')).length,1); }
test('publishes only the ledger without touching caller edits or index', t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'keep.txt'),'user work');git(f.root,'add','keep.txt');
  fs.writeFileSync(path.join(f.root,'untracked.txt'),'do not delete');const before=git(f.root,'status','--porcelain');
  const out=persist({root:f.root});assert.equal(out.status,'pushed');assert.equal(out.attempts,1);
  assert.equal(f.remoteFile(OUTPUT).cumulative.races,1);assert.equal(git(f.root,'status','--porcelain'),before);
  assert.equal(fs.readFileSync(path.join(f.root,'keep.txt'),'utf8'),'user work');
  assert.equal(git(f.root,'show','--format=','--name-only',out.publishedCommit),OUTPUT);cleanupVerified(f);
});
test('no-op creates no extra commit', t=>{
  const f=fixture(t);persist({root:f.root});const before=f.head();const out=persist({root:f.root});
  assert.equal(out.status,'unchanged');assert.equal(f.head(),before);cleanupVerified(f);
});
test('a real concurrent push rebuilds from newer inputs and preserves the other writer', t=>{
  const f=fixture(t);const out=persist({root:f.root,beforePush:({attempt})=>{if(attempt===1)f.advance(2);}});
  assert.equal(out.attempts,2);assert.equal(f.remoteFile(OUTPUT).cumulative.races,2);
  assert.equal(f.remoteFile('source.json').value,2);
  assert.equal(execFileSync('git',['--git-dir',f.remote,'show','main:keep.txt'],{encoding:'utf8'}),'other writer 2\n');cleanupVerified(f);
});
test('a concurrently changed ledger is rebuilt, never resolved by overwriting it with stale data', t=>{
  const f=fixture(t);const out=persist({root:f.root,beforePush:({attempt})=>{if(attempt===1)f.advance(3,true);}});
  assert.equal(out.attempts,2);assert.equal(f.remoteFile(OUTPUT).rows.length,3);cleanupVerified(f);
});
test('two consecutive races can recover within the bounded third attempt', t=>{
  const f=fixture(t);const out=persist({root:f.root,beforePush:({attempt})=>{if(attempt<3)f.advance(attempt+1);}});
  assert.equal(out.attempts,3);assert.equal(f.remoteFile(OUTPUT).rows.length,3);cleanupVerified(f);
});
test('persistent contention fails visibly and does not force-push', t=>{
  const f=fixture(t);let calls=0;assert.throws(()=>persist({root:f.root,beforePush:({attempt})=>{calls++;f.advance(attempt+1);}}),/contention-limit/);
  assert.equal(calls,3);assert.equal(f.remoteFile('source.json').value,4);
  assert.throws(()=>f.remoteFile(OUTPUT));cleanupVerified(f);
});
test('push refusal without remote advancement fails instead of retrying or force-pushing', t=>{
  const f=fixture(t);const before=f.head();fs.writeFileSync(path.join(f.remote,'hooks/pre-receive'),'#!/bin/sh\nexit 1\n',{mode:0o755});
  let calls=0;assert.throws(()=>persist({root:f.root,beforePush:()=>calls++}),/ledger-push-rejected/);
  assert.equal(calls,1);assert.equal(f.head(),before);cleanupVerified(f);
});
test('an accepted push with an ambiguous response is reconciled without duplicate publication', t=>{
  const f=fixture(t);let calls=0;const out=persist({root:f.root,push:cwd=>{calls++;git(cwd,'push','origin','HEAD:refs/heads/main');return {status:1,stderr:'connection lost after acceptance',stdout:''};}});
  assert.equal(out.status,'push-confirmed-after-fetch');assert.equal(calls,1);assert.equal(f.remoteFile(OUTPUT).rows.length,1);cleanupVerified(f);
});
for(const [name,builder,pattern] of [
  ['build error',()=>{throw Error('fixture builder failed');},/fixture builder failed/],
  ['unexpected input write',cwd=>{buildLedger(cwd);fs.writeFileSync(path.join(cwd,'source.json'),'{}');},/unexpected-generated-path/],
  ['invalid JSON',cwd=>{fs.writeFileSync(path.join(cwd,OUTPUT),'invalid');},/JSON|Unexpected/],
  ['missing output',()=>{},/invalid-ledger-output/],
  ['symlink output',cwd=>{fs.symlinkSync(path.join(cwd,'source.json'),path.join(cwd,OUTPUT));},/invalid-ledger-output/],
]) test(name+' cannot publish or delete caller data',t=>{
  const f=fixture(t),before=f.head();assert.throws(()=>persist({root:f.root,build:builder}),pattern);
  assert.equal(f.head(),before);assert.equal(fs.readFileSync(path.join(f.root,'keep.txt'),'utf8'),'original\n');cleanupVerified(f);
});
test('retry limit cannot be expanded beyond three',t=>{
  const f=fixture(t);for(const maxAttempts of [0,4,1.5,'3'])assert.throws(()=>persist({root:f.root,maxAttempts}),/invalid-attempt-limit/);
});
test('workflow isolates report generation from ledger publication failure',()=>{
  const text=fs.readFileSync(path.join(__dirname,'../.github/workflows/build-continuous-performance-ledger.yml'),'utf8');
  assert.match(text,/node scripts\/persist-continuous-performance-ledger\.cjs/);
  const step=text.split('      - name: Build separate eight-ticket promotion shadow report')[1].split('      - name: Preserve separate eight-ticket shadow report')[0];
  assert.match(step,/!cancelled\(\)/);assert.match(step,/steps\.checkout\.outcome == 'success'/);assert.match(step,/steps\.node\.outcome == 'success'/);
  assert.doesNotMatch(step,/steps\.persist\.outcome/);
  assert.match(text,/steps\.shadow_report\.outcome == 'success'/);
  assert.match(text,/if-no-files-found: error/);
});
