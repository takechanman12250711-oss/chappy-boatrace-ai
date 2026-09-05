(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyResultVoidCompat = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function boatNoOf(item){const boatNo=Number(item?.boat??item?.boatNo??0);return Number.isInteger(boatNo)?boatNo:0;}
  function hasTrifecta(payload){return Boolean(String(payload?.trifecta?.combination||payload?.result||"").trim());}
  function isFalseOrLateStart(item){const marker=String(item?.marker||"").trim().toUpperCase();return marker==="F"||marker==="L"||item?.falseStart===true||item?.lateStart===true;}
  function hasAllSixBoats(starts){if(!Array.isArray(starts)||starts.length!==6)return false;const boats=starts.map(boatNoOf).sort((a,b)=>a-b);return boats.every((boatNo,index)=>boatNo===index+1);}
  function isVoidResult(payload){return Boolean(payload&&payload.resultAvailable===false&&payload.status==="void");}
  function isVoidRacePayload(payload){if(!payload||payload.resultAvailable!==false||hasTrifecta(payload)||!hasAllSixBoats(payload.starts))return false;return payload.starts.every(isFalseOrLateStart);}
  function normalize(payload){if(isVoidResult(payload)||!isVoidRacePayload(payload))return payload;return{...payload,status:"void",void:true,voidReason:"all-boats-f-l"};}
  return Object.freeze({boatNoOf,hasTrifecta,isFalseOrLateStart,hasAllSixBoats,isVoidResult,isVoidRacePayload,normalize});
});

(function loadFinalMobileUi(root){
  "use strict";
  if(!root||!root.document)return;
  const BUILD = "20260904-final-mobile-ui9";
  const COMPACT_BUILD="20260904-final-mobile-ui10";
  const STRUCTURE_BUILD="20260905-final-mobile-structure15-manshu";
  const TICKET_REASON_BUILD="20260905-ticket-reason3-unified";
  const MANSHU_STYLE_BUILD="20260905-manshu-formation1";
  function style(id,href){if(root.document.getElementById(id))return;const link=root.document.createElement("link");link.id=id;link.rel="stylesheet";link.href=href;root.document.head.appendChild(link);}
  function script(id,src,onload){if(root.document.getElementById(id)){onload?.();return;}const node=root.document.createElement("script");node.id=id;node.src=src;node.async=false;if(onload)node.addEventListener("load",onload,{once:true});root.document.head.appendChild(node);}
  function loadStructure(){style("chappy-final-mobile-structure11-style",`css/final-mobile-structure11.css?v=${STRUCTURE_BUILD}`);style("chappy-manshu-formation-style",`css/manshu-formation-fix.css?v=${MANSHU_STYLE_BUILD}`);script("chappy-final-mobile-structure11-script",`js/final-mobile-structure11.js?v=${STRUCTURE_BUILD}`);}
  function loadCompact(){style("chappy-final-compact-ui10-style",`css/final-compact-ui10.css?v=${COMPACT_BUILD}`);script("chappy-final-compact-ui10-script",`js/final-compact-ui10.js?v=${COMPACT_BUILD}`,loadStructure);}
  function loadTicketReason(){script("chappy-final-ticket-reason-fix",`js/final-ticket-reason-fix.js?v=${TICKET_REASON_BUILD}`,loadCompact);}
  style("chappy-final-mobile-ui-style",`css/final-mobile-ui.css?v=${BUILD}`);
  style("chappy-final-home-v2-photo-style",`css/final-home-v2-photo.css?v=${BUILD}`);
  style("chappy-final-prediction-photo-style",`css/final-prediction-photo.css?v=${BUILD}`);
  style("chappy-final-iphone-tuning-style",`css/final-iphone-tuning.css?v=${BUILD}`);
  style("chappy-final-reference-layout-style",`css/final-reference-layout.css?v=${BUILD}`);
  style("chappy-final-readability-fix-style",`css/final-readability-fix.css?v=${BUILD}`);
  if(root.ChappyFinalMobileUi)loadTicketReason();else script("chappy-final-mobile-ui-script",`js/final-mobile-ui.js?v=${BUILD}`,loadTicketReason);
})(typeof window!=="undefined"?window:null);
