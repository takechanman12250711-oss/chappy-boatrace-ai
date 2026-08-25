/* =========================================================
  チャッピーボートレースAI
  万舟表示の復旧レイヤー

  表示直前に、実戦厳選とは別に保持している万舟・穴候補を
  最大1点だけ復元する。予想、買い目選択、購入対象は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyManshuDisplayReliability = Object.freeze(api);
    api.install(root);
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const INSTALLED_FLAG = "__chappyManshuDisplayReliabilityInstalled";
  const WRAPPED_FLAG = "__chappyManshuDisplayReliabilityWrapped";

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function ticketOf(value) {
    const row = typeof value === "string" ? { ticket: value } : value || {};
    return String(
      row.ticket ||
      row.line ||
      row.formation ||
      row.bet ||
      row.mark ||
      ""
    )
      .replace(/\s+/g, "")
      .trim();
  }

  function isSkipped(prediction) {
    const status = String(
      prediction?.practicalSelection?.status ||
      prediction?.selectionStatus ||
      ""
    ).toLowerCase();
    return status === "skip" || status === "skipped" || status.includes("見送り");
  }

  function candidatePools(prediction) {
    const formation = prediction?.formation || {};
    return [
      prediction?.ticketSheets?.hole,
      prediction?.manshuSheet?.tickets,
      prediction?.aiCore?.ticketSheets?.hole,
      prediction?.aiCore?.manshuSheet?.tickets,
      formation.hole,
      formation.manshu,
      formation.longshot,
      formation.highPay,
      prediction?.manshuFormation
    ];
  }

  function firstFallbackTicket(prediction) {
    if (!prediction || typeof prediction !== "object" || isSkipped(prediction)) {
      return null;
    }

    for (const pool of candidatePools(prediction)) {
      const found = rows(pool).find(item => Boolean(ticketOf(item)));
      if (found) return found;
    }

    return null;
  }

  function normalizeCandidate(value) {
    if (!value) return null;
    const row = typeof value === "string" ? { ticket: value } : value;
    const ticket = ticketOf(row);
    if (!ticket) return null;

    const numericOdds = Number(row.odds);
    const hasOdds =
      row.odds !== null &&
      row.odds !== undefined &&
      row.odds !== "" &&
      Number.isFinite(numericOdds) &&
      numericOdds > 0;
    const category =
      row.category ||
      (hasOdds && numericOdds >= 100
        ? "万舟"
        : hasOdds
          ? "高配当候補"
          : "穴候補");

    return {
      ...row,
      ticket,
      category,
      odds: hasOdds ? numericOdds : null,
      oddsText:
        row.oddsText ||
        (hasOdds ? `${numericOdds}倍` : "オッズ未取得"),
      scenarioType: row.scenarioType || "穴展開",
      scenarioSummary:
        row.scenarioSummary ||
        row.comment ||
        row.reason ||
        "内側が崩れた場合に成立する高配当候補。"
    };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function boatBadge(boatNo) {
    const colors = {
      1: ["#ffffff", "#111111", "#c9c9c9"],
      2: ["#111111", "#ffffff", "#111111"],
      3: ["#e53935", "#ffffff", "#e53935"],
      4: ["#1e88e5", "#ffffff", "#1e88e5"],
      5: ["#fdd835", "#111111", "#fbc02d"],
      6: ["#43a047", "#ffffff", "#43a047"]
    };
    const [background, text, border] = colors[Number(boatNo)] || colors[1];
    return `<span class="v3-boat-badge v3-boat-mini" style="background:${background};color:${text};border-color:${border};">${escapeHtml(boatNo)}</span>`;
  }

  function ticketHtml(ticket) {
    const parts = String(ticket || "").split("-");
    if (parts.length !== 3) {
      return `<span class="v3-ticket-arrow">${escapeHtml(ticket)}</span>`;
    }
    return `<span class="v3-ticket-arrow">${parts.map(boatBadge).join(" → ")}</span>`;
  }

  function categoryType(candidate) {
    if (candidate.category === "万舟" || Number(candidate.odds) >= 100) return "manshu";
    if (candidate.category === "高配当候補") return "highpay";
    return "hole";
  }

  function candidateBody(candidate) {
    const type = categoryType(candidate);
    return `
      <details name="chappy-ticket-accordion" class="v3-ticket-accordion v3-ticket-accordion-manshu">
        <summary>
          <span>候補</span>
          <span class="v3-ticket-accordion-count">1点</span>
          <span class="v3-ticket-accordion-arrow" aria-hidden="true"></span>
        </summary>
        <div class="v3-ticket-accordion-panel">
          <div class="v3-ticket-accordion-aim">
            <strong>狙い</strong>
            <p>${escapeHtml(candidate.scenarioSummary)}</p>
          </div>
          <div class="v3-ticket-accordion-label">買い目・オッズ</div>
          <div class="v3-formation-group">
            <div class="v3-formation-list v3-formation-${escapeHtml(type)}">
              <div class="v3-formation-row v3-formation-row-${escapeHtml(type)}" data-manshu-display-fallback="true">
                <div class="v3-formation-ticket">${ticketHtml(candidate.ticket)}</div>
                <div class="v3-formation-tags">
                  <span class="v3-tag v3-tag-${escapeHtml(type)}">${escapeHtml(candidate.category)}</span>
                  <span class="v3-tag v3-tag-odds">${escapeHtml(candidate.oddsText)}</span>
                  <span class="v3-tag v3-tag-flow">${escapeHtml(candidate.scenarioType)}</span>
                </div>
                <div class="v3-formation-reason">${escapeHtml(candidate.scenarioSummary)}</div>
              </div>
            </div>
          </div>
        </div>
      </details>
    `;
  }

  function candidateSignature(candidate) {
    if (!candidate || typeof candidate !== "object") return "";

    return JSON.stringify([
      String(candidate.ticket || ""),
      String(candidate.category || ""),
      Number.isFinite(Number(candidate.odds))
        ? Number(candidate.odds)
        : null,
      String(candidate.oddsText || ""),
      String(candidate.scenarioType || ""),
      String(candidate.scenarioSummary || "")
    ]);
  }

  function createSection(documentObject) {
    const section = documentObject.createElement("section");
    section.className = "v3-section v3-manshu-newspaper";
    section.dataset.manshuDisplayFallbackSection = "true";
    section.innerHTML = `
      <div class="v3-section-head"><h2>💣 万舟</h2></div>
      <div class="v3-section-body"></div>
    `;
    return section;
  }

  function apply(prediction, documentObject = typeof document !== "undefined" ? document : null) {
    if (!documentObject) return false;

    const resultArea = documentObject.getElementById?.("resultArea");
    if (!resultArea) return false;

    let section = resultArea.querySelector?.(".v3-manshu-newspaper") || null;
    const normalRow = section?.querySelector?.(
      ".v3-formation-row:not([data-manshu-display-fallback='true'])"
    );
    if (normalRow) return false;

    const candidate = normalizeCandidate(firstFallbackTicket(prediction));
    if (!candidate) {
      if (section?.dataset?.manshuDisplayFallbackSection === "true") {
        section.remove?.();
      }
      return false;
    }

    if (!section) {
      section = createSection(documentObject);
      const anchor =
        resultArea.querySelector?.(".v3-missing-numbers") ||
        resultArea.querySelector?.(".v3-practical-selection") ||
        null;
      if (anchor?.parentNode) {
        anchor.parentNode.insertBefore(section, anchor);
      } else {
        resultArea.appendChild(section);
      }
    }

    const body = section.querySelector?.(".v3-section-body");
    if (!body) return false;

    const signature = candidateSignature(candidate);
    const existingFallbackRow = section.querySelector?.(
      "[data-manshu-display-fallback='true']"
    );
    if (
      existingFallbackRow &&
      section.dataset?.manshuDisplaySignature === signature
    ) {
      return false;
    }

    body.innerHTML = candidateBody(candidate);
    section.dataset.manshuDisplayFallback = "true";
    section.dataset.manshuDisplaySignature = signature;
    return true;
  }

  function install(root) {
    if (!root || root[INSTALLED_FLAG]) return false;
    root[INSTALLED_FLAG] = true;

    let lastPrediction = null;
    const wrap = name => {
      const original = root[name];
      if (typeof original !== "function" || original[WRAPPED_FLAG]) return false;

      const wrapped = function (prediction, ...args) {
        lastPrediction = prediction;
        const result = original.call(this, prediction, ...args);
        const run = () => apply(prediction, root.document || (typeof document !== "undefined" ? document : null));
        if (typeof root.queueMicrotask === "function") root.queueMicrotask(run);
        else Promise.resolve().then(run);
        return result;
      };
      wrapped[WRAPPED_FLAG] = true;
      root[name] = wrapped;
      return true;
    };

    const wrapAll = () => {
      wrap("renderAll");
      wrap("renderPrediction");
    };

    wrapAll();
    root.addEventListener?.("chappy:prediction-runtime-ready", wrapAll);

    const documentObject = root.document || (typeof document !== "undefined" ? document : null);
    const resultArea = documentObject?.getElementById?.("resultArea");
    if (resultArea && typeof root.MutationObserver === "function") {
      let applyScheduled = false;
      const observer = new root.MutationObserver(() => {
        if (!lastPrediction || applyScheduled) return;
        applyScheduled = true;
        const run = () => {
          applyScheduled = false;
          apply(lastPrediction, documentObject);
        };
        if (typeof root.queueMicrotask === "function") root.queueMicrotask(run);
        else Promise.resolve().then(run);
      });
      observer.observe(resultArea, { childList: true, subtree: true });
    }

    return true;
  }

  return {
    rows,
    ticketOf,
    isSkipped,
    candidatePools,
    firstFallbackTicket,
    normalizeCandidate,
    categoryType,
    candidateBody,
    candidateSignature,
    apply,
    install
  };
});
