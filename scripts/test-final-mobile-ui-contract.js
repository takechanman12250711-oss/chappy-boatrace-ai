const fs = require("fs");
const assert = require("assert");
const vm = require("vm");

const ui = fs.readFileSync("js/final-mobile-ui.js", "utf8");
const css = fs.readFileSync("css/final-mobile-ui.css", "utf8");
const homeCss = fs.readFileSync("css/final-home-v2-photo.css", "utf8");
const predictionCss = fs.readFileSync("css/final-prediction-photo.css", "utf8");
const iphoneCss = fs.readFileSync("css/final-iphone-tuning.css", "utf8");
const referenceCss = fs.readFileSync("css/final-reference-layout.css", "utf8");
const readabilityCss = fs.readFileSync("css/final-readability-fix.css", "utf8");
const loader = fs.readFileSync("js/result-void-compat.js", "utf8");
const ticketOdds = fs.readFileSync("js/final-ticket-odds-visibility.js", "utf8");
const prediction = fs.readFileSync("js/prediction.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("js/script.js", "utf8");

assert(ui.includes("buildPhotoStyleLines"), "photo-style ticket builder missing");
assert(ui.includes("buildOddsMap"), "ticket odds lookup missing");
assert(ui.includes("buildTrueManshuBoard"), "true manshu multi-line board missing");
assert(ui.includes("odds < 100"), "manshu 100x threshold missing");
assert(ui.includes("decorateMissingOdds"), "missing-number odds decoration missing");
assert(ui.includes("setupBoatTabs"), "boat evaluation tab behavior missing");
assert(ui.includes("dedupeReason"), "duplicate explanation cleanup missing");
assert(ui.includes("flowFormations"), "formation source missing");
assert(ui.includes("unitsPerTicket"), "ticket-unit display missing");
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
assert(!/home-v2-recommend[^{]*\{[^}]*display\s*:\s*none/is.test(referenceCss), "home recommendation must remain visible");
assert(/official-race-grid\s*\{[\s\S]*?repeat\(4,minmax\(0,1fr\)\)/.test(css), "four-column race grid required");
assert(/grid-template-areas:"race-number" "race-time"/.test(css), "mobile race number and deadline must use separate rows");
assert(/\.official-race-time\s*\{[\s\S]*?white-space:nowrap/.test(css), "mobile race deadline must not wrap into the race number");
assert(/grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/.test(referenceCss), "three visible bottom navigation items required");
assert(!index.includes('data-view="home"'), "obsolete home navigation must be removed");
assert(referenceCss.includes('.bottom-nav-item[data-view="race"]'), "race nav selector missing");
assert(/\.bottom-nav-item\[data-view="race"\][^{]*\{[^}]*display:\s*flex/is.test(referenceCss), "race nav must remain visible so review mode is reachable");
assert(readabilityCss.includes("chappy-race-info-visible"), "race information visibility rescue missing");
assert(readabilityCss.includes("chappy-final-buy-odds"), "AI ticket odds styling missing");
assert(readabilityCss.includes("chappy-true-manshu-board"), "manshu multi-line styling missing");
assert(readabilityCss.includes("chappy-missing-odds"), "missing-number odds styling missing");
assert(readabilityCss.includes("v3-boat-tab-panel.is-active"), "boat evaluation selected-panel styling missing");
assert(readabilityCss.includes("details.v3-ticket-accordion"), "ticket accordion visibility rescue missing");
assert(readabilityCss.includes("details.chappy-final-buy-group"), "final buy group visibility rescue missing");
assert(loader.includes("final-mobile-ui.css"), "final UI stylesheet loader missing");
assert(loader.includes("final-home-v2-photo.css"), "photo-matched home stylesheet loader missing");
assert(loader.includes("final-prediction-photo.css"), "photo-matched prediction stylesheet loader missing");
assert(loader.includes("final-iphone-tuning.css"), "iPhone final tuning stylesheet loader missing");
assert(loader.includes("final-reference-layout.css"), "final reference layout stylesheet loader missing");
assert(loader.includes("final-readability-fix.css"), "readability rescue stylesheet loader missing");
assert(loader.includes("final-mobile-ui.js"), "final UI script loader missing");
assert(loader.includes('const BUILD="20260909-iphone-card-clarity1"'), "iPhone card clarity asset generation missing");
assert(!loader.includes("home-single-race-entry.css"), "obsolete home selector overlay must not load");
assert(loader.includes('OWNER_BUILD="20260907-practical-selected-visible1"'), "single-owner generation missing");
assert(loader.includes('USER_CONTRACT_BUILD="20260909-ticket-visibility-fallback1"'), "restored ticket UI generation missing");
assert(loader.includes("final-display-owner-v2.js"), "single final display owner loader missing");
assert(loader.includes("final-display-user-contract.js"), "approved ticket UI contract loader missing");
assert(loader.includes("final-display-controller.css"), "single final display owner stylesheet missing");
assert(loader.includes("final-ticket-odds-visibility.js"), "all-odds visibility layer missing from production loader");
assert(ticketOdds.includes("展開から選んだ万舟候補"), "manshu display must stay flow-first");
assert(ticketOdds.includes("構成買い目のオッズを全表示"), "manshu all-odds contract missing");
assert(ticketOdds.includes("const tickets=expandNotation(source.notation)"), "manshu formation must expand to every exact ticket");
assert(ticketOdds.includes("const tickets=expandNotation(notation)"), "missing-number formation must expand to every exact ticket");
assert(ticketOdds.includes("chappy-missing-all-odds"), "missing-number all-odds board missing");
assert(ticketOdds.includes('className="chappy-missing-odds-value"'), "missing-number compact odds value missing");
assert(!ticketOdds.includes('item.innerHTML=`<b>${escapeHtml(ticket)}</b>'), "missing-number card must not repeat the ticket beside its odds");
assert(ticketOdds.includes('"オッズ未取得"'), "missing-number cards must retain a consistent missing-odds label");
assert(ticketOdds.includes('addEventListener("chappy:prediction-runtime-ready"'), "lazy prediction runtime must rebind the TOP30 odds renderer");
assert(ticketOdds.includes('querySelector(".v3-missing-rank")'), "TOP30 ticket parsing must exclude the rank label");
assert(ticketOdds.includes('.replace(rank,"")'), "TOP30 rank text must not be mistaken for ticket digits");
assert(ticketOdds.includes('.replace(/^\\d+位/,"")'), "TOP30 flattened rank prefix must be removed after photo-style rendering");
assert(loader.includes('TICKET_ODDS_BUILD="20260909-top30-rank-prefix-safe2"'), "TOP30 rank-prefix-safe cache generation missing");

const ticketOddsDocument = {
  getElementById() { return null; },
  createElement() { return {}; },
  head: { appendChild() {} },
  addEventListener() {},
  visibilityState: "visible"
};
const ticketOddsWindow = {
  document: ticketOddsDocument,
  setInterval() { return 1; },
  clearInterval() {},
  addEventListener() {}
};
vm.runInNewContext(ticketOdds, { window: ticketOddsWindow });
const ticketFromNode = ticketOddsWindow.ChappyTicketOddsVisibility.ticketFromNode;
for (const rank of [1, 6, 7, 10, 30]) {
  const rankNode = { textContent: `${rank}位` };
  const ticketNode = {
    textContent: `${rank}位2→1→6`,
    querySelector(selector) { return selector === ".v3-missing-rank" ? rankNode : null; }
  };
  const row = {
    getAttribute() { return ""; },
    querySelector(selector) { return selector === ".v3-formation-ticket" ? ticketNode : null; }
  };
  assert.strictEqual(ticketFromNode(row), "2-1-6", `rank ${rank} must not contaminate the ticket`);

  const flattenedTicketNode = {
    textContent: `${rank}位2-1-6`,
    querySelector() { return null; }
  };
  const flattenedRow = {
    getAttribute() { return ""; },
    querySelector(selector) { return selector === ".v3-formation-ticket" ? flattenedTicketNode : null; }
  };
  assert.strictEqual(ticketFromNode(flattenedRow), "2-1-6", `flattened rank ${rank} must not contaminate the ticket`);
}
assert(prediction.includes('type: "raceFlow"'), "formation source must remain raceFlow");
assert(prediction.includes("hole: cleanHole"), "manshu/hole candidates must remain tied to raceFlow formation output");
[
  "final-ticket-reason-fix.js",
  "final-compact-ui10.js",
  "final-mobile-structure11.js",
  "final-missing-odds-refresh.js"
].forEach(name=>assert(!loader.includes(name), `${name} must not be loaded as a competing final renderer`));
assert(index.includes('data-view="race"'), "race navigation entry missing from production index");
assert(index.includes('<option value="review">終了レースを振り返る</option>'), "review mode selector missing from production index");
assert(script.includes('isReview'), "review mode handling missing from race controls");
assert(script.includes('振り返り予想を見る'), "review action missing from race controls");
assert(index.includes('<small>成績</small>'), "results tab label does not match final reference");

console.log("final mobile UI contract: ok");
