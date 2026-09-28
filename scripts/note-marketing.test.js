'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const c = require('./note-marketing-content');
const { client, REPO, BRANCH } = require('./note-marketing-store');
const config = require('../config/note-marketing.json');
const now = Date.parse('2026-09-28T23:00:00+09:00');
const source = JSON.stringify({version:'note-draft-bundle-v1',record:{raceKey:'20260928-13-4',place:'尼崎',raceNo:4,deadlineAt:'2026-09-28T11:52:00+09:00'}});
const receipt = {version:'note-publication-receipt-v1',raceKey:'20260928-13-4',url:'https://note.com/great_robin3243/n/n2fd33336e0a4',price:300,publishedAt:'2026-09-28T11:38:13+09:00',verifiedAt:'2026-09-28T11:38:30+09:00',sourceSha256:createHash('sha256').update(source).digest('hex')};
test('only a verified publication with matching immutable original becomes an index row',()=>{
  assert.equal(c.receiptRow(receipt,source,now).place,'尼崎');
  assert.throws(()=>c.receiptRow(receipt,source+' ',now),/source_hash/);
  for (const mutation of [{price:0},{url:'https://note.com/another/n/n123'},{verifiedAt:'bad'},{verifiedAt:'2026-09-29T01:00:00+09:00'},{publishedAt:'2026-09-28T11:53:00+09:00',verifiedAt:'2026-09-28T11:54:00+09:00'}]) {
    assert.throws(()=>c.receiptRow({...receipt,...mutation},source,now));
  }
  assert.equal(c.receiptRow(receipt,'',now+86400000),null);
});
test('navigation leaves paid text, picks and source object unchanged',()=>{
  const article={freeText:'無料案内',paidText:'有料本文\n1-2-3',fullText:'無料案内\n\n有料本文\n1-2-3',practicalTickets:['1-2-3']};
  const before=JSON.stringify(article), updated=c.navigation(article,config);
  assert.equal(JSON.stringify(article),before);
  assert.equal(updated.paidText,article.paidText);
  assert.deepEqual(updated.practicalTickets,article.practicalTickets);
  assert.equal(updated.fullText.slice(updated.freeText.length),article.fullText.slice(article.freeText.length));
  assert(updated.freeText.includes(config.index.url));
  assert(updated.freeText.includes(config.guide.url));
});
test('index uses absolute deadlines, rolls over at midnight JST and refuses duplicates',()=>{
  const row=c.receiptRow(receipt,source,now);
  assert(c.indexBody([row],config,now).includes('11:52｜尼崎4R'));
  const tomorrow=c.indexBody([row],config,Date.parse('2026-09-28T15:00:00Z'));
  assert(tomorrow.startsWith('2026年9月29日'));
  assert(!tomorrow.includes(receipt.url));
  assert.throws(()=>c.indexBody([row,row],config,now),/duplicate_publication/);
});
test('manual changes stop; a response-lost retry accepts already desired content',()=>{
  assert.equal(c.hash('A\n\nB'),c.hash('A\nB'));
  assert.throws(()=>c.requireEditable('human change',c.hash('old'),'new'),/manual_change/);
  c.requireEditable('old',c.hash('old'),'new');
  c.requireEditable('new',c.hash('old'),'new');
  assert(c.bodyHtml(config.guide.initialBody).includes('<a href="'+config.index.url+'">'));
  assert(c.bodyHtml('<script>').includes('&lt;script&gt;'));
});
test('receipt store is incremental and state writes only its dedicated branch',async()=>{
  const calls=[], commit='b'.repeat(40), receiptCommit='c'.repeat(40);
  const ref={ref:'refs/tags/note-published/'+'a'.repeat(64),object:{sha:receiptCommit}};
  const api=async(url,options)=>{
    const route=url.split(REPO)[1], body=options.body&&JSON.parse(options.body);
    calls.push({route,method:options.method,body});
    let status=200,data;
    if(route==='/git/ref/heads/'+BRANCH){status=404;data={};}
    else if(route==='/git/matching-refs/tags/note-published/')data=[ref];
    else if(route.startsWith('/contents/receipt.json'))data={encoding:'base64',content:Buffer.from(JSON.stringify(receipt)).toString('base64')};
    else if(route.startsWith('/contents/data/note-drafts/')){assert(route.endsWith('ref=main'));data={encoding:'none',type:'file',sha:'e'.repeat(40)};}
    else if(route==='/git/blobs/'+'e'.repeat(40))data={encoding:'base64',content:Buffer.from(source).toString('base64')};
    else if(route==='/git/trees')data={sha:'d'.repeat(40)};
    else if(route==='/git/commits')data={sha:commit};
    else if(route==='/git/refs' || route==='/git/refs/heads/'+BRANCH)data={object:{sha:commit}};
    else throw Error(route);
    return {ok:status===200,status,json:async()=>data};
  };
  const store=client({GITHUB_REPOSITORY:REPO,NOTE_CLAIM_TOKEN:'test-only',NOTE_CLAIM_SHA:'f'.repeat(40)},api);
  const loaded=await store.load(config);
  const state=await store.collect(loaded.state,now);
  assert.equal(state.rows.length,1);
  const count=calls.length;
  assert.deepEqual(await store.collect(state,now),state);
  assert.equal(calls.length-count,1);
  await store.save(state,null);
  assert.equal(calls.at(-1).body.ref,'refs/heads/'+BRANCH);
  await store.save(state,commit);
  assert.equal(calls.at(-1).body.force,false);
  assert(!calls.some(v=>v.method!=='GET'&&v.route.includes('heads/main')));
  const tomorrow=await store.collect(state,now+86400000);
  assert.deepEqual(tomorrow.rows,[]);
});
test('anonymous verification requires full text and clickable navigation',async()=>{
  const {verifyPublic,updateArticle}=require('./update-note-marketing');
  const article=config.guide, desired=article.initialBody;
  let links=c.urlsIn(desired), edits=0;
  const publicPage={
    goto:async()=>({ok:()=>true}), url:()=>article.url,
    getByRole:(_,{name})=>({waitFor:async()=>{},count:async()=>name==='ここから先は'?0:1}),
    locator:()=>({count:async()=>1,innerText:async()=>desired,locator:()=>({evaluateAll:async()=>links})})
  };
  await verifyPublic(publicPage,article,desired);
  assert.equal(await updateArticle({goto:async()=>{edits++;}},publicPage,article,desired,c.hash('old')),false);
  assert.equal(edits,0);
  links=[];
  await assert.rejects(verifyPublic(publicPage,article,desired),/public_content_mismatch/);
});
