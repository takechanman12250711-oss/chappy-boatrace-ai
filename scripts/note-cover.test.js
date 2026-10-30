'use strict';
const assert = require('node:assert/strict');
const { loadCover, loadSeriesCover, attachCover } = require('./note-cover');

async function main() {
  const file = loadCover();
  assert.equal(file.mimeType, 'image/jpeg');
  assert.ok(file.buffer.length > 1000);
  assert.throws(() => loadCover(__filename), /note_cover_invalid/);
  assert.throws(() => loadCover(__filename + '.missing'), /ENOENT/);
  const seriesCovers = ['normal', 'escape', 'manshu'].map(kind => loadSeriesCover(kind).buffer);
  assert.ok(seriesCovers[0].equals(file.buffer));
  assert.equal(new Set(seriesCovers.map(b => require('node:crypto').createHash('sha256').update(b).digest('hex'))).size, 3);
  assert.throws(() => loadSeriesCover('../escape'), /note_article_series_invalid/);
  const events = [];
  let loaded = true;
  const cover = {
    waitFor: async () => { events.push('image'); },
    evaluate: async fn => fn({ decode: async () => {}, complete: loaded, naturalWidth: loaded ? 1734 : 0 })
  };
  const page = {
    waitForEvent: async () => ({ setFiles: async value => { assert.equal(value, file); events.push('upload'); } }),
    getByRole: (role, options) => ({
      click: async () => { events.push(options.name); },
      getByRole: (child, childOptions) => child === 'img' ? cover : {
        waitFor: async () => {}, click: async () => { events.push(childOptions.name); }
      }
    })
  };
  assert.deepEqual(await attachCover(page, file), { attached: true });
  assert.ok(events.indexOf('upload') < events.indexOf('保存'));
  assert.ok(events.indexOf('保存') < events.indexOf('image'));
  loaded = false;
  await assert.rejects(attachCover(page, file), /note_cover_verification_failed/);
  const failedUpload = { ...page, waitForEvent: async () => ({ setFiles: async () => { throw new Error('upload_failed'); } }) };
  events.length = 0;
  await assert.rejects(attachCover(failedUpload, file), /upload_failed/);
  assert.ok(!events.includes('保存'), 'upload failure stops before saving the cover');
  // A cover that never appears reports a bounded diagnostic of what the page shows.
  const hidden = { ...page, getByRole: (role, options) => role === 'dialog' ? { count: async () => 1,
      getByRole: (child, o) => ({ waitFor: async () => {}, click: async () => {} }) }
    : role === 'main' ? { getByRole: (child, o) => o ? { waitFor: async () => { throw new Error('Timeout 60000ms'); } }
      : { evaluateAll: async fn => fn([{ getAttribute: k => k === 'alt' ? 'ヘッダー画像' : null }, { getAttribute: k => k === 'alt' ? 'eye catch!' : null }]) } }
    : { click: async () => {} } };
  await assert.rejects(attachCover(hidden, file), /^Error: note_cover_not_visible:dialogs=1,imgs=2,names=x\.eyecatch$/);
  console.log('note cover attachment and failure tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
