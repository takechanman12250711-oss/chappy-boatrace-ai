"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const window={};vm.runInNewContext(fs.readFileSync("js/final-mobile-ui.js","utf8"),{window});
const api=window.ChappyFinalMobileUi;
const sorted=v=>Array.from(v).sort();
function check(input){
 const expected=new Set(input.flatMap(api.expandFormationNotation));
 const groups=api.groupTickets(input);
 const actual=groups.flatMap(group=>api.expandFormationNotation(group.notation));
 assert.deepEqual(sorted(actual),sorted(expected),"grouping must preserve every exact ticket once");
 assert.equal(actual.length,new Set(actual).size,"groups must not overlap");
 for(const group of groups)assert.deepEqual(sorted(group.tickets),sorted(api.expandFormationNotation(group.notation)));
 return groups;
}
assert.equal(check(["3-1-5","3-2-5","3-1-6","3-2-6"])[0].notation,"3-12-56");
check(["1-2-3","1-2-3","1-2-34","1-3-4"]);
check(["1-2-3","1-3-4"]); // A rectangular approximation would invent extra tickets.
check(["12-345-全"]);
check(["1-23-全","1-2-3","1-23-45"]);
const universe=api.expandFormationNotation("全-全-全");
assert.equal(check(universe).reduce((sum,g)=>sum+g.tickets.length,0),120);
let seed=42;
for(let trial=0;trial<120;trial++)check(universe.filter(()=>{seed=(seed*1664525+1013904223)>>>0;return seed%5===0;}));
const prediction={mainSheet:{tickets:[{ticket:"3-1-5"},{ticket:"3-2-5"},{ticket:"3-1-6"},{ticket:"3-2-6"}],coverTickets:[{ticket:"3-1-5"},{ticket:"1-2-3"}],flowFormations:[{notation:"3-12-全"}]},practicalSelection:{tickets:[{ticket:"3-1-5"}]},oddsByTicket:{"3-1-5":15.2,"3-2-5":27}};
const before=JSON.stringify(prediction);
const entries=api.displayTicketGroups(prediction);
const exact=entries.flatMap(entry=>entry.groups.flatMap(group=>group.tickets));
assert.equal(exact.length,9);
assert.equal(new Set(exact).size,9,"main/cover/flow must not repeat tickets");
assert.equal(JSON.stringify(prediction),before,"presentation must not mutate source or practical selection");
const html=api.buildBuySummary(prediction);
assert.match(html,/<details class="chappy-final-buy-line chappy-ticket-fold"/);
assert.match(html,/3-12-56/);
assert.match(html,/15\.2倍/);
assert.match(html,/オッズ未取得/);
assert.doesNotMatch(html,/chappy-ticket-fold"[^>]*\bopen\b/);
assert.doesNotMatch(html,/chappy-final-buy-reason/);
// The later owner must not restore the overlapping legacy flow or practical fallback.
let touched=false;
const box={dataset:{ticketLayout:"grouped"},querySelector(){touched=true;return null;}};
const doc={documentElement:{},querySelector(){return box;},getElementById(){return{querySelector(){return box;}};}};
const ownerWindow={document:doc,setInterval(){return 1;},clearInterval(){}};
vm.runInNewContext(fs.readFileSync("js/final-display-owner-v2.js","utf8"),{window:ownerWindow});
ownerWindow.ChappyFinalDisplayOwner.ensureFormationGroup(prediction);
ownerWindow.ChappyFinalDisplayOwner.ensurePracticalFallback(prediction);
assert.equal(touched,false,"legacy owner must respect grouped display ownership");
// The final manshu renderer must deduplicate exact/formation sources and the main list.
const body={innerHTML:"",querySelectorAll(){return[];}};
const area={querySelector(){return{querySelector(){return body;}};},querySelectorAll(){return[];}};
const oddsWindow={document:{getElementById(id){return id==="resultArea"?area:{};},addEventListener(){}},setInterval(){},addEventListener(){},ChappyFinalMobileUi:api};
vm.runInNewContext(fs.readFileSync("js/final-ticket-odds-visibility.js","utf8"),{window:oddsWindow});
const manshuPrediction={...prediction,manshuSheet:{tickets:[{ticket:"3-1-5"},{ticket:"5-1-2"}]},lightManshuTicketBoard:{lines:[{notation:"5-1-23"}]}};
oddsWindow.ChappyTicketOddsVisibility.enhance(manshuPrediction);
assert.match(body.innerHTML,/5-1-23/);
assert.doesNotMatch(body.innerHTML,/3-1-5/);
assert.equal((body.innerHTML.match(/data-ticket="5-1-2"/g)||[]).length,1);
assert.equal((body.innerHTML.match(/data-ticket="5-1-3"/g)||[]).length,1);
console.log("lossless formations, cross-category deduplication, odds and source immutability: ok");
