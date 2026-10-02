(function (root) {
  "use strict";

  if (root.ChappyEscapeOuterSecondRescueFixed5) return;

  const THRESHOLDS = Object.freeze({
    st: -0.27,
    ex: -1.98,
    flow: -16.84,
    attack: -2.4,
    hold: -11.67,
    pickup: 1.93
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
      st: ["indexes.st", "st"],
      ex: ["indexes.exhibition", "indexes.ex", "exhibition", "ex"],
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

  function outerMinusInnerDiffs(analyses) {
    const inner = [2, 3, 4].map(no => findBoat(analyses, no));
    const outer = [5, 6].map(no => findBoat(analyses, no));
    const diffs = {};
    for (const key of Object.keys(THRESHOLDS)) {
      diffs[key] = Math.max(...outer.map(boat => metricByKey(boat, key))) - Math.max(...inner.map(boat => metricByKey(boat, key)));
    }
    return diffs;
  }

  function chooseOuter(analyses) {
    const boat5 = findBoat(analyses, 5);
    const boat6 = findBoat(analyses, 6);
    return metricByKey(boat6, "pickup") > metricByKey(boat5, "pickup") ? 6 : 5;
  }

  function shouldApply(prediction) {
    const formations = prediction?.formations;
    const current = basicFive(formations);
    if (current.length < 5) return false;
    if (prediction?.raceScenarios?.mainScenario?.type !== "escape") return false;

    const seconds = [...new Set(
      current
        .filter(ticket => Number(ticket.split("-")[0]) === 1)
        .map(ticket => Number(ticket.split("-")[1]))
    )];
    if (![2, 3, 4].every(no => seconds.includes(no))) return false;

    const analyses = analysesOf(prediction);
    if (![2, 3, 4, 5, 6].every(no => findBoat(analyses, no))) return false;

    const diffs = outerMinusInnerDiffs(analyses);
    const passed = Object.keys(THRESHOLDS).filter(key => diffs[key] >= THRESHOLDS[key]).length;
    return passed >= 4;
  }

  function buildRescueTicket(prediction) {
    const formations = prediction?.formations;
    const current = basicFive(formations);
    if (current.length < 4) return "";

    const analyses = analysesOf(prediction);
    const outer = chooseOuter(analyses);
    const replaced = current[3];
    const parts = String(replaced).split("-").map(Number);
    let third = parts[2];

    if (third === outer || third === 1 || !Number.isInteger(third)) {
      third = [2, 3, 4, 5, 6].find(no =>
        no !== 1 &&
        no !== outer &&
        current.some(ticket => Number(String(ticket).split("-")[2]) === no)
      ) || 2;
    }

    return `1-${outer}-${third}`;
  }

  function apply(prediction) {
    if (!prediction || !shouldApply(prediction)) return prediction;
    const formations = prediction.formations;
    if (!Array.isArray(formations?.safety) || formations.safety.length < 1) return prediction;

    const ticket = buildRescueTicket(prediction);
    if (!ticket) return prediction;

    const current = basicFive(formations);
    if (current.includes(ticket)) return prediction;

    const main = Array.isArray(formations.main) ? formations.main.slice() : [];
    const safety = formations.safety.slice();
    const replaced = safety[0];
    safety[0] = ticket;

    return {
      ...prediction,
      formations: {
        ...formations,
        main,
        safety,
        escapeOuterSecondRescueFixed5: {
          applied: true,
          rule: "all4of6_replace4",
          thresholds: { ...THRESHOLDS },
          ticket,
          replaced
        }
      }
    };
  }

  function install() {
    const core = root.ChappyAICore;
    if (!core || typeof core.buildPredictionData !== "function") return false;
    if (core.__escapeOuterSecondRescueFixed5Installed) return true;

    const originalBuildPredictionData = core.buildPredictionData.bind(core);
    root.ChappyAICore = Object.freeze({
      ...core,
      __escapeOuterSecondRescueFixed5Installed: true,
      buildPredictionData(data) {
        return apply(originalBuildPredictionData(data));
      }
    });
    return true;
  }

  root.ChappyEscapeOuterSecondRescueFixed5 = Object.freeze({
    version: "20260821-all4of6-replace4-v1",
    thresholds: THRESHOLDS,
    shouldApply,
    outerMinusInnerDiffs,
    chooseOuter,
    buildRescueTicket,
    apply,
    install
  });

  install();
})(typeof window !== "undefined" ? window : globalThis);
