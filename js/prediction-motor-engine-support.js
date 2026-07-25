// チャッピーボートレースAI
// モーター評価と新エンジン期の重み切り替え。
// モーターは最終補正のみ。展開・印・買い目・既存スコアは変更しない。
(function () {
  "use strict";

  if (window.__CHAPPY_MOTOR_ENGINE_SUPPORT_INSTALLED__) return;
  window.__CHAPPY_MOTOR_ENGINE_SUPPORT_INSTALLED__ = true;

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function boatNoOf(item) {
    const n = Number(item?.boatNo ?? item?.number ?? item?.lane ?? item?.waku);
    return n >= 1 && n <= 6 ? n : 0;
  }

  function entriesOf(prediction, data) {
    const candidates = [
      prediction?.entries,
      prediction?.boats,
      prediction?.race?.entries,
      data?.entries,
      data?.boats,
      data?.race?.entries
    ];
    return candidates.find(Array.isArray) || [];
  }

  function isNewEngineMode(prediction, data) {
    if (prediction?.newEngine?.updated || prediction?.newEngine?.isNewEngineMode) return true;
    if (data?.newEngine?.updated || data?.newEngine?.isNewEngineMode) return true;
    const source = JSON.stringify({
      event: data?.event,
      race: data?.race,
      memo: data?.memo,
      title: data?.title,
      newEngine: data?.newEngine
    });
    return /(新エンジン|新型エンジン|新モーター|新燃料)/.test(source);
  }

  function motorRate(item) {
    return numberOrNull(
      item?.motor2Rate ?? item?.motorSecondRate ?? item?.motorRate ??
      item?.motor?.rate2 ?? item?.motor?.secondRate ?? item?.motor?.twoRate
    );
  }

  function exhibition(item) {
    return numberOrNull(item?.exhibitionTime ?? item?.displayTime ?? item?.tenjiTime ?? item?.exhibition);
  }

  function currentSt(item) {
    return numberOrNull(item?.currentST ?? item?.seriesST ?? item?.konsetsuST ?? item?.averageST ?? item?.avgST);
  }

  function classRank(item) {
    const rank = text(item?.class ?? item?.rank ?? item?.grade).toUpperCase();
    return ({ A1: 4, A2: 3, B1: 2, B2: 1 })[rank] || 0;
  }

  function centerBoatNo(prediction) {
    return Number(
      prediction?.flowPriority?.attackBoatNo ??
      prediction?.mainSheet?.honmei?.boatNo ??
      prediction?.ranking?.[0]?.boatNo ?? 0
    );
  }

  function build(prediction, data) {
    const entries = entriesOf(prediction, data);
    const centerNo = centerBoatNo(prediction);
    const center = entries.find(item => boatNoOf(item) === centerNo) || null;
    const newEngineMode = isNewEngineMode(prediction, data);

    const motorValues = entries.map(motorRate).filter(v => v !== null);
    const centerMotor = center ? motorRate(center) : null;
    const confirmations = [];
    const cautions = [];

    if (newEngineMode) {
      confirmations.push("新エンジン期は展示・今節ST・技量を優先");
      if (center && exhibition(center) !== null) confirmations.push(`${centerNo}号艇は展示気配を最終確認`);
      if (center && currentSt(center) !== null) confirmations.push(`${centerNo}号艇は今節STを重視`);
      cautions.push("モーター実績の比重を下げて過信しない");
    } else if (centerMotor !== null && motorValues.length >= 3) {
      const sorted = [...motorValues].sort((a, b) => b - a);
      const rank = sorted.indexOf(centerMotor) + 1;
      if (rank <= 2) confirmations.push(`${centerNo}号艇はモーター実績上位で展開を補助`);
      if (rank >= Math.max(5, motorValues.length - 1)) cautions.push(`${centerNo}号艇はモーター実績下位で過信注意`);
    }

    if (center && classRank(center) >= 3 && newEngineMode) {
      confirmations.push(`${centerNo}号艇は技量面を新エンジン期の補助材料にする`);
    }

    const comment = newEngineMode
      ? "新エンジン期のため、展示・今節ST・技量を優先し、モーター数字は最終補正に留める。"
      : confirmations[0] || cautions[0] || "モーターは展開判断後の最終補正として扱う。";

    return {
      mode: newEngineMode ? "new-engine" : "normal",
      newEngineMode,
      centerBoatNo: centerNo || null,
      centerMotorRate: centerMotor,
      weights: newEngineMode
        ? { st: 0.22, exhibition: 0.23, motor: 0.05, local: 0.14, skill: 0.10, attack: 0.14, raceFlow: 0.08, turn: 0.04 }
        : { st: 0.18, exhibition: 0.18, motor: 0.12, local: 0.13, skill: 0.10, attack: 0.13, raceFlow: 0.10, turn: 0.06 },
      confirmations: [...new Set(confirmations)],
      cautions: [...new Set(cautions)],
      comment,
      policy: "motor-is-final-support-only"
    };
  }

  function enhance(prediction, data) {
    if (!prediction || typeof prediction !== "object") return prediction;
    const motorEngineSupport = build(prediction, data);
    const flow = prediction.flowPriority || {};
    return {
      ...prediction,
      motorEngineSupport,
      flowPriority: {
        ...flow,
        motorComment: motorEngineSupport.comment,
        confirmations: [...new Set([...(flow.confirmations || []), ...motorEngineSupport.confirmations])],
        cautions: [...new Set([...(flow.cautions || []), ...motorEngineSupport.cautions])]
      }
    };
  }

  function install() {
    const base = window.createPrediction;
    if (typeof base !== "function" || base.__chappyMotorEngineSupportWrapped) return false;
    function wrappedCreatePrediction(data) {
      return enhance(base(data), data);
    }
    wrappedCreatePrediction.__chappyMotorEngineSupportWrapped = true;
    wrappedCreatePrediction.__chappyBaseCreatePrediction = base;
    window.createPrediction = wrappedCreatePrediction;
    return true;
  }

  window.ChappyPredictionMotorEngineSupport = { build, enhance, install, isNewEngineMode };
  if (!install()) {
    window.addEventListener("chappy:hiyori-runtime-ready", install, { once: true });
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();
