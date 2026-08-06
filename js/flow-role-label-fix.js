// 画面へ出る内部識別子を日本語へ統一し、同一カード・説明の重複を防ぐ。
(function (root) {
  "use strict";

  if (root.ChappyFlowRoleLabelFix?.version === "3") return;

  const SCENARIO_LABELS = Object.freeze({
    escape: "イン逃げ",
    oneEscape: "イン逃げ",
    oneNige: "イン逃げ",
    nige: "イン逃げ",
    twoSashi: "2コース差し",
    twoCourseSashi: "2コース差し",
    sashi: "差し",
    threeAttack: "3コース攻め",
    threeMakuri: "3コースまくり",
    threeMakuriSashi: "3コースまくり差し",
    fourKado: "4カド攻め",
    fourAttack: "4カド攻め",
    kadoAttack: "カド攻め",
    makuri: "まくり",
    makuriSashi: "まくり差し",
    outsideAttack: "外枠攻め",
    independentScenario: "独立展開",
    "independent-scenario": "独立展開"
  });

  const LABELS_LOWER = Object.freeze(
    Object.fromEntries(
      Object.entries(SCENARIO_LABELS).map(([key, value]) => [key.toLowerCase(), value])
    )
  );

  let normalizing = false;

  function translateLabel(value) {
    const source = String(value || "").trim();
    return SCENARIO_LABELS[source] || LABELS_LOWER[source.toLowerCase()] || source;
  }

  function normalizeInternalLabels(area) {
    area
      .querySelectorAll(
        ".v3-tag, .v3-role, .ticket-rank-badge, [data-scenario-label]"
      )
      .forEach(element => {
        const value = String(element.textContent || "").trim();
        const translated = translateLabel(value);
        if (translated !== value) element.textContent = translated;
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

  function compactRepeatedSentences(text) {
    const source = String(text || "").trim();
    if (!source) return source;

    const parts = source
      .split(/(?<=[。！？])/)
      .map(part => part.trim())
      .filter(Boolean);

    if (parts.length < 2) return source;

    const compact = [];
    parts.forEach(part => {
      const normalized = part.replace(/\s+/g, "");
      const previous = compact[compact.length - 1] || "";
      if (normalized && normalized === previous.replace(/\s+/g, "")) return;
      compact.push(part);
    });

    return compact.join("");
  }

  function removeRepeatedDescriptions(area) {
    area
      .querySelectorAll(
        ".v3-formation-reason, .ticket-reason, .v3-practical-selection p, .v3-practical-ticket p"
      )
      .forEach(element => {
        const before = String(element.textContent || "").trim();
        const after = compactRepeatedSentences(before);
        if (after && after !== before) element.textContent = after;
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
      removeRepeatedDescriptions(area);
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
    version: "3",
    normalize: normalizeFlowDisplay,
    labels: SCENARIO_LABELS,
    translateLabel,
    compactRepeatedSentences
  });
})(window);
