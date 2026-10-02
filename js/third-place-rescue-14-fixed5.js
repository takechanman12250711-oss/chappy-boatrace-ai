(function (root) {
  "use strict";

  if (root.ChappyThirdPlaceRescue14Fixed5) return;

  const THRESHOLDS = Object.freeze({
    ex: -0.13,
    flow: 5.2,
    hold: 5.7
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
      ex: ["indexes.exhibition", "indexes.ex", "exhibition", "ex"],
      flow: ["indexes.raceFlow", "raceFlow"],
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

  function chooseAlternative(analyses) {
    return [2, 5, 6]
      .map(no => ({ no, boat: findBoat(analyses, no) }))
      .filter(item => item.boat)
      .sort((a, b) => metricByKey(b.boat, "pickup") - metricByKey(a.boat, "pickup"))[0] || null;
  }

  function signalDiffs(prediction) {
    const analyses = analysesOf(prediction);
    const boat3 = findBoat(analyses, 3);
    const alternative = chooseAlternative(analyses);
    if (!boat3 || !alternative) return null;
    return {
      alternative: alternative.no,
      ex: metricByKey(alternative.boat, "ex") - metricByKey(boat3, "ex"),
      flow: metricByKey(alternative.boat, "flow") - metricByKey(boat3, "flow"),
      hold: metricByKey(alternative.boat, "hold") - metricByKey(boat3, "hold")
    };
  }

  function shouldApply(prediction) {
    const current = basicFive(prediction?.formations);
    if (current.length < 5 || !current.includes("1-4-3")) return false;
    const diffs = signalDiffs(prediction);
    if (!diffs) return false;
    const passed = [
      diffs.ex <= THRESHOLDS.ex,
      diffs.flow <= THRESHOLDS.flow,
      diffs.hold <= THRESHOLDS.hold
    ].filter(Boolean).length;
    return passed >= 2;
  }

  function rescueTicket(prediction) {
    const diffs = signalDiffs(prediction);
    return diffs ? `1-4-${diffs.alternative}` : "";
  }

  function apply(prediction) {
    if (!prediction || !shouldApply(prediction)) return prediction;
    const formations = prediction.formations;
    const ticket = rescueTicket(prediction);
    if (!ticket || basicFive(formations).includes(ticket)) return prediction;

    const main = Array.isArray(formations?.main) ? formations.main.slice() : [];
    const safety = Array.isArray(formations?.safety) ? formations.safety.slice() : [];
    let replaced = "";
    let location = "";
    let index = -1;

    const mainIndex = main.slice(0, 3).map(String).indexOf("1-4-3");
    if (mainIndex >= 0) {
      replaced = main[mainIndex];
      main[mainIndex] = ticket;
      location = "main";
      index = mainIndex;
    } else {
      const safetyIndex = safety.slice(0, 2).map(String).indexOf("1-4-3");
      if (safetyIndex < 0) return prediction;
      replaced = safety[safetyIndex];
      safety[safetyIndex] = ticket;
      location = "safety";
      index = safetyIndex;
    }

    return {
      ...prediction,
      formations: {
        ...formations,
        main,
        safety,
        thirdPlaceRescue14Fixed5: {
          applied: true,
          rule: "twoOf3_replace_1-4-3",
          thresholds: { ...THRESHOLDS },
          ticket,
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
    if (core.__thirdPlaceRescue14Fixed5Installed) return true;

    const originalBuildPredictionData = core.buildPredictionData.bind(core);
    root.ChappyAICore = Object.freeze({
      ...core,
      __thirdPlaceRescue14Fixed5Installed: true,
      buildPredictionData(data) {
        return apply(originalBuildPredictionData(data));
      }
    });
    return true;
  }

  root.ChappyThirdPlaceRescue14Fixed5 = Object.freeze({
    version: "20260821-twoof3-v1",
    thresholds: THRESHOLDS,
    chooseAlternative,
    signalDiffs,
    shouldApply,
    rescueTicket,
    apply,
    install
  });

  install();
})(typeof window !== "undefined" ? window : globalThis);
