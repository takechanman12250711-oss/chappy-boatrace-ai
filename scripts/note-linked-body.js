'use strict';
const { urlsIn, bodyHtml } = require('./note-marketing-content');
const { verifyEditorContent, readEditorContent, contentLines } = require('./note-editor-content');
const isEmpty = async input => contentLines(await readEditorContent(input)).length === 0;
// A long ProseMirror body is not always emptied by fill(''); pasting then
// appends the new body after the old one (seen 2026-11-17: 294 lines for 157).
// Clear with the editor's own select-all + delete and refuse to paste unless
// the editor is really empty. Nothing is pasted, saved or published on refusal.
async function clearBody(input) {
  await input.fill('');
  if (await isEmpty(input)) return;
  await input.click();
  await input.press('ControlOrMeta+A');
  await input.press('Delete');
  if (!await isEmpty(input)) throw new Error('note_body_clear_failed');
}
async function fillLinkedBody(page, input, body) {
  const urls = urlsIn(body);
  if (!urls.length) { await input.fill(body); return; }
  // Use the editor's normal HTML paste handler so URLs remain clickable.
  // No note private API or direct document mutation is used.
  await page.bringToFront();
  await clearBody(input);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  await page.evaluate(async ({html, text}) => navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([text], { type: 'text/plain' })
  })]), { html: bodyHtml(body), text: body });
  await input.click();
  await input.press('ControlOrMeta+V');
  await page.waitForTimeout(250);
  await verifyEditorContent(input, body);
  const actual = await input.locator('a[href]').evaluateAll(links => links.map(a=>a.href));
  if (urls.some(url => !actual.includes(url))) throw new Error('note_navigation_links_missing');
}
module.exports = { fillLinkedBody, clearBody };
