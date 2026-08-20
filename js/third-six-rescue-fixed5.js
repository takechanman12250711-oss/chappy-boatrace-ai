(function (root) {
  "use strict";

  if (root.ChappyThirdSixRescueFixed5) return;

  const RULE = Object.freeze({ pickup: 70, hold: 30, raceFlow: 60 });

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
    return null;
  }

  function basicFive(formations) {
    return [
      ...(formations?.main || []).slice(0, 3),
      ...(formations?.safety || []).slice(0, 2)
    ];
  }

  function shouldApply(prediction) {
    const formations = prediction?.formations;
    const current = basicFive(formations);
    if (current.length < 5) return false;
    if (current.some(ticket => String(ticket).split("-")[2] === "6")) return false;

    const oneHead = current.filter(ticket => String(ticket).startsWith("1-"));
    if (!oneHead.length) return false;

    const analyses =
      prediction?.analyses ||
      prediction?.evaluations ||
      prediction?.boatEvaluation?.evaluations ||
      [];
    const boat6 = findBoat(analyses, 6);
    if (!boat6) return false;

    const pickup = metric(boat6, ["roleScores.pickup", "indexes.pickup", "pickup"]);
    const hold = metric(boat6, ["roleScores.hold", "indexes.hold", "hold"]);
    const raceFlow = metric(boat6, ["indexes.raceFlow", "raceFlow"]);

    return pickup !== null && hold !== null && raceFlow !== null &&
      pickup >= RULE.pickup && hold >= RULE.hold && raceFlow >= RULE.raceFlow;
  }

  function buildShadowTicket(formations) {
    const current = basicFive(formations);
    const oneHead = current.filter(ticket => String(ticket).startsWith("1-"));
    const counts = new Map();
    for (const ticket of oneHead) {
      const second = String(ticket).split("-")[1];
      counts.set(second, (counts.get(second) || 0) + 1);
    }
    const second = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]?.[0];
    return second ? `1-${second}-6` : "";
  }

  function apply(prediction) {
    if (!prediction || !shouldApply(prediction)) return prediction;
    const formations = prediction.formations;
    if (!Array.isArray(formations?.safety) || formations.safety.length < 2) return prediction;

    const shadow = buildShadowTicket(formations);
    if (!shadow) return prediction;

    const main = Array.isArray(formations.main) ? formations.main.slice() : [];
    const safety = formations.safety.slice();
    safety[1] = shadow;

    return {
      ...prediction,
      formations: {
        ...formations,
        main,
        safety,
        thirdSixRescueFixed5: {
          applied: true,
          rule: { ...RULE },
          ticket: shadow
        }
      }
    };
  }

  function install() {
    const core = root.ChappyAICore;
    if (!core || typeof core.buildPredictionData !== "function") return false;
    if (core.__thirdSixRescueFixed5Installed) return true;

    const originalBuildPredictionData = core.buildPredictionData.bind(core);
    root.ChappyAICore = Object.freeze({
      ...core,
      __thirdSixRescueFixed5Installed: true,
      buildPredictionData(data) {
        return apply(originalBuildPredictionData(data));
      }
    });
    return true;
  }

  root.ChappyThirdSixRescueFixed5 = Object.freeze({
    version: "20260820-fixed5-v1",
    rule: RULE,
    shouldApply,
    buildShadowTicket,
    apply,
    install
  });

  install();
})(typeof window !== "undefined" ? window : globalThis);
