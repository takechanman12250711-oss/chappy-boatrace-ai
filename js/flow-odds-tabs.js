(function (root) {
  "use strict";

  if (root.ChappyFlowOddsTabs) return;

  const API_BASE = "https://chappy-boatrace-api.vercel.app";
  const ODDS_TIMEOUT_MS = 30000;
  const oddsCache = new Map();

  const PLACE_CODE_MAP = Object.freeze({
    桐生: "01", 戸田: "02", 江戸川: "03", 平和島: "04",
    多摩川: "05", 浜名湖: "06", 蒲郡: "07", 常滑: "08",
    津: "09", 三国: "10", びわこ: "11", 住之江: "12",
    尼崎: "13", 鳴門: "14", 丸亀: "15", 児島: "16",
    宮島: "17", 徳山: "18", 下関: "19", 若松: "20",
    芦屋: "21", 福岡: "22", 唐津: "23", 大村: "24"
  });

  const style = document.createElement("style");
  style.textContent = `
    .flow-odds-tab-trigger{cursor:pointer;position:relative;padding-right:7.5rem!important}
    .flow-odds-tab-trigger:focus-visible{outline:3px solid rgba(30,136,229,.35);outline-offset:2px}
    .flow-odds-tab-label{position:absolute;right:.7rem;top:50%;transform:translateY(-50%);font-size:.78rem;font-weight:700;color:#1565c0;white-space:nowrap}
    .flow-odds-tab-panel{margin:-.15rem 0 .7rem;padding:.65rem;border:1px solid #d9e8f7;border-radius:0 0 12px 12px;background:#f7fbff}
    .flow-odds-ticket-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.55rem .65rem;border-bottom:1px solid #e6eef6;font-size:.9rem}
    .flow-odds-ticket-row:last-child{border-bottom:0}
    .flow-odds-ticket-row strong{letter-spacing:.03em}
    .flow-odds-ticket-row span{font-weight:700;color:#c62828;white-space:nowrap}
    .flow-odds-loading{padding:.75rem;text-align:center;color:#607d8b;font-weight:700}
    @media(max-width:480px){.flow-odds-tab-trigger{padding-right:6.8rem!important}.flow-odds-tab-label{right:.45rem;font-size:.72rem}}
  `;
  document.head.appendChild(style);

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

  function collectVisibleOdds(rootNode) {
    const odds = new Map();
    rootNode.querySelectorAll(".v3-ticket-inline,.v3-formation-row,.ticket-row")
      .forEach(row => {
        if (row.dataset.flowNotation) return;
        const ticketNode = row.querySelector(".ticket,.v3-formation-ticket,.ticket-main strong");
        const ticket = normalizeTicket(ticketNode?.textContent);
        if (!/^([1-6])-([1-6])-([1-6])$/.test(ticket)) return;
        const oddsNode = row.querySelector(".ticket-odds,.v3-tag-odds,[data-ticket-odds]");
        const match = String(oddsNode?.textContent || "").match(/(\d+(?:\.\d+)?)\s*倍/);
        if (match) odds.set(ticket, `${match[1]}倍`);
      });
    return odds;
  }

  function resolveRaceParams() {
    const placeSelect = document.getElementById("placeSelect");
    const raceSelect = document.getElementById("raceSelect");
    const dateInput = document.getElementById("dateInput");
    const selectedPlaceOption = placeSelect?.selectedOptions?.[0];
    const selectedRaceOption = raceSelect?.selectedOptions?.[0];

    const jcd = String(
      selectedPlaceOption?.dataset?.jcd ||
      PLACE_CODE_MAP[placeSelect?.value] ||
      ""
    ).padStart(2, "0");

    const rno = Number(
      selectedRaceOption?.dataset?.rno ||
      String(raceSelect?.value || "").replace(/[^0-9]/g, "")
    );

    const date = String(dateInput?.value || "").replace(/-/g, "");
    if (!/^\d{2}$/.test(jcd) || !(rno >= 1 && rno <= 12) || !/^\d{8}$/.test(date)) {
      return null;
    }
    return { jcd, rno, date };
  }

  async function fetchAllOdds() {
    const params = resolveRaceParams();
    if (!params) return new Map();

    const key = `${params.date}:${params.jcd}:${params.rno}`;
    if (oddsCache.has(key)) return oddsCache.get(key);

    const promise = (async () => {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? root.setTimeout(() => controller.abort(), ODDS_TIMEOUT_MS) : 0;
      try {
        const url = `${API_BASE}/api/odds?jcd=${encodeURIComponent(params.jcd)}&rno=${encodeURIComponent(params.rno)}&date=${encodeURIComponent(params.date)}`;
        const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
        const data = await response.json();
        if (!response.ok || !data?.ok) return new Map();

        const source = data.byTicket && typeof data.byTicket === "object"
          ? data.byTicket
          : Object.fromEntries(
              (Array.isArray(data.trifecta) ? data.trifecta : [])
                .map(item => [item?.ticket, item?.odds])
            );

        return new Map(
          Object.entries(source)
            .map(([ticket, odds]) => [normalizeTicket(ticket), Number(odds)])
            .filter(([ticket, odds]) => /^([1-6])-([1-6])-([1-6])$/.test(ticket) && Number.isFinite(odds) && odds > 0)
            .map(([ticket, odds]) => [ticket, `${odds}倍`])
        );
      } catch (_) {
        return new Map();
      } finally {
        if (timer) root.clearTimeout(timer);
      }
    })();

    oddsCache.set(key, promise);
    return promise;
  }

  function renderRows(panel, tickets, odds) {
    panel.innerHTML = tickets.map(ticket => `
      <div class="flow-odds-ticket-row">
        <strong>${ticket}</strong>
        <span>${odds.get(ticket) || "オッズ未取得"}</span>
      </div>
    `).join("");
  }

  function createDetails(row, notation) {
    const parsed = parseNotation(notation);
    if (!parsed) return null;

    const panel = document.createElement("div");
    panel.className = "flow-odds-tab-panel";
    panel.hidden = true;
    panel.dataset.flowOddsPanel = notation;
    panel.dataset.flowOddsLoaded = "false";
    panel.innerHTML = '<div class="flow-odds-loading">オッズを確認中...</div>';
    row.insertAdjacentElement("afterend", panel);
    return panel;
  }

  async function loadPanel(panel, notation) {
    if (panel.dataset.flowOddsLoaded === "true") return;
    const parsed = parseNotation(notation);
    if (!parsed) return;

    const visibleOdds = collectVisibleOdds(document);
    const allOdds = await fetchAllOdds();
    const merged = new Map([...visibleOdds, ...allOdds]);
    renderRows(panel, parsed.tickets, merged);
    panel.dataset.flowOddsLoaded = "true";
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

    const toggle = async () => {
      let panel = row.nextElementSibling;
      if (!panel?.matches(".flow-odds-tab-panel")) panel = createDetails(row, notation);
      if (!panel) return;

      const opening = panel.hidden;
      panel.hidden = !opening;
      row.setAttribute("aria-expanded", String(opening));
      label.textContent = opening ? "オッズを閉じる ▲" : "オッズを見る ▼";
      if (opening) await loadPanel(panel, notation);
    };

    row.addEventListener("click", event => {
      if (event.target.closest("a,button,input,select,textarea")) return;
      void toggle();
    });
    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      void toggle();
    });
  }

  function enhanceAll() {
    document.querySelectorAll("[data-flow-notation]").forEach(enhanceRow);
  }

  new MutationObserver(enhanceAll).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceAll, { once: true });
  } else {
    enhanceAll();
  }

  root.ChappyFlowOddsTabs = Object.freeze({
    enhanceAll,
    parseNotation,
    resolveRaceParams,
    fetchAllOdds
  });
})(window);
