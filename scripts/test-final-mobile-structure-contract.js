const fs = require("fs");
const assert = require("assert");

const structureJs = fs.readFileSync("js/final-mobile-structure11.js", "utf8");
const structureCss = fs.readFileSync("css/final-mobile-structure11.css", "utf8");
const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const readabilityCss = fs.readFileSync("css/final-readability-fix.css", "utf8");
const manshuCss = fs.readFileSync("css/manshu-formation-fix.css", "utf8");

assert(loader.includes('STRUCTURE_BUILD="20260905-final-mobile-structure15-manshu"'), "structure15 manshu cache key missing");
assert(loader.includes('MANSHU_STYLE_BUILD="20260905-manshu-formation1"'), "manshu stylesheet cache key missing");
assert(loader.includes("final-mobile-structure11.css"), "structure stylesheet loader missing");
assert(loader.includes("final-mobile-structure11.js"), "structure script loader missing");
assert(loader.includes("manshu-formation-fix.css"), "manshu formation stylesheet loader missing");

assert(structureJs.includes("ensureFormation"), "formation recovery hook missing");
assert(structureJs.includes("renderedFlowTickets"), "rendered flow ticket fallback missing");
assert(structureJs.includes("compactPractical"), "practical selection compaction missing");
assert(structureJs.includes("compactManshu"), "manshu preservation hook missing");
assert(structureJs.includes("chappy-practical-compact-list"), "practical compact DOM marker missing");
assert(structureJs.includes("structure15ManshuPreserved"), "manshu formation preservation marker missing");
assert(structureJs.includes("chappy-manshu-formation-preserved"), "manshu preserved class missing");
assert(!structureJs.includes("board.innerHTML=`<div class=\"chappy-true-manshu-head\""), "legacy manshu single-ticket reconstruction must stay disabled");

assert(structureCss.includes("structure14: compact remaining prediction panels"), "structure14 CSS block missing");
assert(structureCss.includes(".v3-race-section"), "race information compact styling missing");
assert(structureCss.includes(".v3-boat-evaluation"), "boat evaluation compact styling missing");
assert(structureCss.includes(".chappy-final-buy-lines"), "main/backup/formation compact styling missing");
assert(structureCss.includes(".v3-missing-numbers"), "missing-number TOP30 compact styling missing");
assert(structureCss.includes(".chappy-practical-compact-list"), "practical selection two-column styling missing");
assert(structureCss.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "two-column mobile compact layout missing");
assert(structureCss.includes(".chappy-final-buy-reason{display:none!important;}"), "duplicate buy explanation suppression missing");
assert(structureCss.includes(".v3-missing-numbers .v3-formation-reason{display:none!important;}"), "duplicate missing-number explanation suppression missing");
assert(structureCss.includes("@media(max-width:360px)"), "small-iPhone one-column fallback missing");

assert(readabilityCss.includes("chappy-race-info-visible"), "race information visibility rescue missing");
assert(readabilityCss.includes("chappy-missing-odds"), "missing-number odds visibility styling missing");

assert(manshuCss.includes(".chappy-manshu-formation-grid"), "manshu formation grid styling missing");
assert(manshuCss.includes(".chappy-manshu-formation-row"), "manshu formation row styling missing");
assert(manshuCss.includes(".chappy-manshu-formation-meta"), "manshu formation odds meta styling missing");
assert(manshuCss.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "manshu formation two-column layout missing");
assert(manshuCss.includes("@media(max-width:360px)"), "manshu small-iPhone one-column fallback missing");

console.log("final mobile structure15 manshu contract: ok");
