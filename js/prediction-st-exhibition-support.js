// チャッピーボートレースAI
// 展開・コースを主軸に、ST・スリット・展示気配を補助情報として接続する。
// 中心展開、印、買い目、既存スコアは変更しない。
(function () {
  "use strict";

  if (window.__CHAPPY_ST_EXHIBITION_SUPPORT_INSTALLED__) return;
  window.__CHAPPY_ST_EXHIBITION_SUPPORT_INSTALLED__ = true;

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function boatNoOf(row, fallback) {
    const n = Number(row?.boatNo ?? row?.boat ?? row?.waku ?? row?.course ?? fallback);
    return Number.isFinite(n) && n >= 1 && n <= 6 ? n : fallback;
  }

  function normalizeRows(data, prediction) {
    const candidates = [
      data?.boats,
      data?.entries,
      data?.racers,
      data?.race?.boats,
      data?.race?.entries,
      prediction?.boats,
      prediction?.entries,
      prediction?.race?.boats,
      prediction?.race?.entries,
      prediction?.ranking
    ];

    const source = candidates.find(Array.isArray) || [];
    return source.slice(0, 6).map((row, index) => ({
      raw: row || {},
      boatNo: boatNoOf(row, index + 1),
      st: numberOrNull(
        row?.currentST ?? row?.exhibitionST ?? row?.tenjiST ?? row?.st ?? row?.startTiming ??
        row?.averageST ?? row?.avgST
      ),
      exhibition: numberOrNull(
        row?.exhibitionTime ?? row?.tenjiTime ?? row?.displayTime ?? row?.exTime ?? row?.time
      ),
      lap: numberOrNull(row?.lapTime ?? row?.oneLapTime ?? row?.isshuTime),
      turn: numberOrNull(row?.turnTime ?? row?.mawariashiTime),
      straight: numberOrNull(row?.straightTime ?? row?.chokusenTime)
    }));
  }

  function rankAscending(rows, key) {
    return rows
      .filter(row => row[key] !== null && row[key] > 0)
      .slice()
      .sort((a, b) => a[key] - b[key])
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  function findRank(ranked, boatNo) {
    return ranked.find(row => row.boatNo === Number(boatNo))?.rank ?? null;
  }

  function build(prediction, data) {
    const flow = prediction?.flowPriority || {};
    const attackBoat = Number(flow.attackBoatNo ?? flow.attackBoat ?? flow.boatNo ?? 0);
    const rows = normalizeRows(data, prediction);
    const stRanked = rankAscending(rows, "st");
    const exhibitionRanked = rankAscending(rows, "exhibition");

    const attackST = rows.find(row => row.boatNo === attackBoat)?.st ?? null;
    const attackExhibition = rows.find(row => row.boatNo === attackBoat)?.exhibition ?? null;
    const attackSTRank = findRank(stRanked, attackBoat);
    const attackExhibitionRank = findRank(exhibitionRanked, attackBoat);

    const alerts = [];
    const confirms = [];

    if (attackBoat && attackSTRank !== null) {
      if (attackSTRank <= 2) confirms.push(`${attackBoat}号艇はスリット上位で中心展開を後押し`);
      if (attackSTRank >= 5) alerts.push(`${attackBoat}号艇はスリット下位で攻め切れない可能性`);
    }

    if (attackBoat && attackExhibitionRank !== null) {
      if (attackExhibitionRank <= 2) confirms.push(`${attackBoat}号艇は展示上位で展開を補強`);
      if (attackExhibitionRank >= 5) alerts.push(`${attackBoat}号艇は展示下位で過信注意`);
    }

    // 隣接艇とのST差0.10以上だけを明確なスリット注意として扱う。
    if (attackBoat && attackST !== null) {
      const neighbors = rows.filter(row => Math.abs(row.boatNo - attackBoat) === 1 && row.st !== null);
      neighbors.forEach(row => {
        const diff = attackST - row.st;
        if (diff >= 0.10) alerts.push(`${row.boatNo}号艇が${attackBoat}号艇よりSTで0.10以上先行`);
        if (diff <= -0.10) confirms.push(`${attackBoat}号艇が${row.boatNo}号艇よりSTで0.10以上先行`);
      });
    }

    const validST = stRanked.length;
    const validExhibition = exhibitionRanked.length;
    let status = "データ不足";
    if (validST >= 4 || validExhibition >= 4) status = alerts.length ? "注意あり" : confirms.length ? "後押し" : "中立";

    const commentParts = [];
    if (confirms.length) commentParts.push(confirms[0]);
    if (alerts.length) commentParts.push(alerts[0]);
    if (!commentParts.length && status !== "データ不足") commentParts.push("ST・展示は中心展開を大きく崩す材料なし");
    if (!commentParts.length) commentParts.push("ST・展示データ不足のため展開とコースを優先");

    return {
      status,
      attackBoatNo: attackBoat || null,
      attackSTRank,
      attackExhibitionRank,
      confirms: [...new Set(confirms)].slice(0, 3),
      alerts: [...new Set(alerts)].slice(0, 3),
      comment: commentParts.join("。") + "。",
      dataCoverage: {
        st: validST,
        exhibition: validExhibition
      },
      rule: "展開→コースを固定し、ST・スリット→展示・足は補正に限定"
    };
  }

  function enhance(prediction, data) {
    if (!prediction || typeof prediction !== "object") return prediction;
    const flowSupport = build(prediction, data);
    const flow = prediction.flowPriority || {};
    const existingNotes = Array.isArray(flow.notes) ? flow.notes : [];

    return {
      ...prediction,
      flowSupport,
      flowPriority: {
        ...flow,
        supportComment: flowSupport.comment,
        confirmations: flowSupport.confirms,
        cautions: flowSupport.alerts,
        notes: [...new Set([...existingNotes, ...flowSupport.alerts])].slice(0, 4)
      }
    };
  }

  function install() {
    const base = window.createPrediction;
    if (typeof base !== "function" || base.__chappySTExhibitionSupportWrapped) return false;

    function wrappedCreatePrediction(data) {
      return enhance(base(data), data);
    }

    wrappedCreatePrediction.__chappySTExhibitionSupportWrapped = true;
    wrappedCreatePrediction.__chappyBaseCreatePrediction = base;
    window.createPrediction = wrappedCreatePrediction;
    return true;
  }

  window.ChappyPredictionSTExhibitionSupport = { build, enhance, install };

  if (!install()) {
    window.addEventListener("chappy:hiyori-runtime-ready", install, { once: true });
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();