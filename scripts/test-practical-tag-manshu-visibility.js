"use strict";
const assert=require("assert");

global.window=global;
let practicalSection=null;
let currentArea=null;
global.document={
  documentElement:{},
  body:{classList:{add(){}}},
  getElementById(id){return id==="resultArea"?currentArea:null;},
  querySelector(selector){return selector==="#resultArea .v3-practical-section"?practicalSection:null;},
  querySelectorAll(){return[];},
  createElement(){return{className:"",textContent:"",dataset:{}};}
};
global.MutationObserver=class{observe(){}};
global.requestAnimationFrame=fn=>{fn();return 1;};
global.setInterval=()=>1;
global.clearInterval=()=>{};
global.setTimeout=fn=>{fn();return 1;};
require("../js/final-display-owner-v2.js");
const api=global.ChappyFinalDisplayOwner;
assert(api,"final display owner API missing");

const prediction={
  manshuSheet:{tickets:[]},
  ticketSheets:{hole:[
    {ticket:"4-1-2",odds:150,reason:"4カド攻めからの万舟筋。"},
    {ticket:"5-1-4",odds:98.8,reason:"100倍未満。"}
  ]},
  practicalSelection:{status:"selected",tickets:[{ticket:"4-1-2"}]}
};
const rows=api.buildManshuRows(prediction);
assert.deepStrictEqual(rows.map(row=>row.ticket),["4-1-2"],
  "empty manshuSheet must not hide a 100x ticket that exists in ticketSheets.hole");
assert.strictEqual(rows[0].odds,150);
const manshuHtml=api.manshuHtml(prediction);
assert.match(manshuHtml,/4-1-2/);
assert.match(manshuHtml,/150\.0倍/);
assert.match(manshuHtml,/実戦厳選/,
  "selected manshu ticket must carry the practical tag in its original section");
assert.doesNotMatch(manshuHtml,/5-1-4/,
  "sub-100x ticket must not be promoted into the manshu display");

practicalSection={hidden:false,attrs:{},setAttribute(name,value){this.attrs[name]=value;}};
api.rewritePractical(prediction);
assert.strictEqual(practicalSection.hidden,true,
  "duplicated standalone practical section must be removed from visible UI");
assert.strictEqual(practicalSection.attrs["aria-hidden"],"true");

const badges=[];
const tagContainer={querySelector(){return badges[0]||null;},appendChild(node){badges.push(node);}};
const exactLine={
  querySelector(selector){
    if(selector===".chappy-final-buy-formation")return{textContent:"1-2-3"};
    if(selector===".chappy-final-buy-side")return tagContainer;
    return null;
  }
};
currentArea={
  querySelectorAll(selector){
    if(selector===".chappy-final-buy-summary .chappy-final-buy-line")return[exactLine];
    return[];
  }
};
api.decoratePracticalTags({practicalSelection:{status:"selected",tickets:[{ticket:"1-2-3"}]}});
assert.strictEqual(badges.length,1);
assert.strictEqual(badges[0].textContent,"実戦厳選",
  "original exact ticket row must receive the practical-selection tag");

console.log("practical tag + visible manshu regression: ok");
