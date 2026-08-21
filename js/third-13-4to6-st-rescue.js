(function (root) {
  "use strict";

  if (root.ChappyThird134To136StRescue) return;

  const RULE = Object.freeze({ minStMargin: 2, minAgreements: 2 });
  const AGREEMENT_KEYS = Object.freeze(["pickup", "hold", "raceFlow"]);

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function boatNoOf(item, index = 0) {
    return Number(item?.boatNo ?? item?.boat ?? item?.no ?? item?.waku ?? item?.course ?? index + 1);
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

  function analysesOf(prediction) {
    return prediction?.analyses || prediction?.evaluations || prediction?.boatEvaluation?.evaluations || [];
  }

  function basicFive(formations) {
    return [
      ...(formations?.main || []).slice(0, 3),
      ...(formations?.safety || []).slice(0, 2)
    ];
  }

  function score(item, key) {
    if (key === "st") return metric(item, ["indexes.st", "st"]);
    if (key === "pickup") return metric(item, ["roleScores.pickup", "indexes.pickup", "pickup"]);
    if (key === "hold") return metric(item, ["roleScores.hold", "indexes.hold", "hold"]);
    if (key === "raceFlow") return metric(item, ["indexes.raceFlow", "raceFlow"]);
    return null;
  }

  function evaluate(prediction) {
    const formations = prediction?.formations;
    const current = basicFive(formations);
    if (current.length < 5) return { apply: false, reason: "fixed5-short" };
    if (formations?.thirdSixRescueFixed5?.applied === true) return { apply: false, reason: "third-six-rescue-active" };
    if (!current.includes("1-3-4")) return { apply: false, reason: "no-1-3-4" };
    if (current.includes("1-3-6")) return { apply: false, reason: "already-1-3-6" };

    const analyses = analysesOf(prediction);
    const boat4 = findBoat(analyses, 4);
    const boat6 = findBoat(analyses, 6);
    if (!boat4 || !boat6) return { apply: false, reason: "missing-analysis" };

    const st4 = score(boat4, "st");
    const st6 = score(boat6, "st");
    if (st4 === null || st6 === null) return { apply: false, reason: "missing-st" };
    const stMargin = st6 - st4;
    if (stMargin < RULE.minStMargin) return { apply: false, reason: "st-margin", stMargin };

    const agreements = AGREEMENT_KEYS.filter(key => {
      const v4 = score(boat4, key);
      const v6 = score(boat6, key);
      return v4 !== null && v6 !== null && v6 > v4;
    });
    if (agreements.length < RULE.minAgreements) {
      return { apply: false, reason: "agreements", stMargin, agreements };
    }

    return { apply: true, stMargin, agreements };
  }

  function replaceTicket(list, from, to, limit) {
    const copy = Array.isArray(list) ? list.slice() : [];
    const end = Math.min(copy.length, limit);
    for (let i = 0; i < end; i += 1) {
      if (String(copy[i]) === from) {
        copy[i] = to;
        return { list: copy, replaced: true, index: i };
      }
    }
    return { list: copy, replaced: false, index: -1 };
  }

  function apply(prediction) {
    if (!prediction) return prediction;
    const decision = evaluate(prediction);
    if (!decision.apply) return prediction;

    const formations = prediction.formations;
    const mainResult = replaceTicket(formations.main, "1-3-4", "1-3-6", 3);
    let safetyResult = { list: Array.isArray(formations.safety) ? formations.safety.slice() : [], replaced: false, index: -1 };
    if (!mainResult.replaced) safetyResult = replaceTicket(formations.safety, "1-3-4", "1-3-6", 2);
    if (!mainResult.replaced && !safetyResult.replaced) return prediction;

    return {
      ...prediction,
      formations: {
        ...formations,
        main: mainResult.list,
        safety: safetyResult.list,
        third134To136StRescue: {
          applied: true,
          from: "1-3-4",
          to: "1-3-6",
          location: mainResult.replaced ? "main" : "safety",
          rule: { ...RULE },
          stMargin: decision.stMargin,
          agreements: decision.agreements.slice()
        }
      }
    };
  }

  function install() {
    const core = root.ChappyAICore;
    if (!core || typeof core.buildPredictionData !== "function") return false;
    if (core.__third134To136StRescueInstalled) return true;

    const originalBuildPredictionData = core.buildPredictionData.bind(core);
    root.ChappyAICore = Object.freeze({
      ...core,
      __third134To136StRescueInstalled: true,
      buildPredictionData(data) {
        return apply(originalBuildPredictionData(data));
      }
    });
    return true;
  }

  root.ChappyThird134To136StRescue = Object.freeze({
    version: "20260821-fixed5-v1",
    rule: RULE,
    evaluate,
    apply,
    install
  });

  install();
})(typeof window !== "undefined" ? window : globalThis);
