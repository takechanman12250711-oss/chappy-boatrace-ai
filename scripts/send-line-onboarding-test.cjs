'use strict';
const fs = require('node:fs');
const { check } = require('./check-line-connection.cjs');
const REPO = 'takechanman12250711-oss/chappy-boatrace-ai';
const CLAIM = 'line-onboarding-test/v1';
const RETRY_KEY = '2c939414-429d-4eaf-8c73-5a9635bbf064';
const TEXT = 'チャッピーのLINE接続テストです🚤\nこのメッセージが届いたら、ChatGPTで「届いた」と教えてください。\n的中報告の自動配信は準備中です。';
async function run({ env = process.env, fetchImpl = fetch } = {}) {
  if (env.GITHUB_REPOSITORY !== REPO || env.GITHUB_REF !== 'refs/heads/main' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) throw new Error('line_test_main_only');
  const userId = env.LINE_TEST_USER_ID;
  if (!/^U[a-f0-9]{32}$/.test(userId || '')) throw new Error('line_test_recipient_missing_or_invalid');
  if (!env.LINE_TEST_CLAIM_TOKEN) throw new Error('line_test_claim_token_missing');
  async function github(path, method = 'GET', body) {
    try {
      return await fetchImpl('https://api.github.com/repos/' + REPO + path, {
        method, redirect: 'error', headers: { Authorization: 'Bearer ' + env.LINE_TEST_CLAIM_TOKEN,
          Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)
      });
    } catch { throw new Error('line_test_claim_request_unknown'); }
  }
  const existing = await github('/git/ref/tags/' + CLAIM);
  if (existing.status === 200) return { status: 'previous_attempt_exists', messagesSentThisRun: 0, deliveryConfirmed: false };
  if (existing.status !== 404) throw new Error('line_test_claim_lookup_failed');
  const connection = await check({ token: env.LINE_CHANNEL_ACCESS_TOKEN, fetchImpl });
  if (connection.quotaType !== 'limited' || connection.quotaLimit > 200 || connection.quotaLimit < 1 ||
      connection.approximateUsage >= connection.quotaLimit) throw new Error('line_test_free_budget_unavailable');
  let profile;
  try {
    const response = await fetchImpl('https://api.line.me/v2/bot/profile/' + userId, {
      method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN }, signal: AbortSignal.timeout(15000)
    });
    if (response.status !== 200) throw new Error();
    profile = await response.json();
  } catch { throw new Error('line_test_recipient_profile_unavailable'); }
  if (profile.userId !== userId) throw new Error('line_test_recipient_mismatch');
  // Permanent atomic claim: unlike LINE's 24-hour retry key, this also stops
  // duplicate sends days later. Never remove it on failure or ambiguous response.
  const claim = await github('/git/refs', 'POST', { ref: 'refs/tags/' + CLAIM, sha: env.GITHUB_SHA });
  if (claim.status !== 201) throw new Error('line_test_claim_not_acquired');
  let response;
  try {
    response = await fetchImpl('https://api.line.me/v2/bot/message/push', {
      method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN,
        'Content-Type': 'application/json', 'X-Line-Retry-Key': RETRY_KEY },
      body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: TEXT }] }),
      signal: AbortSignal.timeout(35000)
    });
  } catch { throw new Error('line_test_send_result_unknown_do_not_resend'); }
  if (response.status !== 200 && response.status !== 409) throw new Error('line_test_send_http_' + response.status + '_claim_retained');
  const requestId = response.headers.get(response.status === 409 ? 'x-line-accepted-request-id' : 'x-line-request-id');
  if (!/^[a-f0-9-]{36}$/i.test(requestId || '')) throw new Error('line_test_accepted_receipt_missing_do_not_resend');
  return { status: response.status === 200 ? 'accepted' : 'already_accepted', requestId,
    messagesAccepted: 1, deliveryConfirmed: false, automaticDistributionEnabled: false };
}
if (require.main === module) run().then(result => {
  const text = JSON.stringify(result);
  console.log('LINE_ONBOARDING_TEST=' + text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '\nLINE owner-only onboarding test. API acceptance is not device delivery.\n\n```json\n' + text + '\n```\n');
}).catch(error => { console.error('LINE_ONBOARDING_FAILED=' + error.message); process.exitCode = 1; });
module.exports = { run, REPO, CLAIM, RETRY_KEY, TEXT };
