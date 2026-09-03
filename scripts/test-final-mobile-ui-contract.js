const fs = require("fs");
const assert = require("assert");

const ui = fs.readFileSync("js/final-mobile-ui.js", "utf8");
const css = fs.readFileSync("css/final-mobile-ui.css", "utf8");
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
assert(css.includes("repeat(4"), "four-column mobile race grid missing");
assert(css.includes("official-venue-grid"), "mobile venue-card layout missing");

assert(loader.includes("final-mobile-ui.css"), "final UI stylesheet loader missing");
assert(loader.includes("final-mobile-ui.js"), "final UI script loader missing");
assert(loader.includes('const BUILD = "20260903-final-mobile-ui3"'), "final UI asset generation was not bumped");
assert(index.includes('result-void-compat.js?v=20260903-final-mobile-ui3'), "final UI bootstrap is not cache-busted in production entrypoint");

console.log("final mobile UI contract: ok");
