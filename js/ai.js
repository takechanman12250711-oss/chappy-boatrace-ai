/* =========================================================
  チャッピーボートレースAI
  js/ai.js 完全版
========================================================= */

(function () {
  "use strict";

  const U = window.ChappyUtils;

  function getEntries(data) {
    return data?.entries || data?.racers || data?.entry || [];
  }

  function calcBoatScore(boat, index) {
    const boatNo = U.safeNumber(boat.boatNo ?? boat.number ?? index + 1, index + 1);

    const avgST = U.safeNumber(boat.avgST ?? boat.st, 0.18);
    const nationalWin = U.safeNumber(boat.nationalWinRate ?? boat.winRate, 5);
    const localWin = U.safeNumber(boat.localWinRate ?? boat.localRate, 5);
    const motor2 = U.safeNumber(boat.motor2Rate ?? boat.motorRate ?? boat.motor2, 30);
    const exhibition = U.safeNumber(boat.exhibitionTime ?? boat.tenjiTime, 6.9);

    let score = 50;

    score += (6 - boatNo) * 2;
    score += (nationalWin - 5) * 6;
    score += (localWin - 5) * 4;
    score += (motor2 - 30) * 0.35;
    score += (0.18 - avgST) * 120;
    score += (6.9 - exhibition) * 35;

    if (boatNo === 1) score += 10;
    if (boatNo === 2) score += 4;
    if (boatNo === 3) score += 5;
    if (boatNo >= 5) score -= 4;

    return U.clamp(U.round(score, 1), 1, 99);
  }

  function makeFactors(boat, score, index) {
    const boatNo = U.safeNumber(boat.boatNo ?? boat.number ?? index + 1, index + 1);
    const avgST = U.safeNumber(boat.avgST ?? boat.st, null);
    const localWin = U.safeNumber(boat.localWinRate ?? boat.localRate, null);
    const motor2 = U.safeNumber(boat.motor2Rate ?? boat.motorRate ?? boat.motor2, null);

    const buffs = [];
    const debuffs = [];

    if (boatNo === 1) buffs.push("イン有利");
    if (boatNo === 2) buffs.push("差し残り注意");
    if (boatNo === 3) buffs.push("攻め位置");
    if (boatNo >= 5) debuffs.push("外枠で展開待ち");

    if (avgST !== null && avgST <= 0.15) buffs.push("ST早め");
    if (avgST !== null && avgST >= 0.21) debuffs.push("ST遅め");

    if (localWin !== null && localWin >= 6) buffs.push("当地良好");
    if (localWin !== null && localWin <= 4) debuffs.push("当地弱め");

    if (motor2 !== null && motor2 >= 40) buffs.push("モーター気配あり");
    if (motor2 !== null && motor2 <= 25) debuffs.push("モーター弱め");

    if (score >= 75) buffs.push("総合上位");
    if (score <= 45) debuffs.push("指数低め");

    return {
      buffs: buffs.length ? buffs : ["大きな加点なし"],
      debuffs: debuffs.length ? debuffs : ["大きな減点なし"]
    };
  }

  function analyzeAI(data) {
    const entries = getEntries(data);

    const boats = entries
      .map((boat, index) => {
        const score = calcBoatScore(boat, index);
        const factors = makeFactors(boat, score, index);

        return {
          boatNo: U.safeNumber(boat.boatNo ?? boat.number ?? index + 1, index + 1),
          name: boat.name ?? boat.racerName ?? "-",
          score,
          buffs: factors.buffs,
          debuffs: factors.debuffs,
          raw: boat
        };
      })
      .sort((a, b) => b.score - a.score);

    const mainPower = boats[0]?.score || 0;
    const secondPower = boats[1]?.score || 0;
    const confidence = U.clamp(U.round((mainPower + secondPower) / 2, 1), 1, 99);

    const outside = boats.filter(x => x.boatNo >= 4);
    const manshuPower = outside.length
      ? U.round(outside.reduce((s, x) => s + x.score, 0) / outside.length, 1)
      : 0;

    return {
      boats,
      confidence,
      manshuPower,
      mainBoat: boats[0] || null,
      secondBoat: boats[1] || null
    };
  }

  function renderAI(data) {
    const ai = analyzeAI(data);

    const topRows = ai.boats.slice(0, 6).map((x, i) => `
      <div class="v3-index-row">
        <span class="label">
          ${i + 1}位 ${U.boatBadge(x.boatNo, "mini")} ${U.escapeHtml(x.name)}
        </span>
        <strong>${x.score}</strong>
      </div>
    `).join("");

    U.setHtml("aiIndexArea", `
      <div class="ai-summary-card panel">
        <h3 class="section-title">AI総合評価</h3>
        <div class="ai-summary-box main">
          <p>本命信頼度</p>
          <strong>${ai.confidence}</strong>
        </div>
        <div class="ai-summary-box manshu">
          <p>万舟期待度</p>
          <strong>${ai.manshuPower}</strong>
        </div>
        <div class="v3-index-table index-mini-grid">
          ${topRows || U.showEmpty("AI指数なし")}
        </div>
      </div>
    `);

    U.setHtml("tenkaiRateArea", `
      <div class="v3-note">
        展開評価：${ai.mainBoat ? `${ai.mainBoat.boatNo}号艇中心。2コース差し・3コース攻め・4残りは切らずに判定。` : "-"}
      </div>
    `);

    U.setHtml("expectedValueArea", `
      <div class="v3-note">
        期待値評価：本命は指数上位、万舟は4〜6号艇の絡みを中心に自動判定。
      </div>
    `);

    return ai;
  }

  window.ChappyAI = {
    getEntries,
    calcBoatScore,
    makeFactors,
    analyzeAI,
    renderAI
  };
})();