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

function loadCoverTemplate(payload, rootDir = process.cwd(), now = Date.now()) {
  const { sourceArticle, verifyPublicationSource } = require('./note-publication-source');
  let article;
  if (payload?.version === 'note-publication-handoff-v1') {
    verifyPublicationSource(payload, rootDir, now);
    article = sourceArticle(payload.sourcePath, rootDir, now).article;
  } else {
    // Legacy manual drafts have no immutable source path. Only use a summary
    // literally present in that draft; publication still requires the source.
    article = { paidText: payload?.paidText,
      rangeSummary: `${payload?.freeText || ''}\n${payload?.paidText || ''}`.split('\n')
        .find(line => /^最有力展開は/.test(line)) || '' };
  }
  const { coverLines, coverHtml } = require('./note-cover-template');
  const lines = coverLines(article);
  const font = fs.readFileSync(path.join(__dirname, '..', 'assets', 'note', 'Yomogi-Cover.ttf'));
  if (font.length < 1000 || font.readUInt32BE(0) !== 0x00010000) throw new Error('note_cover_font_invalid');
  return { lines, html: coverHtml(lines, loadCover().buffer, font) };
}

module.exports = { COVER_PATH, loadCover, loadCoverTemplate, attachCover };
