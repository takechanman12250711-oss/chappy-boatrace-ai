'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseOfficialStartRank, validateSharedProfile, attachOfficialStartRanks } = require('../api/_official-start-rank');
const { VERSION, mergeProfiles, createRecorder, save } = require('./official-start-rank-cache.cjs');
const date = '20301006', clock = Date.parse('2030-10-06T01:00:00.000Z');
const env = { GITHUB_REPOSITORY: 'takechanman12250711-oss/chappy-boatrace-ai', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'schedule' };
function profile(id = '5301', fetchedAt = new Date(clock - 60000).toISOString()) {
  return parseOfficialStartRank(`<dt>登録番号</dt><dd>${id}</dd><table><tr><th>コース別スタート順</th></tr>${[1,2,3,4,5,6].map(i => `<tr><th>${i}</th><td>${i === 6 ? '-' : '3.00'}</td></tr>`).join('')}</table>`, { registerNo: id, fetchedAt });
}
const document = profiles => ({ version: VERSION, date, profiles });
test('shared profile validates identity, origin, freshness and missing values without mutating source', () => {
  const original = profile();
  const options = { registerNo: '5301', date, now: clock };
  const copy = validateSharedProfile(original, options);
  assert.deepEqual(copy, original);
  copy.byCourse[1] = 1;
  assert.equal(original.byCourse[1], 3);
  assert.equal(original.byCourse[6], null);
  for (const mutate of [
    p => p.registerNo = '5302', p => p.source = 'guess', p => p.sourceUrl += '&other=1',
    p => p.sourceSha256 = '', p => p.referenceOnly = false, p => p.population = 'general',
    p => p.fetchedAt = new Date(clock + 1).toISOString(),
    p => p.fetchedAt = new Date(clock - 6 * 3600000 - 1).toISOString(),
    p => p.fetchedAt = 'invalid', p => p.byCourse[2] = '3.00', p => p.byCourse[2] = 0.15,
    p => delete p.byCourse[2], p => p.byCourse[7] = 3, p => p.period = 'guessed'
  ]) {
    const bad = structuredClone(original); mutate(bad);
    assert.equal(validateSharedProfile(bad, options), null);
  }
  const midnight = Date.parse('2030-10-05T15:01:00Z');
  assert.equal(validateSharedProfile(profile('5301', '2030-10-05T14:59:00.000Z'), { ...options, now: midnight }), null);
  assert.equal(validateSharedProfile(original, { ...options, date: '20301005' }), null);
});
test('merge keeps newest original fetchedAt, drops stale records and foreign days', () => {
  const latest = profile(), older = profile('5301', new Date(clock - 120000).toISOString());
  const stale = profile('5302', new Date(clock - 7 * 3600000).toISOString());
  const source = document({5301: latest, 5302: stale});
  const before = JSON.stringify(source);
  const merged = mergeProfiles([source, document({5301: older}), {...document({5303: profile('5303')}), date: '20301005'}], date, clock);
  assert.deepEqual(merged.profiles, {5301: latest});
  assert.equal(JSON.stringify(source), before);
});
test('capture copies only validated official profiles, and never refreshes source timestamps', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rank-stage-')); t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const file = path.join(root, 'stage.json');
  assert.throws(() => createRecorder(file, { env: {...env,GITHUB_EVENT_NAME:'pull_request'} }), /context/);
  const record = createRecorder(file, {env, now:()=>clock});
  const data = {source:'boatrace-official',date,entries:[{registerNo:'5301',officialStartRank:profile(),tickets:['1-2-3']}]};
  const original = JSON.stringify(data);
  record({...data,date:'20301005'}); assert.equal(fs.existsSync(file),false);
  record(data);
  const result = JSON.parse(fs.readFileSync(file));
  assert.deepEqual(result, document({5301: profile()}));
  assert.equal(JSON.stringify(data), original);
  assert.throws(() => createRecorder(file,{env}), /not_empty/);
});
test('sharing uses existing serial writer, exact derived path, bounded non-force retry and no-op', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rank-save-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const stage = path.join(root,'stage.json'), relative = `data/official-start-rank-cache/${date}.json`;
  fs.writeFileSync(stage,JSON.stringify(document({5301:profile()})));
  const calls = []; let pushes = 0;
  const git = args => {
    calls.push(args);
    if (args[0] === 'ls-files') return relative;
    if (args[0] === 'push' && ++pushes === 1) throw Error('non-fast-forward');
    return '';
  };
  assert.equal(save(stage,{root,env,now:()=>clock,git}).saved,1);
  assert.equal(pushes,2);
  assert(calls.every(args=>!args.includes('--force') && !args.includes('reset')));
  assert(calls.some(args=>args.includes('commit') && args.at(-1) === relative));
  calls.length=0;
  assert.equal(save(stage,{root,env,now:()=>clock,git}).saved,0);
  assert(!calls.some(args=>args.includes('commit') || args[0] === 'push'));
  assert.throws(()=>save(stage,{root,env,now:()=>clock,git:()=> ' M data/predictions.json'}), /unrelated/);
});
test('six fresh shared profiles bypass official fetch; current exhibition gate and nulls stay intact', async () => {
  const entries=Array.from({length:6},(_,i)=>({registerNo:String(5401+i),exhibition:{displayTime:6.7}}));
  const input={entries,startExhibition:entries.map((_,i)=>({boat:i+1,course:i+1,isOfficialCourse:true}))};
  const sharedProfiles=Object.fromEntries(entries.map(e=>[e.registerNo,profile(e.registerNo)]));
  const before=JSON.stringify(input), cacheBefore=JSON.stringify(sharedProfiles);
  let calls=0; const fetcher=async()=>{calls++;throw Error('unreachable');};
  const result=await attachOfficialStartRanks(input,{date,now:clock,sharedProfiles,fetcher});
  assert.equal(result.officialStartRankCollection.sharedAvailable,6);
  assert.equal(calls,0);
  assert.equal(result.entries[0].officialStartRank.fetchedAt,sharedProfiles['5401'].fetchedAt);
  result.entries[0].officialStartRank.byCourse[6]=3;
  assert.equal(JSON.stringify(input),before);assert.equal(JSON.stringify(sharedProfiles),cacheBefore);
  const pending=await attachOfficialStartRanks({...input,startExhibition:[]},{date,now:clock,sharedProfiles,fetcher});
  assert.equal(pending.officialStartRankCollection.status,'awaiting-official-exhibition');
  delete sharedProfiles['5406'];
  const partial=await attachOfficialStartRanks(input,{date,now:clock,sharedProfiles,fetcher});
  assert.equal(partial.officialStartRankCollection.sharedAvailable,5);
  assert.equal(partial.officialStartRankCollection.available,5);assert.equal(calls,1);
});
