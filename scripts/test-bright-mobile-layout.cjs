'use strict';
// DOM integration only; synthetic fixtures below are not live predictions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function luminance(hex) {
  const [r,g,b] = hex.match(/\w\w/g).map(value => parseInt(value,16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
}
for (const [foreground,background] of [['173650','ffffff'],['496982','ffffff'],['496982','f3f8ff'],['ffffff','0769cf'],['0769cf','e6f2ff'],['526e86','edf2f7']]) {
  const [a,b] = [luminance(foreground),luminance(background)];
  assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 4.5, `text contrast ${foreground}/${background}`);
}
const palette = fs.readFileSync('css/bright-mobile-layout.css','utf8');
assert.match(palette, /#raceResultStatus \{background:#fff!important/,'asynchronous result panel must have a light surface with dark text');
assert.match(palette, /\.home-header-actions button \{color:#0769cf!important/,'header refresh stays visible on white');
for (const file of ['js/stats.js','js/result-ui-phase5.js','js/final-display-owner-v2.js']) {
  assert(!fs.readFileSync(file,'utf8').includes('実戦厳選'), `${file}: UI-owned labels use 厳選`);
}
// Source records and internal practical keys are deliberately not rewritten.
assert(fs.readFileSync('js/render.js','utf8').includes('prediction.practicalSelection'));
const {parseHTML} = require('linkedom');
const {window} = parseHTML('<html><head></head><body class="chappy-final-mobile-ui"><div id="officialVenueGrid"></div><div id="resultArea"></div></body></html>');
const document = window.document;
const callbacks = [], frames = [];
window.setTimeout = fn => {callbacks.push(fn);return callbacks.length;};
window.setInterval = () => 1; window.clearInterval = () => {};
window.requestAnimationFrame = fn => {frames.push(fn);return frames.length;};
window.HTMLElement.prototype.scrollIntoView = function(){};
// Use real mutation observers. Timers and animation frames are controlled below.
const context = vm.createContext({window,document,MutationObserver:window.MutationObserver,console,Intl,Date,Map,Set,WeakSet});
function load(name) {vm.runInContext(fs.readFileSync(`js/${name}`,'utf8'),context,{filename:name});}
load('render.js');
for (const name of ['final-mobile-ui.js','final-display-owner-v2.js','final-display-user-contract.js','final-ticket-odds-visibility.js','final-practical-visible-panel.js','bright-mobile-layout.js']) load(name);
window.dispatchEvent(new window.Event('chappy:prediction-runtime-ready'));
function flush() { for (let i=0; callbacks.length || frames.length; i++) {assert(i<100,'presentation must settle'); while(callbacks.length)callbacks.shift()();while(frames.length)frames.shift()();} }
function fixture(raceNo=1) {return {
  race:{place:'検証用の場',raceNo,date:'20261007',raceInfo:{deadline:'12:30'},raw:{fetchedAt:'2026-10-07T03:00:00Z'}},
  entries:Array.from({length:6},(_,i)=>({no:i+1,name:`検証選手 ${i+1}`,course:i+1,className:'A1'})),
  raceFlow:{summary:'これはテスト用の保存済み展開説明です。新しい予想ではありません。'},
  finalAi:{warning:'テスト用の注意点。'},
  mainSheet:{tickets:[{ticket:'1-2-3',odds:10}],coverTickets:[{ticket:'1-3-2',odds:20}],flowFormations:[{notation:'1-4-56'}]},
  manshuSheet:{tickets:[{ticket:'4-1-2',odds:90},{ticket:'5-1-2',odds:150},{ticket:'6-1-2'}]},
  oddsByTicket:{'1-4-5':30,'1-4-6':40},
  practicalSelection:{tickets:[{ticket:'1-2-3'},{ticket:'2-1-3'}]},
  preRaceConditions:{sourceFetchedAt:'2026-10-07T03:00:00Z',dataAvailability:{exhibitionTime:6,officialCourses:6}}
};}
(async () => {
let prediction = fixture();
const before = JSON.stringify(prediction);
window.renderAll(prediction); flush();
window.ChappyFinalDisplayUserContract.apply();
window.ChappyBrightMobileLayout.organize(prediction);
const area = document.getElementById('resultArea');
const layout = area.querySelector('.v3-root');
assert(layout);
assert.deepEqual([...layout.children].map(x=>x.className),['chappy-bright-intro','chappy-final-buy-summary','chappy-practical-visible-panel','chappy-readable-evidence']);
assert.match(layout.querySelector('.chappy-bright-intro').textContent,/締切 12:30/);
assert.match(layout.querySelector('.chappy-bright-intro').textContent,/展示 6\/6艇/);
assert.deepEqual([...layout.querySelectorAll('.chappy-final-buy-group>.chappy-final-buy-label')],[]);
assert.deepEqual([...layout.querySelectorAll('.chappy-final-buy-group>summary>.chappy-final-buy-label')].map(x=>x.textContent),['本命','押さえ','流し（フォーメーション）','万舟']);
assert.equal(layout.querySelector('.chappy-readable-evidence').hasAttribute('open'),false);
assert.equal(layout.querySelectorAll('.chappy-readable-evidence .v3-entry-section').length,1);
assert.equal(layout.querySelectorAll('.v3-manshu-newspaper').length,1);
assert.match(layout.querySelector('.is-cover').textContent,/参考候補/);
assert.equal(layout.querySelector('.chappy-final-buy-total').textContent,'7点');
assert.equal(layout.querySelector('.is-manshu .chappy-final-buy-meta').textContent,'1点');
assert.match(layout.querySelector('.chappy-practical-visible-head').textContent,/厳選/);
assert(!layout.querySelector('.chappy-practical-visible-head').textContent.includes('実戦厳選'));
assert.equal(JSON.stringify(prediction),before,'presentation must not mutate source prediction');
const ui = window.ChappyFinalMobileUi;
function renderedSet(scope) {return new Set([...scope.querySelectorAll('.chappy-final-buy-formation')].flatMap(el=>window.ChappyTicketOddsVisibility.expandNotation(el.textContent)));}
function same(actual,expected,label) {assert.deepEqual([...actual].sort(),[...expected].sort(),label);}
same(renderedSet(layout.querySelector('.is-main')),['1-2-3'],'main source membership');
same(renderedSet(layout.querySelector('.is-cover')),['1-3-2','4-1-2','6-1-2'],'existing reference membership retained');
same(renderedSet(layout.querySelector('.is-flow')),['1-4-5','1-4-6'],'flow exact set retained');
same(renderedSet(layout.querySelector('.is-manshu')),['5-1-2'],'manshu exact set retained');
same(renderedSet(layout.querySelector('.chappy-practical-visible-panel')),['1-2-3','2-1-3'],'practical-only tickets retained');
for(let i=0;i<4;i++)window.ChappyBrightMobileLayout.organize(prediction);
assert.equal(layout.querySelectorAll('.chappy-bright-intro').length,1);
assert.equal(layout.querySelectorAll('.chappy-readable-evidence').length,1);
assert.equal(layout.querySelectorAll('.chappy-bright-manshu').length,1);
for (const key of ['skip-ai-panel','scenario-v6-panel']) {const extra=document.createElement('section');extra.className=key;area.prepend(extra);}
window.ChappyBrightMobileLayout.organize(prediction);
assert.equal(area.firstElementChild,layout,'optional diagnostic panels must not precede the race intro');
assert.equal(layout.querySelectorAll('.chappy-readable-evidence .skip-ai-panel,.chappy-readable-evidence .scenario-v6-panel').length,2);
// All boat badge backgrounds remain the original six colours, not theme decisions.
const badges=[...layout.querySelectorAll('.v3-entry-card-boat .v3-boat-badge')];
assert.deepEqual(badges.map(x=>x.style.background),['#ffffff','#111111','#e53935','#1e88e5','#fdd835','#43a047']);
const resultStatus=document.createElement('section');resultStatus.id='raceResultStatus';resultStatus.textContent='公式結果は確認中';area.appendChild(resultStatus);
window.ChappyBrightMobileLayout.organize(prediction);
for(let i=0;i<4;i++){await Promise.resolve();flush();}
assert.equal(frames.length,0,'practical plus result status must settle without perpetual reorder frames');
assert.equal(layout.querySelector('.chappy-practical-visible-panel').nextElementSibling,resultStatus);
assert.equal(resultStatus.nextElementSibling,layout.querySelector('.chappy-readable-evidence'));
// Repeated presentation callbacks preserve an already-open disclosure and its DOM identity.
const savedPanel=area.querySelector('.chappy-practical-visible-panel');
savedPanel.open=true;
window.ChappyPracticalVisiblePanel.render(prediction);
assert.equal(area.querySelector('.chappy-practical-visible-panel'),savedPanel);
assert.equal(savedPanel.open,true);
window.ChappyTicketOddsVisibility.enhance(prediction);
const savedManshu=area.querySelector('.v3-manshu-newspaper .chappy-scenario-manshu-board');
window.ChappyTicketOddsVisibility.enhance(prediction);
assert.equal(area.querySelector('.v3-manshu-newspaper .chappy-scenario-manshu-board'),savedManshu);
// High-odds-only and empty sources still have four category disclosures.
for (const manshu of [[{ticket:'5-1-2',odds:150}],[]]) {
  const only = {race:{place:'検証用の場',raceNo:9},manshuSheet:{tickets:manshu},practicalSelection:{tickets:[]}};
  window.renderAll(only);flush();window.ChappyFinalDisplayUserContract.apply();window.ChappyBrightMobileLayout.organize(only);
  assert.equal(area.querySelectorAll('.chappy-final-buy-group').length,4);
  assert.equal(area.querySelector('.chappy-final-buy-total').textContent,`${manshu.length}点`);
}
// Older delayed callbacks must not write a newer race's screen.
window.renderAll(fixture(2)); window.renderAll(fixture(3)); flush();
assert.match(area.querySelector('.chappy-bright-race-intro h2').textContent,/3R/);
assert.equal(area.querySelectorAll('.chappy-bright-intro').length,1);
// The mutation-observer microtask can run before a new render's timeout.
window.renderAll(fixture(10));
await Promise.resolve();
while(frames.length) frames.shift()();
assert(!area.querySelector('.chappy-bright-race-intro h2'), 'old prediction must not create the new DOM intro before its presentation event');
flush();await Promise.resolve();flush();
assert.match(area.querySelector('.chappy-bright-race-intro h2').textContent,/10R/);
// Known gaps remain explicit. A generated timestamp is not source freshness.
const unknown=window.ChappyBrightMobileLayout.summaryData({generatedAt:'2026-10-07T03:00:00Z'});
assert.equal(unknown.fetched,'確認中');assert.equal(unknown.deadline,'確認中');
assert.match(window.ChappyBrightMobileLayout.introHtml({raceFlow:{summary:'<img src=x onerror=alert(1)>'}}),/&lt;img/);
// Filtering only hides the existing cards and never removes any of the 24.
const grid=document.getElementById('officialVenueGrid');
for(let i=0;i<24;i++){const node=document.createElement('button');node.className='official-venue-button';node.dataset.session=['morning','day','night'][i%3];grid.appendChild(node);}
const filters=document.getElementById('chappy-session-filters');
filters.querySelector('[data-session-filter="night"]').click();
assert.equal([...grid.children].filter(x=>!x.hidden).length,8);assert.equal(grid.children.length,24);
filters.querySelector('[data-session-filter="all"]').click();assert.equal([...grid.children].filter(x=>!x.hidden).length,24);
let view='prediction';window.ChappyHomeDashboardV2={setView:value=>view=value};
area.querySelector('.chappy-back-races').click();assert.equal(view,'race','back link must use the existing view controller');
window.renderAll(fixture(4));area.innerHTML='<p>読み込み中</p>';flush();assert.equal(area.textContent,'読み込み中','old callbacks cannot repaint a newer loading state');
area.innerHTML='<section id="raceResultStatus">公式結果の反映待ち</section>';
window.dispatchEvent(new window.CustomEvent('chappy:view-changed',{detail:{view:'prediction'}}));
assert.match(area.querySelector('#raceResultStatus').textContent,/公式結果の反映待ち/,'official result status remains intact');
area.innerHTML='<div class="prediction-error">APIエラーの詳細</div>';
window.dispatchEvent(new window.CustomEvent('chappy:view-changed',{detail:{view:'prediction'}}));
assert.equal(area.textContent,'APIエラーの詳細','navigation retains specific errors without replacing them');
console.log('Bright mobile DOM: ordered layout, exact category ticket sets, immutable inputs, six boat colours, latest-render guard, safe text, 24-card filters passed');

process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
