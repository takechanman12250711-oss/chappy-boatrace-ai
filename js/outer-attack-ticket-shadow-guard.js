/* Prevent optional outer-attack shadow hooks from blocking production predictions. */
(function (root) {
  "use strict";
  const storage = root?.ChappyStorage;
  const mark = "__chappyOuterAttackTicketShadowV1";
  if (!storage || storage[mark]) return;
  try {
    Object.defineProperty(storage, mark, {
      value: Object.freeze({ disabled: true, reason: "prediction-safety" }),
      configurable: true,
      enumerable: false,
      writable: true
    });
  } catch (_) {
    /* If storage is already locked, do not let an optional shadow hook stop prediction. */
  }
})(typeof window !== "undefined" ? window : globalThis);
