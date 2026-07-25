// チャッピーボートレースAI
// 技量・級別・当地実績を、展開を壊さない補助情報として整理する。
// 印・買い目・既存スコア・中心展開は変更しない。
(function () {
  "use strict";

  if (window.__CHAPPY_SKILL_LOCAL_SUPPORT_INSTALLED__) return;
  window.__CHAPPY_SKILL_LOCAL_SUPPORT_INSTALLED__ = true;

  function num(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function boatNo(row) {
    const n = num(row?.boatNo ?? row?.boat ?? row?.waku ?? row?.lane ?? row?.course);
    return n && n >= 1 && n <= 6 ? n : 0;
  }

  function firstValue(row, keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return null;
  }

  function collectRows(prediction, data) {
    const candidates = [
      prediction?.boats,
      prediction?.entries,
      prediction?.racers,
      prediction?.race?.boats,
      prediction?.race?.entries,
      data?.boats,
      data?.entries,
      data?.racers,
      data?.race?.boats,
      data?.race?.entries
    ];

    for (const rows of candidates) {
      if (Array.isArray(rows) && rows.length) return rows;
    }
    return [];
  }

  function normalizeClass(value) {
    const text = String(value ?? "").toUpperCase().trim();
    const match = text.match(/A1|A2|B1|B2/);
    return match ? match[0] : "";
  }

  function evaluate(row) {
    const grade = normalizeClass(firstValue(row, ["class", "grade", "rank", "kyu", "className"]));
    const national = num(firstValue(row, ["nationalWinRate", "nationalRate", "winRate", "rate", "zenkokuRate"]));
    const local = num(firstValue(row, ["localWinRate", "localRate", "touchiRate", "venueRate"]));
    const avgST = num(firstValue(row, ["avgST", "averageST", "stAverage", "nationalST"]));
    const localST = num(firstValue(row, ["localST", "touchiST", "venueST"]));
    const firstRate = num(firstValue(row, ["firstRate", "win1Rate", "firstPlaceRate", "oneRate"]));

    const positives = [];
    const cautions = [];

    if (grade === "A1") positives.push("A1級の技量");
    else if (grade === "A2") positives.push("A2級の安定力");
    else if (grade === "B2") cautions.push("B2級で技量面は慎重");

    if (national !== null && national >= 6.5) positives.push("全国勝率上位");
    if (local !== null && local >= 6.5) positives.push("当地実績上位");
    if (local !== null && national !== null && local >= national + 0.7) positives.push("当地で成績上昇");
    if (avgST !== null && avgST <= 0.14) positives.push("平均ST良好");
    if (localST !== null && localST <= 0.14) positives.push("当地ST良好");
    if (firstRate !== null && firstRate >= 25) positives.push("1着率良好");

    if (avgST !== null && avgST >= 0.20) cautions.push("平均ST遅め");
    if (localST !== null && localST >= 0.20) cautions.push("当地ST遅め");
    if (local !== null && local < 4.5) cautions.push("当地実績は弱め");

    return {
      boatNo: boatNo(row),
      grade,
      nationalWinRate: national,
      localWinRate: local,
      avgST,
      localST,
      firstRate,
      positives: [...new Set(positives)],
      cautions: [...new Set(cautions)]
    };
  }

  function build(prediction, data) {
    const rows = collectRows(prediction, data);
    const evaluations = rows.map(evaluate).filter(item => item.boatNo);
    const attackBoat = Number(
      prediction?.flowPriority?.attackBoatNo ??
      prediction?.flowPriority?.attackBoat ??
      prediction?.raceFlow?.attackBoatNo ??
      prediction?.mainSheet?.honmei?.boatNo ??
      0
    );

    const target = evaluations.find(item => item.boatNo === attackBoat) || null;
    const confirmations = target?.positives?.slice(0, 2) || [];
    const cautions = target?.cautions?.slice(0, 2) || [];

    let comment = "技量・当地データは展開判断の補助として確認";
    if (target && confirmations.length) {
      comment = `${target.boatNo}号艇は${confirmations.join("・")}で中心展開を後押し`;
    } else if (target && cautions.length) {
      comment = `${target.boatNo}号艇は${cautions.join("・")}のため過信注意`;
    }

    return {
      attackBoatNo: attackBoat || null,
      comment,
      confirmations,
      cautions,
      boats: evaluations,
      policy: {
        changesMainFlow: false,
        changesTickets: false,
        priority: 7,
        label: "技量"
      }
    };
  }

  function enhance(prediction, data) {
    if (!prediction || typeof prediction !== "object") return prediction;
    const skillLocalSupport = build(prediction, data);
    const flowPriority = prediction.flowPriority || {};

    return {
      ...prediction,
      skillLocalSupport,
      flowPriority: {
        ...flowPriority,
        skillComment: skillLocalSupport.comment,
        confirmations: [
          ...(Array.isArray(flowPriority.confirmations) ? flowPriority.confirmations : []),
          ...skillLocalSupport.confirmations
        ].filter((value, index, array) => value && array.indexOf(value) === index),
        cautions: [
          ...(Array.isArray(flowPriority.cautions) ? flowPriority.cautions : []),
          ...skillLocalSupport.cautions
        ].filter((value, index, array) => value && array.indexOf(value) === index)
      }
    };
  }

  function install() {
    const base = window.createPrediction;
    if (typeof base !== "function" || base.__chappySkillLocalSupportWrapped) return false;

    function wrappedCreatePrediction(data) {
      return enhance(base(data), data);
    }

    wrappedCreatePrediction.__chappySkillLocalSupportWrapped = true;
    wrappedCreatePrediction.__chappyBaseCreatePrediction = base;
    window.createPrediction = wrappedCreatePrediction;
    return true;
  }

  window.ChappyPredictionSkillLocalSupport = { build, enhance, install };

  if (!install()) {
    window.addEventListener("chappy:hiyori-runtime-ready", install, { once: true });
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();
