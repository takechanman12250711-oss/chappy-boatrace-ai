// Additional captures inside the existing WebKit development diagnostics.
// This is not a live prediction or a physical-iPhone test.
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export const sourceCommit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
// Capture the prepared event input, never ticket text from the rendered DOM.
// final-mobile-ui dispatches this full boundary snapshot before bright organizes it.
export async function installReaderPresentationCapture(page) {
  await page.evaluate(() => {
    const key='__chappyReaderPresentationDiagnostic';
    const previous=window[key];
    if(previous?.listener)window.removeEventListener('chappy:presentation-rendered',previous.listener);
    const freeze=value=>{
      if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
      return value;
    };
    const state={record:null,root:null,events:0,listener:null};
    state.listener=event=>{
      state.events++;
      state.root=document.querySelector('#resultArea>.v3-root');
      let source=null,expected=null;
      try{
        if(!event.detail||typeof event.detail!=='object'||Array.isArray(event.detail))throw Error('prepared prediction input missing');
        source=freeze(JSON.parse(JSON.stringify(event.detail)));
        const reader=window.ChappyForecastReaderContract;
        if(!reader){state.record=freeze({source,legacy:true,expected:null});return;}
        if(typeof reader.fromPrediction!=='function')throw Error('reader model function missing');
        expected=reader.fromPrediction(source);
        if(!expected||!['selected','skipped','empty','unavailable'].includes(expected.status))throw Error('reader model missing');
        if(source.readerPresentation&&JSON.stringify(source.readerPresentation)!==JSON.stringify(expected))
          throw Error('prepared reader model differs from full source');
        state.record=freeze({source,legacy:false,expected:JSON.parse(JSON.stringify(expected)),
          version:reader.VERSION,referenceLabel:reader.REFERENCE,
          referenceText:expected.referenceOriginalCount?reader.referenceSummary(expected):''});
      }catch(error){state.record=freeze({source,expected,error:String(error?.message||error)});}
    };
    window[key]=state;
    window.addEventListener('chappy:presentation-rendered',state.listener);
  });
}
export async function readReaderPresentationCapture(page) {
  return page.evaluate(()=>{
    const capture=window.__chappyReaderPresentationDiagnostic;
    if(!capture?.record)return {error:'prepared prediction snapshot missing'};
    return {events:capture.events,...capture.record};
  });
}
export async function assertReaderPresentation(page,{requireDefaultDisclosure=true}={}) {
  const view=await page.evaluate(()=>{
    const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
    const area=document.getElementById('resultArea'),capture=window.__chappyReaderPresentationDiagnostic;
    const cards=[...(area?.querySelectorAll('[data-reader-contract]')||[])],card=cards[0];
    const result={
      captured:Boolean(capture?.record&&capture.events>0),
      currentRoot:Boolean(capture?.root&&capture.root===area?.querySelector(':scope>.v3-root')),
      record:capture?.record?{...capture.record,source:undefined}:null,
      cardCount:cards.length,legacyGroupCount:area?.querySelectorAll('.chappy-final-buy-summary>.chappy-final-buy-group').length||0
    };
    if(!card)return result;
    const exact=t=>/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split('-')).size===3;
    const expand=notation=>{
      const parts=clean(notation).replace(/全/g,'123456').split('-');
      if(parts.length!==3||parts.some(p=>!/^[1-6]+$/.test(p)))return null;
      const tickets=[];
      for(const a of parts[0])for(const b of parts[1])for(const c of parts[2]){
        const ticket=a+'-'+b+'-'+c;if(exact(ticket))tickets.push(ticket);
      }
      return tickets;
    };
    const groupNodes=[...card.querySelectorAll('.chappy-final-buy-group')];
    const groups=groupNodes.map(node=>{
      const lineNodes=[...node.querySelectorAll('.chappy-final-buy-line')];
      const lines=lineNodes.map(line=>expand(line.querySelector('.chappy-final-buy-formation')?.textContent));
      const lineCountsMatch=lineNodes.every((line,i)=>clean(line.querySelector('.chappy-final-buy-count')?.textContent)===lines[i]?.length+'点');
      const childrenMatch=lineNodes.every((line,i)=>{
        if(!line.matches('details'))return line.querySelectorAll('.chappy-ticket-child').length===0;
        const children=[...line.querySelectorAll('.chappy-ticket-child')];
        const tickets=children.map(n=>n.dataset.ticket);
        return children.every(n=>n.dataset.ticket===clean(n.querySelector('strong')?.textContent))&&
          JSON.stringify(tickets.sort())===JSON.stringify([...(lines[i]||[])].sort());
      });
      return {label:clean(node.querySelector('.chappy-final-buy-label')?.textContent),
        tickets:lines.flatMap(t=>t||[]),valid:lines.length>0&&lines.every(t=>t&&t.length)&&lineCountsMatch&&childrenMatch,
        countText:clean(node.querySelector('.chappy-final-buy-meta')?.textContent),
        marker:node.getAttribute('data-reader-group'),open:node.open};
    });
    return {...result,version:card.dataset.readerContract,status:card.dataset.readerStatus,groups,
      text:clean(card.textContent),heading:clean(card.querySelector('.chappy-final-buy-head h3')?.textContent),
      header:clean(card.querySelector('.chappy-final-buy-total')?.textContent),
      notes:[...card.querySelectorAll('.chappy-category-note')].map(n=>clean(n.textContent)),
      ticketLines:card.querySelectorAll('.chappy-final-buy-line,.chappy-ticket-child').length,
      hiddenLegacy:[...(area?.querySelectorAll('.v3-main-newspaper,.v3-manshu-newspaper,.chappy-practical-visible-panel')||[])].every(n=>n.hidden&&n.getAttribute('aria-hidden')==='true'),
      fallbackCount:area?.querySelectorAll('.is-practical-fallback').length||0,
      childDisclosuresClosed:[...card.querySelectorAll('details.chappy-ticket-disclosure')].every(n=>!n.open)
    };
  });
  assert.equal(view.captured,true,'prepared prediction snapshot missing');
  assert.equal(view.currentRoot,true,'prepared prediction snapshot belongs to a different render');
  assert(!view.record.error,view.record.error||'prepared prediction capture failed');
  if(view.record.legacy){
    assert.equal(view.cardCount,0,'legacy snapshot must not certify a shared reader card');
    assert.equal(view.legacyGroupCount,4,'legacy presentation retains four groups');
    return {legacy:true,groupCount:4};
  }
  const expected=view.record.expected,clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  assert(expected&&expected.version===view.record.version,'saved reader model/version missing');
  assert.equal(view.cardCount,1,'exactly one shared reader card required');
  assert.equal(view.version,expected.version,'reader version');
  assert.equal(view.status,expected.status,'reader status');
  assert.equal(view.hiddenLegacy,true,'legacy ticket sections must remain hidden even when evidence opens');
  assert.equal(view.fallbackCount,0,'shared reader must not add a legacy fallback');
  const canonical=groups=>groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()}));
  assert.deepEqual(canonical(view.groups),canonical(expected.groups),'all displayed groups and tickets match the frozen source');
  assert(view.groups.every((g,i)=>g.marker===String(i)),'foreign or misnumbered reader group');
  assert(view.groups.every(g=>g.valid&&g.countText===g.tickets.length+'点'),'group ticket counts');
  const all=view.groups.flatMap(g=>g.tickets),primary=view.groups.filter(g=>g.label!==view.record.referenceLabel).flatMap(g=>g.tickets);
  assert.equal(new Set(all).size,all.length,'duplicate displayed tickets');
  assert.equal(all.length,expected.allCount,'all ticket count');
  assert.equal(primary.length,expected.primaryCount,'published ticket count');
  if(expected.status==='selected'){
    assert.equal(view.header,'本命'+expected.centralTickets.length+'点','main header count');
    assert.equal(view.heading,'買い目','selected heading');
    assert(view.notes.includes('本命'+expected.centralTickets.length+'点／追加候補を含む公開予想'+expected.primaryCount+'点。すべて購入する前提ではありません。'),'published count footer');
    assert(view.notes.some(t=>t.replace(/\s/g,'')===String(expected.explanation.text).replace(/\s/g,'')),'saved explanation');
    assert.deepEqual(view.notes.filter(t=>t.startsWith('参考予想')),view.record.referenceText?[clean(view.record.referenceText)]:[],'reference original/overlap accounting');
    if(requireDefaultDisclosure){
      assert.deepEqual(view.groups.map(g=>g.open),view.groups.map((_,i)=>i===0),'default reader disclosures');
      assert.equal(view.childDisclosuresClosed,true,'ticket children closed by default');
    }
  }else{
    assert.equal(view.groups.length,0,'zero-state has no ticket groups');
    assert.equal(view.ticketLines,0,'zero-state has no ticket lines');
    assert.equal(view.header,'','zero-state has no main ticket count');
    assert.equal(view.heading,expected.status==='skipped'?'購入見送り':'買い目を確認中','zero-state heading');
    assert(view.text.includes('購入推奨0点・0円'),'zero purchase message');
    assert(clean(expected.reason)&&view.text.includes(clean(expected.reason)),'saved zero-state reason');
  }
  return {legacy:false,status:expected.status,reason:expected.reason||null,modelError:expected.error||null,
    groupCount:view.groups.length,primaryCount:primary.length,allCount:all.length};
}

