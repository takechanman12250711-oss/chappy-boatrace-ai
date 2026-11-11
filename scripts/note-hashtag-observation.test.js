'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { boundedReport, observeHashtagField, inspectHashtagField } = require('./note-hashtag-observation');

test('the observation only reads the page and logs a bounded report', async () => {
  const calls = [], logs = [];
  const page = new Proxy({}, { get: (unused, name) => {
    if (name === 'evaluate') return async fn => { calls.push(fn); return { fields: 1, labels: 2, tag: 'INPUT', type: 'text',
      role: null, inForm: true, formSubmitButtons: 1, existingTags: 0, extra: '1-2-3 secret' }; };
    throw Error(`forbidden page access: ${String(name)}`);
  } });
  assert.equal(await observeHashtagField(page, line => logs.push(line)), true);
  assert.deepEqual(calls, [inspectHashtagField]);
  assert.deepEqual(JSON.parse(logs[0].replace('NOTE_UI_HASHTAG_FIELD=', '')),
    { fields: 1, labels: 2, tag: 'INPUT', type: 'text', role: null, inForm: true, formSubmitButtons: 1, existingTags: 0 });
  assert.doesNotMatch(inspectHashtagField.toString(), /\.(click|focus|fill|type|press|submit|value\s*=)\b/);
});

test('page text never reaches the log and failures never throw', async () => {
  assert.deepEqual(boundedReport({ fields: -1, tag: '<b>投稿する</b>', type: 'x'.repeat(50), inForm: 'yes' }),
    { fields: null, labels: null, tag: 'bb', type: 'x'.repeat(20), role: null, inForm: false, formSubmitButtons: null, existingTags: null });
  const logs = [];
  assert.equal(await observeHashtagField({ evaluate: async () => { throw Error('closed'); } }, line => logs.push(line)), false);
  assert.equal(await observeHashtagField({}, line => logs.push(line)), false);
  assert.equal(await observeHashtagField({ evaluate: () => new Promise(() => {}) }, line => logs.push(line), 20), false);
  assert.deepEqual(logs, Array(3).fill('NOTE_UI_HASHTAG_FIELD=unavailable'));
});
