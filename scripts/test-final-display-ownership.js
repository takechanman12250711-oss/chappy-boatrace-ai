const fs = require("fs");
const assert = require("assert");

const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const owner = fs.readFileSync("js/final-display-owner-v2.js", "utf8");
const ownerCss = fs.readFileSync("css/final-display-controller.css", "utf8");

// This file is the activation gate. It is intentionally not run until the loader switch commit.
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
assert(owner.includes("単券1点は万舟欄に表示しません"), "single-ticket manshu suppression missing");
assert(ownerCss.includes(".chappy-final-purchase-list"), "final purchase compact grid missing");
assert(ownerCss.includes("@media(max-width:360px)"), "small iPhone fallback missing");

// Before activation, the production loader must still be the old chain.
assert(!loader.includes("final-display-owner-v2.js"), "new final display owner must not activate before preactivation checks pass");
console.log("final display preactivation ownership contract: ok");
