'use strict';
const assert = require('node:assert/strict');
const { loadCover, attachCover } = require('./note-cover');

async function main() {
  const file = loadCover();
  assert.equal(file.mimeType, 'image/jpeg');
  assert.ok(file.buffer.length > 1000);
  assert.throws(() => loadCover(__filename), /note_cover_invalid/);
  assert.throws(() => loadCover(__filename + '.missing'), /ENOENT/);
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
  console.log('note cover attachment and failure tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
