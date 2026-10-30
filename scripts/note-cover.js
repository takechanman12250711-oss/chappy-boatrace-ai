'use strict';

const fs = require('node:fs');
const path = require('node:path');
const COVER_PATH = path.join(__dirname, '..', 'assets', 'note', 'chappy-normal-cover.jpg');

// Artwork selection follows the saved article series, never its predicted winner.
function loadSeriesCover(series) {
  const { requireSeries } = require('./note-article-series');
  return loadCover(path.join(__dirname, '..', 'assets', 'note', `chappy-${requireSeries(series)}-cover.jpg`));
}

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
  try {
    await cover.waitFor({ state: 'visible', timeout: 60000 });
  } catch (error) {
    // Bounded diagnostic for the failure annotation: what the page showed
    // instead (dialog still open, image names). Never page text or tickets.
    const state = await coverDiagnostic(page).catch(() => 'unreadable');
    throw new Error(`note_cover_not_visible:${state}`);
  }
  await cover.evaluate(image => image.decode());
  if (!await cover.evaluate(image => image.complete && image.naturalWidth > 0)) {
    throw new Error('note_cover_verification_failed');
  }
  return { attached: true };
}

// A cover is decoration, not part of the verified article. When the editor
// does not show it (2026-10-30 鳴門1R stopped here), close the crop dialog and
// continue without a cover instead of losing the article. This runs before
// any publish click, so it can never cause a second publication. If the
// dialog will not close, stop as before.
async function attachCoverOrSkip(page, file, log = console.log) {
  try {
    return await attachCover(page, file);
  } catch (error) {
    if (!/^note_cover_(not_visible|verification_failed)/.test(String(error.message))) throw error;
    const dialog = page.getByRole('dialog');
    for (let i = 0; i < 2 && await dialog.count() > 0; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
    if (await dialog.count() > 0) throw error;
    log(`NOTE_UI_COVER_SKIPPED=${error.message.slice(0, 120)}`);
    return { attached: false, skipped: error.message };
  }
}

async function coverDiagnostic(page) {
  const dialogs = await page.getByRole('dialog').count();
  const names = await page.getByRole('main').getByRole('img').evaluateAll(images => images
    .map(image => image.getAttribute('alt') || image.getAttribute('aria-label') || '-'));
  const clean = value => String(value).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || 'x';
  return `dialogs=${dialogs},imgs=${names.length},names=${names.slice(0, 6).map(clean).join('.')}`;
}

function loadCoverTemplate(payload, rootDir = process.cwd(), now = Date.now()) {
  const { sourceArticle, verifyPublicationSource } = require('./note-publication-source');
  let article;
  if (payload?.version === 'note-publication-handoff-v1') {
    verifyPublicationSource(payload, rootDir, now);
    const source = sourceArticle(payload.sourcePath, rootDir, now);
    const record = source.bundle.record;
    const info = { articleSeries: source.articleSeries, date: record.date, place: record.place,
      raceNo: Number(record.raceNo), deadline: new Date(Date.parse(record.deadlineAt)+9*3600000).toISOString().slice(11,16) };
    const font = fs.readFileSync(path.join(__dirname, '..', 'assets', 'note', 'ZenMaruGothic-Cover.ttf'));
    if (font.length < 1000 || font.readUInt32BE(0) !== 0x00010000) throw new Error('note_cover_font_invalid');
    const background = loadSeriesCover(source.articleSeries).buffer;
    return { layout: 'series-v1', info, html: require('./note-cover-template').raceCoverHtml(info, background, font) };
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

module.exports = { COVER_PATH, loadCover, loadSeriesCover, loadCoverTemplate, attachCover, attachCoverOrSkip };
