'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { SOCIAL_NOTICE, withNoticeIfFits } = require('./note-social-notice');
const { announcementCopy, weight } = require('./note-marketing-social');
const marketing = require('../config/note-marketing.json');

const now = Date.parse('2026-09-29T21:00:00+09:00');
const row = { raceKey: '20260929-13-4', publicationKey: '20260929-13-4:normal', articleSeries: 'normal', place: '尼崎', raceNo: 4,
  deadlineAt: '2026-09-29T22:00:00+09:00', publishedAt: '2026-09-29T20:40:00+09:00', sourceSha256: 'a'.repeat(64),
  url: 'https://note.com/great_robin3243/n/nabcdef', price: 200 };

test('notice says reference only, 20 or older and own responsibility, with no hype', () => {
  for (const phrase of ['参考情報', '20歳以上', '自己責任']) assert(SOCIAL_NOTICE.includes(phrase));
  assert(!/必勝|絶対|確実|儲か|保証/.test(SOCIAL_NOTICE));
});

test('every announcement ends with the notice and stays within X length', () => {
  const one = announcementCopy([row], marketing.index.url, now);
  assert(one.endsWith('\n\n' + SOCIAL_NOTICE)); assert(weight(one) <= 280);
  // A large batch shrinks race lines through the existing fallback, never the notice.
  const many = Array.from({ length: 30 }, (_, i) => ({ ...row, raceNo: i % 12 + 1, publicationKey: row.publicationKey + i }));
  const text = announcementCopy(many, marketing.index.url, now);
  assert(text.endsWith('\n\n' + SOCIAL_NOTICE)); assert(weight(text) <= 280);
});

test('hit reports and recaps add the notice only when every existing fact still fits', () => {
  const short = 'short post';
  assert.equal(withNoticeIfFits(short, weight), `${short}\n${SOCIAL_NOTICE}`);
  const full = 'x'.repeat(280 - weight(SOCIAL_NOTICE));
  assert.equal(withNoticeIfFits(full, weight), full);
  assert(weight(withNoticeIfFits('y'.repeat(200), weight)) <= 280);
});
