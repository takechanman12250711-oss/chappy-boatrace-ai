'use strict';

const assert = require('node:assert/strict');
const { validateDraftGate } = require('./note-github-ui-transport');

assert.deepEqual(validateDraftGate({ canPublish: true, title: 't', body: 'b' }), { ok: true });
assert.deepEqual(validateDraftGate({ canPublish: false, blockReason: 'deadline_passed', title: 't', body: 'b' }), { ok: false, reason: 'deadline_passed' });
assert.deepEqual(validateDraftGate({ canPublish: true, title: '', body: 'b' }), { ok: false, reason: 'title_missing' });
assert.deepEqual(validateDraftGate({ canPublish: true, title: 't', body: '' }), { ok: false, reason: 'body_missing' });

console.log('note-github-ui-transport tests passed');
