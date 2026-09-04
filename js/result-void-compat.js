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
  const COMPACT_STYLE_ID = "chappy-final-compact-ui10-style";
  const SCRIPT_ID = "chappy-final-mobile-ui-script";
  const COMPACT_SCRIPT_ID = "chappy-final-compact-ui10-script";
  const BUILD = "20260904-final-mobile-ui9";
  const COMPACT_BUILD = "20260904-final-mobile-ui10";

  function appendStyle(id, href) {
    if (root.document.getElementById(id)) return;
    const link = root.document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    root.document.head.appendChild(link);
  }

  function loadCompactUi() {
    appendStyle(COMPACT_STYLE_ID, `css/final-compact-ui10.css?v=${COMPACT_BUILD}`);
    if (root.document.getElementById(COMPACT_SCRIPT_ID)) return;
    const script = root.document.createElement("script");
    script.id = COMPACT_SCRIPT_ID;
    script.src = `js/final-compact-ui10.js?v=${COMPACT_BUILD}`;
    script.async = false;
    root.document.head.appendChild(script);
  }

  function waitForFinalUiThenCompact() {
    if (root.ChappyFinalMobileUi) {
      loadCompactUi();
      return;
    }
    let attempts = 0;
    const timer = root.setInterval(() => {
      attempts += 1;
      if (root.ChappyFinalMobileUi) {
        root.clearInterval(timer);
        loadCompactUi();
      } else if (attempts > 80) {
        root.clearInterval(timer);
      }
    }, 50);
  }

  appendStyle(STYLE_ID, `css/final-mobile-ui.css?v=${BUILD}`);
  appendStyle(HOME_STYLE_ID, `css/final-home-v2-photo.css?v=${BUILD}`);
  appendStyle(PREDICTION_STYLE_ID, `css/final-prediction-photo.css?v=${BUILD}`);
  appendStyle(IPHONE_STYLE_ID, `css/final-iphone-tuning.css?v=${BUILD}`);
  appendStyle(REFERENCE_STYLE_ID, `css/final-reference-layout.css?v=${BUILD}`);
  appendStyle(READABILITY_STYLE_ID, `css/final-readability-fix.css?v=${BUILD}`);

  const existingFinalScript = root.document.getElementById(SCRIPT_ID);
  if (!existingFinalScript) {
    const script = root.document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `js/final-mobile-ui.js?v=${BUILD}`;
    script.async = false;
    script.addEventListener("load", waitForFinalUiThenCompact, { once: true });
    root.document.head.appendChild(script);
  } else {
    waitForFinalUiThenCompact();
  }
})(typeof window !== "undefined" ? window : null);
