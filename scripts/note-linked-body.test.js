'use strict';
// Local browser regression: exercise the same HTML paste path used by note.
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { fillLinkedBody } = require('./note-linked-body');
const { readEditorContent, compareEditorContent } = require('./note-editor-content');
(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<div class="ProseMirror" contenteditable="true"><p>old draft</p></div>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port);
    const input=page.locator('.ProseMirror');
    const readerContext=await browser.newContext();
    const reader=await readerContext.newPage();
    await reader.goto('about:blank');
    const body='🚤 無料案内\n\n今日の予想一覧\nhttps://note.com/great_robin3243/n/na76b6c6c18ff\n\n有料本文\n1-2-3\n  字下げも維持';
    await fillLinkedBody(page,input,body);
    assert(compareEditorContent(await readEditorContent(input),body).equal);
    assert.equal(await input.locator('a').getAttribute('href'),'https://note.com/great_robin3243/n/na76b6c6c18ff');
    // An updater repeatedly replaces an existing linked body while an
    // anonymous reader page is open in a different browser context.
    await reader.bringToFront();
    await fillLinkedBody(page,input,body);
    assert(compareEditorContent(await readEditorContent(input),body).equal);
    await fillLinkedBody(page,input,'通常の本文\n1-3-2');
    assert(compareEditorContent(await readEditorContent(input),'通常の本文\n1-3-2').equal);
    const resultUrl='https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20260928&jcd=13&rno=4';
    const resultBody='公開 11:38｜実戦厳選2点\n公式結果を確認\n'+resultUrl;
    await fillLinkedBody(page,input,resultBody);
    assert(compareEditorContent(await readEditorContent(input),resultBody).equal);
    assert.equal(await input.locator('a').getAttribute('href'),resultUrl,'query parameters survive HTML paste');
    await readerContext.close();
    console.log('Linked note body paste: full replacement, spacing, reader context and clickable URL verified');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
