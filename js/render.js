/* =========================================================
  チャッピーボートレースAI
  render.js 完全版
  白カードUI・場所区切り明確版
========================================================= */

(function(){
"use strict";

/* ===============================
  基本設定
=============================== */

const BOAT_COLORS={
  1:{bg:"#fff",text:"#111",bd:"#cfcfcf"},
  2:{bg:"#111",text:"#fff",bd:"#111"},
  3:{bg:"#e53935",text:"#fff",bd:"#e53935"},
  4:{bg:"#1e88e5",text:"#fff",bd:"#1e88e5"},
  5:{bg:"#fdd835",text:"#111",bd:"#fdd835"},
  6:{bg:"#43a047",text:"#fff",bd:"#43a047"}
};

function $(id){return document.getElementById(id);}
function set(id,html){const e=$(id);if(e)e.innerHTML=html;}

function safe(v){
  if(v===null||v===undefined||v==="")return "-";
  if(Array.isArray(v))return v.map(safe).join(" / ");
  if(typeof v==="object"){
    return v.comment||v.summary||v.message||v.name||v.title||"-";
  }
  return String(v);
}

function asArray(v){
  if(Array.isArray(v))return v;
  if(!v||typeof v!=="object")return [];
  if(Array.isArray(v.items))return v.items;
  if(Array.isArray(v.list))return v.list;
  if(Array.isArray(v.runners))return v.runners;
  if(Array.isArray(v.entries))return v.entries;
  if(Array.isArray(v.candidates))return v.candidates;
  if(Array.isArray(v.bets))return v.bets;
  if(Array.isArray(v.tickets))return v.tickets;
  return [];
}

  return Object.entries(v).map(([key,val])=>{
    if(val&&typeof val==="object"&&!Array.isArray(val)){
      return {sectionKey:key,...val};
    }
    return {sectionKey:key,value:val};
  });
}

function card(title,body){
  return `
    <section class="cp-card">
      <div class="section-title">${title}</div>
      <div class="cp-card-body">${body||""}</div>
    </section>
  `;
}

function boatBadge(no){
  const n=Number(no);
  const c=BOAT_COLORS[n]||BOAT_COLORS[1];
  return `
    <span class="boat-badge"
      style="background:${c.bg};color:${c.text};border:1px solid ${c.bd};">
      ${safe(no)}
    </span>
  `;
}

function scoreClass(v){
  const n=Number(v)||0;
  if(n>=85)return "score-high";
  if(n>=70)return "score-mid";
  return "score-low";
}

function scoreBox(label,v){
  return `
    <div class="score-box">
      <span>${label}</span>
      <b class="${scoreClass(v)}">${safe(v)}</b>
    </div>
  `;
}

function signs(list,title){
  const arr=asArray(list);
  if(!arr.length)return "";

  return `
    <div class="sign-block">
      <div class="mini-title">${title}</div>
      <div class="sign-list">
        ${arr.slice(0,6).map(x=>{
          const s=safe(x.value||x.text||x.comment||x);
          const minus=s.startsWith("-")||s.startsWith("−");
          const mark=minus?"−":"+";
          const cls=minus?"minus":"plus";
          return `<span class="sign ${cls}">${mark} ${s.replace(/^(\+|-|−)\s*/,"")}</span>`;
        }).join("")}
      </div>
    </div>
  `;
}

function infoRows(obj){
  if(!obj||typeof obj!=="object")return `<div class="empty-text">データなし</div>`;
  return Object.entries(obj).map(([k,v])=>{
    if(v&&typeof v==="object")return "";
    return `<div class="info-row"><span>${k}</span><b>${safe(v)}</b></div>`;
  }).join("") || `<div class="empty-text">データなし</div>`;
}

function pickNo(x){
  return x.no||x.boatNo||x.waku||x.frame||x.boat||x.number||"";
}

function pickName(x){
  return x.name||x.playerName||x.racer||x.player||x.title||x.label||x.sectionKey||"";
}

function pickScore(x){
  return x.score||x.totalScore||x.aiScore||x.index||x.value||x.manshuScore||x.holeScore||"";
}

/* ===============================
  出走表
=============================== */

function renderEntries(entries){
  const list=asArray(entries);
  if(!list.length)return "";

  return card("🚤 出走表",`
    <div class="runner-grid">
      ${list.map(r=>{
        const no=pickNo(r);
        const name=pickName(r);
        const sc=pickScore(r);

        return `
          <div class="runner-card">
            <div class="runner-main">
              <div class="runner-left">
                ${no?boatBadge(no):""}
                <span class="runner-name">${safe(name)}</span>
              </div>
              ${sc!==""?scoreBox("総合",sc):""}
            </div>

            <div class="runner-mini">
              <span>ST <b>${safe(r.st||r.avgST||r.start)}</b></span>
              <span>展示 <b>${safe(r.exhibit||r.exhibition||r.tenji)}</b></span>
              <span>Motor <b>${safe(r.motor||r.motorNo||r.motorRate)}</b></span>
              <span>級別 <b>${safe(r.class||r.grade)}</b></span>
            </div>

            ${signs(r.buffs||r.plus||r.good,"プラス")}
            ${signs(r.debuffs||r.minus||r.bad,"マイナス")}

            ${r.comment||r.reason||r.memo?`
              <div class="sheet-comment">${safe(r.comment||r.reason||r.memo)}</div>
            `:""}
          </div>
        `;
      }).join("")}
    </div>
  `);
}

/* ===============================
  青シート
=============================== */

function renderMainSheet(mainSheet){
  if(!mainSheet||typeof mainSheet!=="object"){
    return card("🔵 本命シート",`<div class="empty-text">青シートデータなし</div>`);
  }

  const order=[
    ["◎ 本命","honmei"],
    ["○ 対抗","taikou"],
    ["▲ 穴","ana"],
    ["△ 押さえ","osae"]
  ];

  const list=order
    .map(([label,key])=>{
      const x=mainSheet[key];
      if(!x)return null;
      return {label,...x};
    })
    .filter(Boolean);

  return card("🔵 本命シート",`
    <div class="sheet-list">
      ${list.map(x=>{
        const no=pickNo(x);
        const name=pickName(x);
        const score=pickScore(x);

        return `
          <div class="sheet-row">
            <div class="sheet-head">
              <span class="sheet-mark">${x.label}</span>
              ${no?boatBadge(no):""}
              <span class="sheet-name">${safe(name)}</span>
            </div>

            ${score!==""?scoreBox("総合指数",score):""}

            ${signs(x.buffs||x.plus||x.good,"プラス要因")}
            ${signs(x.debuffs||x.minus||x.bad,"マイナス要因")}

            <div class="comment-label">AIコメント</div>
            <div class="sheet-comment">${safe(x.comment||x.reason||x.memo)}</div>
          </div>
        `;
      }).join("")}

      ${mainSheet.reason?`
        <div class="sheet-row">
          <div class="sheet-head">
            <span class="sheet-mark">理由</span>
          </div>
          <div class="sheet-comment">${safe(mainSheet.reason)}</div>
        </div>
      `:""}
    </div>
  `);
}

/* ===============================
  ピンクシート
=============================== */

function renderManshuSheet(manshuSheet){
  const list=asArray(manshuSheet);
  if(!list.length)return card("🌸 万舟シート",`<div class="empty-text">ピンクシートデータなし</div>`);

  return card("🌸 万舟シート",`
    <div class="sheet-list">
      ${list.map(x=>{
        const no=pickNo(x);
        const title=pickName(x)||"万舟候補";
        const score=pickScore(x);

        return `
          <div class="sheet-row pink-row">
            <div class="sheet-head">
              <span class="sheet-mark">💣</span>
              ${no?boatBadge(no):""}
              <span class="sheet-name">${safe(title)}</span>
            </div>

            ${score!==""?scoreBox("穴指数",score):""}

            ${signs(x.buffs||x.plus||x.good,"期待理由")}
            ${signs(x.debuffs||x.minus||x.bad,"注意点")}

            <div class="comment-label">AIコメント</div>
            <div class="sheet-comment">
              ${safe(x.comment||x.reason||x.memo||x.value)}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `);
}

/* ===============================
  フォーメーション
=============================== */

function renderFormation(formation){
  const blocks=asArray(formation);
  if(!blocks.length)return card("🎯 フォーメーション",`<div class="empty-text">フォーメーションデータなし</div>`);

  return card("🎯 フォーメーション",`
    <div class="formation-grid">
      ${blocks.map(block=>{
        const title=block.title||block.label||block.type||block.sectionKey||"買い目";
        const bets=asArray(block.bets||block.items||block.tickets||block.value||block);

        return `
          <div class="formation-block">
            <div class="formation-title">${safe(title)}</div>

            <div class="formation-bets">
              ${bets.map(b=>{
                if(typeof b==="string"){
                  return `<div class="bet-row"><b>${safe(b)}</b></div>`;
                }

                return `
                  <div class="bet-row">
                    <b>${safe(b.combo||b.bet||b.ticket||b.kumi||b.title||b.value)}</b>
                    ${b.odds?`<span>${safe(b.odds)}</span>`:""}
                    ${b.reason||b.comment?`<em>${safe(b.reason||b.comment)}</em>`:""}
                  </div>
                `;
              }).join("")}
            </div>

            ${block.comment||block.reason?`
              <div class="formation-comment">${safe(block.comment||block.reason)}</div>
            `:""}
          </div>
        `;
      }).join("")}
    </div>
  `);
}

/* ===============================
  レース情報
=============================== */

function renderRaceInfo(p){
  return card("📊 レース情報",`
    <div class="info-section">
      <div class="sub-title">天候</div>
      ${infoRows(p.weather)}
    </div>

    <div class="info-section">
      <div class="sub-title">水面</div>
      ${infoRows(p.venue)}
    </div>

    <div class="info-section">
      <div class="sub-title">新エンジン</div>
      ${infoRows(p.newEngine)}
    </div>
  `);
}

/* ===============================
  最終コメント
=============================== */

function renderFinalComment(c){
  if(typeof c==="string"){
    return card("📝 最終コメント",`<div class="comment-main">${safe(c)}</div>`);
  }

  c=c||{};

  return card("📝 最終コメント",`
    <div class="comment-main">${safe(c.summary||c.comment||c.message)}</div>

    <div class="comment-grid">
      <div>
        <span>展開</span>
        <b>${safe(c.raceFlow||c.flow||c.development)}</b>
      </div>
      <div>
        <span>狙い艇</span>
        <b>${safe(c.target||c.pick||c.hotBoat)}</b>
      </div>
      <div>
        <span>危険艇</span>
        <b>${safe(c.danger||c.dangerBoat)}</b>
      </div>
      <div>
        <span>買い方</span>
        <b>${safe(c.buy||c.strategy||c.buyPlan)}</b>
      </div>
    </div>

    ${c.caution?`<div class="comment-caution">${safe(c.caution)}</div>`:""}
  `);
}

/* ===============================
  renderAll
=============================== */

window.renderAll=function(data={},extra={}){
  const p=extra.prediction||{};

  const entries=
    p.runners||
    p.entries||
    p.entryList||
    data.runners||
    data.entries||
    data.entryList||
    [];

  set("weatherArea",renderRaceInfo(p));

  set("mainSheetArea",
    renderEntries(entries)+
    renderMainSheet(p.mainSheet)+
    renderManshuSheet(p.manshuSheet)+
    renderFormation(p.formation)
  );

  set("finalCommentArea",
    renderFinalComment(p.finalComment||p.finalAI)
  );
};

window.renderAllEmpty=function(){
  set("weatherArea",renderRaceInfo({}));
  set("mainSheetArea",
    renderMainSheet(null)+
    renderManshuSheet(null)+
    renderFormation(null)
  );
  set("finalCommentArea",renderFinalComment({summary:"-"}));
};

})();