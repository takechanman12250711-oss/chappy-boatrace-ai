// script.js 自動取得対応版 v1

// ★ここをVercelのURLに変更
const API_BASE_URL = "https://chappy-boatrace-ai.vercel.app/api/race";

const venueCodes = {
  "桐生": "01",
  "戸田": "02",
  "江戸川": "03",
  "平和島": "04",
  "多摩川": "05",
  "浜名湖": "06",
  "蒲郡": "07",
  "常滑": "08",
  "津": "09",
  "三国": "10",
  "びわこ": "11",
  "住之江": "12",
  "尼崎": "13",
  "鳴門": "14",
  "丸亀": "15",
  "児島": "16",
  "宮島": "17",
  "徳山": "18",
  "下関": "19",
  "若松": "20",
  "芦屋": "21",
  "福岡": "22",
  "唐津": "23",
  "大村": "24"
};

let raceData = [];

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchRaceData() {
  const placeSelect = document.querySelector("#placeSelect");
  const raceSelect = document.querySelector("#raceSelect");

  const place = placeSelect?.value || "大村";
  const rnoText = raceSelect?.value || "7R";
  const rno = String(rnoText).replace("R", "");
  const jcd = venueCodes[place];

  if (!jcd) {
    alert("場コードが見つかりません");
    return;
  }

  const date = todayYmd();
  const url = `${API_BASE_URL}?jcd=${jcd}&rno=${rno}&date=${date}`;

  setStatus("出走表を取得中...");

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok || !data.boats || data.boats.length === 0) {
      throw new Error("出走表データが空です");
    }

    raceData = data.boats.map(b => ({
      boat: b.boat,
      name: b.name || `選手${b.boat}`,
      class: b.class || "",
      avgST: b.avgST ?? null,
      nationalWinRate: b.nationalWinRate ?? null,
      localWinRate: b.localWinRate ?? null,
      motor: b.motor ?? null,
      raw: b.raw || ""
    }));

    renderRaceList();
    runPrediction();

    setStatus(`${place}${rno}R 取得OK`);
  } catch (err) {
    console.error(err);
    setStatus("取得失敗。サンプルデータで表示中");

    raceData = createSampleData();
    renderRaceList();
    runPrediction();
  }
}

function createSampleData() {
  return [1, 2, 3, 4, 5, 6].map(n => ({
    boat: n,
    name: `選手${n}`,
    class: "",
    avgST: null,
    nationalWinRate: null,
    localWinRate: null,
    motor: null,
    raw: ""
  }));
}

