// チャッピーボートレースAI
// 予想時に表示する評価を「本線信頼度」または「波乱入口」の1つへ統一する。
// 既存の印・買い目・予想スコアは変更しない。

// Nodeの履歴収集ではブラウザのhiyori-runtime-loaderを通らないため、
// createPrediction生成後に本番と同じ補助層を同じ順序で接続する。
// ブラウザではrequireが存在しないので従来どおりruntime-loader側だけが担当する。
if (typeof module !== "undefined" && module.exports && typeof require === "function") {
  [
    "./prediction-flow-priority",
    "./prediction-st-exhibition-support",
    "./prediction-venue-water-support",
    "./prediction-skill-local-support",
    "./prediction-motor-engine-support",
    "./prediction-engine-integration"
  ].forEach(path => require(path));
}

(function () {
  "use strict";

  if (window.__CHAPPY_SIMPLE_EVALUATION_INSTALLED__) return;
  window.__CHAPPY_SIMPLE_EVALUATION_INSTALLED__ = true;

  function num(value, fallback = 0) {
    if (value && typeof value === "object") {
      value = value.score ?? value.value ?? value.point;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value) {
    return Math.max(0, Math.min(100, Math.round(num(value, 0))));
  }

  function level(score) {
    if (score >= 82) return "高";
    if (score >= 68) return "中";
    return "低";
  }

  function firstText(values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "展開・コースを中心に判断";
  }

  function build(prediction) {
    const finalAi = prediction?.finalAi || {};
    const ai = prediction?.ai || {};
    const weather = prediction?.weather || prediction?.race?.weather || {};
    const engine = prediction?.predictionEngine || finalAi.engine || {};

    const mainScore = clamp(
      finalAi.confidence ??
      prediction?.confidence ??
      ai.trust ??
      ai.mainTrust ??
      prediction?.buyLevel?.score ??
      50
    );

    const chaosScore = clamp(
      finalAi.manshuPower ??
      prediction?.manshuPower ??
      ai.manshu ??
      ai.manshuPower ??
      weather.insideRisk ??
      40
    );

    // 波乱を表示するのは、本線より明確に強い場合だけ。
    // 数値が近いだけでは表示を切り替えず、迷いを増やさない。
    const showChaos = chaosScore >= 70 && chaosScore >= mainScore + 8;
    const score = showChaos ? chaosScore : mainScore;

    const mainComment = firstText([
      engine.finalComment,
      engine.mainComment,
      prediction?.flowPriority?.comment,
      prediction?.raceFlow?.comment,
      prediction?.raceFlow?.title,
      prediction?.final?.comment,
      finalAi.summary,
      ai.comment
    ]);

    const notes = [];
    if (Array.isArray(engine.supportComments)) {
      notes.push(...engine.supportComments.filter(Boolean).slice(0, 2));
    }

    const memo = prediction?.final?.memo;
    if (!notes.length && Array.isArray(memo)) {
      notes.push(...memo.filter(Boolean).slice(0, 2));
    }

    if (!notes.length && weather.insideRisk >= 70) {
      notes.push("内側の取りこぼしに注意");
    }

    if (!notes.length && prediction?.newEngine?.updated) {
      notes.push("新エンジン期は展示気配を優先");
    }

    if (engine.complete === false && Array.isArray(engine.missingLayers) && engine.missingLayers.length) {
      notes.push(`未接続層：${engine.missingLayers.join(" / ")}`);
    }

    return {
      mode: showChaos ? "chaos" : "main",
      label: showChaos ? "波乱入口" : "本線信頼度",
      level: level(score),
      score,
      mainComment,
      notes: [...new Set(notes)].slice(0, 3),
      engineComplete: engine.complete !== false,
      internal: {
        mainScore,
        chaosScore,
        engineStatus: engine.status || "unknown",
        missingLayers: Array.isArray(engine.missingLayers) ? engine.missingLayers.slice() : []
      }
    };
  }

  function enhance(prediction) {
    if (!prediction || typeof prediction !== "object") return prediction;
    const simpleEvaluation = build(prediction);
    return {
      ...prediction,
      simpleEvaluation,
      finalAi: {
        ...(prediction.finalAi || {}),
        simpleEvaluation
      }
    };
  }

  function install() {
    const base = window.createPrediction;
    if (typeof base !== "function" || base.__chappySimpleEvaluationWrapped) return false;

    function wrappedCreatePrediction(data) {
      return enhance(base(data));
    }

    wrappedCreatePrediction.__chappySimpleEvaluationWrapped = true;
    wrappedCreatePrediction.__chappyBaseCreatePrediction = base;
    window.createPrediction = wrappedCreatePrediction;
    return true;
  }

  window.ChappyPredictionSimpleEvaluation = {
    build,
    enhance,
    install
  };

  if (!install()) {
    window.addEventListener("chappy:hiyori-runtime-ready", install, { once: true });
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();