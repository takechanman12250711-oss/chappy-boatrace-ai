(function (root, factory) {
  "use strict";
  const api = factory(root?.ChappyTeleboatHistory || (typeof require === "function" ? require("./teleboat-history-parser.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) {
    root.ChappyPurchaseImport = api;
    const start = () => api.install(root);
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window === "undefined" ? null : window, function (parser) {
  "use strict";

  // 購入の取り込みページ。ブックマークが渡した明細を確認してから購入同期APIへ送り、
  // 今日・今月の負けと警告（購入の歯止め）を表示する。警告のみで購入は止めない。
  const API_URL = "https://chappy-boatrace-api.vercel.app/api/purchases";
  const TOKEN_KEY = "chappy_purchase_sync_token_v1";
  const VENUE_NAMES = Object.freeze(Object.fromEntries((parser?.VENUES || []).filter(([name]) => name !== "琵琶湖").map(([name, jcd]) => [jcd, name])));

  function yen(value) {
    return `${Math.round(Number(value) || 0).toLocaleString("ja-JP")}円`;
  }

  function readHashCapture(hash) {
    const match = String(hash || "").match(/[#&]d=([A-Za-z0-9_-]+)/);
    if (!match) return null;
    try { return parser.decodeCapture(match[1]); } catch { return { error: "読み取ったデータを開けませんでした" }; }
  }

  function loadToken(storage) {
    try { return storage?.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  }

  function saveToken(storage, token, remember) {
    try {
      if (remember && token) storage?.setItem(TOKEN_KEY, token);
      else storage?.removeItem(TOKEN_KEY);
    } catch { /* 保存できなくても送信はできる */ }
  }

  async function callApi(fetchImpl, token, { method = "GET", query = "", body } = {}) {
    const response = await fetchImpl(`${API_URL}${query}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok === false) throw new Error(json.error || `通信に失敗しました（${response.status}）`);
    return json;
  }

  function todayJst(now = Date.now()) {
    return parser.jstDate(new Date(now).toISOString());
  }

  // 応答の guardrails を、画面に出す短い行にする
  function summarizeGuardrails(guardrails = {}, today = "") {
    const lines = [];
    for (const [date, day] of Object.entries(guardrails.days || {}).sort().reverse()) {
      const label = date === today ? "今日" : `${Number(date.slice(4, 6))}/${Number(date.slice(6, 8))}`;
      lines.push({ level: day.level, text: `${label}の負け ${yen(day.netSpentYen)} ／ 上限 ${yen(day.limitYen)}（購入 ${yen(day.stakeYen)}・結果待ち ${yen(day.pendingStakeYen)}）` });
    }
    for (const [month, data] of Object.entries(guardrails.months || {}).sort().reverse()) {
      const label = month === today.slice(0, 6) ? "今月" : `${Number(month.slice(4, 6))}月`;
      lines.push({ level: data.level, text: `${label}の負け ${yen(data.netSpentYen)} ／ 予算 ${yen(data.budgetYen)}（購入 ${yen(data.stakeYen)}）` });
    }
    for (const warning of guardrails.warnings || []) lines.push({ level: warning.level, text: warning.message });
    if (guardrails.unavailable) lines.push({ level: "notice", text: "警告の計算ができませんでした（購入の保存は完了しています）" });
    return lines;
  }

  function el(document, tag, attrs = {}, text = "") {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
  }

  function renderStatus(document, lines) {
    const area = document.getElementById("guardrailArea");
    area.replaceChildren();
    if (!lines.length) { area.append(el(document, "p", { class: "muted" }, "表示できる集計はまだありません。")); return; }
    for (const line of lines) area.append(el(document, "p", { class: `line ${line.level || "ok"}` }, line.text));
  }

  function renderCapture(document, parsed) {
    const table = document.getElementById("purchaseRows");
    table.replaceChildren();
    parsed.purchases.forEach((p, index) => {
      const row = el(document, "tr");
      const check = el(document, "input", { type: "checkbox", "data-index": String(index) });
      check.checked = true;
      const cell = el(document, "td"); cell.append(check);
      row.append(cell,
        el(document, "td", {}, `${p.date.slice(4, 6)}/${p.date.slice(6, 8)}${p.dateAssumed ? "（推定）" : ""}`),
        el(document, "td", {}, `${VENUE_NAMES[p.jcd] || p.jcd} ${p.raceNo}R`),
        el(document, "td", {}, p.ticket),
        el(document, "td", { class: "num" }, yen(p.amount)));
      table.append(row);
    });
    const skipped = document.getElementById("skippedRows");
    skipped.replaceChildren();
    for (const item of parsed.skipped) skipped.append(el(document, "li", {}, `${item.label}：${item.text}`));
    document.getElementById("skippedBox").hidden = !parsed.skipped.length;
    document.getElementById("captureSummary").textContent =
      `${parsed.host || "読み取り元不明"} から ${parsed.purchases.length}件を読み取りました${parsed.skipped.length ? `（読めなかった行 ${parsed.skipped.length}件）` : ""}。内容を確認してから送信してください。`;
    document.getElementById("captureBox").hidden = false;
    document.getElementById("sendButton").disabled = !parsed.purchases.length;
  }

  function selectedPurchases(document, parsed) {
    return [...document.querySelectorAll("#purchaseRows input[type=checkbox]")]
      .filter((input) => input.checked)
      .map((input) => parsed.purchases[Number(input.getAttribute("data-index"))])
      .filter(Boolean)
      .map(({ date, jcd, raceNo, ticket, amount, contractId, source }) => ({ date, jcd, raceNo, ticket, amount, contractId, source }));
  }

  function install(root) {
    const { document } = root;
    const storage = root.localStorage;
    const fetchImpl = root.fetch.bind(root);
    const tokenInput = document.getElementById("tokenInput");
    const remember = document.getElementById("rememberToken");
    const message = document.getElementById("messageArea");
    const saved = loadToken(storage);
    tokenInput.value = saved;
    remember.checked = Boolean(saved);
    document.getElementById("bookmarkletCode").value = parser.bookmarkletSource();

    let parsed = { purchases: [], skipped: [] };
    const capture = readHashCapture(root.location.hash);
    // 読み取った内容をアドレス欄や履歴に残さない
    if (root.location.hash) root.history?.replaceState?.(null, "", root.location.pathname + root.location.search);
    if (capture?.error) message.textContent = capture.error;
    else if (capture) { parsed = parser.parseCapture(capture); renderCapture(document, parsed); }

    const token = () => {
      const value = tokenInput.value.trim();
      saveToken(storage, value, remember.checked);
      if (!value) throw new Error("同期用の合言葉（トークン）を入力してください");
      return value;
    };

    const run = async (button, task) => {
      button.disabled = true;
      message.textContent = "通信しています…";
      try { await task(); } catch (error) { message.textContent = String(error?.message || error); } finally { button.disabled = false; }
    };

    document.getElementById("sendButton").addEventListener("click", (event) => run(event.currentTarget, async () => {
      const purchases = selectedPurchases(document, parsed);
      if (!purchases.length) throw new Error("送信する明細を1件以上選んでください");
      const result = await callApi(fetchImpl, token(), { method: "POST", body: { purchases } });
      message.textContent = `${result.received}件を送信しました（新規 ${result.added}件）。`;
      renderStatus(document, summarizeGuardrails(result.guardrails, todayJst()));
    }));

    document.getElementById("statusButton").addEventListener("click", (event) => run(event.currentTarget, async () => {
      const today = todayJst();
      const result = await callApi(fetchImpl, token(), { query: `?date=${today}` });
      message.textContent = `今日の購入 ${result.count}件`;
      renderStatus(document, summarizeGuardrails(result.guardrails, today));
    }));

    document.getElementById("copyBookmarklet").addEventListener("click", async () => {
      const code = document.getElementById("bookmarkletCode");
      try { await root.navigator.clipboard.writeText(code.value); message.textContent = "コピーしました"; }
      catch { code.select(); message.textContent = "選択した文字をコピーしてください"; }
    });
  }

  return Object.freeze({ API_URL, TOKEN_KEY, readHashCapture, summarizeGuardrails, callApi, todayJst, install });
});
