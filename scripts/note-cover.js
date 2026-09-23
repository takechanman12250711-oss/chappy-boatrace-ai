'use strict';

const fs = require('node:fs');
const path = require('node:path');
const COVER_PATH = path.join(__dirname, '..', 'assets', 'note', 'chappy-cover.jpg');

function loadCover(file = COVER_PATH) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 1000 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('note_cover_invalid');
  }
  return { name: 'chappy-cover.jpg', mimeType: 'image/jpeg', buffer };
}

// Selectors observed in the signed-in note editor on 2026-09-23.
async function attachCover(page, file) {
  await page.getByRole('button', { name: '画像を追加', exact: true }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    page.getByRole('button', { name: '画像をアップロード 推奨サイズ：1280×670px', exact: true }).click()
  ]);
  await chooser.setFiles(file);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('slider', { name: '画像のサイズの変更', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  const cover = page.getByRole('main').getByRole('img', { name: 'eyecatch', exact: true });
  await cover.waitFor({ state: 'visible', timeout: 60000 });
  await cover.evaluate(image => image.decode());
  if (!await cover.evaluate(image => image.complete && image.naturalWidth > 0)) {
    throw new Error('note_cover_verification_failed');
  }
  return { attached: true };
}

module.exports = { COVER_PATH, loadCover, attachCover };
