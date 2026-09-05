const fs = require("fs");
const assert = require("assert");

const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const owner = fs.readFileSync("js/final-display-owner-v2.js", "utf8");
const ownerCss = fs.readFileSync("css/final-display-controller.css", "utf8");

assert(loader.includes('OWNER_BUILD="20260905-final-display-owner2"'), "final display owner cache key missing");
assert(loader.includes("final-display-owner-v2.js"), "single final display owner is not loaded");
assert(loader.includes("final-display-controller.css"), "single final display owner stylesheet is not loaded");
[
  "js/final-ticket-reason-fix.js",
  "js/final-compact-ui10.js",
  "js/final-mobile-structure11.js",
  "js/final-missing-odds-refresh.js",
  "js/final-display-controller.js"
].forEach(path => assert(!loader.includes(path), `${path} must not be loaded as a competing final renderer`));

assert(owner.includes("formalFlowTickets"), "formal selection flow ownership missing");
assert(owner.includes("formalFlowFormations"), "formal-safe formation ownership missing");
assert(owner.includes("authoritativeFlowFormations"), "authoritative formation resolver missing");
assert(owner.includes("buildManshuFormations"), "manshu formation ownership missing");
assert(owner.includes("rewriteManshu"), "manshu final renderer missing");
assert(owner.includes("rewritePractical"), "practical final renderer missing");
assert(owner.includes('querySelector("#resultArea .v3-practical-section")'), "practical renderer must target the real render.js class");
assert(!owner.includes("v3-practical-selection"), "obsolete practical selector must not return");
assert(owner.includes("decorateMissingOdds"), "TOP30 odds ownership missing");
assert(owner.includes("MutationObserver"), "async TOP30 refresh ownership missing");
assert(owner.includes("applyLayout"), "compact layout ownership missing");
assert(owner.includes("chappy-ui10-entry-compact"), "entry compact ownership missing");
assert(owner.includes("chappy-ui10-eval-compact"), "boat evaluation compact ownership missing");
assert(owner.includes("chappy-ui10-practical-compact"), "practical compact ownership missing");
assert(owner.includes("単券1点は万舟欄に表示しません"), "single-ticket manshu suppression missing");

assert(ownerCss.includes(".chappy-final-purchase-list"), "final purchase compact grid missing");
assert(ownerCss.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "final purchase two-column layout missing");
assert(ownerCss.includes("@media(max-width:360px)"), "small iPhone fallback missing");

console.log("final display single-owner contract: ok");
