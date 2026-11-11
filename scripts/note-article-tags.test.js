'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { SERIES } = require('./note-article-series');
const { MAX_TAGS, loadTagConfig, articleClassification } = require('./note-article-tags');

test('every article kind and all 24 venues get a genre and valid, distinct tags', () => {
  const config = loadTagConfig();
  assert.deepEqual(Object.keys(config.series).sort(), Object.keys(SERIES).sort());
  assert.equal(Object.keys(config.venues).length, 24);
  const genres = new Set();
  for (const articleSeries of Object.keys(SERIES)) {
    for (let venue = 1; venue <= 24; venue++) {
      const result = articleClassification({ articleSeries, raceKey: `20261111-${String(venue).padStart(2, '0')}-8` });
      assert.ok(result.tags.length <= MAX_TAGS && new Set(result.tags).size === result.tags.length);
      assert.ok(result.tags.every(tag => !/[#＃\s]/.test(tag)));
      assert.ok(result.tags.includes(`ボートレース${config.venues[venue]}`));
      if (venue === 1) genres.add(result.genre);
    }
  }
  assert.equal(genres.size, 3, 'the three kinds stay separate genres');
});

test('the kind comes only from articleSeries and unknown input is refused', () => {
  const normal = articleClassification({ articleSeries: 'normal', raceKey: '20261111-19-8', title: '万舟 イン逃げ' });
  assert.equal(normal.genre, 'AI展開予想'); assert.equal(normal.venue, '下関');
  assert.equal(articleClassification({ raceKey: '20261111-24-1' }).series, 'normal');
  assert.equal(articleClassification({ articleSeries: 'escape', raceKey: '20261111-7-4' }).genre, '本命予想');
  assert.equal(articleClassification({ articleSeries: 'manshu', raceKey: '20261111-9-12' }).genre, '万舟予想');
  assert.throws(() => articleClassification({ articleSeries: 'other', raceKey: '20261111-1-1' }), /note_article_series_invalid/);
  assert.throws(() => articleClassification({ articleSeries: 'normal', raceKey: '20261111-25-1' }), /venue_unknown/);
  assert.throws(() => articleClassification({ articleSeries: 'normal', raceKey: 'x' }), /race_key_invalid/);
  const config = loadTagConfig();
  config.series.normal.tags = ['#だめ'];
  assert.throws(() => articleClassification({ articleSeries: 'normal', raceKey: '20261111-1-1' }, config), /note_article_tags_invalid/);
});
