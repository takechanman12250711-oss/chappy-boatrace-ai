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
assert(ui.includes("wrapRender"), "render presentation hook missing");
assert(!ui.includes("prediction.score ="), "presentation layer must not mutate prediction score");
assert(!ui.includes("prediction.ticketSheets ="), "presentation layer must not replace ticket generation");

assert(css.includes("chappy-final-mobile-ui"), "final UI scope missing");
assert(css.includes("#08131d"), "dark mobile shell missing");
assert(css.includes("chappy-final-buy-formation"), "photo-style formation CSS missing");
assert(css.includes("repeat(6"), "six-boat tab layout missing");

assert(loader.includes("final-mobile-ui.css"), "final UI stylesheet loader missing");
assert(loader.includes("final-mobile-ui.js"), "final UI script loader missing");
assert(loader.includes('const BUILD = "20260903-final-mobile-ui2"'), "final UI asset generation was not bumped");
assert(index.includes('result-void-compat.js?v=20260903-final-mobile-ui2'), "final UI bootstrap is not cache-busted in production entrypoint");

console.log("final mobile UI contract: ok");
