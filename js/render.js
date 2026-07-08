/* =========================================================
  チャッピーボートレースAI
  render.js 完全版 prediction.js専用
========================================================= */

(function(){
"use strict";

const COLORS={
  1:{bg:"#fff",text:"#111",bd:"#ccc"},
  2:{bg:"#111",text:"#fff",bd:"#111"},
  3:{bg:"#e53935",text:"#fff",bd:"#e53935"},
  4:{bg:"#1e88e5",text:"#fff",bd:"#1e88e5"},
  5:{bg:"#fdd835",text:"#111",bd:"#fdd835"},
  6:{bg:"#43a047",text:"#fff",bd:"#43a047"}
};

function $(id){return document.getElementById(id);}
function set(id,html){const e=$(id); if(e)e.innerHTML=html;}
function safe(v){
  if(v===null||v===undefined||v==="")return "-";
  if(Array.isArray(v))return v.map(safe).join(" / ");
  if(typeof v==="object")return Object.values(v).map(safe).join(" / ");
  return String(v);
}
function arr(v){
  if(Array.isArray(v))return v;
  if(!v||typeof v!=="object")return [];
  if(Array.isArray(v.items))return v.items;
  if(Array.isArray(v.list))return v.list;
  if(Array.isArray(v.bets))return v.bets;
  if(Array.isArray(v.candidates))return v.candidates;
  return Object.entries(v).map(([key,val])=>{
    if(val&&typeof val==="object")return {title:key,...val};
    return {title:key,value:val};
  });
}
function card(title,body){
  return `<section class="cp-card"><h2 class="cp-card-title">${title}</h2><div class="cp-card-body">${body}</div></section>`;
}
function boat(no){
  const c=COLORS[Number(no)]||COLORS[1];
  return `<span class="boat-badge" style="background:${c.bg};color:${c.text};border:1px solid ${c.bd};">${safe(no)}</span>`;
}
function score(v,label="指数"){
  const n=Number(v)||0;
  const cls=n>=85?"score-high":n>=70?"score-mid":"score-low";
  return `<div class="score-box"><span>${label}</span><b class="${cls}">${safe(v)}</b></div>`;
}
function signs(v){
  const list=arr(v);
  if(!list.length)return "";
  return `<div class="signs">${list.slice(0,6).map(x=>{
    const s=safe(x);
    const minus=s.startsWith("-")||s.startsWith("−");
    return `<span class="sign ${minus?"minus":"plus"}">${minus?"−":"+"} ${s.replace(/^(\+|-|−)\s*/,"")}</span>`;
  }).join("")}</div>`;
}
function textBlock(obj){
  if(typeof obj==="string")return `<p>${obj}</p>`;
  if(!obj||typeof obj!=="object")return `<p>-</p>`;
  return Object.entries(obj).map(([k,v])=>{
    if(v&&typeof v==="object")return "";
    return `<div class="info-row"><span>${k}</span><b>${safe(v)}</b></div>`;
  }).join("");
}

/* ================= 青シート ================= */

function renderMain(main){
  const list=arr(main);
  if(!list.length)return card("青シート","青シートデータなし");

  return card("青シート",list.map(x=>{
    const no=x.no||x.boatNo||x.waku||x.frame||x.boat||"";
    const name=x.name||x.playerName||x.racer||x.title||x.label||"";
    const mark=x.mark||x.symbol||x.rank||"";
    const sc=x.score||x.totalScore||x.aiScore||x.index||x.value||"";

    return `<div class="sheet-row">
      <div class="sheet-head">
        <span class="sheet-mark">${safe(mark)}</span>
        ${no?boat(no):""}
        <span class="sheet-name">${safe(name)}</span>
      </div>
      ${sc!==""?score(sc,"総合"):""}
      ${signs(x.buffs||x.plus||x.good)}
      ${signs(x.debuffs||x.minus||x.bad)}
      <div class="sheet-comment">${safe(x.comment||x.reason||x.memo||x.value||"")}</div>
    </div>`;
  }).join(""));
}

/* ================= ピンクシート ================= */

function renderManshu(manshu){
  const list=arr(manshu);
  if(!list.length)return card("ピンクシート","ピンクシートデータなし");

  return card("ピンクシート",list.map(x=>{
    const no=x.no||x.boatNo||x.waku||x.frame||"";
    const title=x.title||x.label||x.name||"万舟候補";
    const sc=x.score||x.manshuScore||x.holeScore||x.index||x.value||"";

    return `<div class="sheet-row pink-row">
      <div class="sheet-head">
        <span class="sheet-mark">💣</span>
        ${no?boat(no):""}
        <span class="sheet-name">${safe(title)}</span>
      </div>
      ${sc!==""?score(sc,"穴指数"):""}
      ${signs(x.buffs||x.plus||x.good)}
      ${signs(x.debuffs||x.minus||x.bad)}
      <div class="sheet-comment">${safe(x.comment||x.reason||x.memo||"")}</div>
    </div>`;
  }).join(""));
}

/* ================= フォーメーション ================= */

function renderFormation(f){
  const list=arr(f);
  if(!list.length)return card("フォーメーション","フォーメーションデータなし");

  return card("フォーメーション",list.map(block=>{
    const title=block.title||block.label||block.type||"買い目";
    const bets=arr(block.bets||block.items||block.tickets||block.value||block);

    return `<div class="formation-block">
      <div class="formation-title">${safe(title)}</div>
      ${bets.map(b=>{
        if(typeof b==="string")return `<div class="bet-row"><b>${b}</b></div>`;
        return `<div class="bet-row">
          <b>${safe(b.combo||b.bet||b.ticket||b.kumi||b.title||b.value)}</b>
          ${b.odds?`<span>${safe(b.odds)}</span>`:""}
          ${b.comment||b.reason?`<em>${safe(b.comment||b.reason)}</em>`:""}
        </div>`;
      }).join("")}
    </div>`;
  }).join(""));
}

/* ================= レース情報 ================= */

function renderRaceInfo(p){
  return card("レース情報",`
    <div class="info-list">
      <div class="sub-title">天候情報</div>
      ${textBlock(p.weather)}
      <div class="sub-title">水面情報</div>
      ${textBlock(p.venue)}
      <div class="sub-title">エンジン情報</div>
      ${textBlock(p.newEngine)}
    </div>
  `);
}

/* ================= 最終コメント ================= */

function renderCommentBox(c){
  if(typeof c==="string")return card("最終コメント",`<div class="comment-main">${c}</div>`);
  c=c||{};
  return card("最終コメント",`
    <div class="comment-main">${safe(c.summary||c.comment||c.message)}</div>
    <div class="comment-grid">
      <div><span>展開</span><b>${safe(c.raceFlow||c.flow)}</b></div>
      <div><span>狙い艇</span><b>${safe(c.target||c.pick)}</b></div>
      <div><span>危険艇</span><b>${safe(c.danger)}</b></div>
      <div><span>買い方</span><b>${safe(c.buy||c.strategy)}</b></div>
    </div>
  `);
}

/* ================= renderAll ================= */

window.renderAll=function(data={},extra={}){
  const p=extra.prediction||{};

  set("mainSheetArea",
    renderMain(p.mainSheet)+
    renderManshu(p.manshuSheet)+
    renderFormation(p.formation)
  );

  set("weatherArea",renderRaceInfo(p));
  set("finalCommentArea",renderCommentBox(p.finalComment||p.finalAI));

};

window.renderAllEmpty=function(){
  set("mainSheetArea",renderMain(null)+renderFormation(null));
  set("weatherArea",renderRaceInfo({}));
  set("finalCommentArea",renderCommentBox({summary:"-"}));
};

})();