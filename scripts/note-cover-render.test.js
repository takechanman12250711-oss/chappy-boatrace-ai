'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { coverLines, coverHtml, renderCover } = require('./note-cover-template');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const font = fs.readFileSync(path.join(__dirname,'../assets/note/Yomogi-Cover.ttf'));
    const background = fs.readFileSync(path.join(__dirname,'../assets/note/chappy-cover.jpg'));
    const examples = [
      {rangeSummary:'最有力展開は2コース差し。2着残しは1・4・3号艇'},
      {rangeSummary:'最有力展開は4コースまくり差し。2着残しは1・2・3・5・6号艇'},
      {rangeSummary:'最有力展開はイン逃げ。'},
      {paidText:'【購入見送り】\n参考'}
    ];
    fs.mkdirSync('tmp/note-cover-preview',{recursive:true});
    const outputs=[];
    for(let i=0;i<examples.length;i++) {
      const lines=coverLines(examples[i]);
      const file=await renderCover(browser,{html:coverHtml(lines,background,font)});
      assert.equal(browser.contexts().length,0,'render context closed; no profile mutation');
      assert.equal(file.mimeType,'image/jpeg');
      assert.ok(file.buffer.length>10000);
      outputs.push(file.buffer);
      fs.writeFileSync(`tmp/note-cover-preview/cover-${i}.jpg`,file.buffer);
      console.log(JSON.stringify({lines,bytes:file.buffer.length}));
    }
    assert.ok(!outputs[0].equals(outputs[1]),'race-specific images differ');
    console.log('Chromium cover font, layout, JPEG and isolated-context verification passed');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
