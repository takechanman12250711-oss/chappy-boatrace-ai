const fs = require("fs");
const assert = require("assert");

const refresh = fs.readFileSync("js/final-missing-odds-refresh.js", "utf8");
const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const mobile = fs.readFileSync("js/final-mobile-ui.js", "utf8");
const render = fs.readFileSync("js/render.js", "utf8");

assert(loader.includes('MISSING_ODDS_BUILD="20260905-missing-odds-refresh1"'), "missing odds cache key missing");
assert(loader.includes("final-missing-odds-refresh.js"), "missing odds refresh loader missing");
assert(refresh.includes("latestPrediction"), "latest prediction retention missing");
assert(refresh.includes("MutationObserver"), "missing-number async refresh observer missing");
assert(refresh.includes(".v3-missing-numbers .v3-formation-row"), "missing-number row selector missing");
assert(refresh.includes("chappy-missing-odds"), "missing-number odds badge missing");
assert(refresh.includes("buildOddsMap"), "shared odds map integration missing");
assert(refresh.includes("fallbackOddsMap"), "odds fallback map missing");
assert(refresh.includes("requestAnimationFrame"), "refresh scheduling guard missing");
assert(mobile.includes("decorateMissingOdds"), "base missing odds decorator missing");
assert(render.includes("function updateMissingNumbersSection"), "async missing-number section replacement missing from renderer");

console.log("final missing-number odds refresh contract: ok");
