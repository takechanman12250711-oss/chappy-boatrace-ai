'use strict';

const assert = require('node:assert/strict');
const { getCredentials } = require('./note-browserbase-x-login');

assert.deepEqual(getCredentials({}), {
  configured: false,
  loginId: '',
  password: ''
});

assert.deepEqual(getCredentials({ X_LOGIN_ID: 'user@example.com', X_PASSWORD: 'secret' }), {
  configured: true,
  loginId: 'user@example.com',
  password: 'secret'
});

console.log('note-browserbase-x-login tests passed');
