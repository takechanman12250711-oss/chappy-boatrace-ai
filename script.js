// script.js v8.1
// 根拠型「この選手の強み」版

const API_BASE = "/api/race";

const PLACE_CODES = {
  桐生:"01", 戸田:"02", 江戸川:"03", 平和島:"04",
  多摩川:"05", 浜名湖:"06", 蒲郡:"07", 常滑:"08",
  津:"09", 三国:"10", びわこ:"11", 住之江:"12",
  尼崎:"13", 鳴門:"14", 丸亀:"15", 児島:"16",
  宮島:"17", 徳山:"18", 下関:"19", 若松:"20",
  芦屋:"21", 福岡:"22", 唐津:"23", 大村:"24"
};

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#fetchRaceBtn")?.addEventListener("click", runPrediction);
});

async function runPrediction() {
  const place = val("#placeSelect");
  const rno = String(val("#raceSelect")).replace("R", "");
  const dateRaw = val("#dateInput");
  const date = dateRaw ? dateRaw.replaceAll("-", "").replaceAll("/", "") : todayYmd();
  const jcd = PLACE_CODES[place] || place;

  setStatus("取得中…");
  clearAreas();
  setHTML("#raceListArea", `<div class="loading">読み込み中…🚤</div>`);

  try {
    const safeDate = date || getTodayYmd();
const res = await fetch(`${API_BASE}?jcd=${jcd}&rno=${rno}&date=${safeDate}`);
    const data = await res.json();

const oddsRes = await fetch(`/api/odds?jcd=${jcd}&rno=${rno}&date=${safeDate}`);
const oddsData = await oddsRes.json();
data.odds = oddsData.ok ? oddsData.odds : [];
    if (!data.ok || !Array.isArray(data.boats) || data.boats.length === 0) {
      showError(data.message || data.error || "出走表データが取得できません");
      setStatus("取得失敗");
      return;
    }

    renderAll(data);
    setStatus("取得成功");
  } catch (e) {
    showError("通信エラー：" + e.message);
    setStatus("通信エラー");
  }
}

function renderAll(data) {
  const boats = data.boats || [];
  const p = data.prediction || {};
  const venue = data.venue || {};
  const weather = data.weather || {};
const odds = data.odds || [];
  setHTML("#raceListArea", renderEntryTable(boats));
  setHTML("#engineArea", renderCondition(venue, weather, boats));
  setHTML("#mainSheetArea", renderMainSheet(boats, p));
  setHTML("#formationArea", renderFormations(p));
  setHTML("#manshuSheetArea", renderManshuSheet(boats, p));
  setHTML("#alertArea", renderAlerts(p));
  setHTML("#finalCommentArea", renderFinalComment(p, venue, weather));
  setHTML("#oddsArea", renderOdds(odds));
}

