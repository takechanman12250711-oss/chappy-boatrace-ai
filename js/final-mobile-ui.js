(function (root) {
  "use strict";

  const BUILD = "20260904-final-mobile-ui9";
  const HOOK_FLAG = "__chappyFinalMobileUiWrapped";

  function text(value) {
    return String(value ?? "").trim();
  }

  function arrayify(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function normalizeExactTicket(value) {
    const raw = text(value).replace(/\s+/g, "");
    const parts = raw.split("-");
    if (parts.length !== 3) return "";
    if (parts.some(part => !/^[1-6]$/.test(part))) return "";
    if (new Set(parts).size !== 3) return "";
    return raw;
  }

  function formationFromRow(row) {
    if (!row) return "";
    if (typeof row === "string") return text(row);
    return text(row.notation || row.formation?.notation || row.formation || row.ticket || row.line);
  }

  function pointCountFromRow(row, fallback = 1) {
    if (!row || typeof row !== "object") return fallback;
    const value = Number(
      row.pointCount ?? row.ticketCount ?? row.formation?.pointCount ??
      row.expandedTickets?.length ?? row.formation?.expandedTickets?.length ?? fallback
    );
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function unitsFromRow(row) {
    if (!row || typeof row !== "object") return null;
    const value = Number(
      row.unitsPerTicket ?? row.units ?? row.betUnits ??
      row.allocation?.unitsPerTicket ?? row.allocation?.units
    );
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function expandFormationNotation(notation) {
    const raw = text(notation).replace(/\s+/g, "");
    const groups = raw.split("-");
    if (groups.length !== 3) return [];
    const normalize = value => [...new Set(value.replace(/全/g, "123456").split(""))];
    const first = normalize(groups[0]);
    const second = normalize(groups[1]);
    const third = normalize(groups[2]);
    if ([first, second, third].some(group => group.some(v => !/^[1-6]$/.test(v)))) return [];
    const out = [];
    first.forEach(a => second.forEach(b => third.forEach(c => {
      if (new Set([a, b, c]).size === 3) out.push(`${a}-${b}-${c}`);
    })));
    return [...new Set(out)];
  }

  function dedupeReason(value, maxSentences = null) {
    const raw = text(value).replace(/\s+/g, " ");
    if (!raw) return "";
    const pieces = raw.split("。").map(v => v.trim()).filter(Boolean);
    const unique = [];
    pieces.forEach(piece => {
      const key = piece.replace(/[、・\s]/g, "");
      if (!key) return;
      if (unique.some(item => {
        const existing = item.replace(/[、・\s]/g, "");
        return existing === key || existing.includes(key) || key.includes(existing);
      })) return;
      unique.push(piece);
    });
    const list = Number.isInteger(maxSentences) ? unique.slice(0, maxSentences) : unique;
    return list.length ? `${list.join("。")}。` : raw;
  }

  function numericOdds(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(String(value).replace(/倍/g, "").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function buildOddsMap(prediction) {
    const map = new Map();
    const seen = new WeakSet();
    const record = (ticket, value) => {
      const key = normalizeExactTicket(ticket);
      const odds = numericOdds(value);
      if (key && odds && !map.has(key)) map.set(key, odds);
    };
    const walk = (value, depth = 0) => {
      if (depth > 6 || value === null || value === undefined) return;
      if (Array.isArray(value)) {
        value.forEach(item => walk(item, depth + 1));
        return;
      }
      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);

      const ticket = formationFromRow(value);
      record(ticket, value.odds ?? value.currentOdds ?? value.finalOdds ?? value.oddsText);

      Object.entries(value).forEach(([key, child]) => {
        if (/^[1-6]-[1-6]-[1-6]$/.test(key)) {
          if (typeof child === "object" && child) {
            record(key, child.odds ?? child.currentOdds ?? child.finalOdds ?? child.value ?? child.oddsText);
          } else {
            record(key, child);
          }
        }
        walk(child, depth + 1);
      });
    };

    [
      prediction?.mainSheet,
      prediction?.manshuSheet,
      prediction?.ticketSheets,
      prediction?.aiTicketList,
      prediction?.practicalSelection,
      prediction?.practicalTickets,
      prediction?.odds,
      prediction?.oddsByTicket,
      prediction?.trifectaOdds,
      prediction?.combinedOdds,
      prediction?.lightManshuTicketBoard
    ].forEach(source => walk(source));

    return map;
  }

  function oddsForNotation(notation, oddsMap) {
    const exact = normalizeExactTicket(notation);
    if (exact) return oddsMap.get(exact) || null;
    const expanded = expandFormationNotation(notation);
    const values = expanded.map(ticket => oddsMap.get(ticket)).filter(Boolean);
    if (!values.length) return null;
    return Math.min(...values);
  }

  function buildPhotoStyleLines(prediction) {
    const sheet = prediction?.mainSheet || {};
    const rows = [];
    const oddsMap = buildOddsMap(prediction);

    const addFormationRows = (source, category) => {
      arrayify(source).forEach(row => {
        const notation = formationFromRow(row);
        if (!notation) return;
        rows.push({
          category,
          notation,
          points: pointCountFromRow(row, expandFormationNotation(notation).length || 1),
          units: unitsFromRow(row),
          odds: oddsForNotation(notation, oddsMap),
          reason: dedupeReason(row?.reason || row?.scenarioSummary || row?.comment, 2)
        });
      });
    };

    const addExactRows = (source, category) => {
      arrayify(source).forEach(row => {
        const ticket = normalizeExactTicket(formationFromRow(row));
        if (!ticket) return;
        rows.push({
          category,
          notation: ticket,
          points: 1,
          units: unitsFromRow(row),
          odds: oddsMap.get(ticket) || numericOdds(row?.odds ?? row?.oddsText),
          reason: dedupeReason(row?.reason || row?.scenarioSummary || row?.comment, 2)
        });
      });
    };

    addExactRows(sheet.tickets || prediction?.ticketSheets?.main, "本命");
    addExactRows(sheet.coverTickets || prediction?.ticketSheets?.cover, "押さえ");
    addFormationRows(
      sheet.flowFormations || prediction?.formation?.flowFormations || prediction?.formations?.flowFormations,
      "フォーメーション"
    );

    const seen = new Set();
    return rows.filter(row => {
      const key = `${row.category}|${row.notation}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function groupClass(category) {
    return `is-${({"本命":"main","押さえ":"cover","フォーメーション":"flow"})[category] || "other"}`;
  }

  function buildBuySummary(prediction) {
    const rows = buildPhotoStyleLines(prediction);
    if (!rows.length) return "";
    const grouped = new Map();
    rows.forEach(row => {
      if (!grouped.has(row.category)) grouped.set(row.category, []);
      grouped.get(row.category).push(row);
    });
    const order = ["本命", "押さえ", "フォーメーション"];
    const entries = [...grouped.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));

    return `
      <section class="chappy-final-buy-summary" data-final-ui-build="${BUILD}">
        <div class="chappy-final-buy-head">
          <div>
            <span class="chappy-final-kicker">AI TICKETS</span>
            <h3>買い目</h3>
          </div>
          <span class="chappy-final-buy-total">${rows.length}筋</span>
        </div>
        ${entries.map(([category, list]) => `
          <details class="chappy-final-buy-group ${groupClass(category)}" ${category === "本命" ? "open" : ""}>
            <summary>
              <span class="chappy-final-buy-label">${category}</span>
              <span class="chappy-final-buy-meta">${list.length}筋</span>
            </summary>
            <div class="chappy-final-buy-lines">
              ${list.map(row => `
                <article class="chappy-final-buy-line">
                  <div class="chappy-final-buy-mainline">
                    <strong class="chappy-final-buy-formation">${row.notation}</strong>
                    <div class="chappy-final-buy-side">
                      ${row.odds ? `<span class="chappy-final-buy-odds">${row.odds.toFixed(1)}倍</span>` : `<span class="chappy-final-buy-odds is-missing">オッズ未取得</span>`}
                      <span class="chappy-final-buy-count">${row.units ? `${row.units}枚` : `${row.points}点`}</span>
                    </div>
                  </div>
                  ${row.reason ? `<p class="chappy-final-buy-reason">${row.reason}</p>` : ""}
                </article>
              `).join("")}
            </div>
          </details>
        `).join("")}
      </section>
    `;
  }

  function buildTrueManshuBoard(prediction) {
    const oddsMap = buildOddsMap(prediction);
    const candidates = [];
    const pushExact = (ticket, reason) => {
      const exact = normalizeExactTicket(ticket);
      const odds = exact ? oddsMap.get(exact) : null;
      if (!exact || !odds || odds < 100) return;
      candidates.push({ ticket: exact, odds, reason: dedupeReason(reason, 2) });
    };

    arrayify(prediction?.manshuSheet?.tickets || prediction?.ticketSheets?.hole).forEach(row => {
      pushExact(formationFromRow(row), row?.reason || row?.scenarioSummary || row?.comment);
    });

    arrayify(prediction?.lightManshuTicketBoard?.lines).forEach(line => {
      const notation = formationFromRow(line);
      expandFormationNotation(notation).forEach(ticket => {
        const detail = arrayify(line?.ticketDetails).find(item => normalizeExactTicket(item?.ticket) === ticket);
        pushExact(ticket, detail?.scenarioSummary || line?.reason || line?.scenarioSummary);
      });
    });

    const seen = new Set();
    const rows = candidates
      .filter(row => {
        if (seen.has(row.ticket)) return false;
        seen.add(row.ticket);
        return true;
      })
      .sort((a, b) => b.odds - a.odds)
      .slice(0, 6);

    if (!rows.length) {
      return `<div class="chappy-true-manshu-empty">現在、取得オッズで100倍以上の万舟買い目はありません。</div>`;
    }

    return `
      <div class="chappy-true-manshu-board">
        <div class="chappy-true-manshu-head">
          <strong>万舟候補 ${rows.length}筋</strong>
          <span>取得オッズ100倍以上のみ</span>
        </div>
        ${rows.map(row => `
          <article class="chappy-true-manshu-line">
            <div><strong>${row.ticket}</strong><span>${row.odds.toFixed(1)}倍</span></div>
            ${row.reason ? `<p>${row.reason}</p>` : ""}
          </article>
        `).join("")}
      </div>
    `;
  }

  function replaceTicketVisuals(rootNode) {
    rootNode.querySelectorAll(".v3-formation-row").forEach(row => {
      const ticketNode = row.querySelector(".v3-formation-ticket");
      if (!ticketNode) return;
      const explicit = text(row.getAttribute("data-flow-notation"));
      const raw = explicit || ticketNode.textContent.replace(/\s+/g, " ").trim();
      const compact = explicit || raw.replace(/\s*→\s*/g, "-").replace(/\s+/g, "");
      if (!compact) return;
      ticketNode.innerHTML = `<span class="chappy-photo-ticket">${compact}</span>`;
      row.dataset.finalTicketStyled = "1";
    });
  }

  function setupBoatTabs(rootNode) {
    const buttons = [...rootNode.querySelectorAll(".v3-boat-tab-button")];
    const panels = [...rootNode.querySelectorAll(".v3-boat-tab-panel")];
    if (!buttons.length || !panels.length) return;

    const activate = index => {
      buttons.forEach((button, i) => {
        button.classList.toggle("is-active", i === index);
        button.setAttribute("aria-selected", i === index ? "true" : "false");
      });
      panels.forEach((panel, i) => panel.classList.toggle("is-active", i === index));
    };

    buttons.forEach((button, index) => {
      if (button.dataset.finalBoatTabBound === "1") return;
      button.dataset.finalBoatTabBound = "1";
      button.addEventListener("click", () => activate(index));
    });

    const checked = buttons.findIndex(button => {
      const id = button.getAttribute("for");
      return id && root.document.getElementById(id)?.checked;
    });
    activate(checked >= 0 ? checked : 0);
  }

  function cleanDetailedReasons(rootNode) {
    rootNode.querySelectorAll(".v3-formation-reason,.ticket-reason").forEach(node => {
      const cleaned = dedupeReason(node.textContent);
      if (cleaned) node.textContent = cleaned;
    });

    rootNode.querySelectorAll(".v3-ticket-accordion").forEach(group => {
      const aim = group.querySelector(".v3-ticket-accordion-aim p");
      const firstReason = group.querySelector(".v3-formation-reason");
      if (!aim || !firstReason) return;
      const a = dedupeReason(aim.textContent).replace(/\s+/g, "");
      const b = dedupeReason(firstReason.textContent).replace(/\s+/g, "");
      if (a && b && (a === b || a.includes(b) || b.includes(a))) {
        const box = aim.closest(".v3-ticket-accordion-aim");
        if (box) box.hidden = true;
      }
    });
  }

  function decorateMissingOdds(prediction, rootNode) {
    const oddsMap = buildOddsMap(prediction);
    rootNode.querySelectorAll(".v3-missing-numbers .v3-formation-row").forEach(row => {
      row.querySelectorAll(".chappy-missing-odds").forEach(node => node.remove());
      const ticketNode = row.querySelector(".v3-formation-ticket");
      const ticket = normalizeExactTicket(text(ticketNode?.textContent).replace(/^\d+位/, "").replace(/\s+/g, ""));
      const odds = ticket ? oddsMap.get(ticket) : null;
      const tags = row.querySelector(".v3-formation-tags") || row;
      const badge = root.document.createElement("span");
      badge.className = `chappy-missing-odds${odds ? "" : " is-missing"}`;
      badge.textContent = odds ? `${odds.toFixed(1)}倍` : "オッズ未取得";
      tags.appendChild(badge);
    });
  }

  function fixManshuSection(prediction, rootNode) {
    const section = rootNode.querySelector(".v3-manshu-newspaper");
    if (!section) return;
    const body = section.querySelector(".v3-section-body") || section;
    body.innerHTML = buildTrueManshuBoard(prediction);
  }

  function markVisibleSections(rootNode) {
    rootNode.querySelector(".v3-race-section")?.classList.add("chappy-race-info-visible");
    rootNode.querySelector(".v3-boat-evaluation")?.classList.add("chappy-boat-eval-fixed");
    rootNode.querySelector(".v3-practical-selection")?.classList.add("chappy-practical-fixed");
  }

  function markReferenceLayout() {
    const doc = root.document;
    if (!doc) return;
    doc.body?.classList.add("chappy-final-mobile-ui");
    doc.querySelector(".app-header")?.classList.add("chappy-reference-header");
    doc.getElementById("officialVenueGrid")?.classList.add("chappy-reference-venue-grid");
    doc.getElementById("officialRaceGrid")?.classList.add("chappy-reference-race-grid");
    doc.getElementById("predictionSection")?.classList.add("chappy-reference-prediction");
  }

  function enhance(prediction) {
    const resultArea = root.document?.getElementById("resultArea");
    markReferenceLayout();
    if (!resultArea) return;
    resultArea.querySelectorAll(".chappy-final-buy-summary").forEach(node => node.remove());
    const summary = buildBuySummary(prediction);
    const anchor = resultArea.querySelector(".v3-boat-evaluation") || resultArea.querySelector(".v3-main-newspaper");
    if (summary && anchor) anchor.insertAdjacentHTML("afterend", summary);
    replaceTicketVisuals(resultArea);
    setupBoatTabs(resultArea);
    cleanDetailedReasons(resultArea);
    decorateMissingOdds(prediction, resultArea);
    fixManshuSection(prediction, resultArea);
    markVisibleSections(resultArea);
  }

  function wrapRender() {
    const fn = root.renderAll;
    if (typeof fn !== "function" || fn[HOOK_FLAG]) return false;
    function wrapped(prediction) {
      const value = fn.apply(this, arguments);
      root.setTimeout(() => enhance(prediction), 0);
      return value;
    }
    wrapped[HOOK_FLAG] = true;
    wrapped.__original = fn;
    root.renderAll = wrapped;
    return true;
  }

  function install() {
    if (!root.document) return;
    markReferenceLayout();
    root.document.addEventListener("DOMContentLoaded", markReferenceLayout, { once: true });
    let attempts = 0;
    const timer = root.setInterval(() => {
      attempts += 1;
      markReferenceLayout();
      if (wrapRender() || attempts > 240) root.clearInterval(timer);
    }, 250);
    const observer = new MutationObserver(() => {
      markReferenceLayout();
      const area = root.document.getElementById("resultArea");
      if (area) replaceTicketVisuals(area);
    });
    observer.observe(root.document.documentElement, { childList: true, subtree: true });
  }

  root.ChappyFinalMobileUi = Object.freeze({
    build: BUILD,
    buildPhotoStyleLines,
    buildOddsMap,
    buildTrueManshuBoard,
    enhance
  });
  install();
})(typeof window !== "undefined" ? window : globalThis);
