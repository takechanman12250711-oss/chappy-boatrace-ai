'use strict';
const fs = require('node:fs');
const EXPECTED_BASIC_ID = '@009mdbvr';
async function check({ token = process.env.LINE_CHANNEL_ACCESS_TOKEN, fetchImpl = fetch } = {}) {
  if (!token || token.trim() !== token || /\s/.test(token)) throw new Error('line_token_missing_or_invalid');
  async function get(path) {
    let response;
    try {
      response = await fetchImpl('https://api.line.me/v2/bot/' + path, {
        method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(15000)
      });
    } catch { throw new Error('line_connection_failed'); }
    if (response.status !== 200) throw new Error('line_http_' + response.status);
    try { return await response.json(); } catch { throw new Error('line_response_invalid'); }
  }
  const bot = await get('info');
  if (bot.basicId !== EXPECTED_BASIC_ID) throw new Error('line_account_mismatch');
  const quota = await get('message/quota');
  const consumption = await get('message/quota/consumption');
  if (!['limited', 'none'].includes(quota.type) ||
      (quota.type === 'limited' && (!Number.isSafeInteger(quota.value) || quota.value < 0)) ||
      !Number.isSafeInteger(consumption.totalUsage) || consumption.totalUsage < 0) throw new Error('line_quota_invalid');
  // Only allowlisted public identity and numeric quota fields leave the process.
  // Quota includes additional paid messages: this is NOT proof of a free plan.
  return { status: 'connected', basicId: EXPECTED_BASIC_ID, quotaType: quota.type,
    quotaLimit: quota.type === 'limited' ? quota.value : null,
    approximateUsage: consumption.totalUsage, messagesSent: 0, deliveryEnabled: false };
}
if (require.main === module) check().then(result => {
  const text = JSON.stringify(result);
  console.log('LINE_CONNECTION=' + text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '\nLINE connection verified (no messages sent).\n\n```json\n' + text + '\n```\n');
}).catch(error => { console.error('LINE_CONNECTION_FAILED=' + error.message); process.exitCode = 1; });
module.exports = { check, EXPECTED_BASIC_ID };
