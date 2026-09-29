'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run, REPO, TEXT, RETRY_KEY } = require('./send-line-onboarding-test.cjs');
const env = { GITHUB_REPOSITORY: REPO, GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40),
  LINE_TEST_USER_ID: 'U' + 'b'.repeat(32), LINE_CHANNEL_ACCESS_TOKEN: 'private-token', LINE_TEST_CLAIM_TOKEN: 'private-gh-token' };
function server(options = {}) {
  let claimed = !!options.claimed;
  const requests = [];
  return { requests, fetchImpl: async (url, init) => {
    requests.push({url, ...init});
    assert.equal(init.redirect, 'error');
    const reply = (status, data = {}) => ({status, json: async () => data, headers: {get: () => '123e4567-e89b-12d3-a456-426614174000'}});
    if (url.includes('/git/ref/tags/')) return reply(claimed ? 200 : 404);
    if (url.endsWith('/bot/info')) return reply(200, {basicId: options.wrongBot ? '@wrong' : '@009mdbvr'});
    if (url.endsWith('/message/quota')) return reply(200, {type:'limited',value:200});
    if (url.endsWith('/quota/consumption')) return reply(200, {totalUsage:options.full ? 200 : 0});
    if (url.includes('/profile/')) return reply(options.noProfile ? 404 : 200, {userId: options.wrongUser ? 'U'+'c'.repeat(32) : env.LINE_TEST_USER_ID, displayName:'private-name'});
    if (url.endsWith('/git/refs')) { if (options.claimUnknown) throw new Error('private-token'); claimed=true; return reply(options.claimConflict ? 422 : 201); }
    assert.ok(url.endsWith('/message/push'));
    assert.equal(claimed, true);
    if (options.sendUnknown) throw new Error('private-token');
    return reply(options.sendStatus || 200);
  }};
}
test('one owner-only fixed message, claim before send, no repeated send', async () => {
  const s=server(); const result=await run({env,fetchImpl:s.fetchImpl});
  assert.equal(result.status,'accepted'); assert.equal(result.deliveryConfirmed,false);
  const sent=s.requests.filter(r=>r.url.endsWith('/message/push'));
  assert.equal(sent.length,1); assert.deepEqual(JSON.parse(sent[0].body),{to:env.LINE_TEST_USER_ID,messages:[{type:'text',text:TEXT}]});
  assert.equal(sent[0].headers['X-Line-Retry-Key'],RETRY_KEY);
  assert.doesNotMatch(JSON.stringify(result),/private|bbbb/);
  assert.equal((await run({env,fetchImpl:s.fetchImpl})).status,'previous_attempt_exists');
  assert.equal(s.requests.filter(r=>r.url.endsWith('/message/push')).length,1);
});
test('invalid context or recipient cannot make requests',async()=>{
  for(const overrides of [{GITHUB_REF:'refs/heads/test'},{LINE_TEST_USER_ID:'C'+'b'.repeat(32)},{LINE_TEST_USER_ID:''},{LINE_TEST_CLAIM_TOKEN:''}])
    await assert.rejects(run({env:{...env,...overrides},fetchImpl:()=>assert.fail('called')}));
});
test('account, budget, and recipient failures occur before claim or sending',async()=>{
  for(const options of [{wrongBot:true},{full:true},{noProfile:true},{wrongUser:true}]){
    const s=server(options); await assert.rejects(run({env,fetchImpl:s.fetchImpl}));
    assert.equal(s.requests.filter(r=>r.method==='POST').length,0);
  }
});
test('claim race or unknown claim result never sends',async()=>{
  for(const options of [{claimConflict:true},{claimUnknown:true}]){
    const s=server(options);await assert.rejects(run({env,fetchImpl:s.fetchImpl}));
    assert.equal(s.requests.filter(r=>r.url.endsWith('/message/push')).length,0);
  }
});
test('unknown send result is not retried and leaves permanent claim',async()=>{
  const s=server({sendUnknown:true});await assert.rejects(run({env,fetchImpl:s.fetchImpl}),/send_result_unknown/);
  assert.equal((await run({env,fetchImpl:s.fetchImpl})).status,'previous_attempt_exists');
  assert.equal(s.requests.filter(r=>r.url.endsWith('/message/push')).length,1);
});
test('HTTP error keeps claim, accepted retry response is not delivery proof',async()=>{
  const s=server({sendStatus:429});await assert.rejects(run({env,fetchImpl:s.fetchImpl}),/http_429/);
  assert.equal((await run({env,fetchImpl:s.fetchImpl})).status,'previous_attempt_exists');
  const t=server({sendStatus:409});assert.equal((await run({env,fetchImpl:t.fetchImpl})).status,'already_accepted');
});