function renderEntryTable(boats) {
  return `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>艇</th><th>選手</th><th>級</th><th>ST</th><th>展示</th><th>強み</th>
          </tr>
        </thead>
        <tbody>
          ${boats.map(b => `
            <tr>
              <td><b>${b.boat}</b></td>
              <td>${b.name || "-"}</td>
              <td>${b.class || "-"}</td>
              <td>${fmtST(b.avgST)}</td>
              <td>${b.exhibitionTime ?? "-"}</td>
              <td>${shortSkill(b)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCondition(venue, weather, boats) {
  return `
    <div class="comment-box">
      <p><b>🌊 場の見方</b></p>
      <p>${venue.name || "-"}は <b>${venue.courseBias || "場傾向不明"}</b></p>
      <p>推奨展開：<b>${venue.recommendedShape || "-"}</b></p>
      <p>天候 ${weather.weather || "-"} / 風 ${weather.windSpeed ?? "-"}m / 波 ${weather.waveHeight ?? "-"}cm / 気温 ${weather.temperature ?? "-"}℃</p>
    </div>

    <details>
      <summary>モーター・展示の詳細を見る</summary>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th>艇</th><th>M</th><th>M2</th><th>M3</th><th>B</th><th>B2</th><th>展示ST</th><th>チルト</th>
            </tr>
          </thead>
          <tbody>
            ${boats.map(b => `
              <tr>
                <td><b>${b.boat}</b></td>
                <td>${b.motor ?? "-"}</td>
                <td>${b.motor2Rate ?? "-"}%</td>
                <td>${b.motor3Rate ?? "-"}%</td>
                <td>${b.boatNo ?? "-"}</td>
                <td>${b.boat2Rate ?? "-"}%</td>
                <td>${fmtST(b.exhibitionST)}</td>
                <td>${b.tilt ?? "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

function renderMainSheet(boats, p) {
  const marks = p.marks || {};
  const picks = [
    ["◎ 本命", marks.honmei, "軸として一番買いやすい艇"],
    ["○ 対抗", marks.taikou, "本命に迫る相手候補"],
    ["▲ 穴", marks.ana, "展開が向けば配当を上げる艇"],
    ["△ 押さえ", marks.osaE, "切ると怖い安全カバー"]
  ];

  return `
    ${picks.map(([label, m, role]) => pickCard(label, m, role, boats)).join("")}

    <details open>
      <summary>全艇の「強み」と根拠を見る</summary>
      ${boats.map(boatDetail).join("")}
    </details>
  `;
}

function pickCard(label, m, role, boats) {
  if (!m) return `<div class="rank-card"><b>${label}</b><br>該当なし</div>`;
  const b = boats.find(x => Number(x.boat) === Number(m.boat)) || m;

  return `
    <div class="rank-card">
      <div style="font-size:1.2rem;font-weight:900;">${label}　${b.boat}号艇 ${b.name || ""}</div>
      <p><b>役割：</b>${role}</p>
      <p><b>なぜ買う：</b>${buyReason(b)}</p>
      <p><b>この選手の強み：</b></p>
      ${skillListHtml(b)}
      <p class="small-score">総合 ${b.totalScore ?? "-"} / チャッピー ${b.chappyScore ?? "-"} / 舟券太郎 ${b.funaTaroScore ?? "-"}</p>
      <p>⬆️ ${join(b.buffs)}</p>
      <p>⬇️ ${join(b.debuffs)}</p>
    </div>
  `;
}

function boatDetail(b) {
  return `
    <div class="boat-card boat-${b.boat}">
      <h3>${b.boat}号艇 ${b.name || ""}</h3>

      <p class="big-reason">${buyReason(b)}</p>

      <p><b>この選手の強み</b></p>
      ${skillListHtml(b)}

      <p><b>今回の役割：</b>${positionReason(b)}</p>
      <p>⬆️ <b>プラス材料：</b>${join(b.buffs)}</p>
      <p>⬇️ <b>マイナス材料：</b>${join(b.debuffs)}</p>

      <details>
        <summary>数字の詳細</summary>
        <p>総合 ${b.totalScore ?? "-"} / チャッピー ${b.chappyScore ?? "-"} / 舟券太郎 ${b.funaTaroScore ?? "-"}</p>
        <p>級別 ${b.class || "-"} / 支部 ${b.branchHome || "-"} / ${b.ageWeight || "-"}</p>
        <p>全国勝率 ${b.nationalWinRate ?? "-"} / 当地勝率 ${b.localWinRate ?? "-"}</p>
        <p>平均ST ${fmtST(b.avgST)} / 展示ST ${fmtST(b.exhibitionST)}</p>
        <p>展示 ${b.exhibitionTime ?? "-"} / チルト ${b.tilt ?? "-"}</p>
        <p>モーター ${b.motor ?? "-"} / 2率 ${b.motor2Rate ?? "-"}% / 3率 ${b.motor3Rate ?? "-"}%</p>
        <p>ボート ${b.boatNo ?? "-"} / 2率 ${b.boat2Rate ?? "-"}% / 3率 ${b.boat3Rate ?? "-"}%</p>
      </details>
    </div>
  `;
}

function skillListHtml(b) {
  const skills = skillPoints(b);

  if (!skills.length) {
    return `<ul><li>現データだけでは断定不可。展示・ST・当地・機力で評価。</li></ul>`;
  }

  return `
    <ul>
      ${skills.map(s => `<li><b>${s.title}</b><br><span>${s.reason}</span></li>`).join("")}
    </ul>
  `;
}

function skillPoints(b) {
  const skills = [];
  const boat = Number(b.boat);
  const avgST = num(b.avgST);
  const exST = num(b.exhibitionST);
  const exTime = num(b.exhibitionTime);
  const motor2 = num(b.motor2Rate);
  const motor3 = num(b.motor3Rate);
  const boat2 = num(b.boat2Rate);
  const local = num(b.localWinRate);
  const national = num(b.nationalWinRate);
  const tilt = num(b.tilt);
  const total = num(b.totalScore);

  if (avgST && avgST <= 0.14) {
    skills.push({
      title: "🚀 スタートが武器",
      reason: `平均ST ${fmtST(avgST)}。スリットで展開を作れる可能性がある。`
    });
  }

  if (exST !== null && exST <= 0.08) {
    skills.push({
      title: "🚨 展示STが速い",
      reason: `展示ST ${fmtST(exST)}。本番で同じ踏み込みなら攻め・差しの起点になる。`
    });
  }

  if (motor2 !== null && motor2 >= 40) {
    skills.push({
      title: "🔧 モーター出し上位",
      reason: `モーター2連率 ${motor2}% 。機力面の後押しがある。`
    });
  }

  if (motor3 !== null && motor3 >= 50) {
    skills.push({
      title: "🔧 機力の安定感あり",
      reason: `モーター3連率 ${motor3}% 。連絡みの下支えとして評価。`
    });
  }

  if (boat2 !== null && boat2 >= 40) {
    skills.push({
      title: "🛠 ボート相性良好",
      reason: `ボート2連率 ${boat2}% 。足回りの安定材料。`
    });
  }

  if (local !== null && local >= 6) {
    skills.push({
      title: "🌊 当地水面に強い",
      reason: `当地勝率 ${local}。この場で走れる根拠がある。`
    });
  }

  if (national !== null && national >= 6) {
    skills.push({
      title: "💪 地力上位",
      reason: `全国勝率 ${national}。単純な選手力として上位評価。`
    });
  }

  if (exTime !== null && exTime <= 6.80) {
    skills.push({
      title: "⚙️ 展示気配良好",
      reason: `展示タイム ${exTime}。調整・足色が悪くない。`
    });
  }

  if (tilt !== null && tilt >= 0.5) {
    skills.push({
      title: "⚙️ 伸び寄り調整の可能性",
      reason: `チルト ${tilt}。外から攻める意識や伸び型調整を警戒。`
    });
  }

  if (boat === 1 && total >= 65) {
    skills.push({
      title: "① 内寄りで強い条件",
      reason: "1コース＋総合評価が高く、先マイできれば軸候補。"
    });
  }

  if (boat === 2 && (exST !== null && exST <= 0.12 || avgST !== null && avgST <= 0.15)) {
    skills.push({
      title: "🎯 差し残し候補",
      reason: "2コースから1を見て差す形。頭より2着残りで評価しやすい。"
    });
  }

  if (boat === 3 && (exST !== null && exST <= 0.10 || total >= 60)) {
    skills.push({
      title: "🎯 センター攻め候補",
      reason: "3コースから攻めの起点になれる条件がある。"
    });
  }

  if (boat === 4 && (exST !== null && exST <= 0.10 || tilt !== null && tilt >= 0.5)) {
    skills.push({
      title: "🎯 カド攻め・展開乗り候補",
      reason: "4カドから自力攻め、または3攻めに乗る形を警戒。"
    });
  }

  if (boat >= 5 && (local !== null && local >= 5.5 || exST !== null && exST <= 0.10 || total >= 55)) {
    skills.push({
      title: "⑤⑥ 外から連絡み候補",
      reason: "外枠で人気が落ちやすい分、展開が向くと配当を上げる。"
    });
  }

  return skills.slice(0, 5);
}

function renderFormations(p) {
  return `
    <h3>🎯 本線</h3>
    <p>一番素直な展開。まずここを中心。</p>
    ${tickets(p.mainFormation)}

    <h3>🛡 押さえ</h3>
    <p>展開が少しズレた時の安全カバー。</p>
    ${tickets((p.holeFormation || []).slice(0, 3))}

    <h3>💣 穴・万舟</h3>
    <p>攻め艇が動いた時、内が残った時の高配当候補。</p>
    ${tickets(p.holeFormation)}
  `;
}

function renderManshuSheet(boats, p) {
  const targets = boats
    .filter(b => Number(b.boat) >= 3)
    .sort((a,b) => Number(b.totalScore || 0) - Number(a.totalScore || 0))
    .slice(0,4);

  return `
    <div class="comment-box">
      <p><b>💣 万舟の狙い方</b></p>
      <p>外枠一撃だけでなく、3攻め・4残し・5差し場・6展開待ちまで見る。</p>
    </div>

    ${targets.map(b => `
      <div class="boat-card boat-${b.boat}">
        <h3>${b.boat}号艇 ${b.name || ""}</h3>
        <p class="big-reason">${manshuReason(b)}</p>
        <p>期待度：<b>${stars(b.totalScore)}</b></p>
        ${skillListHtml(b)}
        <p>⬆️ ${join(b.buffs)}</p>
        <p>⬇️ ${join(b.debuffs)}</p>
      </div>
    `).join("")}
  `;
}

function renderAlerts(p) {
  const list = [
    ...(p.slitAlert || []),
    ...(p.doubleTimeAlert || []),
    ...(p.newSumAlert || [])
  ];

  if (!list.length) return `<div class="comment-box">大きなアラートなし。基本展開を重視。</div>`;

  return list.map(a => `
    <div class="alert-card">
      <b>${a.boat}号艇 ${a.type || "アラート"}</b><br>
      ${a.reason || ""}${a.sum ? ` / 合計 ${a.sum}` : ""}
    </div>
  `).join("");
}

function renderFinalComment(p, venue, weather) {
  return `
    <div class="comment-box">
      <p><b>最終判断</b></p>
      <p>${p.raceComment || "展開とSTを見て本線・押さえ・穴を分ける。"}</p>
      <p><b>展開：</b>${p.raceShape?.shape || "-"}</p>
      <p><b>場：</b>${venue.courseBias || "-"} / <b>水面：</b>${weather.weather || "-"} 風${weather.windSpeed ?? "-"}m 波${weather.waveHeight ?? "-"}cm</p>
      <p><b>注意：</b>整備巧者・ペラ巧者・ピット離れは、現状は展示/モーター/チルト/当地からの推定。選手DB追加後に精度を上げる。</p>
    </div>
  `;
}

function buyReason(b) {
  const boat = Number(b.boat);
  if (boat === 1) return "インから先マイできるかが鍵。STと足が足りれば逃げ本線。";
  if (boat === 2) return "2コース差し候補。頭固定より2着残り・差し残しで評価。";
  if (boat === 3) return "3コース攻め候補。スタートが決まればまくり・まくり差しで展開を作る。";
  if (boat === 4) return "カド位置で攻め残し候補。3の攻めに乗る形も見る。";
  if (boat === 5) return "内が競った時の差し場待ち。2・3着で配当を上げる。";
  if (boat === 6) return "大外で展開待ち。当地・ST・展示が良い時は切りすぎ注意。";
  return "展開次第の押さえ候補。";
}

function positionReason(b) {
  const boat = Number(b.boat);
  if (boat === 1) return "1マーク先取りが最大条件。スタート遅れなら差される。";
  if (boat === 2) return "1を見て差す形。差し切りより2着残りが現実的。";
  if (boat === 3) return "攻めるならレースの起点。ここが遅いと外も苦しい。";
  if (boat === 4) return "3の攻めに乗るか、自力でカド攻めできるか。";
  if (boat === 5) return "4までが攻めて内が空けば差し場あり。";
  if (boat === 6) return "最内差し・展開待ち。当地が良い時は切りすぎ注意。";
  return "-";
}

function manshuReason(b) {
  const boat = Number(b.boat);
  if (boat === 3) return "3が攻めると人気筋が崩れて配当が上がる。";
  if (boat === 4) return "カドから攻め残ると本命筋とズレて高配当になりやすい。";
  if (boat === 5) return "内が競った時の差し場。2・3着絡みで万舟に繋がる。";
  if (boat === 6) return "大外で人気が落ちる分、展開がハマれば一気に跳ねる。";
  return "展開がズレた時の高配当候補。";
}

function shortSkill(b) {
  const s = skillPoints(b)[0];
  return s ? s.title.replace(/[🚀🚨🔧🛠🌊💪⚙️①⑤⑥🎯]/g, "") : "根拠待ち";
}

function tickets(list) {
  if (!Array.isArray(list) || list.length === 0) return `<p>なし</p>`;
  return list.map(x => `<span class="ticket">${x}</span>`).join("");
}

function stars(score) {
  const s = Number(score || 0);
  if (s >= 75) return "★★★★★";
  if (s >= 65) return "★★★★";
  if (s >= 55) return "★★★";
  return "★★";
}

function clearAreas() {
  ["#raceListArea","#engineArea","#mainSheetArea","#formationArea","#manshuSheetArea","#alertArea","#finalCommentArea"]
    .forEach(id => setHTML(id, ""));
}

function showError(msg) {
  setHTML("#raceListArea", `<div class="error">⚠️ ${msg}</div>`);
}

function setHTML(id, html) {
  const el = document.querySelector(id);
  if (el) el.innerHTML = html;
}

function setStatus(text) {
  const el = document.querySelector("#statusText");
  if (el) el.textContent = text;
}

function val(id) {
  return document.querySelector(id)?.value?.trim() || "";
}

function join(v) {
  return Array.isArray(v) && v.length ? v.join(" / ") : "なし";
}

function fmtST(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "-";
  const n = Number(v);
  if (n < 0) return `F${Math.abs(n).toFixed(2).slice(1)}`;
  return n.toFixed(2);
}

function num(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return null;
  return Number(v);
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}
function getTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function renderOdds(odds) {
  if (!Array.isArray(odds) || odds.length === 0) {
    return `<div class="card">オッズ未取得</div>`;
  }

  const top = odds.slice(0, 12);

  return `
    <div class="card odds-card">
      <h2>💰 3連単オッズ TOP12</h2>
      <div class="odds-grid">
        ${top.map((o, i) => `
          <div class="odds-pill">
            <b>${i + 1}. ${o.key}</b>
            <span>${o.odds}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}