function calcScore(b) {
  let score = 50;

  // 枠番補正
  if (b.boat === 1) score += 18;
  if (b.boat === 2) score += 8;
  if (b.boat === 3) score += 6;
  if (b.boat === 4) score += 3;
  if (b.boat === 5) score -= 2;
  if (b.boat === 6) score -= 5;

  // 級別補正
  if (b.class === "A1") score += 10;
  if (b.class === "A2") score += 6;
  if (b.class === "B1") score -= 2;
  if (b.class === "B2") score -= 5;

  // ST補正
  if (b.avgST !== null) {
    if (b.avgST <= 0.13) score += 8;
    else if (b.avgST <= 0.15) score += 5;
    else if (b.avgST <= 0.17) score += 2;
    else if (b.avgST >= 0.20) score -= 6;
  }

  // 勝率補正
  if (b.nationalWinRate !== null) {
    if (b.nationalWinRate >= 7) score += 8;
    else if (b.nationalWinRate >= 6) score += 5;
    else if (b.nationalWinRate >= 5) score += 2;
    else score -= 3;
  }

  if (b.localWinRate !== null) {
    if (b.localWinRate >= 7) score += 6;
    else if (b.localWinRate >= 6) score += 4;
    else if (b.localWinRate >= 5) score += 1;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getBuffDebuff(b, score) {
  const buffs = [];
  const debuffs = [];

  if (b.boat === 1) buffs.push("⬆️イン有利 +18");
  if (b.boat === 2) buffs.push("⬆️2コース差し +8");
  if (b.boat === 3) buffs.push("⬆️3コース攻め +6");
  if (b.boat >= 5) debuffs.push("⬇️外枠補正 -2〜-5");

  if (b.class === "A1") buffs.push("⬆️A1格 +10");
  if (b.class === "A2") buffs.push("⬆️A2格 +6");
  if (b.class === "B2") debuffs.push("⬇️B2格 -5");

  if (b.avgST !== null && b.avgST <= 0.15) {
    buffs.push(`⬆️ST優秀 ${b.avgST}`);
  }

  if (b.avgST !== null && b.avgST >= 0.20) {
    debuffs.push(`⬇️ST遅め ${b.avgST}`);
  }

  if (b.nationalWinRate !== null && b.nationalWinRate >= 6) {
    buffs.push(`⬆️全国勝率 ${b.nationalWinRate}`);
  }

  if (b.localWinRate !== null && b.localWinRate >= 6) {
    buffs.push(`⬆️当地勝率 ${b.localWinRate}`);
  }

  return {
    buffs: buffs.length ? buffs : ["⬆️大きな加点なし"],
    debuffs: debuffs.length ? debuffs : ["⬇️大きな減点なし"]
  };
}

function renderRaceList() {
  const area = document.querySelector("#raceListArea");
  if (!area) return;

  area.innerHTML = raceData
    .map(b => {
      return `
        <div class="boat-row boat-${b.boat}">
          <strong>${b.boat}号艇</strong>
          ${b.name}
          ${b.class ? `<span>${b.class}</span>` : ""}
          <br>
          <small>
            全国:${b.nationalWinRate ?? "-"}　
            当地:${b.localWinRate ?? "-"}　
            ST:${b.avgST ?? "-"}
          </small>
        </div>
      `;
    })
    .join("");
}

function runPrediction() {
  if (!raceData.length) {
    raceData = createSampleData();
  }

  const scored = raceData
    .map(b => ({
      ...b,
      score: calcScore(b)
    }))
    .sort((a, b) => b.score - a.score);

  renderEngine(scored);
  renderMainSheet(scored);
  renderFormation(scored);
  renderManshuSheet(scored);
  renderAlerts(scored);
  renderFinalComment(scored);
}

function renderEngine(scored) {
  const area = document.querySelector("#engineArea");
  if (!area) return;

  area.innerHTML = scored
    .map(b => {
      const bd = getBuffDebuff(b, b.score);
      return `
        <div class="card-mini">
          <strong>${b.boat}号艇 ${b.name}</strong>
          <div>スコア：${b.score}</div>
          <div>${bd.buffs.slice(0, 2).join(" / ")}</div>
          <div>${bd.debuffs.slice(0, 1).join(" / ")}</div>
        </div>
      `;
    })
    .join("");
}

function renderMainSheet(scored) {
  const area = document.querySelector("#mainSheetArea");
  if (!area) return;

  const top = scored.slice(0, 4);

  area.innerHTML = `
    <div class="sheet-title">🎯 本命シート</div>
    ${top
      .map((b, i) => {
        const marks = ["◎", "○", "▲", "△"];
        const bd = getBuffDebuff(b, b.score);
        return `
          <div class="predict-box">
            <strong>${marks[i]} ${b.boat}号艇 ${b.name}</strong>
            <div>スコア：${b.score}</div>
            <div>${bd.buffs.join(" / ")}</div>
            <div>${bd.debuffs.join(" / ")}</div>
            <p>${b.boat}号艇は指数上位。枠・級別・ST・勝率を加味して評価。</p>
          </div>
        `;
      })
      .join("")}
  `;
}

function renderFormation(scored) {
  const area = document.querySelector("#formationArea");
  if (!area) return;

  const nums = scored.map(b => b.boat);
  const first = nums[0];
  const second = nums[1];
  const third = nums[2];
  const fourth = nums[3];

  area.innerHTML = `
    <div class="sheet-title">📊 フォーメーション</div>

    <div class="predict-box">
      <strong>【本線】</strong><br>
      ${first}-${second}${third}-${second}${third}${fourth}<br>
      ${first}-${second}-${third}<br>
      ${first}-${third}-${second}
    </div>

    <div class="predict-box">
      <strong>【押さえ】</strong><br>
      1-2-345<br>
      1-3-245<br>
      2-1-345
    </div>

    <div class="predict-box">
      <strong>【流し】</strong><br>
      1-${second}${third}-${second}${third}${fourth}<br>
      ※展開型の安全カバー
    </div>
  `;
}

function renderManshuSheet(scored) {
  const area = document.querySelector("#manshuSheetArea");
  if (!area) return;

  const outer = scored.filter(b => b.boat >= 4);
  const hot = outer.length ? outer[0] : scored[3];

  area.innerHTML = `
    <div class="sheet-title">💣 万舟シート</div>

    <div class="predict-box">
      <strong>穴軸候補：${hot.boat}号艇 ${hot.name}</strong>
      <div>万舟指数：${Math.max(0, hot.score - 10)}</div>
      <div>⬆️ 外枠の展開拾い / 道中浮上</div>
      <div>⬇️ 頭固定はリスクあり</div>
      <p>内側が競る展開なら、3着・2着で絡む余地あり。</p>
    </div>

    <div class="predict-box">
      <strong>【万舟候補】</strong><br>
      5-6-1　オッズ待ち<br>
      6-4-1　オッズ待ち<br>
      4-5-6　オッズ待ち<br>
      5-1-4　オッズ待ち<br>
      6-1-5　オッズ待ち
    </div>
  `;
}

function renderAlerts(scored) {
  const area = document.querySelector("#alertArea");
  if (!area) return;

  const fastest = [...scored]
    .filter(b => b.avgST !== null)
    .sort((a, b) => a.avgST - b.avgST)[0];

  area.innerHTML = `
    <div class="sheet-title">🚨 舟券太郎アラート</div>
    <div class="predict-box">
      <strong>スリットアラート</strong><br>
      ${fastest ? `${fastest.boat}号艇 ${fastest.name} ST優秀` : "ST情報なし"}
    </div>
    <div class="predict-box">
      <strong>ダブルタイム理論</strong><br>
      展示・一周タイム入力後に判定
    </div>
    <div class="predict-box">
      <strong>新サムアラート</strong><br>
      展示＋一周タイム入力後に判定
    </div>
  `;
}

function renderFinalComment(scored) {
  const area = document.querySelector("#finalCommentArea");
  if (!area) return;

  const top = scored[0];

  area.innerHTML = `
    <div class="sheet-title">🧊 最終コメント</div>
    <p>
      現時点の中心は <strong>${top.boat}号艇 ${top.name}</strong>。
      ただし、展示・直前気配・オッズで最終補正が必要。
      本命は指数上位、万舟は外枠の展開拾いを中心に見る。
    </p>
  `;
}

function setStatus(text) {
  const status = document.querySelector("#statusText");
  if (status) status.textContent = text;
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#fetchRaceBtn");

  if (btn) {
    btn.addEventListener("click", fetchRaceData);
  }

  raceData = createSampleData();
  renderRaceList();
  runPrediction();
});
