(function (root) {
  "use strict";

  const BUILD = "20260903-final-mobile-ui3";
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

  function buildPhotoStyleLines(prediction) {
    const sheet = prediction?.mainSheet || {};
    const rows = [];

    const addFormationRows = (source, category) => {
      arrayify(source).forEach(row => {
        const notation = formationFromRow(row);
        if (!notation) return;
        rows.push({
          category,
          notation,
          points: pointCountFromRow(row, expandFormationNotation(notation).length || 1),
          units: unitsFromRow(row),
          reason: text(row?.reason || row?.scenarioSummary || row?.comment)
        });
      });
    };

    addFormationRows(
      sheet.flowFormations || prediction?.formation?.flowFormations || prediction?.formations?.flowFormations,
      "流し"
    );

    const addExactRows = (source, category) => {
      arrayify(source).forEach(row => {
        const ticket = normalizeExactTicket(formationFromRow(row));
        if (!ticket) return;
        rows.push({
          category,
          notation: ticket,
          points: 1,
          units: unitsFromRow(row),
          reason: text(row?.reason || row?.scenarioSummary || row?.comment)
        });
      });
    };

    addExactRows(sheet.tickets || prediction?.ticketSheets?.main, "本命");
    addExactRows(sheet.coverTickets || prediction?.ticketSheets?.cover, "押さえ");

    const lightBoard = prediction?.lightManshuTicketBoard;
    arrayify(lightBoard?.lines).forEach(line => {
      const notation = formationFromRow(line);
      if (!notation) return;
      rows.push({
        category: line.kind === "ROAD_PICKUP" ? "道中変化" : line.kind === "START_UPSET" ? "波乱" : "万舟",
        notation,
        points: pointCountFromRow(line, expandFormationNotation(notation).length || 1),
        units: unitsFromRow(line),
        reason: text(line.reason || line.scenarioSummary)
      });
    });

    const seen = new Set();
    return rows.filter(row => {
      const key = `${row.category}|${row.notation}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function groupClass(category) {
    return `is-${({"本命":"main","押さえ":"cover","流し":"flow","万舟":"manshu","波乱":"upset","道中変化":"road"})[category] || "other"}`;
  }

  function buildBuySummary(prediction) {
    const rows = buildPhotoStyleLines(prediction);
    if (!rows.length) return "";
    const grouped = new Map();
    rows.forEach(row => {
      if (!grouped.has(row.category)) grouped.set(row.category, []);
      grouped.get(row.category).push(row);
    });
    const order = ["本命", "押さえ", "流し", "万舟", "波乱", "道中変化"];
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
                    <span class="chappy-final-buy-count">${row.units ? `${row.units}枚` : `${row.points}点`}</span>
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

  function replaceTicketVisuals(rootNode) {
    rootNode.querySelectorAll(".v3-formation-row").forEach(row => {
      if (row.dataset.finalTicketStyled === "1") return;
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

  root.ChappyFinalMobileUi = Object.freeze({ build: BUILD, buildPhotoStyleLines, enhance });
  install();
})(typeof window !== "undefined" ? window : globalThis);
