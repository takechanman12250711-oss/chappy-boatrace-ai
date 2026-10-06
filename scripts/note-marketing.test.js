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
  assert.equal(c.receiptRow(receipt,source,now+86400000).raceKey,receipt.raceKey);
  assert.equal(c.receiptRow(receipt,'',now+2*86400000),null);
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
  assert(tomorrow.includes(receipt.url));
  assert(tomorrow.indexOf(receipt.url)>tomorrow.indexOf('前日の公開記事と公式結果'));
  assert(!c.indexBody([row],config,now+2*86400000).includes(receipt.url));
  assert.throws(()=>c.indexBody([row,row],config,now),/duplicate_publication/);
  assert.throws(()=>c.indexBody([row,row],config,now+86400000),/duplicate_publication/);
});
test('count comes from both immutable ticket sets; result links reveal no paid tickets',()=>{
  const make=(change=()=>{})=>{
    const b=JSON.parse(source); b.baselinePracticalTickets=['1-2-3','1-3-2'];
    b.record.prediction={practicalTickets:[{ticket:'1-3-2'},{ticket:'1-2-3'}]};
    change(b); const bytes=JSON.stringify(b);
    return c.receiptRow({...receipt,sourceSha256:createHash('sha256').update(bytes).digest('hex')},bytes,now);
  };
  const row=make(), body=c.indexBody([row],config,now);
  assert.equal(row.ticketCount,2);
  assert(body.includes('公開 11:38｜実戦厳選2点'));
  assert(!body.includes('1-2-3'));
  assert(!JSON.stringify(row).includes('1-3-2'));
  const url='https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20260928&jcd=13&rno=4';
  assert.equal(row.resultUrl,url);
  assert(c.urlsIn(body).includes(url));
  assert(c.bodyHtml(body).includes('<a href="'+url.replaceAll('&','&amp;')+'">'));
  assert.equal(c.receiptRow(receipt,source,now).ticketCount,null);
  for(const change of [b=>b.record.prediction.practicalTickets.pop(),b=>b.baselinePracticalTickets.push('1-2-3'),b=>delete b.baselinePracticalTickets,b=>b.record.raceNo=5]) assert.throws(()=>make(change));
});
test('manual changes stop; a response-lost retry accepts already desired content',()=>{
  assert.equal(c.hash('A\n\nB'),c.hash('A\nB'));
  assert.throws(()=>c.requireEditable('human change',c.hash('old'),'new'),/manual_change/);
  c.requireEditable('old',c.hash('old'),'new');
  c.requireEditable('new',c.hash('old'),'new');
  assert(c.bodyHtml(config.guide.initialBody).includes('<a href="'+config.index.url+'">'));
  assert(c.bodyHtml('<script>').includes('&lt;script&gt;'));
});
test('terminal free-guide NBSP does not block the index; meaningful edits and paid checks remain strict', async()=>{
  const desired=config.guide.initialBody, actual=desired+'\u00a0';
  assert.equal(c.hash(actual),c.hash(desired));
  assert.equal(c.sameMarketingContent(actual+'\n',desired),true);
  c.requireEditable(actual,c.hash(desired),desired);
  for(const changed of [desired+' ',desired+'追加',desired.replace('200円','500円'),desired.replace('今日の予想一覧',' 今日の予想一覧')]) {
    assert.throws(()=>c.requireEditable(changed,c.hash(desired),desired),/manual_change/);
  }
  assert.equal(require('./note-editor-content').compareEditorContent(actual,desired).equal,false,'paid article comparison is unchanged');
  const page={goto:async()=>({ok:()=>true}),url:()=>config.guide.url,
    getByRole:()=>({waitFor:async()=>{},count:async()=>0}),
    locator:()=>({count:async()=>1,innerText:async()=>actual,locator:()=>({evaluateAll:async()=>c.urlsIn(desired)})})};
  const {updateArticle,verifyPublic}=require('./update-note-marketing');
  assert.equal(await updateArticle({},page,config.guide,desired,c.hash(desired)),false,'no editor or write is needed');
  await verifyPublic(page,config.guide,desired);
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
  assert.equal(tomorrow.rows.length,1);
  const oldState={...state,rows:[]}; delete oldState.receiptWindowVersion;
  const migrated=await store.collect(oldState,now+86400000);
  assert.equal(migrated.rows.length,1,'migration recovers yesterday even when its receipt was already seen');
  assert.equal(migrated.receiptWindowVersion,2);
  assert(migrated.rows[0].resultUrl.includes('jcd=13&rno=4'));
  assert.deepEqual((await store.collect(tomorrow,now+2*86400000)).rows,[]);
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
test('edit-review diagnostics locate public/editor drift without logging text or relaxing the guard',()=>{
  const {requireArticleEditable}=require('./update-note-marketing');
  const old='known line\nhttps://note.com/great_robin3243', desired='new approved line';
  const actual=old+' ', diagnostic=c.editDiagnostics(actual,c.hash(old),desired,old);
  assert.deepEqual(diagnostic.whitespaceCandidates.previous,['terminalAsciiSpace','terminalWhitespace','lineEndWhitespace']);
  assert.equal(diagnostic.previousComparison.firstDifferentLine,2);
  assert.equal(diagnostic.desiredComparison.firstDifferentLine,1);
  assert.equal(c.editDiagnostics(actual,c.hash(old),desired,'wrong reconstruction').previousComparison,null);
  assert.throws(()=>c.requireEditable(actual,c.hash(old),desired),/manual_change/,'diagnosis is not permission to trim');
  const messages=[], original=console.error;
  try {
    console.error=message=>messages.push(message);
    for (const stage of ['public','editor']) {
      assert.throws(()=>requireArticleEditable('private draft addition',c.hash(old),desired,config.guide,stage,old),/manual_change/);
    }
  } finally { console.error=original; }
  assert.equal(messages.length,2);
  assert.equal(messages.some(message=>message.includes('private draft addition') || message.includes('known line') || message.includes(desired)),false);
  const report=JSON.parse(messages[1].split('NOTE_MARKETING_EDIT_REVIEW=')[1]);
  assert.equal(report.stage,'editor');
  assert.equal(report.articleId,config.guide.id);
  assert.deepEqual(report.whitespaceCandidates,{previous:[],desired:[]});
});
test('previous body diagnostics use only a hash-verified reconstruction at the original publication time',()=>{
  const {previousArticleText}=require('./update-note-marketing');
  const state=c.initialState(config);
  assert.equal(previousArticleText(state,config,'guide'),config.guide.initialBody);
  assert.equal(previousArticleText(state,config,'index'),null);
  const publishedAt='2026-09-28T14:00:00Z';
  state.articles.index={verifiedAt:publishedAt,hash:c.hash(c.publishedIndexBody(state,config,Date.parse(publishedAt)))};
  assert.equal(previousArticleText(state,config,'index'),c.publishedIndexBody(state,config,Date.parse(publishedAt)));
  state.articles.index.hash=c.hash('an older generator output');
  assert.equal(previousArticleText(state,config,'index'),null);
});
test('public manual-change diagnostics stop before opening the editor or submitting',async()=>{
  const {updateArticle}=require('./update-note-marketing');
  let editorOpened=false;
  const publicPage={goto:async()=>({ok:()=>true}),url:()=>config.guide.url,
    getByRole:()=>({waitFor:async()=>{},count:async()=>0}),
    locator:()=>({count:async()=>1,innerText:async()=>'unknown added text',locator:()=>({evaluateAll:async()=>[]})})};
  const original=console.error; console.error=()=>{};
  try {
    await assert.rejects(updateArticle({goto:async()=>{editorOpened=true;}},publicPage,config.guide,config.guide.initialBody,c.hash(config.guide.initialBody)),/manual_change/);
    assert.equal(editorOpened,false);
  } finally {console.error=original;}
});
function fakeMarketingPages(article, initial, {failAfterSubmit = false, editorText = initial} = {}) {
  const events=[];
  let published=initial, edited=editorText, title=article.title, pageUrl='', hasSubmitted=false;
  const titleInput={count:async()=>1,nth(){return this;},isVisible:async()=>true,inputValue:async()=>title,
    fill:async value=>{events.push('fill title');title=value;}};
  const bodyInput={count:async()=>1,nth(){return this;},isVisible:async()=>true,
    evaluate:async fn=>fn({tagName:'DIV',getAttribute:()=> 'true',innerText:edited}),
    fill:async value=>{events.push('fill body');edited=value;}};
  const page={goto:async url=>{events.push('open editor');pageUrl=url;},url:()=>pageUrl,
    locator:selector=>selector.includes('タイトル')?titleInput:bodyInput,
    frames:()=>[],mainFrame:()=>null,waitForTimeout:async()=>{},waitForURL:async()=>{},
    getByRole:(role,{name})=>role==='radio'?{isChecked:async()=>true}:{count:async()=>1,isEnabled:async()=>true,click:async()=>{
      if (String(name).includes('公開に進む')) {events.push('settings');pageUrl=`https://editor.note.com/notes/${article.id}/publish/`;}
      else {events.push('submit');published=edited;hasSubmitted=true;}
    }}};
  const publicPage={goto:async()=>({ok:()=>!(hasSubmitted&&failAfterSubmit)}),url:()=>article.url,
    getByRole:()=>({waitFor:async()=>{},count:async()=>0}),
    locator:()=>({count:async()=>1,innerText:async()=>published,locator:()=>({evaluateAll:async()=>c.urlsIn(published)})})};
  return {page,publicPage,events,get published(){return published;},get editor(){return edited;}};
}
test('publication success followed by verification failure recovers exact pending content after desired changes',async()=>{
  const {createUpdateJournal,updateArticle}=require('./update-note-marketing');
  const article=config.index, old='old verified content', first='first generated content', next='new result arrived';
  let persisted={...c.initialState(config),rows:[],articles:{guide:{hash:c.hash(config.guide.initialBody)},index:{hash:c.hash(old)}}};
  let head='a'.repeat(40), saves=0;
  const events=[];
  const store={save:async(state,expected)=>{assert.equal(expected,head);events.push('save intent');persisted=structuredClone(state);head=(++saves).toString(16).padStart(40,'0');return head;}};
  const journal=createUpdateJournal(store,{state:persisted,head},config,()=>now);
  const firstPages=fakeMarketingPages(article,old,{failAfterSubmit:true});
  const options=journal.options('index',first), persist=options.beforeWrite;
  options.beforeWrite=async()=>{await persist();firstPages.events.push('intent saved');};
  await assert.rejects(updateArticle(firstPages.page,firstPages.publicPage,article,first,c.hash(old),old,options),/public_page_unavailable/);
  assert(firstPages.events.indexOf('intent saved')<firstPages.events.indexOf('fill body'));
  assert.equal(firstPages.events.filter(x=>x==='submit').length,1);
  assert.equal(persisted.articles.index.hash,c.hash(old),'unverified target is not recorded as verified');
  assert.equal(persisted.pendingUpdates.index.targetHash,c.hash(first));
  assert.equal(firstPages.published,first);
  const resumed=createUpdateJournal(store,{state:persisted,head},config,()=>now+1000);
  const secondPages=fakeMarketingPages(article,first);
  assert.equal(await updateArticle(secondPages.page,secondPages.publicPage,article,next,c.hash(old),old,resumed.options('index',next)),true);
  assert.equal(secondPages.published,next);
  assert.equal(secondPages.events.filter(x=>x==='submit').length,1,'first publication is not resent');
  assert.equal(persisted.pendingUpdates.index.targetHash,c.hash(next));
  assert.equal(resumed.head,head);
});
test('already desired published content is verified without another editor write or submission',async()=>{
  const {createUpdateJournal,updateArticle}=require('./update-note-marketing');
  const old='old',desired='published target',state=c.initialState(config);state.articles.index.hash=c.hash(old);
  const pending=c.prepareUpdateAttempt(state,'index',config.index,desired,now);
  const journal=createUpdateJournal({save:async()=>{throw Error('no new write expected');}},{state:pending,head:'a'.repeat(40)},config,()=>now);
  const pages=fakeMarketingPages(config.index,desired);
  assert.equal(await updateArticle(pages.page,pages.publicPage,config.index,desired,c.hash(old),old,journal.options('index',desired)),false);
  assert.deepEqual(pages.events,[]);
});
test('failed intent persistence, foreign attempts and manual editor changes never permit a write',async()=>{
  const {createUpdateJournal,updateArticle}=require('./update-note-marketing');
  const old='old',target='automated target',desired='new desired',state=c.initialState(config);state.articles.index.hash=c.hash(old);
  const pages=fakeMarketingPages(config.index,old);
  const blocked=createUpdateJournal({save:async()=>{throw Error('CAS conflict');}},{state,head:'a'.repeat(40)},config,()=>now);
  await assert.rejects(updateArticle(pages.page,pages.publicPage,config.index,desired,c.hash(old),old,blocked.options('index',desired)),/CAS conflict/);
  assert.equal(pages.events.some(x=>x.startsWith('fill')||x==='submit'),false);
  const pending=c.prepareUpdateAttempt(state,'index',config.index,target,now);
  for (const bad of [{articleId:config.guide.id},{fromHash:c.hash('foreign state')},{targetHash:'bad'},{version:'unknown'},{startedAt:'invalid'}]) {
    const tampered=structuredClone(pending);Object.assign(tampered.pendingUpdates.index,bad);
    assert.throws(()=>createUpdateJournal({}, {state:tampered,head:'a'.repeat(40)},config,()=>now),/attempt_invalid/);
  }
  let writes=0;
  const resumed=createUpdateJournal({save:async()=>{writes++;return 'b'.repeat(40);}},{state:pending,head:'a'.repeat(40)},config,()=>now);
  const manual=fakeMarketingPages(config.index,target,{editorText:target+' human addition'});
  const original=console.error;console.error=()=>{};
  try {await assert.rejects(updateArticle(manual.page,manual.publicPage,config.index,desired,c.hash(old),old,resumed.options('index',desired)),/manual_change/);}
  finally {console.error=original;}
  assert.equal(writes,0);
  assert.equal(manual.events.some(x=>x.startsWith('fill')||x==='submit'),false);
});
test('verified article checkpoints chain CAS and retain the last verified index rows until complete',async()=>{
  const {createUpdateJournal}=require('./update-note-marketing');
  const original=c.initialState(config);original.rows=[{proof:'last verified rows'}];
  const loaded=structuredClone(original), states=[];let head='a'.repeat(40);
  const store={save:async(state,expected)=>{assert.equal(expected,head);states.push(structuredClone(state));head=String(states.length).padStart(40,'0');return head;}};
  const j=createUpdateJournal(store,{state:loaded,head},config,()=>now);
  await j.options('guide','new guide').beforeWrite();
  j.verified('guide',{hash:c.hash('new guide'),url:config.guide.url,verifiedAt:new Date(now).toISOString()});
  await j.options('index','first index').beforeWrite();
  assert.equal(states[1].articles.guide.hash,c.hash('new guide'));
  assert.equal(states[1].pendingUpdates.guide,undefined);
  assert.deepEqual(states[1].rows,original.rows);
  j.verified('index',{hash:c.hash('first index'),url:config.index.url,verifiedAt:new Date(now).toISOString()});
  await j.options('index','corrected course index').beforeWrite();
  assert.equal(states[2].pendingUpdates.index.fromHash,c.hash('first index'));
  assert.equal(states[2].pendingUpdates.index.targetHash,c.hash('corrected course index'));
  assert.deepEqual(loaded,original,'source state is not mutated');
  assert.throws(()=>createUpdateJournal(store,{state:{...original,pendingUpdates:{foreign:{}}},head},config,()=>now),/attempt_invalid/);
});
test('a second interruption after replacing an intent preserves the earlier published target',async()=>{
  const {createUpdateJournal,updateArticle}=require('./update-note-marketing');
  const old='verified A',published='published B',interrupted='intended C',latest='latest D';
  let state=c.initialState(config);state.articles.index.hash=c.hash(old);
  state=c.prepareUpdateAttempt(state,'index',config.index,published,now);
  let head='a'.repeat(40),writes=0;
  const store={save:async(next,expected)=>{assert.equal(expected,head);state=structuredClone(next);head=String(++writes).padStart(40,'0');return head;}};
  const second=createUpdateJournal(store,{state,head},config,()=>now+1000);
  await second.options('index',interrupted).beforeWrite(); // process stops here, before any editor change
  assert.equal(state.articles.index.hash,c.hash(old));
  assert.deepEqual(state.pendingUpdates.index.previousAttempts.map(value=>value.targetHash),[c.hash(published)]);
  const third=createUpdateJournal(store,{state,head},config,()=>now+2000);
  const pages=fakeMarketingPages(config.index,published);
  assert.equal(await updateArticle(pages.page,pages.publicPage,config.index,latest,c.hash(old),old,third.options('index',latest)),true);
  assert.equal(pages.published,latest);
  assert.equal(pages.events.filter(x=>x==='submit').length,1);
  assert.deepEqual(state.pendingUpdates.index.previousAttempts.map(value=>value.targetHash),[c.hash(published),c.hash(interrupted)]);
  const invalid=structuredClone(state);invalid.pendingUpdates.index.previousAttempts=[{sequence:1,targetHash:'unknown',startedAt:new Date(now).toISOString()}];
  assert.throws(()=>createUpdateJournal(store,{state:invalid,head},config,()=>now),/attempt_invalid/);
});
test('an autosaved intermediate draft is retained without treating it as a verified publication',async()=>{
  const {createUpdateJournal,updateArticle}=require('./update-note-marketing');
  const old='verified public A',draft='autosaved B',desired='intended C',latest='later D';
  let state=c.initialState(config);state.articles.index.hash=c.hash(old);
  state=c.prepareUpdateAttempt(state,'index',config.index,draft,now);
  let head='a'.repeat(40),writes=0;
  const store={save:async(next,expected)=>{assert.equal(expected,head);state=structuredClone(next);head=String(++writes).padStart(40,'0');return head;}};
  const interrupted=createUpdateJournal(store,{state,head},config,()=>now+1000);
  const options=interrupted.options('index',desired),save=options.beforeWrite;
  options.beforeWrite=async()=>{await save();throw Error('process stopped after intent');};
  const first=fakeMarketingPages(config.index,old,{editorText:draft});
  await assert.rejects(updateArticle(first.page,first.publicPage,config.index,desired,c.hash(old),old,options),/process stopped/);
  assert.equal(state.articles.index.hash,c.hash(old));
  assert.equal(first.published,old);
  assert.equal(first.editor,draft);
  const resumed=createUpdateJournal(store,{state,head},config,()=>now+2000);
  const next=fakeMarketingPages(config.index,old,{editorText:draft});
  assert.equal(await updateArticle(next.page,next.publicPage,config.index,latest,c.hash(old),old,resumed.options('index',latest)),true);
  assert.equal(next.published,latest);
});
test('attempt ancestry is ordered, contiguous and tied to the same verified article epoch',()=>{
  const {createUpdateJournal}=require('./update-note-marketing');
  let state=c.initialState(config);
  state=c.prepareUpdateAttempt(state,'index',config.index,'B',now);
  state=c.prepareUpdateAttempt(state,'index',config.index,'C',now+1000);
  state=c.prepareUpdateAttempt(state,'index',config.index,'D',now+2000);
  const load=value=>createUpdateJournal({}, {state:value,head:'a'.repeat(40)},config,()=>now+3000);
  load(state);
  for(const mutate of [a=>a.previousAttempts.reverse(),a=>a.previousAttempts.pop(),a=>a.previousAttempts.push(a.previousAttempts[0]),
    a=>a.previousAttempts[0].sequence=9,a=>a.previousAttempts[0].startedAt=new Date(now+9000).toISOString(),
    a=>a.previousAttempts[0].targetHash='unknown',a=>a.fromHash=c.hash('other verified epoch'),a=>a.articleId=config.guide.id]) {
    const bad=structuredClone(state);mutate(bad.pendingUpdates.index);assert.throws(()=>load(bad),/attempt_invalid/);
  }
  assert.throws(()=>c.prepareUpdateAttempt(state,'index',config.index,'E',now-1),/attempt_invalid/);
});
