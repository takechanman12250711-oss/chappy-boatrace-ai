const fs = require("fs");
const assert = require("assert");

const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const owner = fs.readFileSync("js/final-display-owner-v2.js", "utf8");
const ownerCss = fs.readFileSync("css/final-display-controller.css", "utf8");

assert(owner.includes("formalFlowTickets"), "formal selection flow ownership missing");
assert(owner.includes("formalFlowFormations"), "formal-safe formation ownership missing");
assert(owner.includes("authoritativeFlowFormations"), "authoritative formation resolver missing");
assert(owner.includes("buildManshuRows"), "exact manshu display ownership missing");
assert(owner.includes("buildManshuFormations"), "manshu formation compatibility missing");
assert(owner.includes("rewriteManshu"), "manshu final renderer missing");
assert(owner.includes("rewritePractical"), "practical duplicate suppressor missing");
assert(owner.includes('querySelector("#resultArea .v3-practical-section")'), "practical suppressor must target the real render.js class");
assert(!owner.includes("v3-practical-selection"), "obsolete practical selector must not return");
assert(owner.includes("decoratePracticalTags"), "practical selection must be represented on original ticket rows");
assert(owner.includes("decorateMissingOdds"), "TOP30 odds ownership missing");
assert(owner.includes("MutationObserver"), "async TOP30 refresh ownership missing");
assert(owner.includes("applyLayout"), "compact layout ownership missing");
assert(!owner.includes("単券1点は万舟欄に表示しません"), "100x single-ticket manshu suppression must be removed");
assert(owner.includes("現在、取得オッズで100倍以上の万舟買い目はありません"), "manshu empty state missing");
assert(ownerCss.includes(".v3-practical-section{display:none!important;}"), "duplicated standalone practical section must be hidden");
assert(ownerCss.includes(".chappy-practical-tag"), "practical tag style missing");
assert(ownerCss.includes("@media(max-width:360px)"), "small iPhone fallback missing");

assert(loader.includes('OWNER_BUILD="20260907-practical-selected-visible1"'), "single-owner cache key missing");
assert(loader.includes("final-display-owner-v2.js"), "new final display owner is not activated");
assert(loader.includes("final-display-controller.css"), "single-owner stylesheet is not activated");
[
  "js/final-ticket-reason-fix.js",
  "js/final-compact-ui10.js",
  "js/final-mobile-structure11.js",
  "js/final-missing-odds-refresh.js",
  "js/final-display-controller.js"
].forEach(path => assert(!loader.includes(path), `${path} must not be loaded as a competing final renderer`));
console.log("final display activated single-owner contract: ok");