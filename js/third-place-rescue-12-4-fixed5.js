(function (root) {
  "use strict";

  if (root.ChappyThirdPlaceRescue124Fixed5) return;

  const THRESHOLDS = Object.freeze({
    st: 0.1385,
    flow: 3.9203,
    attack: 1.2305,
    hold: 4.5277,
    pickup: 1.3926
  });

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function boatNoOf(item, index = 0) {
    return Number(item?.boatNo ?? item?.boat ?? item?.no ?? index + 1);
  }

  function findBoat(list, boatNo) {
    return (list || []).find((item, index) => boatNoOf(item, index) === boatNo) || null;
  }

  function metric(item, paths) {
    for (const path of paths) {
      let value = item;
      for (const key of path.split(".")) value = value?.[key];
      const n = toNumber(value);
      if (n !== null) return n;
    }
    return 0;
  }

  function metricByKey(item, key) {
    const map = {
      st: ["indexes.st", "stIndex", "st"],
      flow: ["indexes.raceFlow", "raceFlow"],
      attack: ["roleScores.attack", "attack"],
      hold: ["roleScores.hold", "hold"],
      pickup: ["roleScores.pickup", "pickup"]
    };
    return metric(item, map[key]);
  }

  function basicFive(formations) {
    return [
      ...(formations?.main || []).slice(0, 3),
      ...(formations?.safety || []).slice(0, 2)
    ].map(String);
  }

  function analysesOf(prediction) {
    return prediction?.analyses || prediction?.evaluations || prediction?.boatEvaluation?.evaluations || [];
  }

  function signalDiffs(prediction) {
    const analyses = analysesOf(prediction);
    const boat3 = findBoat(analyses, 3);
    const boat4 = findBoat(analyses, 4);
    if (!boat3 || !boat4) return null;
    return {
      st: metricByKey(boat4, "st") - metricByKey(boat3, "st"),
      flow: metricByKey(boat4, "flow") - metricByKey(boat3, "flow"),
      attack: metricByKey(boat4, "attack") - metricByKey(boat3, "attack"),
      hold: metricByKey(boat4, "hold") - metricByKey(boat3, "hold"),
      pickup: metricByKey(boat4, "pickup") - metricByKey(boat3, "pickup")
    };
  }

  function shouldApply(prediction) {
    const current = basicFive(prediction?.formations);
    if (current.length < 5 || !current.includes("1-2-3") || current.includes("1-2-4")) return false;
    const diffs = signalDiffs(prediction);
    if (!diffs) return false;
    return diffs.st >= THRESHOLDS.st &&
      diffs.flow >= THRESHOLDS.flow &&
      diffs.attack >= THRESHOLDS.attack &&
      diffs.hold >= THRESHOLDS.hold &&
      diffs.pickup >= THRESHOLDS.pickup;
  }

  function apply(prediction) {
    if (!prediction || !shouldApply(prediction)) return prediction;
    const formations = prediction.formations;
    const main = Array.isArray(formations?.main) ? formations.main.slice() : [];
    const safety = Array.isArray(formations?.safety) ? formations.safety.slice() : [];
    let replaced = "";
    let location = "";
    let index = -1;

    const mainIndex = main.slice(0, 3).map(String).indexOf("1-2-3");
    if (mainIndex >= 0) {
      replaced = main[mainIndex];
      main[mainIndex] = "1-2-4";
      location = "main";
      index = mainIndex;
    } else {
      const safetyIndex = safety.slice(0, 2).map(String).indexOf("1-2-3");
      if (safetyIndex < 0) return prediction;
      replaced = safety[safetyIndex];
      safety[safetyIndex] = "1-2-4";
      location = "safety";
      index = safetyIndex;
    }

    return {
      ...prediction,
      formations: {
        ...formations,
        main,
        safety,
        thirdPlaceRescue124Fixed5: {
          applied: true,
          rule: "fiveOf5_replace_1-2-3",
          thresholds: { ...THRESHOLDS },
          ticket: "1-2-4",
          replaced,
          location,
          index,
          diffs: signalDiffs(prediction)
        }
      }
    };
  }

  function install() {
    const core = root.ChappyAICore;
    if (!core || typeof core.buildPredictionData !== "function") return false;
    if (core.__thirdPlaceRescue124Fixed5Installed) return true;

    const originalBuildPredictionData = core.buildPredictionData.bind(core);
    root.ChappyAICore = Object.freeze({
      ...core,
      __thirdPlaceRescue124Fixed5Installed: true,
      buildPredictionData(data) {
        return apply(originalBuildPredictionData(data));
      }
    });
    return true;
  }

  root.ChappyThirdPlaceRescue124Fixed5 = Object.freeze({
    version: "20260822-fiveof5-v1",
    thresholds: THRESHOLDS,
    signalDiffs,
    shouldApply,
    apply,
    install
  });

  install();
})(typeof window !== "undefined" ? window : globalThis);
