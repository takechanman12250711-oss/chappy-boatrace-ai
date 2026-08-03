(function (root) {
  "use strict";

  if (root.ChappyFlowOddsTabs) return;

  function normalizeTicket(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/→/g, "-")
      .replace(/[^1-6-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function parseNotation(value) {
    const match = String(value || "")
      .replace(/\s+/g, "")
      .match(/^([1-6])-([1-6]{1,3})-(?:全|ALL)$/i);

    if (!match) return null;

    const head = Number(match[1]);
    const seconds = [...new Set(match[2].split("").map(Number))]
      .filter(no => no !== head && no >= 1 && no <= 6)
      .slice(0, 3);

    if (!seconds.length) return null;

    const tickets = [];
    for (const second of seconds) {
      for (let third = 1; third <= 6; third += 1) {
        if (third === head || third === second) continue;
        tickets.push(`${head}-${second}-${third}`);
      }
    }

    return { head, seconds, tickets };
  }

  function collectOdds(rootNode) {
    const odds = new Map();
    const rows = rootNode.querySelectorAll(
      ".v3-ticket-inline, .v3-formation-row, .ticket-row"
    );

    rows.forEach(row => {
      if (row.dataset.flowNotation) return;

      const ticketNode = row.querySelector(
        ".ticket, .v3-formation-ticket, .ticket-main strong"
      );
      const ticket = normalizeTicket(ticketNode?.textContent);
      if (!/^([1-6])-([1-6])-([1-6])$/.test(ticket)) return;

      const oddsNode = row.querySelector(
        ".ticket-odds, .v3-tag-odds, [data-ticket-odds]"
      );
      const text = String(oddsNode?.textContent || "").trim();
      const match = text.match(/(\d+(?:\.\d+)?)\s*倍/);

      if (match) odds.set(ticket, `${match[1]}倍`);
    });

    return odds;
  }

  function createDetails(row, notation) {
    const parsed = parseNotation(notation);
    if (!parsed) return null;

    const details = document.createElement("div");
    details.className = "flow-odds-tab-panel";
    details.hidden = true;
    details.dataset.flowOddsPanel = notation;

    const odds = collectOdds(document);
    details.innerHTML = parsed.tickets
      .map(ticket => {
        const oddsText = odds.get(ticket) || "オッズ未取得";
        return `
          <div class="flow-odds-ticket-row">
            <strong>${ticket}</strong>
            <span>${oddsText}</span>
          </div>
        `;
      })
      .join("");

    row.insertAdjacentElement("afterend", details);
    return details;
  }

  function enhanceRow(row) {
    if (!row || row.dataset.flowOddsReady === "true") return;

    const notation = row.dataset.flowNotation || "";
    if (!parseNotation(notation)) return;

    row.dataset.flowOddsReady = "true";
    row.classList.add("flow-odds-tab-trigger");
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.className = "flow-odds-tab-label";
    label.textContent = "オッズを見る ▼";
    row.appendChild(label);

    const toggle = () => {
      let panel = row.nextElementSibling;
      if (!panel?.matches(".flow-odds-tab-panel")) {
        panel = createDetails(row, notation);
      }
      if (!panel) return;

      const opening = panel.hidden;
      panel.hidden = !opening;
      row.setAttribute("aria-expanded", String(opening));
      label.textContent = opening ? "オッズを閉じる ▲" : "オッズを見る ▼";
    };

    row.addEventListener("click", event => {
      if (event.target.closest("a,button,input,select,textarea")) return;
      toggle();
    });

    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });
  }

  function enhanceAll() {
    document
      .querySelectorAll("[data-flow-notation]")
      .forEach(enhanceRow);
  }

  const observer = new MutationObserver(enhanceAll);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceAll, { once: true });
  } else {
    enhanceAll();
  }

  root.ChappyFlowOddsTabs = Object.freeze({
    enhanceAll,
    parseNotation
  });
})(window);
