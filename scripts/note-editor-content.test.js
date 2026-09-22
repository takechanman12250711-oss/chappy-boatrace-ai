'use strict';
const assert = require('node:assert/strict');
const { compareEditorContent, readEditorContent, verifyEditorContent } = require('./note-editor-content');
const { fillDraft } = require('./note-browserbase-draft-save');

// Observed in the failed 2026-09-22 Suminoe draft: two source newlines become
// five rendered newlines around an empty paragraph. All non-empty lines match.
const body = '🚤 本文照合テスト\n\n' + '元原稿の説明。'.repeat(12) + '\n\n🔵 本命予想\n・1-2-3　18.1倍\n・1-4-3　28.8倍';
const rendered = body.replace(/\n\n/g, '\n\n\n\n\n');
assert.equal(rendered.includes(body.slice(0, 80)), false);
assert.equal(compareEditorContent(rendered, body).equal, true);
assert.equal(compareEditorContent(body.replace(/\n/g, '\r\n'), body).equal, true);
assert.equal(compareEditorContent('A\u00a0B', 'A B').equal, true);
for (const changed of [body.slice(0, 80), body + '\n余計な本文', body.replace('1-2-3', '1-3-2'),
  body.replace('18.1', '181'), body.replace('🔵 本命予想\n', ''),
  body.replace('・1-2-3　18.1倍\n・1-4-3　28.8倍', '・1-4-3　28.8倍\n・1-2-3　18.1倍'),
  body.replace('　18.1', '18.1'), body.replace('🔵 本命予想\n', '🔵 本命予想'), '']) {
  assert.equal(compareEditorContent(changed, body).equal, false);
}
assert.equal(compareEditorContent('', '').equal, false);

async function main() {
  for (const tagName of ['TEXTAREA', 'INPUT', 'DIV']) {
    const el = { tagName, value: body, innerText: tagName === 'DIV' ? rendered : '', getAttribute: () => tagName === 'DIV' ? 'true' : null };
    const locator = { evaluate: async fn => fn(el) };
    assert.equal(await readEditorContent(locator), tagName === 'DIV' ? rendered : body);
    assert.equal((await verifyEditorContent(locator, body)).equal, true);
  }
  await assert.rejects(readEditorContent({ evaluate: async fn => fn({ tagName: 'SPAN', getAttribute: () => null }) }), /not_editable/);
  // Exercise the actual fillDraft caller, including post-autosave reads.
  for (const corrupted of [false, true]) {
    let titleValue = '', bodyValue = '';
    const title = { isVisible: async () => true, fill: async v => { titleValue = v; }, inputValue: async () => titleValue };
    const editor = { isVisible: async () => true, fill: async v => { bodyValue = v; }, evaluate: async fn => fn({
      tagName: 'DIV', getAttribute: () => 'true',
      innerText: corrupted ? bodyValue.slice(0, 85) : bodyValue.replace(/\n\n/g, '\n\n\n\n\n')
    }) };
    const page = { locator: selector => ({ count: async () => 1, nth: () => selector.includes('タイトル') ? title : editor }),
      waitForTimeout: async () => {}, url: () => 'https://editor.note.com/notes/test/edit/' };
    if (corrupted) await assert.rejects(fillDraft(page, { title: '検証', body }), /note_body_verification_failed/);
    else assert.equal((await fillDraft(page, { title: '検証', body })).ok, true);
  }
  console.log('note editor content: full text, observed paragraph conversion, textarea and corruption guards passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
