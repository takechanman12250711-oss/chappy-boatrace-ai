(function (root, factory) {
  const api = factory();
  if (
    typeof module === "object" &&
    module.exports
  ) {
    module.exports = api;
  }
  if (root) {
    root.ChappyResultVoidCompat =
      api;
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis,
  function () {
    "use strict";

    function boatNoOf(item) {
      const boatNo = Number(item?.boat ?? item?.boatNo ?? 0);
      return Number.isInteger(boatNo) ? boatNo : 0;
    }

    function hasTrifecta(payload) {
      return Boolean(String(payload?.trifecta?.combination || payload?.result || "").trim());
    }

    function isFalseOrLateStart(item) {
      const marker = String(item?.marker || "").trim().toUpperCase();
      return marker === "F" || marker === "L" || item?.falseStart === true || item?.lateStart === true;
    }

    function hasAllSixBoats(starts) {
      if (!Array.isArray(starts) || starts.length !== 6) return false;
      const boats = starts.map(boatNoOf).sort((a, b) => a - b);
      return boats.every((boatNo, index) => boatNo === index + 1);
    }

    function isVoidResult(payload) {
      return Boolean(payload && payload.resultAvailable === false && payload.status === "void");
    }

    function isVoidRacePayload(payload) {
      if (!payload || payload.resultAvailable !== false || hasTrifecta(payload) || !hasAllSixBoats(payload.starts)) return false;
      return payload.starts.every(isFalseOrLateStart);
    }

    function normalize(payload) {
      if (isVoidResult(payload) || !isVoidRacePayload(payload)) return payload;
      return { ...payload, status: "void", void: true, voidReason: "all-boats-f-l" };
    }

    return Object.freeze({
      boatNoOf,
      hasTrifecta,
      isFalseOrLateStart,
      hasAllSixBoats,
      isVoidResult,
      isVoidRacePayload,
      normalize
    });
  }
);

(function loadFinalMobileUi(root) {
  "use strict";
  if (!root || !root.document) return;

  const STYLE_ID = "chappy-final-mobile-ui-style";
  const HOME_STYLE_ID = "chappy-final-home-v2-photo-style";
  const PREDICTION_STYLE_ID = "chappy-final-prediction-photo-style";
  const IPHONE_STYLE_ID = "chappy-final-iphone-tuning-style";
  const REFERENCE_STYLE_ID = "chappy-final-reference-layout-style";
  const READABILITY_STYLE_ID = "chappy-final-readability-fix-style";
  const SCRIPT_ID = "chappy-final-mobile-ui-script";
  const BUILD = "20260904-final-mobile-ui9";

  if (!root.document.getElementById(STYLE_ID)) {
    const link = root.document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = `css/final-mobile-ui.css?v=${BUILD}`;
    root.document.head.appendChild(link);
  }

  if (!root.document.getElementById(HOME_STYLE_ID)) {
    const link = root.document.createElement("link");
    link.id = HOME_STYLE_ID;
    link.rel = "stylesheet";
    link.href = `css/final-home-v2-photo.css?v=${BUILD}`;
    root.document.head.appendChild(link);
  }

  if (!root.document.getElementById(PREDICTION_STYLE_ID)) {
    const link = root.document.createElement("link");
    link.id = PREDICTION_STYLE_ID;
    link.rel = "stylesheet";
    link.href = `css/final-prediction-photo.css?v=${BUILD}`;
    root.document.head.appendChild(link);
  }

  if (!root.document.getElementById(IPHONE_STYLE_ID)) {
    const link = root.document.createElement("link");
    link.id = IPHONE_STYLE_ID;
    link.rel = "stylesheet";
    link.href = `css/final-iphone-tuning.css?v=${BUILD}`;
    root.document.head.appendChild(link);
  }

  if (!root.document.getElementById(REFERENCE_STYLE_ID)) {
    const link = root.document.createElement("link");
    link.id = REFERENCE_STYLE_ID;
    link.rel = "stylesheet";
    link.href = `css/final-reference-layout.css?v=${BUILD}`;
    root.document.head.appendChild(link);
  }

  if (!root.document.getElementById(READABILITY_STYLE_ID)) {
    const link = root.document.createElement("link");
    link.id = READABILITY_STYLE_ID;
    link.rel = "stylesheet";
    link.href = `css/final-readability-fix.css?v=${BUILD}`;
    root.document.head.appendChild(link);
  }

  if (!root.document.getElementById(SCRIPT_ID)) {
    const script = root.document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `js/final-mobile-ui.js?v=${BUILD}`;
    script.defer = true;
    root.document.head.appendChild(script);
  }
})(typeof window !== "undefined" ? window : null);