const widths = [320,390,1024];
async function settle(page) {
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});
}
async function badge(page) {
  await page.evaluate(sha=>{
    let note=document.getElementById('chappy-ci-label');
    if(!note){note=document.createElement('div');note.id='chappy-ci-label';document.body.prepend(note);}
    note.textContent=`CI検証用・過去データ／一部応答fixture · ${sha.slice(0,12)}`;
    note.style.cssText='background:#fff4cb;color:#614800;padding:6px 12px;font:11px sans-serif;text-align:center';
  },sourceCommit);
}
async function assertCanvas(page,selector,width) {
  const state=await page.evaluate(({selector,width})=>{
    const host=document.querySelector(selector);
    const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
    const nodes=[host,...host.querySelectorAll('button,summary,.official-venue-meta,.chappy-final-buy-mainline')].filter(visible);
    return {
      ready:document.body.classList.contains('chappy-bright-ui')&&window.ChappyBrightMobileLayout?.build==='20261007-bright-mobile1',
      body:getComputedStyle(document.body).backgroundColor,
      width:innerWidth,
      overflow:nodes.filter(el=>{const r=el.getBoundingClientRect();return r.left < -1 || r.right > width+1;}).map(el=>el.className),
      nav:document.querySelector('.bottom-nav').getBoundingClientRect().bottom,
      viewportHeight:innerHeight
    };
  },{selector,width});
  assert.equal(state.ready,true,'real bright assets loaded');assert.equal(state.body,'rgb(243, 248, 255)');assert.equal(state.width,width);
  assert.deepEqual(state.overflow,[],`horizontal overflow at ${width}`);
  assert(Math.abs(state.nav-state.viewportHeight)<2,'bottom navigation remains fixed inside viewport');
  return state;
}
export async function captureVenueViews(page,outputDir,step) {
  await badge(page);
  assert.equal(await page.locator('#officialVenueGrid .official-venue-button').count(),24);
  for(const width of widths){
    await page.setViewportSize({width,height:844});await settle(page);
    const result=await assertCanvas(page,'#raceSection',width);
    const columns=await page.locator('#officialVenueGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,width<700?3:6);
    const action = await page.evaluate(()=>({position:getComputedStyle(document.querySelector('.race-main-action')).position,top:document.querySelector('.race-main-action').getBoundingClientRect().top,gridBottom:document.getElementById('officialVenueGrid').getBoundingClientRect().bottom}));
    assert.equal(action.position,'static','legacy action overlay removed');
    assert(action.top >= action.gridBottom-1,'prediction action must not cover venue cards');
    await page.screenshot({path:path.join(outputDir,`bright-venues-${width}.png`),fullPage:true});
    step('bright-venues-captured',{sourceCommit,width,columns,...result});
  }
  for(const filter of ['morning','day','night','all']){
    await page.locator(`[data-session-filter="${filter}"]`).click();await settle(page);
    const result=await page.locator('#officialVenueGrid .official-venue-button').evaluateAll((nodes,filter)=>({
      total:nodes.length,visible:nodes.filter(el=>!el.hidden).length,
      correct:nodes.every(el=>el.hidden===(filter!=='all'&&el.dataset.session!==filter))
    }),filter);
    assert.equal(result.total,24);assert.equal(result.correct,true);if(filter==='all')assert.equal(result.visible,24);
  }
  await page.setViewportSize({width:390,height:844});await settle(page);
}
export async function capturePredictionViews(page,outputDir,step) {
  await page.waitForSelector('.chappy-bright-race-intro',{state:'visible',timeout:10000});
  await badge(page);
  // Wait on an observable final presentation state rather than a fixed sleep.
  await page.waitForFunction(()=>document.querySelectorAll('#resultArea>.v3-root').length===1&&document.querySelectorAll('#resultArea>.skip-ai-panel,#resultArea>.scenario-v6-panel').length===0);
  for(const width of widths){
    await page.setViewportSize({width,height:844});await settle(page);
    const result=await assertCanvas(page,'#predictionSection',width);
    const order=await page.locator('#resultArea>.v3-root').evaluate(el=>[...el.children].map(node=>node.className));
    assert.equal(order[0],'chappy-bright-intro');
    const readerProof=await assertReaderPresentation(page);
    step('bright-reader-model-verified',{sourceCommit,width,...readerProof});
    await page.screenshot({path:path.join(outputDir,`bright-prediction-${width}.png`),fullPage:true});
    // Open via keyboard and retain focus after repeated close/open.
    const summaries=page.locator('.chappy-final-buy-summary>.chappy-final-buy-group>summary:visible,.chappy-practical-visible-panel>summary:visible');
    const disclosureStates=[];
    for(const summary of await summaries.all()){
      const wasOpen=await summary.evaluate(el=>el.parentElement.open);
      disclosureStates.push({summary,wasOpen});
      await summary.focus();
      // The reader main is open by default; exercise both keyboard transitions
      // from a known closed state, then restore each original state after capture.
      if(wasOpen){await summary.press('Enter');await settle(page);}
      assert(!(await summary.evaluate(el=>el.parentElement.open)),'disclosure starts closed for keyboard check');
      await summary.press('Enter');await settle(page);
      assert(await summary.evaluate(el=>el.parentElement.open),'keyboard opens disclosure');
      await summary.press('Enter');await settle(page);assert(!(await summary.evaluate(el=>el.parentElement.open)),'keyboard closes disclosure');
      assert(await summary.evaluate(el=>document.activeElement===el),'focus remains on summary');
      await summary.press('Enter');
    }
    await settle(page);await assertCanvas(page,'#predictionSection',width);
    await page.screenshot({path:path.join(outputDir,`bright-prediction-open-${width}.png`),fullPage:true});
    for(const {summary,wasOpen} of disclosureStates){
      if((await summary.evaluate(el=>el.parentElement.open))!==wasOpen)await summary.press('Enter');
      await settle(page);
      assert.equal(await summary.evaluate(el=>el.parentElement.open),wasOpen,'restore disclosure initial state');
    }
    step('bright-prediction-captured',{sourceCommit,width,order,...result});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.chappy-readable-evidence>summary').click();await settle(page);
  const badges=await page.locator('.v3-entry-card-boat .v3-boat-badge').evaluateAll(nodes=>nodes.slice(0,6).map(el=>getComputedStyle(el).backgroundColor));
  assert.deepEqual(badges,['rgb(255, 255, 255)','rgb(17, 17, 17)','rgb(229, 57, 53)','rgb(30, 136, 229)','rgb(253, 216, 53)','rgb(67, 160, 71)']);
  for(const tab of await page.locator('.v3-boat-tab-button').all()){
    await tab.click();assert.equal(await tab.getAttribute('aria-selected'),'true');
  }
  await page.screenshot({path:path.join(outputDir,'bright-evidence-open-390.png'),fullPage:true});
  await page.locator('.chappy-readable-evidence>summary').click();
  // The existing navigation lifecycle owns Back, including cancel/intent guards.
  await page.locator('.chappy-back-races').click();
  assert.equal(await page.locator('#raceSection').isVisible(),true);
  assert.equal(await page.locator('#predictionSection').isVisible(),false);
  // Back starts an async schedule/race selection. Returning earlier cancels
  // that intent before its existing onchange reset can finish.
  await page.waitForFunction(()=>{
    const area=document.getElementById('resultArea'),race=document.getElementById('raceSection');
    const select=document.getElementById('raceSelect'),button=document.getElementById('fetchRaceBtn');
    return race&&!race.hidden&&area&&area.dataset.raceLoading!=='true'&&
      area.querySelectorAll('.chappy-bright-race-intro,.chappy-final-buy-summary').length===0&&
      Boolean(select?.value)&&button?.disabled===false;
  },null,{timeout:60_000});
  step('bright-race-reset-settled',{sourceCommit});
  await page.locator('.bottom-nav-item[data-view="prediction"]').click();
  assert.equal(await page.locator('#predictionSection').isVisible(),true);
  // Returning to the race picker intentionally resets the selection in the existing controller.
  // Preserve the existing baseline: prediction is reset; its official status stays visible.
  // Do not impose a new prompt or erase results/errors as part of a layout change.
  await page.waitForFunction(()=>{
    const area=document.getElementById('resultArea'),status=area?.querySelector('#raceResultStatus'),r=status?.getBoundingClientRect();
    return area&&area.dataset.raceLoading!=='true'&&
      area.querySelectorAll('.chappy-bright-race-intro,.chappy-final-buy-summary').length===0&&
      Boolean(r&&r.width>0&&r.height>0)&&Boolean(status.textContent.trim());
  },null,{timeout:10_000});
  await settle(page);
  const revisit=await page.evaluate(()=>{
    const area=document.getElementById('resultArea');
    const status=area.querySelector('#raceResultStatus');
    const rect=status?.getBoundingClientRect();
    return {
      visibleViews:['race','prediction','result'].filter(view=>!document.getElementById(`${view}Section`).hidden),
      priorPredictionCount:area.querySelectorAll('.chappy-bright-race-intro,.chappy-final-buy-summary').length,
      staleTicketCount:area.querySelectorAll('.v3-root,.v3-manshu-newspaper,[data-manshu-display-fallback],.v3-formation-row').length,
      loading:area.dataset.raceLoading==='true',
      statusVisible:Boolean(rect&&rect.width>0&&rect.height>0),
      statusText:status?.textContent.trim()||'',
      errorText:document.getElementById('errorArea')?.textContent.trim()||''
    };
  });
  assert.deepEqual(revisit.visibleViews,['prediction']);
  assert.equal(revisit.priorPredictionCount,0,'prior prediction and ticket groups are cleared');
  assert.equal(revisit.staleTicketCount,0,'old roots, manshu panels and fallback tickets stay cleared after Back');
  assert.equal(revisit.loading,false,'no stuck loading state after return');
  assert.equal(revisit.statusVisible,true,'official status remains available');
  assert(revisit.statusText.length>0,'official status text is not erased');
  await page.screenshot({path:path.join(outputDir,'bright-back-revisit-390.png'),fullPage:true});
  step('bright-back-revisit-state',{sourceCommit,...revisit});
  step('bright-disclosures-and-back-passed',{sourceCommit,badges});
}
