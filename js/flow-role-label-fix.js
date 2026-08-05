// 流し表示の内部識別子を画面へ出さない。
(function (root) {
  "use strict";

  function normalizeFlowRoleLabels() {
    const area = document.getElementById("resultArea");
    if (!area) return;

    area.querySelectorAll(".v3-tag").forEach(element => {
      if (String(element.textContent || "").trim() === "escape") {
        element.textContent = "流し";
      }
    });
  }

  ["renderAll", "renderPrediction"].forEach(name => {
    const original = root[name];
    if (typeof original !== "function") return;

    root[name] = function (...args) {
      const result = original.apply(this, args);
      normalizeFlowRoleLabels();
      return result;
    };
  });

  root.ChappyFlowRoleLabelFix = Object.freeze({
    normalize: normalizeFlowRoleLabels
  });
})(window);
