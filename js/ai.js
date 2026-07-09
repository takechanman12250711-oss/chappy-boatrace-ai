/* =========================================================
  チャッピーボートレースAI
  js/ai.js 完全版
  ai-core.js 連携専用
========================================================= */

(function () {
  "use strict";

  const U = window.ChappyUtils;

  function getEntries(data) {
    return data?.entries || data?.racers || data?.entry || data?.boats || [];
  }

  function normalizeBoat(boat, index) {
    const boatNo = U.safeNumber(
      boat.boatNo ?? boat.number ?? boat.teiban ?? index + 1,
      index + 1
    );

    return {
      boatNo,
      name: U.safeText(
        boat.name ?? boat.racerName ?? boat.playerName ?? boat.nameJa,
        "-"
      ),
      className: U.safeText(boat.className ?? boat.class ?? boat.grade, "-"),
      avgST: U.safeNumber(boat.avgST ?? boat.st ?? boat.averageST, 0.18),
      nationalWinRate: U.safeNumber(
        boat.nationalWinRate ?? boat.winRate ?? boat.nationalRate,
        5
      ),
      localWinRate: U.safeNumber(
        boat.localWinRate ?? boat.localRate ?? boat.localWin,
        5
      ),
      motor2Rate: U.safeNumber(
        boat.motor2Rate ?? boat.motorRate ?? boat.motor2 ?? boat.motorTwoRate,
        30
      ),
      exhibitionTime: U.safeNumber(
        boat.exhibitionTime ?? boat.tenjiTime ?? boat.displayTime,
        6.9
      ),
      raw: boat
    };
  }

  function fallbackScore(boat) {
    let score = 50;

    score += (6 - boat.boatNo) * 1.8;
    score += (boat.nationalWinRate - 5) * 6;
    score += (boat.localWinRate - 5) * 4;
    score += (boat.motor2Rate - 30) * 0.25;
    score += (0.18 - boat.avgST) * 120;
    score += (6.9 - boat.exhibitionTime) * 30;

    if (boat.boatNo === 1) score += 9;
    if (boat.boatNo === 2) score += 4;
    if (boat.boatNo === 3) score += 5;
    if (boat.boatNo === 4) score += 2;
    if (boat.boatNo >= 5) score -= 3;

    return U.clamp(U.round(score, 1), 1, 99);
  }

  function buildFactors(boat, score) {
    const buffs = [];
    const debuffs = [];

    if (boat.boatNo === 1) buffs.push("イン有利");
    if (boat.boatNo === 2) buffs.push("2コース差し残り");
    if (boat.boatNo === 3) buffs.push("3コース攻め位置");
    if (boat.boatNo === 4) buffs.push("4カド残り注意");
    if (boat.boatNo >= 5) debuffs.push("外枠で展開待ち");

    if (boat.avgST <= 0.15) buffs.push("ST早め");
    if (boat.avgST >= 0.21) debuffs.push("ST遅め");

    if (boat.localWinRate >= 6) buffs.push("当地成績良好");
    if (boat.localWinRate <= 4) debuffs.push("当地成績弱め");

    if (boat.motor2Rate >= 40) buffs.push("モーター気配あり");
    if (boat.motor2Rate <= 25) debuffs.push("モーター弱め");

    if (score >= 75) buffs.push("AI指数上位");
    if (score <= 45) debuffs.push("総合指数低め");

    return {
      buffs: buffs.length ? buffs : ["加点は標準"],
      debuffs: debuffs.length ? debuffs : ["大きな減点なし"]
    };
  }

  function analyzeAI(data) {
    if (window.ChappyAICore?.analyze) {
      return window.ChappyAICore.analyze(data);
    }

    if (window.ChappyAICore?.build) {
      return window.ChappyAICore.build(data);
    }

    const entries = getEntries(data).map(normalizeBoat);

    const boats = entries
      .map((boat) => {
        const score = fallbackScore(boat);
        const factors = buildFactors(boat, score);

        return {
          boatNo: boat.boatNo,
          name: boat.name,
          score,
          buffs: factors.buffs,
          debuffs: factors.debuffs,
          raw: boat
        };
      })
      .sort((a, b) => b.score - a.score);

    const mainBoat = boats[0] || null;
    const secondBoat = boats[1] || null;

    const confidence = mainBoat && secondBoat
      ? U.round((mainBoat.score + secondBoat.score) / 2, 1)
      : 0;

    const manshuTargets = boats.filter(x => x.boatNo >= 4);
    const manshuPower = manshuTargets.length
      ? U.round(
          manshuTargets.reduce((sum, x) => sum + x.score, 0) / manshuTargets.length,
          1
        )
      : 0;

    return {
      boats,
      mainBoat,
      secondBoat,
      confidence,
      manshuPower,
      source: "fallback-ai"
    };
  }

  function renderAI(data) {
    const ai = analyzeAI(data);
    const boats = ai.boats || ai.rankings || [];

    const rows = boats.slice(0, 6).map((x, i) => `
      <div class="v3-index-row">
        <span class="label">
          ${i + 1}位 ${U.boatBadge(x.boatNo, "mini")} ${U.escapeHtml(x.name)}
        </span>
        <strong>${U.safeNumber(x.score ?? x.totalIndex, 0)}</strong>
      </div>
    `).join("");

    U.setHtml("aiIndexArea", `
      <div class="ai-summary-card">
        <h3 class="section-title">AI総合評価</h3>
        <div class="ai-summary-box main">
          <p>本命信頼度</p>
          <strong>${U.safeNumber(ai.confidence, 0)}</strong>
        </div>
        <div class="ai-summary-box manshu">
          <p>万舟期待度</p>
          <strong>${U.safeNumber(ai.manshuPower, 0)}</strong>
        </div>
        <div class="v3-index-table index-mini-grid">
          ${rows || U.showEmpty("AI指数なし")}
        </div>
      </div>
    `);

    U.setHtml("tenkaiRateArea", `
      <div class="v3-note">
        展開評価：イン逃げ、2コース差し残り、3コース攻め、4カド残りを切らずに判定。
      </div>
    `);

    U.setHtml("expectedValueArea", `
      <div class="v3-note">
        期待値評価：本命は指数上位、万舟は4〜6号艇絡みと内側高配当を分けて確認。
      </div>
    `);

    return ai;
  }

  window.ChappyAI = {
    getEntries,
    normalizeBoat,
    analyzeAI,
    renderAI
  };
})();