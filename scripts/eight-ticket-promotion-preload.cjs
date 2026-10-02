"use strict";
// Reuse the collector's existing optional priority-shadow snapshot transport.
// No selector, prediction, note, purchase or legacy-study field is replaced.
const Module = require("node:module");
const INSTALLED = Symbol.for("chappy.eightTicketPromotionSidecarInstalled");
const wrapped = new WeakMap();
function wrap(api) {
  if (!api || typeof api.build !== "function") return api;
  if (wrapped.has(api)) return wrapped.get(api);
  const next = Object.freeze({ ...api, build(selection) {
    const legacy = api.build(selection);
    let eightTicketPromotionShadow;
    try { eightTicketPromotionShadow = require("./eight-ticket-promotion-shadow.cjs").build(selection); }
    catch { eightTicketPromotionShadow = { status: "unavailable", eligible: false,
      automaticApplication: false, usableForPrediction: false, affectsTickets: false, affectsPrediction: false }; }
    return { ...legacy, eightTicketPromotionShadow };
  } });
  wrapped.set(api, next); wrapped.set(next, next); return next;
}
if (!Module[INSTALLED]) {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = originalLoad.apply(this, arguments);
    return /(?:^|\/)practical-priority-shadow(?:\.js)?$/.test(String(request || "")) ? wrap(loaded) : loaded;
  };
  Module[INSTALLED] = true;
}
module.exports = { wrap };
