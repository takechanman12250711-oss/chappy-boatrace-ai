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
  const SUMMARY_KEY = "chappy_inquiry_summary_v1";
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

  // 「合計」タブの購入金額を日付ごとに覚えておき、明細の金額を入れたときに照合する（この端末だけ）
  function loadSummaries(storage) {
    try { return JSON.parse(storage?.getItem(SUMMARY_KEY) || "{}") || {}; } catch { return {}; }
  }

  function saveSummary(storage, summary) {
    const all = loadSummaries(storage);
    all[summary.date] = summary;
    const recent = Object.fromEntries(Object.entries(all).sort().slice(-31));
    try { storage?.setItem(SUMMARY_KEY, JSON.stringify(recent)); } catch { /* 照合ができないだけ */ }
    return recent;
  }

  function summaryPayload(summary) {
    const { date, stakeYen, payoutYen, races, hitRaces, capturedAt } = summary;
    return { date, stakeYen, payoutYen, races, hitRaces, source: "inquiry-summary", capturedAt: capturedAt || "" };
  }

  // 入力した金額の合計と、照会の購入金額との照合文
  function amountCheck(total, summary) {
    if (!summary) return "";
    const diff = summary.stakeYen - total;
    const base = `入力した金額の合計 ${yen(total)} ／ 照会の購入金額 ${yen(summary.stakeYen)}`;
    if (diff === 0) return `${base}（一致）`;
    return diff > 0 ? `${base}（あと ${yen(diff)}）` : `${base}（${yen(-diff)} 多い）`;
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
      const detail = day.source === "inquiry-summary" ? `照会の合計・購入 ${yen(day.stakeYen)}` : `購入 ${yen(day.stakeYen)}・結果待ち ${yen(day.pendingStakeYen)}`;
      lines.push({ level: day.level, text: `${label}の負け ${yen(day.netSpentYen)} ／ 上限 ${yen(day.limitYen)}（${detail}）` });
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
        el(document, "td", {}, p.ticket));
      // 一覧に金額がない画面（投票照会）では、ここで入力してもらう
      const amount = el(document, "input", { type: "number", inputmode: "numeric", min: "100", step: "100", class: "amount", "data-index": String(index), "aria-label": `${p.ticket}の金額` });
      if (p.amount) amount.value = String(p.amount);
      const amountCell = el(document, "td", { class: "num" }); amountCell.append(amount);
      row.append(amountCell);
      table.append(row);
    });
    const missing = parsed.purchases.filter((p) => !p.amount).length;
    document.getElementById("bulkAmountBox").hidden = !missing;
    const skipped = document.getElementById("skippedRows");
    skipped.replaceChildren();
    for (const item of parsed.skipped) skipped.append(el(document, "li", {}, `${item.label}：${item.text}`));
    document.getElementById("skippedBox").hidden = !parsed.skipped.length;
    const dateNote = parsed.listedDate ? `${Number(parsed.listedDate.slice(4, 6))}月${Number(parsed.listedDate.slice(6, 8))}日の照会` : "";
    document.getElementById("captureSummary").textContent =
      `${parsed.host || "読み取り元不明"} ${dateNote}から ${parsed.purchases.length}件を読み取りました${parsed.skipped.length ? `（読めなかった行 ${parsed.skipped.length}件）` : ""}。` +
      (parsed.detailAmounts ? `金額は詳細から${parsed.detailAmounts}件読みました。` : "") +
      (missing ? `金額が読めなかった明細が${missing}件あります。金額を入れてから送信してください。` : "内容を確認してから送信してください。");
    document.getElementById("captureBox").hidden = false;
    document.getElementById("sendButton").disabled = !parsed.purchases.length;
  }

  // 100円単位の正の金額だけを受け付ける（APIと同じ条件）
  function validAmount(value) {
    const amount = Number(String(value ?? "").replace(/[,円\s]/g, ""));
    return Number.isSafeInteger(amount) && amount > 0 && amount % 100 === 0 ? amount : 0;
  }

  function selectedPurchases(document, parsed) {
    const picked = [];
    for (const input of document.querySelectorAll("#purchaseRows input[type=checkbox]")) {
      if (!input.checked) continue;
      const index = input.getAttribute("data-index");
      const p = parsed.purchases[Number(index)];
      if (!p) continue;
      const amount = validAmount(document.querySelector(`#purchaseRows input.amount[data-index="${index}"]`)?.value);
      if (!amount) throw new Error(`${p.raceNo}R ${p.ticket} の金額を100円単位で入れてください`);
      const { date, jcd, raceNo, ticket, contractId, source } = p;
      picked.push({ date, jcd, raceNo, ticket, amount, contractId, source });
    }
    return picked;
  }

  function applyBulkAmount(document, value) {
    const amount = validAmount(value);
    if (!amount) throw new Error("まとめて入れる金額を100円単位で入れてください");
    let filled = 0;
    for (const input of document.querySelectorAll("#purchaseRows input.amount")) {
      if (input.value) continue;
      input.value = String(amount);
      filled += 1;
    }
    return filled;
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
    // チェックを外したらすぐ消し、付けたらすぐ保存する（送信を待たない）
    remember.addEventListener("change", () => saveToken(storage, tokenInput.value.trim(), remember.checked));
    tokenInput.addEventListener("change", () => { if (remember.checked) saveToken(storage, tokenInput.value.trim(), true); });
    document.getElementById("bookmarkletCode").value = parser.bookmarkletSource();

    let parsed = { purchases: [], skipped: [] };
    let pendingSummary = null;
    const capture = readHashCapture(root.location.hash);
    // 読み取った内容をアドレス欄や履歴に残さない
    if (root.location.hash) root.history?.replaceState?.(null, "", root.location.pathname + root.location.search);
    const check = document.getElementById("amountCheck");
    const updateCheck = () => {
      const summary = loadSummaries(storage)[parsed.listedDate];
      const total = [...document.querySelectorAll("#purchaseRows input[type=checkbox]")]
        .filter((input) => input.checked)
        .reduce((sum, input) => sum + validAmount(document.querySelector(`#purchaseRows input.amount[data-index="${input.getAttribute("data-index")}"]`)?.value), 0);
      check.textContent = amountCheck(total, summary);
      check.hidden = !summary;
    };
    if (capture?.error) message.textContent = capture.error;
    else if (capture) {
      parsed = parser.parseCapture(capture);
      // 合計タブなら合計を出す。明細も読めた場合は両方を出す（隠れた行が混ざっても合計を送れるように）
      const summary = parser.parseSummary(capture);
      if (summary) {
        pendingSummary = { ...summary, capturedAt: capture.capturedAt || "" };
        saveSummary(storage, pendingSummary);
        document.getElementById("summaryText").textContent =
          `${Number(summary.date.slice(4, 6))}月${Number(summary.date.slice(6, 8))}日の照会の合計：購入 ${yen(summary.stakeYen)}・払戻 ${yen(summary.payoutYen)}` +
          `${summary.races !== null ? `（${summary.races}レース）` : ""}。送信すると、この日の負けと今月の予算をこの合計で判定します。一覧を取り込むと、入れた金額とも照合します。`;
        document.getElementById("summaryBox").hidden = false;
      }
      if (parsed.purchases.length || !summary) {
        renderCapture(document, parsed);
        document.getElementById("purchaseRows").addEventListener("input", updateCheck);
        document.getElementById("purchaseRows").addEventListener("change", updateCheck);
        updateCheck();
      }
    }

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
      // 同じ日の照会の合計を覚えていれば一緒に送る
      const stored = loadSummaries(storage)[parsed.listedDate];
      const dailySummaries = stored ? [summaryPayload(stored)] : [];
      const result = await callApi(fetchImpl, token(), { method: "POST", body: { purchases, ...(dailySummaries.length ? { dailySummaries } : {}) } });
      message.textContent = `${result.received}件を送信しました（新規 ${result.added}件）${result.receivedSummaries ? "。照会の合計も送りました" : ""}。`;
      renderStatus(document, summarizeGuardrails(result.guardrails, todayJst()));
    }));

    document.getElementById("sendSummaryButton").addEventListener("click", (event) => run(event.currentTarget, async () => {
      if (!pendingSummary) throw new Error("送信する合計がありません");
      const result = await callApi(fetchImpl, token(), { method: "POST", body: { dailySummaries: [summaryPayload(pendingSummary)] } });
      message.textContent = "照会の合計を送信しました。";
      renderStatus(document, summarizeGuardrails(result.guardrails, todayJst()));
    }));

    document.getElementById("statusButton").addEventListener("click", (event) => run(event.currentTarget, async () => {
      const today = todayJst();
      const result = await callApi(fetchImpl, token(), { query: `?date=${today}` });
      message.textContent = `今日の購入 ${result.count}件`;
      renderStatus(document, summarizeGuardrails(result.guardrails, today));
    }));

    document.getElementById("bulkAmountButton").addEventListener("click", () => {
      try {
        const filled = applyBulkAmount(document, document.getElementById("bulkAmountInput").value);
        updateCheck();
        message.textContent = `金額が空の${filled}件に入れました。違う金額の券は個別に直してください。`;
      } catch (error) { message.textContent = String(error?.message || error); }
    });

    document.getElementById("copyBookmarklet").addEventListener("click", async () => {
      const code = document.getElementById("bookmarkletCode");
      try { await root.navigator.clipboard.writeText(code.value); message.textContent = "コピーしました"; }
      catch { code.select(); message.textContent = "選択した文字をコピーしてください"; }
    });
  }

  return Object.freeze({ API_URL, TOKEN_KEY, SUMMARY_KEY, validAmount, loadToken, saveToken, loadSummaries, saveSummary, summaryPayload, amountCheck, readHashCapture, summarizeGuardrails, callApi, todayJst, install });
});
