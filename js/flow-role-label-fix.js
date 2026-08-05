// 流し表示の内部識別子を画面へ出さず、同一カードの重複を防ぐ。
(function (root) {
  "use strict";

  if (root.ChappyFlowRoleLabelFix?.version === "2") return;

  const SCENARIO_LABELS = Object.freeze({
    escape: "1コース逃げ",
    oneEscape: "1コース逃げ",
    twoSashi: "2コース差し",
    threeAttack: "3コース攻め",
    fourKado: "4カド攻め"
  });

  let normalizing = false;

  function normalizeInternalLabels(area) {
    area.querySelectorAll(".v3-tag").forEach(element => {
      const value = String(element.textContent || "").trim();
      if (SCENARIO_LABELS[value]) element.textContent = SCENARIO_LABELS[value];
    });
  }

  function removeDuplicateFlowCards(area) {
    const seenByParent = new Map();

    area.querySelectorAll("[data-flow-notation]").forEach(row => {
      const parent = row.parentElement;
      const notation = String(row.dataset.flowNotation || "").trim();
      if (!parent || !notation) return;

      let seen = seenByParent.get(parent);
      if (!seen) {
        seen = new Set();
        seenByParent.set(parent, seen);
      }

      if (!seen.has(notation)) {
        seen.add(notation);
        return;
      }

      const next = row.nextElementSibling;
      if (next?.matches(".flow-odds-tab-panel")) next.remove();
      row.remove();
    });
  }

  function normalizeFlowDisplay() {
    if (normalizing) return;
    const area = document.getElementById("resultArea");
    if (!area) return;

    normalizing = true;
    try {
      normalizeInternalLabels(area);
      removeDuplicateFlowCards(area);
    } finally {
      normalizing = false;
    }
  }

  const observer = new MutationObserver(() => normalizeFlowDisplay());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", normalizeFlowDisplay, { once: true });
  } else {
    normalizeFlowDisplay();
  }

  root.ChappyFlowRoleLabelFix = Object.freeze({
    version: "2",
    normalize: normalizeFlowDisplay,
    labels: SCENARIO_LABELS
  });
})(window);
