'use strict';
const assert = require('node:assert/strict');
const { coverLines, coverHtml, renderCover } = require('./note-cover-template');

async function main() {
  const a = { rangeSummary: '最有力展開は2コース差し。2号艇を1着軸に、2着残しは1・4・3号艇、3着拾いは3・4・5・6号艇を評価する。' };
  const saved = JSON.stringify(a);
  assert.deepEqual(coverLines(a), ['2コース差しが軸。', '残しは1・4・3号艇。']);
  assert.equal(JSON.stringify(a), saved);
  assert.deepEqual(coverLines({ rangeSummary: '最有力展開はイン逃げ。' }), ['イン逃げが軸。', '残し・拾いに注目。']);
  assert.equal(coverLines({ rangeSummary: '最有力展開は4コースまくり差し。' })[0], '4コースまくり差しが軸。');
  assert.deepEqual(coverLines({ rangeSummary: '未確認の展開', allRangeGroups: [{key:'main',reason:'本命は1号艇。'}] }), ['本命は1号艇。', '残し・拾いに注目。']);
  assert.deepEqual(coverLines({}), ['展開を読む。', '残し・拾いに注目。']);
  assert.deepEqual(coverLines({...a,paidText:'【購入見送り】\n壁成立'}), ['購入見送り。', '参考予想を掲載。']);
  const {loadCoverTemplate} = require('./note-cover');
  assert.deepEqual(loadCoverTemplate({version:'note-iphone-handoff-v3',freeText:a.rangeSummary}).lines, coverLines(a));
  const html=coverHtml(coverLines(a),Buffer.from('image'),Buffer.from('font'));
  assert.ok(html.includes('2コース差しが軸。'));
  assert.ok(!/(?:src=["']|url\()https?:/.test(html));
  assert.ok(!coverHtml(['<script>','&'],Buffer.from('image'),Buffer.from('font')).includes('<script>'));
  let closed = false;
  let setContentOptions;
  let routePattern;
  const failedBrowser = { newContext: async () => ({
    newPage: async () => ({ route: async pattern => { routePattern = pattern; }, setContent: async (_content, options) => { setContentOptions = options; throw new Error('render_failed'); } }),
    close: async () => { closed = true; }
  }) };
  await assert.rejects(renderCover(failedBrowser,{html}),/render_failed/);
  assert.equal(routePattern.source, '^https?:\\/\\/');
  assert.deepEqual(setContentOptions, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(closed,true,'failed render must close its isolated context');
  console.log('note cover copy, source preservation, escaping and render failure tests passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
