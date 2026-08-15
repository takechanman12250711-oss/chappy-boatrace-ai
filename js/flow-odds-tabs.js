(function (root) {
  "use strict";

  if (!root || root.ChappyFlowOddsTabs) return;

  const API_BASE = "https://chappy-boatrace-api.vercel.app";
  const ODDS_TIMEOUT_MS = 12000;
  const CACHE_TTL_MS = 5000;
  const STYLE_ID = "chappy-flow-odds-tabs-style";
  const oddsCache = new Map();

  const PLACE_CODE_MAP = Object.freeze({
    桐生: "01", 戸田: "02", 江戸川: "03", 平和島: "04",
    多摩川: "05", 浜名湖: "06", 蒲郡: "07", 常滑: "08",
    津: "09", 三国: "10", びわこ: "11", 住之江: "12",
    尼崎: "13", 鳴門: "14", 丸亀: "15", 児島: "16",
    宮島: "17", 徳山: "18", 下関: "19", 若松: "20",
    芦屋: "21", 福岡: "22", 唐津: "23", 大村: "24"
  });

  function installStyle() {
    if (!root.document || root.document.getElementById?.(STYLE_ID)) return;
    const style = root.document.createElement?.("style");
    if (!style) return;
    style.id = STYLE_ID;
    style.textContent = `
      .flow-odds-tab-trigger{cursor:pointer;position:relative;padding-right:7.5rem!important}
      .flow-odds-tab-trigger:focus-visible{outline:3px solid rgba(30,136,229,.35);outline-offset:2px}
      .flow-odds-tab-label{position:absolute;right:.7rem;top:50%;transform:translateY(-50%);font-size:.78rem;font-weight:700;color:#1565c0;white-space:nowrap}
      .flow-odds-tab-panel{margin:-.15rem 0 .7rem;padding:.65rem;border:1px solid #d9e8f7;border-radius:0 0 12px 12px;background:#f7fbff}
      .flow-odds-ticket-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.55rem .65rem;border-bottom:1px solid #e6eef6;font-size:.9rem}
      .flow-odds-ticket-row:last-child{border-bottom:0}.flow-odds-ticket-row strong{letter-spacing:.03em}
      .flow-odds-ticket-row span{font-weight:700;color:#c62828;white-space:nowrap}.flow-odds-loading{padding:.75rem;text-align:center;color:#607d8b;font-weight:700}
      @media(max-width:480px){.flow-odds-tab-trigger{padding-right:6.8rem!important}.flow-odds-tab-label{right:.45rem;font-size:.72rem}}
    `;
    root.document.head?.appendChild?.(style);
  }

  function normalizeTicket(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/→/g, "-")
      .replace(/[^1-6-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normalizeBoats(value) {
    return [...new Set(String(value || "").replace(/\D/g, "").split("").map(Number))]
      .filter(no => no >= 1 && no <= 6);
  }

  function parseNotation(value) {
    const match = String(value || "")
      .replace(/\s+/g, "")
      .match(/^([1-6]+)-([1-6]+)-(?:全|ALL)$/i);
    if (!match) return null;

    const heads = normalizeBoats(match[1]);
    const seconds = normalizeBoats(match[2]);
    if (!heads.length || !seconds.length) return null;

    const tickets = [];
    for (const head of heads) {
      for (const second of seconds) {
        if (second === head) continue;
        for (let third = 1; third <= 6; third += 1) {
          if (third === head || third === second) continue;
          tickets.push(`${head}-${second}-${third}`);
        }
      }
    }
    const unique = [...new Set(tickets)];
    return unique.length ? { head: heads[0], heads, seconds, tickets: unique } : null;
  }

  function collectVisibleOdds(rootNode) {
    const odds = new Map();
    rootNode?.querySelectorAll?.(".v3-ticket-inline,.v3-formation-row,.ticket-row,[data-formation-ticket]")
      .forEach(row => {
        const directTicket = row.dataset?.formationTicket || "";
        const ticketNode = row.querySelector?.(".ticket,.v3-formation-ticket,.ticket-main strong,.chappy-formation-odds-ticket");
        const ticket = normalizeTicket(directTicket || ticketNode?.textContent);
        if (!/^([1-6])-([1-6])-([1-6])$/.test(ticket)) return;
        const oddsNode = row.querySelector?.(".ticket-odds,.v3-tag-odds,[data-ticket-odds],.chappy-formation-odds-value");
        const match = String(oddsNode?.textContent || "").match(/(\d+(?:\.\d+)?)\s*倍/);
        if (match) odds.set(ticket, `${match[1]}倍`);
      });
    return odds;
  }

  function resolveRaceParams(input = {}) {
    const explicit = input && typeof input === "object" ? input : {};
    const documentObject = root.document;
    const placeSelect = documentObject?.getElementById?.("placeSelect");
    const raceSelect = documentObject?.getElementById?.("raceSelect");
    const dateInput = documentObject?.getElementById?.("dateInput");
    const selectedPlaceOption = placeSelect?.selectedOptions?.[0];
    const selectedRaceOption = raceSelect?.selectedOptions?.[0];

    const jcd = String(
      explicit.jcd ?? explicit.stadiumCode ??
      selectedPlaceOption?.dataset?.jcd ?? PLACE_CODE_MAP[placeSelect?.value] ?? ""
    ).replace(/\D/g, "").padStart(2, "0").slice(-2);
    const rno = Number(
      explicit.rno ?? explicit.raceNo ??
      selectedRaceOption?.dataset?.rno ?? String(raceSelect?.value || "").replace(/[^0-9]/g, "")
    );
    const date = String(explicit.date ?? explicit.hd ?? dateInput?.value ?? "")
      .replace(/\D/g, "").slice(0, 8);

    if (!/^\d{2}$/.test(jcd) || !(rno >= 1 && rno <= 12) || !/^\d{8}$/.test(date)) return null;
    return { jcd, rno, date };
  }

  function oddsDataToMap(data) {
    if (!data || data.ok === false || data.available === false) return new Map();
    const source = data.byTicket && typeof data.byTicket === "object"
      ? data.byTicket
      : Object.fromEntries((Array.isArray(data.trifecta) ? data.trifecta : [])
          .map(item => [item?.ticket, item?.odds]));
    return new Map(
      Object.entries(source)
        .map(([ticket, odds]) => [normalizeTicket(ticket), Number(odds)])
        .filter(([ticket, odds]) => /^([1-6])-([1-6])-([1-6])$/.test(ticket) && Number.isFinite(odds) && odds > 0)
        .map(([ticket, odds]) => [ticket, `${odds}倍`])
    );
  }

  async function directFetchOdds(params) {
    const controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
    const timer = controller ? root.setTimeout(() => controller.abort(), ODDS_TIMEOUT_MS) : 0;
    try {
      const url = `${API_BASE}/api/odds?jcd=${encodeURIComponent(params.jcd)}&rno=${encodeURIComponent(params.rno)}&date=${encodeURIComponent(params.date)}`;
      const response = await root.fetch(url, controller ? { signal: controller.signal } : undefined);
      const data = await response.json();
      return response.ok ? data : null;
    } finally {
      if (timer) root.clearTimeout(timer);
    }
  }

  async function fetchAllOdds(input = {}, options = {}) {
    const params = resolveRaceParams(input);
    if (!params) return new Map();
    const key = `${params.date}:${params.jcd}:${params.rno}`;
    const current = oddsCache.get(key);
    const now = Date.now();

    if (!options.force && current?.map instanceof Map && current.map.size && now - current.savedAt <= CACHE_TTL_MS) {
      return new Map(current.map);
    }
    if (current?.promise) return current.promise;

    const promise = (async () => {
      const shared = root.ChappyOddsFetchCache;
      const data = typeof shared?.fetchData === "function"
        ? await shared.fetchData(params, { force: options.force === true })
        : await directFetchOdds(params);
      const map = oddsDataToMap(data);
      if (map.size) {
        oddsCache.set(key, { map, savedAt: Date.now(), promise: null });
        return new Map(map);
      }
      oddsCache.delete(key);
      return new Map();
    })().catch(error => {
      oddsCache.delete(key);
      console.warn("フォーメーションオッズ取得エラー", error?.message || error);
      return new Map();
    });

    oddsCache.set(key, {
      map: current?.map instanceof Map ? current.map : null,
      savedAt: Number(current?.savedAt || 0),
      promise
    });
    return promise;
  }

  function renderRows(panel, tickets, odds) {
    panel.innerHTML = tickets.map(ticket => `
      <div class="flow-odds-ticket-row"><strong>${ticket}</strong><span>${odds.get(ticket) || "オッズ未取得"}</span></div>
    `).join("");
  }

  function createDetails(row, notation) {
    const parsed = parseNotation(notation);
    if (!parsed) return null;
    const panel = root.document.createElement("div");
    panel.className = "flow-odds-tab-panel";
    panel.hidden = true;
    panel.dataset.flowOddsPanel = notation;
    panel.dataset.flowOddsLoaded = "false";
    panel.innerHTML = '<div class="flow-odds-loading">オッズを確認中...</div>';
    row.insertAdjacentElement("afterend", panel);
    return panel;
  }

  async function loadPanel(panel, notation, options = {}) {
    if (!panel || panel.dataset.flowOddsLoading === "true") return false;
    if (!options.force && panel.dataset.flowOddsLoaded === "true") return true;
    const parsed = parseNotation(notation);
    if (!parsed) return false;

    panel.dataset.flowOddsLoading = "true";
    try {
      const visibleOdds = collectVisibleOdds(root.document);
      const completeVisible = parsed.tickets.every(ticket => visibleOdds.has(ticket));
      const allOdds = completeVisible ? new Map() : await fetchAllOdds({}, options);
      const merged = new Map([...visibleOdds, ...allOdds]);
      renderRows(panel, parsed.tickets, merged);
      const complete = parsed.tickets.every(ticket => merged.has(ticket));
      panel.dataset.flowOddsLoaded = complete ? "true" : "false";
      return complete;
    } finally {
      delete panel.dataset.flowOddsLoading;
    }
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

    const label = root.document.createElement("span");
    label.className = "flow-odds-tab-label";
    label.textContent = "オッズを見る ▼";
    row.appendChild(label);

    const toggle = async () => {
      let panel = row.nextElementSibling;
      if (!panel?.matches?.(".flow-odds-tab-panel")) panel = createDetails(row, notation);
      if (!panel) return;
      const opening = panel.hidden;
      panel.hidden = !opening;
      row.setAttribute("aria-expanded", String(opening));
      label.textContent = opening ? "オッズを閉じる ▲" : "オッズを見る ▼";
      if (opening) await loadPanel(panel, notation);
    };

    row.addEventListener("click", event => {
      if (event.target.closest?.("a,button,input,select,textarea")) return;
      void toggle();
    });
    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      void toggle();
    });
  }

  function enhanceAll(scope = root.document) {
    scope?.querySelectorAll?.("[data-flow-notation]").forEach(enhanceRow);
  }

  async function refreshOpenPanels() {
    const panels = [...(root.document?.querySelectorAll?.(".flow-odds-tab-panel:not([hidden])") || [])];
    await Promise.all(panels.map(panel => loadPanel(panel, panel.dataset.flowOddsPanel || "", { force: false })));
  }

  installStyle();
  root.addEventListener?.("chappy:prediction-rendered", () => {
    enhanceAll(root.document?.getElementById?.("resultArea") || root.document);
  });
  root.addEventListener?.("chappy:odds-cache-updated", () => {
    void refreshOpenPanels();
  });
  if (root.document?.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", () => enhanceAll(), { once: true });
  } else {
    enhanceAll();
  }

  root.ChappyFlowOddsTabs = Object.freeze({
    enhanceAll,
    parseNotation,
    resolveRaceParams,
    oddsDataToMap,
    fetchAllOdds,
    loadPanel,
    refreshOpenPanels
  });
})(typeof window !== "undefined" ? window : null);
