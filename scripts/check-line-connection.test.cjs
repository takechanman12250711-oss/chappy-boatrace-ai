'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('./check-line-connection.cjs');
test('checks fixed bot and quota with GET only; does not expose credentials or personal IDs', async () => {
  const paths = [];
  const result = await check({ token: 'test-private-token', fetchImpl: async (url, options) => {
    paths.push(url);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer test-private-token');
    return { status: 200, json: async () => paths.length === 1 ? { basicId: '@009mdbvr', userId: 'private-user', displayName: 'not-logged' } : paths.length === 2 ? { type: 'limited', value: 200 } : { totalUsage: 1 } };
  }});
  assert.equal(paths.length, 3);
  assert.equal(result.messagesSent, 0);
  assert.equal(result.deliveryEnabled, false);
  assert.doesNotMatch(JSON.stringify(result), /test-private-token|private-user|not-logged/);
});
test('wrong account stops before quota and cannot send', async () => {
  let calls = 0;
  await assert.rejects(check({ token: 'test', fetchImpl: async () => { calls++; return {status: 200, json: async () => ({basicId: '@wrong'})}; } }), /line_account_mismatch/);
  assert.equal(calls, 1);
});
test('missing or whitespace token makes no API request', async () => {
  for (const token of ['', ' token', 'a\nb']) await assert.rejects(check({token, fetchImpl: () => assert.fail('called')}), /line_token_missing_or_invalid/);
});
test('authentication and network failures do not print provider body or secret', async () => {
  await assert.rejects(check({token:'private',fetchImpl:async()=>({status:401,json:()=>assert.fail('read body')})}), /^Error: line_http_401$/);
  await assert.rejects(check({token:'private',fetchImpl:async()=>{throw new Error('private');}}), /^Error: line_connection_failed$/);
});
test('malformed quota stops', async () => {
  let calls = 0;
  await assert.rejects(check({token:'test', fetchImpl:async()=>({status:200,json:async()=>++calls===1?{basicId:'@009mdbvr'}:{}})}), /line_quota_invalid/);
});
