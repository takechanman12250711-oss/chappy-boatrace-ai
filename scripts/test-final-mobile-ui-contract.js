const fs = require("fs");
const assert = require("assert");

const ui = fs.readFileSync("js/final-mobile-ui.js", "utf8");
const css = fs.readFileSync("css/final-mobile-ui.css", "utf8");
const homeCss = fs.readFileSync("css/final-home-v2-photo.css", "utf8");
const predictionCss = fs.readFileSync("css/final-prediction-photo.css", "utf8");
const iphoneCss = fs.readFileSync("css/final-iphone-tuning.css", "utf8");
const referenceCss = fs.readFileSync("css/final-reference-layout.css", "utf8");
const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

assert(ui.includes("buildPhotoStyleLines"), "photo-style ticket builder missing");
assert(ui.includes("flowFormations"), "formation source missing");
assert(ui.includes("unitsPerTicket"), "ticket-unit display missing");
assert(ui.includes("lightManshuTicketBoard"), "manshu multi-line source missing");
assert(ui.includes("買い目"), "buy summary heading missing");
assert(ui.includes("枚"), "unit label missing");
assert(ui.includes("点"), "point fallback missing");
assert(ui.includes("markReferenceLayout"), "reference layout hook missing");
assert(ui.includes('classList.add("chappy-final-mobile-ui")'), "home must receive final UI before prediction render");
assert(ui.includes("wrapRender"), "render presentation hook missing");
assert(!ui.includes("写真のように"), "internal reference-photo explanation must not be visible in app");
assert(!ui.includes("prediction.score ="), "presentation layer must not mutate prediction score");
assert(!ui.includes("prediction.ticketSheets ="), "presentation layer must not replace ticket generation");

assert(css.includes("chappy-final-mobile-ui"), "final UI scope missing");
assert(css.includes("--ch-bg:#07111a"), "dark mobile shell missing");
assert(css.includes("chappy-final-buy-formation"), "photo-style formation CSS missing");
assert(css.includes("repeat(6"), "six-boat tab layout missing");
assert(css.includes("official-venue-grid"), "mobile venue-card layout missing");

assert(homeCss.includes("home-v2-recommend-card"), "home recommendation photo override missing");
assert(homeCss.includes("home-v2-venue-list"), "home venue photo override missing");
assert(homeCss.includes("home-v2-filters"), "home filter photo override missing");
assert(homeCss.includes("bottom-nav"), "home bottom navigation override missing");

assert(predictionCss.includes("v3-entry-card-list"), "prediction entry-card photo override missing");
assert(predictionCss.includes("v3-boat-tab-buttons"), "six-boat evaluation photo override missing");
assert(predictionCss.includes("v3-ticket-accordion"), "ticket accordion photo override missing");
assert(predictionCss.includes("chappy-final-buy-summary"), "final buy summary photo override missing");
assert(predictionCss.includes("v3-newspaper-grid"), "newspaper residue flattening missing");

assert(iphoneCss.includes("safe-area-inset-bottom"), "iPhone safe-area spacing missing");
assert(iphoneCss.includes("max-width:430px"), "iPhone width tuning missing");
assert(iphoneCss.includes("max-width:390px"), "small iPhone width tuning missing");
assert(iphoneCss.includes("v3-ticket-accordion"), "iPhone ticket density tuning missing");
assert(iphoneCss.includes("chappy-final-buy-formation"), "iPhone formation sizing missing");

assert(referenceCss.includes("home-v2-recommend"), "reference home recommendation suppression missing");
assert(referenceCss.includes("grid-template-columns:1fr"), "reference home one-column venue list missing");
assert(referenceCss.includes("repeat(3"), "reference three-column race grid missing");
assert(referenceCss.includes("repeat(4"), "reference four-tab bottom navigation missing");
assert(referenceCss.includes("home-v2-races .home-v2-race:not(:first-child)"), "reference next-race-only venue row missing");

assert(loader.includes("final-mobile-ui.css"), "final UI stylesheet loader missing");
assert(loader.includes("final-home-v2-photo.css"), "photo-matched home stylesheet loader missing");
assert(loader.includes("final-prediction-photo.css"), "photo-matched prediction stylesheet loader missing");
assert(loader.includes("final-iphone-tuning.css"), "iPhone final tuning stylesheet loader missing");
assert(loader.includes("final-reference-layout.css"), "final reference layout stylesheet loader missing");
assert(loader.includes("final-mobile-ui.js"), "final UI script loader missing");
assert(loader.includes('const BUILD = "20260904-final-mobile-ui7"'), "final UI asset generation was not bumped");
assert(index.includes('data-view="race"'), "four-tab navigation is missing the race tab");
assert(index.includes('<small>成績</small>'), "results tab label does not match final reference");
assert(index.includes('result-void-compat.js?v=20260904-final-mobile-ui7'), "final UI bootstrap is not cache-busted in production entrypoint");

console.log("final mobile UI contract: ok");
