/* =========================================================
   チャッピーボートレースAI
   render.js 完全版 Part1/6

   役割
   ・画面描画専用
   ・白カードUI
   ・表示レイアウト生成
========================================================= */

(function () {

"use strict";

/*==================================================
  艇カラー
==================================================*/

const BOAT_COLORS = {
    1:{bg:"#ffffff",text:"#111",border:"#d9d9d9"},
    2:{bg:"#111111",text:"#ffffff",border:"#111111"},
    3:{bg:"#e53935",text:"#ffffff",border:"#e53935"},
    4:{bg:"#1e88e5",text:"#ffffff",border:"#1e88e5"},
    5:{bg:"#fdd835",text:"#111111",border:"#fdd835"},
    6:{bg:"#43a047",text:"#ffffff",border:"#43a047"}
};

/*==================================================
  共通
==================================================*/

function $(id){
    return document.getElementById(id);
}

function clear(id){

    const el=$(id);

    if(el) el.innerHTML="";

}

function set(id,html){

    const el=$(id);

    if(el) el.innerHTML=html;

}

/*==================================================
  白カード
==================================================*/

function card(title,body){

return `

<div class="cp-card">

<div class="cp-card-title">

${title}

</div>

<div class="cp-card-body">

${body}

</div>

</div>

`;

}

/*==================================================
  レース一覧
==================================================*/

window.renderRaceList=function(races=[]){

let html="";

races.forEach(r=>{

html+=`

<div class="race-button">

${r}

</div>

`;

});

set("raceListArea",html);

};

/*==================================================
  天候
==================================================*/

window.renderWeather=function(weather={}){

set("weatherArea",

card("天候情報",`

<div class="weather-grid">

<div>風速</div>
<div>${weather.wind ?? "-"}</div>

<div>風向</div>
<div>${weather.direction ?? "-"}</div>

<div>波高</div>
<div>${weather.wave ?? "-"}</div>

<div>気温</div>
<div>${weather.temp ?? "-"}</div>

</div>

`));

};

/*==================================================
  場情報
==================================================*/

window.renderVenue=function(data={}){

set("venueArea",

card("水面情報",`

<div class="venue-grid">

<div>場</div>

<div>${data.place ?? "-"}</div>

<div>特徴</div>

<div>${data.comment ?? "-"}</div>

</div>

`));

};

/*==================================================
  プレースホルダー
==================================================*/

window.renderEntryArea=function(){

set("entryArea",

card("出走表",""));

};

window.renderMaterialArea=function(){

set("materialArea",

card("モーター・展示",""));

};

window.renderMainSheet=function(){

set("mainSheetArea",

card("青シート",""));

};

window.renderPinkSheet=function(){

set("pinkSheetArea",

card("ピンクシート",""));

};

window.renderFormation=function(){

set("formationArea",

card("フォーメーション",""));

};

window.renderComment=function(){

set("finalCommentArea",

card("AIコメント",""));

};
/*==================================================
  Part2/6
  選手カード
==================================================*/

function boatBadge(no){

    const c=BOAT_COLORS[no] || BOAT_COLORS[1];

    return `
    <span class="boat-badge"
          style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">
        ${no}
    </span>
    `;

}

function scoreClass(score){

    const n=Number(score)||0;

    if(n>=85) return "score-high";
    if(n>=70) return "score-mid";
    return "score-low";

}

function shortValue(v){

    if(v===undefined || v===null || v==="") return "-";
    return v;

}

function renderSigns(list=[]){

    if(!Array.isArray(list) || list.length===0) return `<span class="sign muted">なし</span>`;

    return list.slice(0,4).map(x=>{

        const text=String(x).replace(/^(\+|−|-)\s*/,"");

        const mark=String(x).trim().startsWith("-") || String(x).trim().startsWith("−")
            ? "−"
            : "+";

        return `<span class="sign ${mark==="+" ? "plus":"minus"}">${mark} ${text}</span>`;

    }).join("");

}

function normalizeRunner(r={}){

    return {
        no:r.no ?? r.boatNo ?? r.waku ?? r.frame ?? "-",
        name:r.name ?? r.playerName ?? r.racer ?? "-",
        score:r.score ?? r.totalScore ?? r.aiScore ?? 0,
        st:r.st ?? r.avgST ?? r.start ?? "-",
        exhibit:r.exhibit ?? r.exhibition ?? r.exhibitionTime ?? r.tenji ?? "-",
        motor:r.motor ?? r.motorRate ?? r.motorNo ?? "-",
        buffs:r.buffs ?? r.buff ?? r.plus ?? [],
        debuffs:r.debuffs ?? r.debuff ?? r.minus ?? [],
        comment:r.comment ?? r.shortComment ?? ""
    };

}

window.renderEntryArea=function(runners=[]){

    if(!Array.isArray(runners) || runners.length===0){

        set("entryArea",card("出走表",`<div class="empty-text">出走表データなし</div>`));
        return;

    }

    const html=runners.map(raw=>{

        const r=normalizeRunner(raw);

        return `
        <div class="runner-card">

            <div class="runner-main">

                <div class="runner-left">
                    ${boatBadge(r.no)}
                    <span class="runner-name">${r.name}</span>
                </div>

                <div class="runner-score">
                    <span class="score-label">総合</span>
                    <span class="score-number ${scoreClass(r.score)}">${r.score}</span>
                </div>

            </div>

            <div class="runner-mini">

                <span>ST <b>${shortValue(r.st)}</b></span>
                <span>展示 <b>${shortValue(r.exhibit)}</b></span>
                <span>Motor <b>${shortValue(r.motor)}</b></span>

            </div>

            <div class="runner-signs">
                ${renderSigns(r.buffs)}
                ${renderSigns(r.debuffs)}
            </div>

            ${r.comment ? `<div class="runner-comment">${r.comment}</div>` : ""}

        </div>
        `;

    }).join("");

    set("entryArea",card("出走表",`<div class="runner-grid">${html}</div>`));

};
/*==================================================
  Part3/6
  青シート
==================================================*/

function markLabel(mark){

    const map={
        honmei:"◎",
        taikou:"○",
        ana:"▲",
        osaえ:"△",
        osae:"△",
        danger:"危"
    };

    return map[mark] ?? mark ?? "";

}

function normalizeBlueItem(x={}){

    return {
        mark:x.mark ?? x.rank ?? "",
        no:x.no ?? x.boatNo ?? x.waku ?? "-",
        name:x.name ?? x.playerName ?? "-",
        score:x.score ?? x.totalScore ?? x.aiScore ?? 0,
        buffs:x.buffs ?? x.buff ?? x.plus ?? [],
        debuffs:x.debuffs ?? x.debuff ?? x.minus ?? [],
        comment:x.comment ?? x.shortComment ?? ""
    };

}

window.renderMainSheet=function(items=[]){

    if(!Array.isArray(items) || items.length===0){

        set("mainSheetArea",card("青シート",`<div class="empty-text">青シートデータなし</div>`));
        return;

    }

    const html=items.map(raw=>{

        const x=normalizeBlueItem(raw);

        return `
        <div class="sheet-row">

            <div class="sheet-head">
                <span class="sheet-mark">${markLabel(x.mark)}</span>
                ${boatBadge(x.no)}
                <span class="sheet-name">${x.name}</span>
            </div>

            <div class="sheet-score">
                <span>総合</span>
                <b class="${scoreClass(x.score)}">${x.score}</b>
            </div>

            <div class="sheet-signs">
                ${renderSigns(x.buffs)}
                ${renderSigns(x.debuffs)}
            </div>

            ${x.comment ? `<div class="sheet-comment">${x.comment}</div>` : ""}

        </div>
        `;

    }).join("");

    set("mainSheetArea",card("青シート",`<div class="sheet-list blue-sheet">${html}</div>`));

};
/*==================================================
  Part4/6
  ピンクシート
==================================================*/

function normalizePinkItem(x={}){

    return {
        title:x.title ?? x.label ?? x.type ?? "万舟候補",
        no:x.no ?? x.boatNo ?? x.waku ?? "",
        name:x.name ?? x.playerName ?? "",
        score:x.score ?? x.manshuScore ?? x.holeScore ?? 0,
        odds:x.odds ?? x.expectedOdds ?? "",
        buffs:x.buffs ?? x.buff ?? x.plus ?? [],
        debuffs:x.debuffs ?? x.debuff ?? x.minus ?? [],
        comment:x.comment ?? x.shortComment ?? ""
    };

}

function normalizeMissingItem(x={}){

    return {
        rank:x.rank ?? "",
        combo:x.combo ?? x.bet ?? x.kumi ?? "-",
        odds:x.odds ?? x.currentOdds ?? "-"
    };

}

window.renderPinkSheet=function(data={}){

    const candidates=Array.isArray(data) ? data : (data.candidates ?? data.items ?? []);
    const missing=Array.isArray(data.missing) ? data.missing : (data.missingTop30 ?? []);

    let candidateHtml="";

    if(candidates.length===0){

        candidateHtml=`<div class="empty-text">万舟候補データなし</div>`;

    }else{

        candidateHtml=candidates.map(raw=>{

            const x=normalizePinkItem(raw);

            return `
            <div class="sheet-row pink-row">

                <div class="sheet-head">
                    <span class="sheet-mark">💣</span>
                    ${x.no ? boatBadge(x.no) : ""}
                    <span class="sheet-name">${x.title}${x.name ? " / " + x.name : ""}</span>
                </div>

                <div class="sheet-score">
                    <span>穴指数</span>
                    <b class="${scoreClass(x.score)}">${x.score}</b>
                    ${x.odds ? `<span class="odds-mini">想定 ${x.odds}</span>` : ""}
                </div>

                <div class="sheet-signs">
                    ${renderSigns(x.buffs)}
                    ${renderSigns(x.debuffs)}
                </div>

                ${x.comment ? `<div class="sheet-comment">${x.comment}</div>` : ""}

            </div>
            `;

        }).join("");

    }

    const missingHtml=missing.slice(0,30).map(raw=>{

        const m=normalizeMissingItem(raw);

        return `
        <div class="missing-row">
            <span>${m.rank ? m.rank + "." : ""}</span>
            <b>${m.combo}</b>
            <em>${m.odds}</em>
        </div>
        `;

    }).join("");

    set("pinkSheetArea",card("ピンクシート",`

        <div class="sheet-list pink-sheet">
            ${candidateHtml}
        </div>

        <div class="missing-box">
            <div class="sub-title">出てない目TOP30</div>
            ${missingHtml || `<div class="empty-text">出てない目データなし</div>`}
        </div>

    `));

};
/*==================================================
  Part5/6
  フォーメーション
==================================================*/

function normalizeFormationBlock(x={}){

    return {
        title:x.title ?? x.label ?? "買い目",
        type:x.type ?? "",
        bets:x.bets ?? x.items ?? x.tickets ?? [],
        comment:x.comment ?? x.memo ?? ""
    };

}

function normalizeBet(x){

    if(typeof x==="string"){
        return {
            combo:x,
            odds:"",
            point:""
        };
    }

    return {
        combo:x.combo ?? x.bet ?? x.ticket ?? x.kumi ?? "-",
        odds:x.odds ?? x.currentOdds ?? x.expectedOdds ?? "",
        point:x.point ?? x.reason ?? x.comment ?? ""
    };

}

function formationClass(type,title){

    const t=String(type || title || "");

    if(t.includes("万舟") || t.includes("穴")) return "formation-hole";
    if(t.includes("押") || t.includes("安全")) return "formation-safe";
    return "formation-main";

}

window.renderFormation=function(data=[]){

    const blocks=Array.isArray(data) ? data : (data.blocks ?? data.formations ?? []);

    if(!Array.isArray(blocks) || blocks.length===0){

        set("formationArea",card("フォーメーション",`<div class="empty-text">フォーメーションデータなし</div>`));
        return;

    }

    const html=blocks.map(raw=>{

        const b=normalizeFormationBlock(raw);
        const cls=formationClass(b.type,b.title);

        const bets=b.bets.map(normalizeBet).map(bet=>`

            <div class="bet-row">
                <b>${bet.combo}</b>
                ${bet.odds ? `<span>${bet.odds}</span>` : ""}
                ${bet.point ? `<em>${bet.point}</em>` : ""}
            </div>

        `).join("");

        return `
        <div class="formation-block ${cls}">

            <div class="formation-title">${b.title}</div>

            <div class="formation-bets">
                ${bets || `<div class="empty-text">買い目なし</div>`}
            </div>

            ${b.comment ? `<div class="formation-comment">${b.comment}</div>` : ""}

        </div>
        `;

    }).join("");

    set("formationArea",card("フォーメーション",`

        <div class="formation-grid">
            ${html}
        </div>

    `));

};
/*==================================================
  Part6/6
  最終コメント
==================================================*/

function normalizeCommentData(data={}){

    return {
        summary:data.summary ?? data.finalComment ?? data.comment ?? "",
        raceFlow:data.raceFlow ?? data.flow ?? data.development ?? "",
        target:data.target ?? data.pick ?? data.hotBoat ?? "",
        danger:data.danger ?? data.dangerBoat ?? "",
        buy:data.buy ?? data.buyPlan ?? data.strategy ?? "",
        caution:data.caution ?? data.warning ?? ""
    };

}

window.renderComment=function(data={}){

    const c=normalizeCommentData(data);

    set("finalCommentArea",card("AIコメント",`

        <div class="comment-box">

            ${c.summary ? `
            <div class="comment-main">
                ${c.summary}
            </div>
            ` : ""}

            <div class="comment-grid">

                <div>
                    <span>展開</span>
                    <b>${c.raceFlow || "-"}</b>
                </div>

                <div>
                    <span>狙い艇</span>
                    <b>${c.target || "-"}</b>
                </div>

                <div>
                    <span>危険艇</span>
                    <b>${c.danger || "-"}</b>
                </div>

                <div>
                    <span>買い方</span>
                    <b>${c.buy || "-"}</b>
                </div>

            </div>

            ${c.caution ? `
            <div class="comment-caution">
                ${c.caution}
            </div>
            ` : ""}

        </div>

    `));

};

/*==================================================
  renderAll 本体
==================================================*/

window.renderAll = function(data = {}, extra = {}) {

    const prediction = extra.prediction || {};
    const ai = extra.ai || {};

    const runners =
        prediction.runners ||
        prediction.entries ||
        prediction.entryList ||
        data.runners ||
        data.entries ||
        data.entryList ||
        [];

    const blueSheet =
        prediction.blueSheet ||
        prediction.mainSheet ||
        prediction.normalSheet ||
        prediction.items ||
        [];

    const pinkSheet =
        prediction.pinkSheet ||
        prediction.manshuSheet ||
        prediction.longshotSheet ||
        {};

    const formation =
        prediction.formation ||
        prediction.formations ||
        prediction.buyFormations ||
        prediction.tickets ||
        [];

    renderEntryArea(runners);
    renderMainSheet(blueSheet);
    renderPinkSheet(pinkSheet);
    renderFormation(formation);
    renderComment({
        summary: ai.summary || prediction.comment || prediction.finalComment || "",
        raceFlow: ai.raceFlow || prediction.raceFlow || "",
        target: ai.target || "",
        danger: ai.danger || "",
        buy: ai.buy || ""
    });

};

/*==================================================
  初期化
==================================================*/

window.renderAllEmpty = function() {

    renderEntryArea([]);
    renderMaterialArea();
    renderMainSheet([]);
    renderPinkSheet({});
    renderFormation([]);
    renderComment({});

};

})();