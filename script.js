// script.js v8
// 理由中心・大きく見やすい表示版

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
    const res = await fetch(`${API_BASE}?jcd=${jcd}&rno=${rno}&date=${date}`);
    const data = await res.json();

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

  setHTML("#raceListArea", renderEntryTable(boats));
  setHTML("#engineArea", renderCondition(venue, weather, boats));
  setHTML("#mainSheetArea", renderReasonMainSheet(boats, p));
  setHTML("#formationArea", renderFormations(p));
  setHTML("#manshuSheetArea", renderManshuSheet(boats, p));
  setHTML("#alertArea", renderAlerts(p));
  setHTML("#finalCommentArea", renderFinalComment(p, venue, weather));
}

function renderEntryTable(boats) {
  return `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>艇</th>
            <th>選手</th>
            <th>級</th>
            <th>ST</th>
            <th>全国</th>
            <th>当地</th>
            <th>評価</th>
          </tr>
        </thead>
        <tbody>
          ${boats.map(b => `
            <tr>
              <td><b>${b.boat}</b></td>
              <td>${b.name || "-"}</td>
              <td>${b.class || "-"}</td>
              <td>${fmtST(b.avgST)}</td>
              <td>${b.nationalWinRate ?? "-"}</td>
              <td>${b.localWinRate ?? "-"}</td>
              <td>${mainReasonShort(b)}</td>
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
      <p>${venue.name || "-"}は <b>${venue.courseBias || "場傾向不明"}</b>。</p>
      <p>推奨展開：<b>${venue.recommendedShape || "-"}</b></p>
      <p>天候 ${weather.weather || "-"} / 風 ${weather.windSpeed ?? "-"}m / 波 ${weather.waveHeight ?? "-"}cm / 気温 ${weather.temperature ?? "-"}℃</p>
    </div>

    <details>
      <summary>モーター・ボート詳細を見る</summary>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th>艇</th><th>M</th><th>M2</th><th>M3</th><th>B</th><th>B2</th><th>展示</th><th>チルト</th>
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
                <td>${b.exhibitionTime ?? "-"}</td>
                <td>${b.tilt ?? "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

function renderReasonMainSheet(boats, p) {
  const marks = p.marks || {};
  const picked = [
    ["◎ 本命", marks.honmei, "軸候補。展開の中心に置く艇。"],
    ["○ 対抗", marks.taikou, "本命に迫る相手候補。2着・逆転まで。"],
    ["▲ 穴", marks.ana, "展開が向けば配当を上げる艇。"],
    ["△ 押さえ", marks.osaE, "切ると怖い安全カバー。"]
  ];

  return `
    ${picked.map(([label, m, role]) => renderPickCard(label, m, role, boats)).join("")}

    <details open>
      <summary>全艇の理由を見る</summary>
      ${boats.map(renderBoatReasonCard).join("")}
    </details>
  `;
}

function renderPickCard(label, m, role, boats) {
  if (!m) return `<div class="rank-card"><b>${label}</b><br>該当なし</div>`;
  const b = boats.find(x => Number(x.boat) === Number(m.boat)) || m;

  return `
    <div class="rank-card">
      <div style="font-size:1.15rem;font-weight:800;">${label}　${b.boat}号艇 ${b.name || ""}</div>
      <p><b>役割：</b>${role}</p>
      <p><b>買う理由：</b>${buyReason(b)}</p>
      <p class="small-score">総合 ${b.totalScore ?? "-"} / チャッピー ${b.chappyScore ?? "-"} / 舟券太郎 ${b.funaTaroScore ?? "-"}</p>
      <p>⬆️ ${join(b.buffs)}</p>
      <p>⬇️ ${join(b.debuffs)}</p>
    </div>
  `;
}

function renderBoatReasonCard(b) {
  return `
    <div class="boat-card boat-${b.boat}">
      <h3>${b.boat}号艇 ${b.name || ""}</h3>

      <p class="big-reason">${buyReason(b)}</p>

      <p><b>選手特徴：</b>${playerType(b)}</p>
      <p><b>今回の立ち位置：</b>${positionReason(b)}</p>

      <p>⬆️ <b>プラス材料</b>：${join(b.buffs)}</p>
      <p>⬇️ <b>マイナス材料</b>：${join(b.debuffs)}</p>

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

function renderFormations(p) {
  return `
    <h3>🎯 本線</h3>
    <p>一番素直な展開。まずここを中心。</p>
    ${tickets(p.mainFormation)}

    <h3>🛡 押さえ</h3>
    <p>展開が少しズレた時の安全カバー。</p>
    ${tickets(p.holeFormation?.slice(0, 3))}

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
      <p>外枠一撃だけじゃなく、3攻め・4残し・5差し場・6地元/当地絡みも見る。</p>
    </div>

    ${targets.map(b => `
      <div class="boat-card boat-${b.boat}">
        <h3>${b.boat}号艇 ${b.name || ""}</h3>
        <p class="big-reason">${manshuReason(b)}</p>
        <p>期待度：<b>${stars(b.totalScore)}</b></p>
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
    </div>
  `;
}

function buyReason(b) {
  const boat = Number(b.boat);
  const win = Number(b.nationalWinRate || 0);
  const local = Number(b.localWinRate || 0);
  const st = Number(b.avgST || 0.2);
  const score = Number(b.totalScore || 0);

  if (boat === 1) {
    return "インから先マイできるかが鍵。勝率・STが悪くなければ逃げ本線。";
  }
  if (boat === 2) {
    return "2コース差し候補。頭よりも2着残し・差し残りで評価。";
  }
  if (boat === 3) {
    return "3コース攻め候補。スタートが決まればまくり・まくり差しで展開を作る。";
  }
  if (boat === 4) {
    return "カド位置で攻め残し候補。3が攻めると展開に乗るが、攻め場消失には注意。";
  }
  if (boat === 5) {
    return "外から差し場待ち。内が競る展開なら2・3着で配当を上げる。";
  }
  if (boat === 6) {
    return "大外で展開待ち。当地実績やSTが良い時だけ連絡み警戒。";
  }

  if (score >= 75) return "総合評価が高く、軸または相手候補。";
  if (local >= 6) return "当地実績があり、展開が向けば絡める。";
  if (st <= 0.14) return "スタート面で展開を作れる可能性あり。";
  if (win >= 6) return "全国勝率から地力評価。";
  return "展開次第の押さえ候補。";
}

function playerType(b) {
  const boat = Number(b.boat);
  const st = Number(b.avgST || 0.2);
  const local = Number(b.localWinRate || 0);

  const types = [];
  if (st <= 0.14) types.push("スタート型");
  if (local >= 6) types.push("当地巧者");
  if (boat === 1) types.push("イン逃げ型");
  if (boat === 2) types.push("差し型");
  if (boat === 3) types.push("攻め型");
  if (boat === 4) types.push("カド自在型");
  if (boat >= 5) types.push("展開待ち型");

  return types.length ? types.join("・") : "バランス型";
}

function positionReason(b) {
  const boat = Number(b.boat);
  if (boat === 1) return "1マーク先取りが最大条件。スタート遅れなら差される。";
  if (boat === 2) return "1を見て差す形。差し切りより2着残りが現実的。";
  if (boat === 3) return "攻めるならレースの起点。ここが遅いと外も苦しい。";
  if (boat === 4) return "3の攻めに乗るか、自力でカド攻めできるか。";
  if (boat === 5) return "4までが攻めて内が空けば差し場あり。";
  if (boat === 6) return "最内差し・展開待ち。地元/当地が良い時は切りすぎ注意。";
  return "-";
}

function manshuReason(b) {
  const boat = Number(b.boat);
  if (boat === 3) return "3が攻めると人気筋が崩れて配当が上がる。";
  if (boat === 4) return "カドから攻め残ると本命筋とズレて高配当になりやすい。";
  if (boat === 5) return "内が競った時の差し場。2・3着絡みで万舟に繋がる。";
  if (boat === 6) return "大外で人気が落ちる分、展開がハマれば一気に配当が跳ねる。";
  return "展開がズレた時の高配当候補。";
}

function mainReasonShort(b) {
  const boat = Number(b.boat);
  if (boat === 1) return "逃げ";
  if (boat === 2) return "差し";
  if (boat === 3) return "攻め";
  if (boat === 4) return "カド";
  if (boat === 5) return "差し場";
  if (boat === 6) return "展開待ち";
  return "-";
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

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}
