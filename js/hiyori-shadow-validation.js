// js/hiyori-shadow-validation.js
// 承認済み提案を実予想へ反映せず、別系統で仮補正・比較・結果照合する。
// 予想ロジック・印・配点・買い目には影響しない。
(function () {
  "use strict";

  const APPROVAL_KEY = "chappy_hiyori_proposal_approvals_v1";
  const PROPOSAL_KEY = "chappy_hiyori_change_proposals_v1";
  const SHADOW_KEY = "chappy_hiyori_shadow_validation_v1";
  const MAX_ROWS = 1000;

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(rows) {
    localStorage.setItem(SHADOW_KEY, JSON.stringify(rows.slice(0, MAX_ROWS)));
  }

  function raceKey(input) {
    const date = String(input?.date || input?.raceDate || "").replace(/\D/g, "").slice(0, 8);
    const jcd = String(input?.jcd || input?.placeCode || "").padStart(2, "0");
    const raceNo = Number(input?.raceNo || input?.rno || 0);
    return date && /^\d{2}$/.test(jcd) && raceNo >= 1 && raceNo <= 12
      ? `${date}-${jcd}-${raceNo}`
      : "";
  }

  function approvedProposalIds() {
    const approvals = read(APPROVAL_KEY, []);
    const list = Array.isArray(approvals) ? approvals : approvals?.items || [];
    return new Set(list.filter(row => row?.status === "approved" && row?.applied !== true).map(row => row.proposalId || row.id));
  }

  function activeProposals() {
    const proposals = read(PROPOSAL_KEY, []);
    const list = Array.isArray(proposals) ? proposals : proposals?.items || [];
    const ids = approvedProposalIds();
    return list.filter(row => ids.has(row?.id || row?.proposalId));
  }

  function numericArray(value) {
    return Array.isArray(value) ? value.slice(0, 6).map(v => Number(v) || 0) : [];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function proposalDelta(proposal, boatNo, input) {
    const group = String(proposal?.group || proposal?.target || "");
    const label = String(proposal?.label || proposal?.condition || "");
    const max = Math.abs(Number(proposal?.maxAdjustment ?? proposal?.limit ?? 0));
    if (!max) return 0;

    const exhibition = numericArray(input?.exhibition || input?.exhibitionTimes || input?.tenji);
    const lapTimes = numericArray(input?.lapTimes || input?.lap || input?.oneLapTimes);
    const st = numericArray(input?.startExhibition || input?.stExhibition);
    const odds = numericArray(input?.combinedOdds || input?.syntheticOdds || input?.gouseiOdds);

    function rank(values, lowerIsBetter) {
      return values.map((value, i) => ({ boatNo: i + 1, value })).filter(row => row.value > 0)
        .sort((a, b) => lowerIsBetter ? a.value - b.value : b.value - a.value)
        .findIndex(row => row.boatNo === boatNo) + 1;
    }

    let matched = false;
    if (group.includes("展示")) matched = label.includes(`${rank(exhibition, true)}位`);
    else if (group.includes("一周")) matched = label.includes(`${rank(lapTimes, true)}位`);
    else if (group.includes("ST")) matched = label.includes(`${rank(st, true)}位`);
    else if (group.includes("合成オッズ")) matched = label.includes(`${rank(odds, true)}位`);
    else if (group.includes("新エンジン")) matched = Boolean(input?.isNewEngine) === label.includes("新");
    else if (group.includes("新燃料")) matched = Boolean(input?.isNewFuel) === label.includes("新");
    else if (group.includes("気象") || group.includes("水面")) {
      const wind = Number(input?.weather?.windSpeed ?? input?.windSpeed ?? 0);
      const wave = Number(input?.weather?.waveHeight ?? input?.waveHeight ?? 0);
      const band = wind >= 6 || wave >= 6 ? "強風・高波" : wind >= 3 || wave >= 3 ? "中程度" : "穏やか";
      matched = label.includes(band);
    }

    if (!matched) return 0;
    const direction = Number(proposal?.direction ?? proposal?.suggestedDirection ?? 1) < 0 ? -1 : 1;
    const confidence = clamp(Number(proposal?.confidenceScore ?? proposal?.reliabilityScore ?? 50), 0, 100) / 100;
    return Math.round(max * confidence * direction * 10) / 10;
  }

  function simulate(input) {
    const key = raceKey(input);
    if (!key) return null;
    const proposals = activeProposals();
    if (!proposals.length) return null;

    const baseScores = numericArray(input?.scores || input?.boatScores || input?.predictionScores);
    if (baseScores.length !== 6) return null;

    const shadowScores = baseScores.map((score, index) => {
      const delta = proposals.reduce((sum, proposal) => sum + proposalDelta(proposal, index + 1, input), 0);
      return Math.round((score + delta) * 10) / 10;
    });

    const baseOrder = baseScores.map((score, i) => ({ boatNo: i + 1, score })).sort((a, b) => b.score - a.score).map(row => row.boatNo);
    const shadowOrder = shadowScores.map((score, i) => ({ boatNo: i + 1, score })).sort((a, b) => b.score - a.score).map(row => row.boatNo);
    const changed = baseOrder.join("-") !== shadowOrder.join("-");

    const row = {
      id: `${key}-${Date.now()}`,
      raceKey: key,
      createdAt: new Date().toISOString(),
      proposalIds: proposals.map(row => row.id || row.proposalId),
      baseScores,
      shadowScores,
      baseOrder,
      shadowOrder,
      changed,
      result: null,
      evaluated: false,
      shadowOnly: true,
      appliedToPrediction: false
    };

    const rows = read(SHADOW_KEY, []);
    write([row, ...(Array.isArray(rows) ? rows : [])]);
    window.dispatchEvent(new CustomEvent("chappy:hiyori-shadow-simulated", { detail: row }));
    return row;
  }

  function attachResult(input) {
    const key = raceKey(input);
    if (!key) return false;
    const resultOrder = Array.isArray(input?.result?.order)
      ? input.result.order.map(Number)
      : Array.isArray(input?.order) ? input.order.map(Number) : [];
    if (!resultOrder.length) return false;

    const rows = read(SHADOW_KEY, []);
    let changed = false;
    const next = (Array.isArray(rows) ? rows : []).map(row => {
      if (row.raceKey !== key || row.evaluated) return row;
      changed = true;
      const winner = resultOrder[0];
      return {
        ...row,
        result: { order: resultOrder },
        evaluated: true,
        evaluatedAt: new Date().toISOString(),
        baseTopHit: row.baseOrder?.[0] === winner,
        shadowTopHit: row.shadowOrder?.[0] === winner,
        effect: row.shadowOrder?.[0] === winner && row.baseOrder?.[0] !== winner
          ? "improved"
          : row.baseOrder?.[0] === winner && row.shadowOrder?.[0] !== winner
            ? "worsened"
            : "neutral"
      };
    });
    if (changed) {
      write(next);
      window.dispatchEvent(new CustomEvent("chappy:hiyori-shadow-evaluated", { detail: { raceKey: key } }));
    }
    return changed;
  }

  function summary() {
    const rows = read(SHADOW_KEY, []);
    const evaluated = (Array.isArray(rows) ? rows : []).filter(row => row.evaluated);
    const improved = evaluated.filter(row => row.effect === "improved").length;
    const worsened = evaluated.filter(row => row.effect === "worsened").length;
    const neutral = evaluated.filter(row => row.effect === "neutral").length;
    return {
      total: Array.isArray(rows) ? rows.length : 0,
      evaluated: evaluated.length,
      improved,
      worsened,
      neutral,
      netEffect: improved - worsened
    };
  }

  function install() {
    window.addEventListener("chappy:prediction-ready", event => {
      if (event?.detail) simulate(event.detail);
    });
    window.addEventListener("chappy:race-result-ready", event => {
      if (event?.detail) attachResult(event.detail);
    });
  }

  window.ChappyHiyoriShadowValidation = { simulate, attachResult, summary, activeProposals };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();