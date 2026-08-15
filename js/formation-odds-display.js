/* =========================================================
  チャッピーボートレースAI
  フォーメーション全点オッズ表示

  表示専用。予想ロジック、買い目、購入対象、並び順は変更しない。
  例: 12-345-全（24点）、4-23-全（8点）
========================================================= */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (!root) return;
  root.ChappyFormationOddsDisplay = Object.freeze(api);
  api.install(root);
  root.addEventListener?.("chappy:prediction-runtime-ready", () => api.install(root));
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const VERSION = "formation-odds-display-v2";
  const STYLE_ID = "chappy-formation-odds-display-style";
  const BOATS = Object.freeze([1, 2, 3, 4, 5, 6]);
  const FORMATION_PATHS = Object.freeze([
    ["mainSheet", "flowFormations"], ["aiCore", "mainSheet", "flowFormations"],
    ["aiCore", "formations", "flowFormations"], ["formations", "flowFormations"],
    ["formation", "flowFormations"]
  ]);
  const FULL_FLOW_PATHS = Object.freeze([
    ["aiCore", "formations", "flow"], ["formations", "flow"],
    ["formation", "flow"], ["formation", "nagashi"]
  ]);
  const COVER_PATHS = Object.freeze([
    ["ticketSheets", "cover"], ["mainSheet", "coverTickets"],
    ["aiCore", "mainSheet", "coverTickets"], ["aiCore", "formations", "safety"],
    ["formations", "safety"], ["formation", "cover"], ["formation", "safety"]
  ]);
  const ODDS_LIST_PATHS = Object.freeze([
    ["ticketSheets", "main"], ["ticketSheets", "cover"], ["ticketSheets", "flow"],
    ["ticketSheets", "hole"], ["ticketSheets", "all"], ["mainSheet", "tickets"],
    ["mainSheet", "coverTickets"], ["mainSheet", "flowTickets"],
    ["manshuSheet", "tickets"], ["aiCore", "mainSheet", "tickets"],
    ["aiCore", "mainSheet", "coverTickets"], ["aiCore", "mainSheet", "flowTickets"],
    ["aiCore", "manshuSheet", "tickets"], ["practicalTickets"],
    ["practicalSelection", "tickets"], ["ticketRanks"], ["aiTicketList"]
  ]);

  const arrayify = value => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
  const getAtPath = (source, path) => path.reduce((value, key) => value?.[key], source);
  const normalizeTicket = value => String(value || "").replace(/\s+/g, "").trim();
  const ticketOf = item => normalizeTicket(typeof item === "string" ? item : item?.ticket || item?.line || item?.formation);

  function parseTicket(value) {
    const ticket = normalizeTicket(value);
    if (!/^[1-6]-[1-6]-[1-6]$/.test(ticket)) return null;
    const boats = ticket.split("-").map(Number);
    return new Set(boats).size === 3 ? boats : null;
  }

  function normalizeBoatNos(value) {
    return [...new Set(arrayify(value).flatMap(item => {
      const text = String(item ?? "").replace(/\s+/g, "");
      return /^[1-6]+$/.test(text) ? text.split("").map(Number) : [Number(item)];
    }).filter(no => Number.isInteger(no) && no >= 1 && no <= 6))].sort((a, b) => a - b);
  }

  function parseFormationNotation(value) {
    const match = String(value || "").replace(/\s+/g, "").match(/^([1-6]+)-([1-6]+)-(?:全|ALL)$/i);
    if (!match) return null;
    const firstBoatNos = normalizeBoatNos(match[1]);
    const secondBoatNos = normalizeBoatNos(match[2]);
    return firstBoatNos.length && secondBoatNos.length ? { firstBoatNos, secondBoatNos } : null;
  }

  function expandFormation(firstBoatNos, secondBoatNos) {
    const tickets = [];
    for (const first of normalizeBoatNos(firstBoatNos)) {
      for (const second of normalizeBoatNos(secondBoatNos)) {
        if (first === second) continue;
        for (const third of BOATS) {
          if (third !== first && third !== second) tickets.push(`${first}-${second}-${third}`);
        }
      }
    }
    return [...new Set(tickets)];
  }

  const notationFor = (firsts, seconds) => `${normalizeBoatNos(firsts).join("")}-${normalizeBoatNos(seconds).join("")}-全`;

  function cleanDisplayText(value) {
    const text = String(value || "")
      .replace(/残り全艇へ流す/g, "残り全艇に組む")
      .replace(/全艇へ流す/g, "全艇に組む")
      .replace(/流し候補/g, "フォーメーション候補")
      .replace(/流し展開|流し/g, "フォーメーション")
      .replace(/フォーメーション(?:\s*[・／、]\s*フォーメーション)+/g, "フォーメーション")
      .replace(/\s+/g, " ").trim();
    if (!text.includes("。")) return text;
    const seen = new Set();
    const sentences = text.split("。").map(row => row.trim()).filter(row => row && !seen.has(row) && seen.add(row));
    return sentences.length ? `${sentences.join("。")}。` : "";
  }

  function inferCompleteFormationRows(value) {
    const groups = new Map();
    for (const ticket of [...new Set(arrayify(value).map(ticketOf).filter(parseTicket))]) {
      const [first, second, third] = parseTicket(ticket);
      const key = `${first}-${second}`;
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key).add(third);
    }
    const secondsByFirst = new Map();
    for (const [key, thirds] of groups) {
      const [first, second] = key.split("-").map(Number);
      const expected = BOATS.filter(no => no !== first && no !== second);
      if (thirds.size !== expected.length || !expected.every(no => thirds.has(no))) continue;
      if (!secondsByFirst.has(first)) secondsByFirst.set(first, []);
      secondsByFirst.get(first).push(second);
    }
    return [...secondsByFirst].map(([first, seconds]) => ({
      firstBoatNos: [first], secondBoatNos: normalizeBoatNos(seconds), reason: "", scenarioId: ""
    })).filter(row => row.secondBoatNos.length);
  }

  function normalizeFormationRow(value) {
    const row = typeof value === "string" ? { notation: value } : value && typeof value === "object" ? value : null;
    if (!row) return null;
    const parsed = parseFormationNotation(row.notation || row.display || row.formation || "");
    let firstBoatNos = normalizeBoatNos([
      ...arrayify(row.firstBoatNos), ...arrayify(row.headBoatNos), ...arrayify(row.heads),
      ...arrayify(row.firsts), ...arrayify(row.firstCandidates), ...arrayify(row.headCandidates),
      row.headBoatNo, row.head
    ]);
    let secondBoatNos = normalizeBoatNos(row.secondBoatNos ?? row.seconds ?? row.secondCandidates);
    if (!firstBoatNos.length) firstBoatNos = parsed?.firstBoatNos || [];
    if (!secondBoatNos.length) secondBoatNos = parsed?.secondBoatNos || [];
    if (!firstBoatNos.length || !secondBoatNos.length) {
      const inferred = inferCompleteFormationRows(row.expandedTickets || row.tickets);
      if (inferred.length === 1) ({ firstBoatNos, secondBoatNos } = inferred[0]);
    }
    const tickets = expandFormation(firstBoatNos, secondBoatNos);
    if (!tickets.length) return null;
    return {
      firstBoatNos, secondBoatNos, tickets, pointCount: tickets.length,
      notation: notationFor(firstBoatNos, secondBoatNos),
      reason: cleanDisplayText(row.reason || row.scenarioSummary || row.flowCommonReason || row.comment || ""),
      scenarioType: cleanDisplayText(row.scenarioType || row.label || ""),
      scenarioId: String(row.scenarioId || row.id || "").trim()
    };
  }

  function mergeCompatibleRows(rows) {
    const grouped = new Map();
    for (const row of rows) {
      const key = [row.secondBoatNos.join(""), row.scenarioId, row.reason, row.scenarioType].join("|");
      const previous = grouped.get(key);
      if (!previous) { grouped.set(key, { ...row }); continue; }
      const firstBoatNos = normalizeBoatNos([...previous.firstBoatNos, ...row.firstBoatNos]);
      const tickets = expandFormation(firstBoatNos, previous.secondBoatNos);
      grouped.set(key, { ...previous, firstBoatNos, tickets, pointCount: tickets.length, notation: notationFor(firstBoatNos, previous.secondBoatNos) });
    }
    return [...grouped.values()].sort((a, b) => b.pointCount - a.pointCount || a.notation.localeCompare(b.notation));
  }

  function collectCoverHeadCandidates(prediction) {
    return normalizeBoatNos(COVER_PATHS.flatMap(path => arrayify(getAtPath(prediction, path)))
      .map(ticketOf).map(parseTicket).filter(Boolean).map(parts => parts[0]));
  }

  function augmentInnerHeadRows(prediction, rows) {
    const coverHeads = new Set(collectCoverHeadCandidates(prediction));
    return rows.map(row => {
      if (row.firstBoatNos.length !== 1 || ![1, 2].includes(row.firstBoatNos[0])) return row;
      const alternate = row.firstBoatNos[0] === 1 ? 2 : 1;
      if (!coverHeads.has(alternate) || row.secondBoatNos.includes(alternate)) return row;
      const firstBoatNos = [1, 2];
      const tickets = expandFormation(firstBoatNos, row.secondBoatNos);
      return { ...row, firstBoatNos, tickets, pointCount: tickets.length, notation: notationFor(firstBoatNos, row.secondBoatNos) };
    });
  }

  function collectFormationRows(prediction) {
    const explicit = FORMATION_PATHS.flatMap(path => arrayify(getAtPath(prediction, path))).map(normalizeFormationRow).filter(Boolean);
    const source = explicit.length ? explicit : FULL_FLOW_PATHS.flatMap(path => inferCompleteFormationRows(getAtPath(prediction, path))).map(normalizeFormationRow).filter(Boolean);
    return mergeCompatibleRows(augmentInnerHeadRows(prediction, source));
  }

  function raceParamsOf(prediction) {
    try {
      const selected = root?.ChappyRaceSelection?.getRaceParams?.();
      const jcd = String(selected?.jcd || "").replace(/\D/g, "").padStart(2, "0").slice(-2);
      const rno = Number(selected?.rno ?? selected?.raceNo ?? 0);
      const date = String(selected?.date || "").replace(/\D/g, "").slice(0, 8);
      if (/^\d{2}$/.test(jcd) && rno >= 1 && rno <= 12 && /^\d{8}$/.test(date)) return { jcd, rno, date };
    } catch (_) {}

    const sources = [prediction?.race, prediction?.rawRaceData, prediction?.raceData, prediction];
    for (const source of sources) {
      if (!source || typeof source !== "object") continue;
      const jcd = String(source.jcd ?? source.stadiumCode ?? source.placeCode ?? "")
        .replace(/\D/g, "").padStart(2, "0").slice(-2);
      const rno = Number(source.rno ?? source.raceNo ?? source.race ?? 0);
      const date = String(source.date ?? source.hd ?? source.raceDate ?? "")
        .replace(/\D/g, "").slice(0, 8);
      if (/^\d{2}$/.test(jcd) && rno >= 1 && rno <= 12 && /^\d{8}$/.test(date)) return { jcd, rno, date };
    }
    return null;
  }

  const oddsValue = value => Number(value && typeof value === "object" ? value.odds ?? value.value ?? value.currentOdds : value);
  function formatOdds(value, fallback = "") {
    const odds = oddsValue(value);
    if (Number.isFinite(odds) && odds > 0) return `${odds.toFixed(1)}倍`;
    const text = String(fallback || "").trim();
    return text && text !== "オッズ未取得" ? text : "オッズ未取得";
  }

  function oddsMapFromData(data) {
    if (data instanceof Map) return new Map(data);
    if (!data || typeof data !== "object") return new Map();
    const source = data.byTicket && typeof data.byTicket === "object"
      ? data.byTicket
      : Object.fromEntries((Array.isArray(data.trifecta) ? data.trifecta : [])
          .map(item => [item?.ticket, item?.odds]));
    return new Map(Object.entries(source).map(([ticket, odds]) => [normalizeTicket(ticket), formatOdds(odds)]));
  }

  function collectOddsRows(prediction) {
    const byTicket = new Map();
    const set = (ticketValue, value, meta = {}) => {
      const ticket = normalizeTicket(ticketValue);
      if (!parseTicket(ticket)) return;
      const odds = oddsValue(value);
      const incoming = { odds: Number.isFinite(odds) && odds > 0 ? odds : null, oddsText: formatOdds(value, meta.oddsText), isFinal: meta.isFinalRetrievedOdds === true };
      const existing = byTicket.get(ticket);
      if (!existing || incoming.isFinal && !existing.isFinal || incoming.isFinal === existing.isFinal && incoming.odds !== null && existing.odds === null) byTicket.set(ticket, incoming);
    };
    [prediction?.odds?.byTicket, prediction?.race?.odds?.byTicket, prediction?.rawRaceData?.odds?.byTicket,
      prediction?.raceData?.odds?.byTicket, prediction?.aiCore?.odds?.byTicket].forEach(source => {
      if (source && typeof source === "object") Object.entries(source).forEach(([ticket, value]) => set(ticket, value));
    });
    try {
      const cached = root?.ChappyOddsFetchCache?.getCachedData?.(raceParamsOf(prediction));
      Object.entries(cached?.byTicket || {}).forEach(([ticket, value]) => set(ticket, value));
    } catch (_) {}
    ODDS_LIST_PATHS.forEach(path => arrayify(getAtPath(prediction, path)).forEach(item => {
      if (item && typeof item === "object") set(ticketOf(item), item.odds, item);
    }));
    try {
      const snapshot = root?.ChappyFinalOddsDisplay?.load?.(prediction);
      Object.entries(snapshot?.byTicket || {}).forEach(([ticket, odds]) => set(ticket, odds, { isFinalRetrievedOdds: true, oddsText: `${odds}倍（最終取得）` }));
    } catch (_) {}
    return byTicket;
  }

  function selectedTicketSet(prediction) {
    return new Set([...arrayify(prediction?.practicalSelection?.tickets), ...arrayify(prediction?.practicalTickets)]
      .map(ticketOf).filter(parseTicket));
  }

  function buildDisplayModels(prediction) {
    const odds = collectOddsRows(prediction);
    const selected = selectedTicketSet(prediction);
    return collectFormationRows(prediction).map(row => {
      const tickets = row.tickets.map(ticket => ({
        ticket, oddsText: odds.get(ticket)?.oddsText || "オッズ未取得",
        isFinalOdds: odds.get(ticket)?.isFinal === true, selected: selected.has(ticket)
      }));
      return { ...row, tickets, selectedCount: tickets.filter(item => item.selected).length, availableOddsCount: tickets.filter(item => item.oddsText !== "オッズ未取得").length };
    });
  }

  const escapeHtml = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function renderStyles(documentRef) {
    if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
    const style = documentRef.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .chappy-formation-odds-display{display:grid;gap:12px}.chappy-formation-odds-card{border:1px solid #d8dee9;border-radius:12px;padding:12px;background:#fff}
      .chappy-formation-odds-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.chappy-formation-odds-notation{font-size:1.08rem;letter-spacing:.04em}
      .chappy-formation-odds-count{font-weight:700;white-space:nowrap}.chappy-formation-odds-meta{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px;font-size:.82rem;color:#4b5563}
      .chappy-formation-odds-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.chappy-formation-odds-item{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;padding:8px;border:1px solid #e5e7eb;border-radius:9px;background:#f8fafc}
      .chappy-formation-odds-item.is-selected{border-width:2px;font-weight:700}.chappy-formation-odds-ticket,.chappy-formation-odds-value{white-space:nowrap}.chappy-formation-odds-value{text-align:right;font-size:.9rem}
      .chappy-formation-odds-reason,.chappy-shared-formation-reason{margin:9px 0 0;line-height:1.65}@media(min-width:680px){.chappy-formation-odds-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    `;
    documentRef.head?.appendChild(style);
  }

  function renderModels(models) {
    return `<div class="chappy-formation-odds-display">${models.map(model => `
      <div class="chappy-formation-odds-card" data-formation-notation="${escapeHtml(model.notation)}">
        <div class="chappy-formation-odds-head"><strong class="chappy-formation-odds-notation">${escapeHtml(model.notation)}</strong><span class="chappy-formation-odds-count">${model.pointCount}点</span></div>
        <div class="chappy-formation-odds-meta"><span class="chappy-formation-odds-availability">オッズ取得 ${model.availableOddsCount}/${model.pointCount}</span>${model.selectedCount ? `<span>★ 購入対象 ${model.selectedCount}券</span>` : ""}</div>
        <div class="chappy-formation-odds-grid">${model.tickets.map(item => `
          <div class="chappy-formation-odds-item${item.selected ? " is-selected" : ""}" data-formation-ticket="${escapeHtml(item.ticket)}" data-final-odds="${item.isFinalOdds ? "true" : "false"}">
            <span class="chappy-formation-odds-ticket">${item.selected ? "★ " : ""}${escapeHtml(item.ticket)}</span><span class="chappy-formation-odds-value">${escapeHtml(item.oddsText)}</span>
          </div>`).join("")}</div>${model.reason ? `<p class="chappy-formation-odds-reason">${escapeHtml(model.reason)}</p>` : ""}
      </div>`).join("")}</div>`;
  }

  function fetchedOddsText(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (/倍/.test(text)) return text;
    const odds = Number(value);
    return Number.isFinite(odds) && odds > 0 ? `${odds.toFixed(1)}倍` : "";
  }

  async function hydrateFetchedOdds(display, prediction) {
    if (!display || display.isConnected === false || display.dataset.oddsHydrating === "true") return false;
    const missingRows = [...display.querySelectorAll("[data-formation-ticket]")]
      .filter(row => row.dataset.finalOdds !== "true" && row.querySelector(".chappy-formation-odds-value")?.textContent === "オッズ未取得");
    if (!missingRows.length) return false;

    display.dataset.oddsHydrating = "true";
    try {
      const params = raceParamsOf(prediction);
      let fetched = new Map();
      if (params && typeof root?.ChappyOddsFetchCache?.fetchData === "function") {
        fetched = oddsMapFromData(await root.ChappyOddsFetchCache.fetchData(params));
      } else if (typeof root?.ChappyFlowOddsTabs?.fetchAllOdds === "function") {
        fetched = await root.ChappyFlowOddsTabs.fetchAllOdds(params || {});
      }
      if (!(fetched instanceof Map) || !fetched.size || display.isConnected === false) return false;

      let changed = false;
      missingRows.forEach(row => {
        const text = fetchedOddsText(fetched.get(row.dataset.formationTicket));
        const value = row.querySelector(".chappy-formation-odds-value");
        if (text && value && value.textContent !== text) { value.textContent = text; changed = true; }
      });
      if (!changed) return false;
      display.querySelectorAll(".chappy-formation-odds-card").forEach(card => {
        const values = [...card.querySelectorAll(".chappy-formation-odds-value")];
        const available = values.filter(value => value.textContent !== "オッズ未取得").length;
        const counter = card.querySelector(".chappy-formation-odds-availability");
        if (counter) counter.textContent = `オッズ取得 ${available}/${values.length}`;
      });
      return true;
    } catch (error) {
      console.warn("フォーメーション全点オッズの反映に失敗", error?.message || error);
      return false;
    } finally {
      delete display.dataset.oddsHydrating;
    }
  }

  function removeRepeatedTags(scope) {
    scope?.querySelectorAll?.(".v3-formation-tags").forEach(container => {
      const seen = new Set();
      [...container.children].forEach(tag => {
        const text = cleanDisplayText(tag.textContent);
        if (!text || seen.has(text)) return tag.remove();
        seen.add(text); tag.textContent = text;
      });
    });
  }

  function collapseRepeatedReasons(scope) {
    scope?.querySelectorAll?.(".v3-formation-group").forEach(group => {
      const seen = new Set();
      [...group.querySelectorAll(".v3-formation-reason")].forEach(reason => {
        const text = cleanDisplayText(reason.textContent);
        if (!text || seen.has(text)) return reason.remove();
        seen.add(text); reason.textContent = text;
      });
      if (seen.size !== 1) return;
      const reason = group.querySelector(".v3-formation-reason");
      const list = group.querySelector(".v3-formation-list");
      if (!reason || !list) return;
      const shared = group.ownerDocument.createElement("p");
      shared.className = "chappy-shared-formation-reason"; shared.textContent = reason.textContent;
      list.before(shared); reason.remove();
    });
  }

  function replaceFlowDisplay(prediction, documentRef) {
    const models = buildDisplayModels(prediction);
    const accordion = documentRef.querySelector(".v3-ticket-accordion-flow");
    const panel = accordion?.querySelector(".v3-ticket-accordion-panel");
    if (!models.length || !accordion || !panel) return false;
    panel.querySelector(".chappy-formation-odds-display")?.remove();
    [...panel.children].filter(child => child.classList?.contains("v3-formation-group")).forEach(child => child.remove());
    const holder = documentRef.createElement("div"); holder.innerHTML = renderModels(models).trim();
    const display = holder.firstElementChild;
    const label = panel.querySelector(".v3-ticket-accordion-label");
    if (label?.after) label.after(display); else panel.appendChild(display);
    const count = accordion.querySelector(".v3-ticket-accordion-count");
    if (count) count.textContent = `${models.reduce((sum, model) => sum + model.pointCount, 0)}点`;
    const aim = accordion.querySelector(".v3-ticket-accordion-aim p");
    if (aim) aim.textContent = "フォーメーション全点のオッズを表示します。★は実戦厳選の購入対象です。";
    void hydrateFetchedOdds(display, prediction);
    return true;
  }

  function apply(prediction, documentRef = root?.document) {
    if (!prediction || typeof prediction !== "object" || !documentRef) return false;
    renderStyles(documentRef);
    const replaced = replaceFlowDisplay(prediction, documentRef);
    const scope = documentRef.getElementById?.("resultArea") || documentRef;
    removeRepeatedTags(scope); collapseRepeatedReasons(scope);
    return replaced;
  }

  function install(target) {
    if (!target || target.__formationOddsDisplayInstalled) return false;
    const name = typeof target.renderAll === "function"
      ? "renderAll"
      : typeof target.renderPrediction === "function"
        ? "renderPrediction"
        : "";
    if (!name) return false;
    const original = target[name];
    target[name] = function (prediction, ...args) {
      const result = original.call(this, prediction, ...args);
      apply(prediction, target.document);
      return result;
    };
    target.__formationOddsDisplayInstalled = true;
    return true;
  }

  return {
    VERSION, normalizeTicket, parseTicket, normalizeBoatNos, parseFormationNotation,
    expandFormation, notationFor, cleanDisplayText, inferCompleteFormationRows,
    normalizeFormationRow, mergeCompatibleRows, collectCoverHeadCandidates,
    augmentInnerHeadRows, collectFormationRows, raceParamsOf, oddsMapFromData,
    collectOddsRows, selectedTicketSet, buildDisplayModels, renderModels,
    fetchedOddsText, hydrateFetchedOdds, apply, install
  };
});
