"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync("js/final-display-user-contract.js","utf8");
const loader=fs.readFileSync("js/result-void-compat.js","utf8");
const index=fs.readFileSync("index.html","utf8");

assert.match(source,/textContent="流し"/,"approved label must be 流し");
assert.match(source,/textContent="万舟"/,"approved label must be 万舟");
assert.match(source,/\.v3-main-newspaper/,"duplicate legacy ticket section must be targeted");
assert.match(source,/compactTickets/,"legacy ticket visibility must depend on a rendered compact ticket row");
assert.doesNotMatch(source,/実戦厳選.*amount|amount.*実戦厳選/i,"UI contract must not add money display");
assert.match(loader,/final-display-user-contract\.js/);
assert.match(index,/result-void-compat\.js\?v=20260909-top30-rank-prefix-safe2/);

function node(label=""){
  return {textContent:label,hidden:false,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},querySelectorAll(){return[];}};
}
const flowLabel=node("フォーメーション");
const main=node();
const manshuTitle=node("穴");
const manshu={querySelectorAll(){return[manshuTitle];}};
const area={
  compactTicket:null,
  querySelector(selector){
    if(selector===".v3-manshu-newspaper")return manshu;
    if(selector===".chappy-final-buy-summary .chappy-final-buy-line")return this.compactTicket;
    return null;
  },
  querySelectorAll(selector){
    if(selector===".chappy-final-buy-group.is-flow .chappy-final-buy-label")return[flowLabel];
    if(selector===".v3-main-newspaper")return[main];
    return[];
  }
};
let observerCallback=null;
const head={appendChild(){}};
const document={
  documentElement:{},head,
  getElementById(id){if(id==="resultArea")return area;return null;},
  createElement(){return{id:"",textContent:""};}
};
const window={document,addEventListener(){},MutationObserver:class{constructor(cb){observerCallback=cb;}observe(){}}};
vm.runInNewContext(source,{window});
assert.equal(flowLabel.textContent,"流し");
assert.equal(manshuTitle.textContent,"万舟");
assert.equal(main.hidden,false,"legacy tickets must remain visible when compact tickets are missing");
assert.equal(main.attrs["aria-hidden"],undefined);
assert.equal(main.dataset.userContractHidden,undefined);
area.compactTicket=node("3-1-5");
observerCallback([]);
assert.equal(main.hidden,true,"legacy duplicate must be hidden after compact tickets render");
assert.equal(main.attrs["aria-hidden"],"true");
assert.equal(main.dataset.userContractHidden,"1");
area.compactTicket=null;
observerCallback([]);
assert.equal(main.hidden,false,"legacy tickets must be restored if the compact card disappears");
assert.equal(main.attrs["aria-hidden"],undefined);
assert.equal(main.dataset.userContractHidden,undefined);
flowLabel.textContent="フォーメーション";
observerCallback([]);
assert.equal(flowLabel.textContent,"流し","later owner repaint must be corrected again");
console.log("restored ticket UI contract: ok");
