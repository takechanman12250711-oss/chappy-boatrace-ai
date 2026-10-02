'use strict';
const { urlsIn, bodyHtml } = require('./note-marketing-content');
const { verifyEditorContent } = require('./note-editor-content');
async function fillLinkedBody(page, input, body) {
  const urls = urlsIn(body);
  if (!urls.length) { await input.fill(body); return; }
  // Use the editor's normal HTML paste handler so URLs remain clickable.
  // No note private API or direct document mutation is used.
  await page.bringToFront();
  await input.fill('');
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
module.exports = { fillLinkedBody };
