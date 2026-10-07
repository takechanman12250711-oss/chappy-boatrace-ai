// Additional captures inside the existing WebKit development diagnostics.
// This is not a live prediction or a physical-iPhone test.
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export const sourceCommit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
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
    assert.equal(await page.locator('.chappy-final-buy-summary>.chappy-final-buy-group').count(),4);
    await page.screenshot({path:path.join(outputDir,`bright-prediction-${width}.png`),fullPage:true});
    // Open via keyboard and retain focus after repeated close/open.
    const summaries=page.locator('.chappy-final-buy-summary>.chappy-final-buy-group>summary,.chappy-practical-visible-panel>summary');
    for(const summary of await summaries.all()){
      await summary.focus();await summary.press('Enter');await settle(page);
      assert(await summary.evaluate(el=>el.parentElement.open),'keyboard opens disclosure');
      await summary.press('Enter');assert(!(await summary.evaluate(el=>el.parentElement.open)),'keyboard closes disclosure');
      assert(await summary.evaluate(el=>document.activeElement===el),'focus remains on summary');
      await summary.press('Enter');
    }
    await settle(page);await assertCanvas(page,'#predictionSection',width);
    await page.screenshot({path:path.join(outputDir,`bright-prediction-open-${width}.png`),fullPage:true});
    for(const summary of await summaries.all())await summary.press('Enter');
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
  await page.locator('.bottom-nav-item[data-view="prediction"]').click();
  assert.equal(await page.locator('#predictionSection').isVisible(),true);
  // Returning to the race picker intentionally resets the selection in the existing controller.
  // Revisit must show a clear empty state rather than stale tickets or a blank screen.
  await page.locator('.prediction-empty-state').waitFor({state:'visible'});
  assert.equal(await page.locator('.chappy-bright-race-intro').count(),0);
  step('bright-disclosures-and-back-passed',{sourceCommit,badges});
}
