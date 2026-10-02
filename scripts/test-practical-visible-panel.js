"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const source=fs.readFileSync("js/final-practical-visible-panel.js","utf8");
let inserted="";
const anchor={insertAdjacentHTML(_where,html){inserted=html;}};
const area={
  querySelectorAll(){return[];},
  querySelector(selector){return selector===".chappy-final-buy-summary"?anchor:null;},
  insertAdjacentHTML(_where,html){inserted=html;}
};
const createdStyles=[];
const window={
  document:{
    head:{appendChild(node){createdStyles.push(node);}},
    visibilityState:"visible",
    getElementById(id){if(id==="resultArea")return area;if(id==="chappy-practical-visible-panel-style")return null;return null;},
    createElement(){return{id:"",textContent:""};},
    addEventListener(){}
  },
  renderAll(pred){return pred;},
  setTimeout(fn){fn();return 1;},
  setInterval(){return 1;},
  clearInterval(){},
  ChappyFinalDisplayOwner:{
    practicalRows(){return[{notation:"1-2-3"},{notation:"4-1-2"}];}
  },
  ChappyFinalMobileUi:{
    buildOddsMap(){return new Map([["1-2-3",31.6],["4-1-2",153.2]]);}
  }
};
vm.runInNewContext(source,{window});
const api=window.ChappyPracticalVisiblePanel;
assert(api,"practical visible panel API missing");
inserted="";
api.render({});
assert.match(inserted,/実戦厳選/);
assert.match(inserted,/2点/);
assert.match(inserted,/1-2-3/);
assert.match(inserted,/4-1-2/);
assert.match(inserted,/31\.6倍/);
assert.match(inserted,/153\.2倍/);
assert.doesNotMatch(inserted,/円/);
assert.doesNotMatch(inserted,/購入金額/);
assert(createdStyles.length>=1,"panel style must be installed");

const originalQuery=area.querySelector;
area.querySelector=function(){return null;};
inserted="";
api.render({});
assert.match(inserted,/実戦厳選/,"panel must fall back to resultArea when buy summary is absent");
area.querySelector=originalQuery;

window.ChappyFinalDisplayOwner.practicalRows=()=>[];
inserted="";
api.render({});
assert.equal(inserted,"","no practical selection must not render an empty panel");

console.log("always-visible practical selection panel: ok");
