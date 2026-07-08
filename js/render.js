/* =========================================================
  チャッピーボートレースAI
  render.js 完全版 v2 Part1/3

  prediction.js の構造に合わせた表示専用
========================================================= */

(function () {
"use strict";

/* ===============================
  艇カラー
=============================== */

const BOAT_COLORS = {
  1:{bg:"#ffffff",text:"#111",border:"#cfcfcf"},
  2:{bg:"#111111",text:"#fff",border:"#111"},
  3:{bg:"#e53935",text:"#fff",border:"#e53935"},
  4:{bg:"#1e88e5",text:"#fff",border:"#1e88e5"},
  5:{bg:"#fdd835",text:"#111",border:"#fdd835"},
  6:{bg:"#43a047",text:"#fff",border:"#43a047"}
};

/* ===============================
  共通
=============================== */

function el(id){
  return document.getElementById(id);
}

function set(id,html){
  const target = el(id);
  if(target) target.innerHTML = html;
}

function safe(v){
  if(v === null || v === undefined || v === "") return "-";
  if(typeof v === "object"){
    if(Array.isArray(v)) return v.map(safe).join(" / ");
    return Object.entries(v).map(([k,val])=>`${k}:${safe(val)}`).join(" / ");
  }
  return String(v);
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function scoreClass(v){
  const n = num(v);
  if(n >= 85) return "score-high";
  if(n >= 70) return "score-mid";
  return "score-low";
}

function card(title,body){
  return `
    <div class="cp-card">
      <div class="cp-card-title">${title}</div>
      <div class="cp-card-body">${body || ""}</div>
    </div>
  `;
}

function boatBadge(no){
  const n = Number(no);
  const c = BOAT_COLORS[n] || BOAT_COLORS[1];
  return `
    <span class="boat-badge"
      style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">
      ${safe(no)}
    </span>
  `;
}

function signs(list){
  if(!Array.isArray(list)) list = [];
  if(list.length === 0) return `<span class="sign muted">なし</span>`;

  return list.slice(0,5).map(x=>{
    const s = safe(x);
    const minus = s.startsWith("-") || s.startsWith("−");
    const text = s.replace(/^(\+|-|−)\s*/,"");
    return `<span class="sign ${minus ? "minus":"plus"}">${minus ? "−":"+"} ${text}</span>`;
  }).join("");
}

function listFromAny(data){
  if(Array.isArray(data)) return data;
  if(!data || typeof data !== "object") return [];
  if(Array.isArray(data.items)) return data.items;
  if(Array.isArray(data.list)) return data.list;
  if(Array.isArray(data.entries)) return data.entries;
  if(Array.isArray(data.runners)) return data.runners;
  if(Array.isArray(data.candidates)) return data.candidates;
  return Object.values(data).filter(v=>v && typeof v === "object");
}

function titleValueRows(obj){
  if(!obj || typeof obj !== "object") return `<div class="empty-text">データなし</div>`;

  return Object.entries(obj).map(([k,v])=>{
    if(typeof v === "object") return "";
    return `
      <div class="info-row">
        <span>${k}</span>
        <b>${safe(v)}</b>
      </div>
    `;
  }).join("");
}
/* ===============================
  選手カード
=============================== */

function renderEntries(entries){
  const runners = listFromAny(entries);

  if(runners.length === 0){
    return card("出走表", `<div class="empty-text">出走表データなし</div>`);
  }

  const html = runners.map(r=>{
    const no = r.no || r.boatNo || r.waku || r.frame || r.number || "-";
    const name = r.name || r.playerName || r.racer || r.player || "-";
    const score = r.score || r.totalScore || r.aiScore || r.index || 0;

    return `
      <div class="runner-card">
        <div class="runner-main">
          <div class="runner-left">
            ${boatBadge(no)}
            <span class="runner-name">${safe(name)}</span>
          </div>
          <div class="runner-score">
            <span>総合</span>
            <b class="${scoreClass(score)}">${safe(score)}</b>
          </div>
        </div>

        <div class="runner-mini">
          <span>ST <b>${safe(r.st || r.avgST || r.start)}</b></span>
          <span>展示 <b>${safe(r.exhibit || r.exhibition || r.tenji)}</b></span>
          <span>Motor <b>${safe(r.motor || r.motorNo || r.motorRate)}</b></span>
        </div>

        <div class="runner-signs">
          ${signs(r.buffs || r.plus || [])}
          ${signs(r.debuffs || r.minus || [])}
        </div>

        ${r.comment ? `<div class="runner-comment">${safe(r.comment)}</div>` : ""}
      </div>
    `;
  }).join("");

  return card("出走表", `<div class="runner-grid">${html}</div>`);
}

/* ===============================
  青シート
=============================== */

function renderMainSheetBox(mainSheet){
  const list = listFromAny(mainSheet);

  if(list.length === 0){
    return card("青シート", `<div class="empty-text">青シートデータなし</div>`);
  }

  const html = list.map(x=>{
    const no = x.no || x.boatNo || x.waku || x.frame || "";
    const name = x.name || x.playerName || x.racer || x.title || "";
    const mark = x.mark || x.rank || x.label || "";
    const score = x.score || x.totalScore || x.aiScore || x.index || "";

    return `
      <div class="sheet-row">
        <div class="sheet-head">
          <span class="sheet-mark">${safe(mark)}</span>
          ${no ? boatBadge(no) : ""}
          <span class="sheet-name">${safe(name)}</span>
        </div>

        <div class="sheet-score">
          <span>総合</span>
          <b class="${scoreClass(score)}">${safe(score)}</b>
        </div>

        <div class="sheet-signs">
          ${signs(x.buffs || x.plus || [])}
          ${signs(x.debuffs || x.minus || [])}
        </div>

        ${x.comment ? `<div class="sheet-comment">${safe(x.comment)}</div>` : ""}
      </div>
    `;
  }).join("");

  return card("青シート", `<div class="sheet-list blue-sheet">${html}</div>`);
}

/* ===============================
  ピンクシート
=============================== */

function renderManshuSheetBox(manshuSheet){
  const list = listFromAny(manshuSheet);

  if(list.length === 0){
    return card("ピンクシート", `<div class="empty-text">ピンクシートデータなし</div>`);
  }

  const html = list.map(x=>{
    const no = x.no || x.boatNo || x.waku || x.frame || "";
    const title = x.title || x.label || x.name || "万舟候補";
    const score = x.score || x.manshuScore || x.holeScore || x.index || "";

    return `
      <div class="sheet-row pink-row">
        <div class="sheet-head">
          <span class="sheet-mark">💣</span>
          ${no ? boatBadge(no) : ""}
          <span class="sheet-name">${safe(title)}</span>
        </div>

        <div class="sheet-score">
          <span>穴指数</span>
          <b class="${scoreClass(score)}">${safe(score)}</b>
        </div>

        <div class="sheet-signs">
          ${signs(x.buffs || x.plus || [])}
          ${signs(x.debuffs || x.minus || [])}
        </div>

        ${x.comment ? `<div class="sheet-comment">${safe(x.comment)}</div>` : ""}
      </div>
    `;
  }).join("");

  return card("ピンクシート", `<div class="sheet-list pink-sheet">${html}</div>`);
}
/* ===============================
  フォーメーション
=============================== */

function renderFormationBox(formation){
  const list = listFromAny(formation);

  if(list.length === 0){
    return card("フォーメーション", `<div class="empty-text">フォーメーションデータなし</div>`);
  }

  const html = list.map(block=>{
    const title = block.title || block.label || block.type || "買い目";
    const bets = listFromAny(block.bets || block.items || block.tickets || block);

    const betHtml = bets.map(b=>{
      if(typeof b === "string"){
        return `<div class="bet-row"><b>${safe(b)}</b></div>`;
      }

      return `
        <div class="bet-row">
          <b>${safe(b.combo || b.bet || b.ticket || b.kumi || "-")}</b>
          ${b.odds ? `<span>${safe(b.odds)}</span>` : ""}
          ${b.comment || b.reason ? `<em>${safe(b.comment || b.reason)}</em>` : ""}
        </div>
      `;
    }).join("");

    return `
      <div class="formation-block">
        <div class="formation-title">${safe(title)}</div>
        <div class="formation-bets">
          ${betHtml || `<div class="empty-text">買い目なし</div>`}
        </div>
        ${block.comment ? `<div class="formation-comment">${safe(block.comment)}</div>` : ""}
      </div>
    `;
  }).join("");

  return card("フォーメーション", `<div class="formation-grid">${html}</div>`);
}

/* ===============================
  最終コメント
=============================== */

function renderFinalCommentBox(finalComment, finalAI){
  const c = finalAI || finalComment || {};

  if(typeof c === "string"){
    return card("最終コメント", `<div class="comment-main">${safe(c)}</div>`);
  }

  return card("最終コメント", `
    <div class="comment-box">
      <div class="comment-main">${safe(c.summary || c.comment || c.message || "-")}</div>

      <div class="comment-grid">
        <div>
          <span>展開</span>
          <b>${safe(c.raceFlow || c.flow || c.development)}</b>
        </div>
        <div>
          <span>狙い艇</span>
          <b>${safe(c.target || c.pick || c.hotBoat)}</b>
        </div>
        <div>
          <span>危険艇</span>
          <b>${safe(c.danger || c.dangerBoat)}</b>
        </div>
        <div>
          <span>買い方</span>
          <b>${safe(c.buy || c.strategy || c.buyPlan)}</b>
        </div>
      </div>

      ${c.caution ? `<div class="comment-caution">${safe(c.caution)}</div>` : ""}
    </div>
  `);
}

/* ===============================
  レース情報
=============================== */

function renderRaceInfoBox(prediction){
  return card("レース情報", `
    <div class="info-list">
      <div class="sub-title">天候情報</div>
      ${titleValueRows(prediction.weather)}

      <div class="sub-title">水面情報</div>
      ${titleValueRows(prediction.venue)}
    </div>
  `);
}

/* ===============================
  renderAll 本体
=============================== */

window.renderAll = function(data = {}, extra = {}) {

  const prediction = extra.prediction || {};

  const htmlMain =
    renderMainSheetBox(prediction.mainSheet) +
    renderManshuSheetBox(prediction.manshuSheet) +
    renderFormationBox(prediction.formation);

  set("mainSheetArea", htmlMain);

  set("finalCommentArea",
    renderFinalCommentBox(prediction.finalComment, prediction.finalAI)
  );

  set("weatherArea",
    renderRaceInfoBox(prediction)
  );

};

/* ===============================
  初期化
=============================== */

window.renderAllEmpty = function() {
  set("mainSheetArea", renderMainSheetBox(null));
  set("finalCommentArea", renderFinalCommentBox({summary:"-"}));
  set("weatherArea", renderRaceInfoBox({}));
};

})();