'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { coverLines, coverHtml, raceCoverHtml, renderCover } = require('./note-cover-template');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const font = fs.readFileSync(path.join(__dirname,'../assets/note/Yomogi-Cover.ttf'));
    const { loadCover, loadSeriesCover } = require('./note-cover');
    const background = loadCover().buffer;
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
    const round = fs.readFileSync(path.join(__dirname, '../assets/note/ZenMaruGothic-Cover.ttf'));
    const seriesImages = [];
    for (const articleSeries of ['normal', 'escape', 'manshu']) {
      const info = { articleSeries, date: '20260929', place: '平和島', raceNo: 12, deadline: '16:45', sample: true };
      const html = raceCoverHtml(info, loadSeriesCover(articleSeries).buffer, round);
      const file = await renderCover(browser, { html, layout: 'series-v1' });
      assert.equal(browser.contexts().length, 0);
      assert.ok(file.buffer.length > 10000);
      seriesImages.push(file.buffer);
      fs.writeFileSync(`tmp/note-cover-preview/series-${articleSeries}.jpg`, file.buffer);
      console.log(JSON.stringify({ articleSeries, bytes: file.buffer.length }));
    }
    assert.ok(!seriesImages[0].equals(seriesImages[1]) && !seriesImages[1].equals(seriesImages[2]));
    console.log('Chromium cover font, layout, JPEG and isolated-context verification passed');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

