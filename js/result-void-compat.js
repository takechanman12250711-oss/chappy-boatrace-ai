(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyResultVoidCompat = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function boatNoOf(item) { const boatNo = Number(item?.boat ?? item?.boatNo ?? 0); return Number.isInteger(boatNo) ? boatNo : 0; }
  function hasTrifecta(payload) { return Boolean(String(payload?.trifecta?.combination || payload?.result || "").trim()); }
  function isFalseOrLateStart(item) { const marker = String(item?.marker || "").trim().toUpperCase(); return marker === "F" || marker === "L" || item?.falseStart === true || item?.lateStart === true; }
  function hasAllSixBoats(starts) { if (!Array.isArray(starts) || starts.length !== 6) return false; const boats = starts.map(boatNoOf).sort((a, b) => a - b); return boats.every((boatNo, index) => boatNo === index + 1); }
  function isVoidResult(payload) { return Boolean(payload && payload.resultAvailable === false && payload.status === "void"); }
  function isVoidRacePayload(payload) { if (!payload || payload.resultAvailable !== false || hasTrifecta(payload) || !hasAllSixBoats(payload.starts)) return false; return payload.starts.every(isFalseOrLateStart); }
  function normalize(payload) { if (isVoidResult(payload) || !isVoidRacePayload(payload)) return payload; return { ...payload, status: "void", void: true, voidReason: "all-boats-f-l" }; }
  return Object.freeze({ boatNoOf, hasTrifecta, isFalseOrLateStart, hasAllSixBoats, isVoidResult, isVoidRacePayload, normalize });
});

(function loadFinalMobileUi(root) {
  "use strict";
  if (!root || !root.document) return;
  const BUILD = "20260904-final-mobile-ui8";
  const styles = [
    ["chappy-final-mobile-ui-style", "css/final-mobile-ui.css"],
    ["chappy-final-home-v2-photo-style", "css/final-home-v2-photo.css"],
    ["chappy-final-prediction-photo-style", "css/final-prediction-photo.css"],
    ["chappy-final-iphone-tuning-style", "css/final-iphone-tuning.css"],
    ["chappy-final-reference-layout-style", "css/final-reference-layout.css"],
    ["chappy-final-readability-fix-style", "css/final-readability-fix.css"]
  ];
  styles.forEach(([id, href]) => {
    if (root.document.getElementById(id)) return;
    const link = root.document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `${href}?v=${BUILD}`;
    root.document.head.appendChild(link);
  });
  if (!root.document.getElementById("chappy-final-mobile-ui-script")) {
    const script = root.document.createElement("script");
    script.id = "chappy-final-mobile-ui-script";
    script.src = `js/final-mobile-ui.js?v=${BUILD}`;
    script.defer = true;
    root.document.head.appendChild(script);
  }
})(typeof window !== "undefined" ? window : null);
