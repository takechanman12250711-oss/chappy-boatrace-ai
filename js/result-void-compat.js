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
      const boatNo = Number(
        item?.boat ??
        item?.boatNo ??
        0
      );
      return Number.isInteger(boatNo)
        ? boatNo
        : 0;
    }

    function hasTrifecta(payload) {
      return Boolean(
        String(
          payload?.trifecta
            ?.combination ||
          payload?.result ||
          ""
        ).trim()
      );
    }

    function isFalseOrLateStart(item) {
      const marker = String(
        item?.marker ||
        ""
      )
        .trim()
        .toUpperCase();
      return (
        marker === "F" ||
        marker === "L" ||
        item?.falseStart === true ||
        item?.lateStart === true
      );
    }

    function hasAllSixBoats(starts) {
      if (
        !Array.isArray(starts) ||
        starts.length !== 6
      ) {
        return false;
      }
      const boats = starts
        .map(boatNoOf)
        .sort((a, b) => a - b);
      return boats.every(
        (boatNo, index) =>
          boatNo === index + 1
      );
    }

    function isVoidResult(payload) {
      return Boolean(
        payload &&
        payload.resultAvailable ===
          false &&
        payload.status === "void"
      );
    }

    function isVoidRacePayload(payload) {
      if (
        !payload ||
        payload.resultAvailable !==
          false ||
        hasTrifecta(payload) ||
        !hasAllSixBoats(
          payload.starts
        )
      ) {
        return false;
      }
      return payload.starts.every(
        isFalseOrLateStart
      );
    }

    function normalize(payload) {
      if (
        isVoidResult(payload) ||
        !isVoidRacePayload(payload)
      ) {
        return payload;
      }
      return {
        ...payload,
        status: "void",
        void: true,
        voidReason:
          "all-boats-f-l"
      };
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
