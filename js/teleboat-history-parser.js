(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyTeleboatHistory = api;
})(typeof window === "undefined" ? null : window, function () {
  "use strict";

  // 投票履歴（BOAT RACE公式の投票照会など）の画面から、1タップのブックマークで読み取った表を購入明細に変換する。
  // 画面の作りが変わってもブックマークを登録し直さずに直せるよう、読み取り後の解釈はすべてここで行う。
  // 読み取れなかった行は推測で埋めず、理由付きで skipped に残して画面で確認してもらう。
  // 投票照会の一覧には金額がないため、金額が読めない明細は amount: null で返し、取り込みページで入力してもらう。
  const MAX_HEAD = 3000;

  const IMPORT_PAGE = "https://takechanman12250711-oss.github.io/chappy-boatrace-ai/purchase-import.html";
  const MAX_ROWS = 400;
  const MAX_TEXT = 20000;

  const VENUES = Object.freeze([
    ["桐生", "01"], ["戸田", "02"], ["江戸川", "03"], ["平和島", "04"], ["多摩川", "05"], ["浜名湖", "06"],
    ["蒲郡", "07"], ["常滑", "08"], ["津", "09"], ["三国", "10"], ["びわこ", "11"], ["琵琶湖", "11"],
    ["住之江", "12"], ["尼崎", "13"], ["鳴門", "14"], ["丸亀", "15"], ["児島", "16"], ["宮島", "17"],
    ["徳山", "18"], ["下関", "19"], ["若松", "20"], ["芦屋", "21"], ["福岡", "22"], ["唐津", "23"], ["大村", "24"]
  ]);
  // 「津」は1文字で他の語に含まれやすいので、長い名前から順に探し、津は単独の語のときだけ採る。
  const VENUE_ORDER = VENUES.slice().sort((a, b) => b[0].length - a[0].length);
  const OTHER_BET_TYPES = /(2連単|2連複|3連複|拡連複|ワイド|単勝|複勝|２連単|２連複|３連複)/;
  const TICKET = /([1-6])\s*[-－ー―‐−=＝]\s*([1-6])\s*[-－ー―‐−=＝]\s*([1-6])/g;

  function normalize(text) {
    return String(text ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  }

  function findVenue(text) {
    for (const [name, jcd] of VENUE_ORDER) {
      const index = text.indexOf(name);
      if (index < 0) continue;
      if (name === "津") {
        const before = text[index - 1] || " ", after = text[index + 1] || " ";
        if (/[\p{L}]/u.test(before) || /[\p{L}]/u.test(after)) continue;
      }
      return jcd;
    }
    return "";
  }

  function findRace(text) {
    const match = text.match(/(?:^|[^\d])(\d{1,2})\s*R(?![a-zA-Z])/);
    const raceNo = match ? Number(match[1]) : 0;
    return raceNo >= 1 && raceNo <= 12 ? raceNo : 0;
  }

  function findDate(text) {
    const match = text.match(/(20\d{2})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})/);
    if (!match) return "";
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
    return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
  }

  // 読み取った時刻の日本時間の日付（明細に日付がないときの既定値）
  function jstDate(iso) {
    const time = Date.parse(iso || "");
    if (!Number.isFinite(time)) return "";
    const jst = new Date(time + 9 * 3600 * 1000);
    return `${jst.getUTCFullYear()}${String(jst.getUTCMonth() + 1).padStart(2, "0")}${String(jst.getUTCDate()).padStart(2, "0")}`;
  }

  function findTickets(text) {
    const tickets = [];
    for (const match of text.matchAll(TICKET)) {
      const boats = [match[1], match[2], match[3]];
      if (new Set(boats).size !== 3) continue;
      const ticket = boats.join("-");
      if (!tickets.includes(ticket)) tickets.push(ticket);
    }
    return tickets;
  }

  function findAmounts(text) {
    return [...text.matchAll(/(?:[¥￥]\s*(\d[\d,]*)|(\d[\d,]*)\s*円)/g)]
      .map((match) => Number((match[1] || match[2]).replace(/,/g, "")))
      .filter((amount) => Number.isSafeInteger(amount) && amount > 0 && amount % 100 === 0);
  }

  // context: 1件が表の2行に分かれる画面（「場・レース」の行と「式別・組番」の行）で、前の行の場・レース
  function parseRow(cells, fallbackDate, context = "") {
    const own = normalize((Array.isArray(cells) ? cells : [cells]).join(" "));
    const tickets = findTickets(own);
    if (!tickets.length) return null; // 見出しや合計、場・レースだけの行は対象外
    const text = (!findVenue(own) || !findRace(own)) && context ? `${context} ${own}` : own;
    if (OTHER_BET_TYPES.test(text) && !/3連単/.test(text)) return { skip: "not-trifecta", text };
    const jcd = findVenue(text), raceNo = findRace(text);
    if (!jcd) return { skip: "venue-missing", text };
    if (!raceNo) return { skip: "race-missing", text };
    if (tickets.length > 1) return { skip: "multiple-tickets", text };
    const date = findDate(text) || fallbackDate;
    if (!date) return { skip: "date-missing", text };
    const amount = findAmounts(text)[0] || null;
    return { purchase: { date, jcd, raceNo, ticket: tickets[0], amount, dateAssumed: !findDate(text) }, text };
  }

  // 投票照会の各明細に付く通し番号（No 001〜）。行の先頭にある3桁の数字。
  function findSerial(text) {
    const match = String(text || "").match(/^(\d{3})(?=\s|$)/);
    return match ? match[1] : "";
  }

  // 投票照会の「合計」タブ（購入金額・払戻金額・レース数）。明細の金額を入れたときの照合に使う。
  function parseSummary(capture = {}) {
    const rows = Array.isArray(capture.rows) ? capture.rows.map((cells) => normalize([].concat(cells).join(" "))) : [];
    const valueOf = (pattern) => {
      const row = rows.find((text) => pattern.test(text));
      if (!row) return null;
      const yen = row.match(/[¥￥]\s*(\d[\d,]*)|(\d[\d,]*)\s*円/);
      if (yen) return Number((yen[1] || yen[2]).replace(/,/g, ""));
      const plain = row.match(/(\d[\d,]*)\s*$/);
      return plain ? Number(plain[1].replace(/,/g, "")) : null;
    };
    const stakeYen = valueOf(/購入金額/);
    const payoutYen = valueOf(/払戻金額/);
    if (stakeYen === null || payoutYen === null) return null;
    const date = pageDate(capture);
    if (!date) return null;
    return { date, stakeYen, payoutYen, races: valueOf(/^(?!.*的中).*レース数/), hitRaces: valueOf(/的中レース数/) };
  }

  // 画面上部の照会日（「2026年10月20日」や年・月・日の選択欄）。明細の行に日付がない画面で使う。
  function pageDate(capture = {}) {
    const fromHead = findDate(normalize(capture.head || ""));
    if (fromHead) return fromHead;
    const values = (Array.isArray(capture.selects) ? capture.selects : []).map((value) => normalize(value));
    for (let i = 0; i + 2 < values.length; i += 1) {
      const date = findDate(`${values[i]}/${values[i + 1]}/${values[i + 2]}`);
      if (date) return date;
    }
    return "";
  }

  const SKIP_LABELS = Object.freeze({
    "not-trifecta": "3連単以外の券",
    "venue-missing": "場名が読めない",
    "race-missing": "レース番号が読めない",
    "multiple-tickets": "1行に複数の買い目（フォーメーション等）",
    "date-missing": "日付が読めない"
  });

  // capture: ブックマークが渡す { v, capturedAt, host, rows: [[セル...]...], text }
  function parseCapture(capture = {}) {
    const listedDate = pageDate(capture);
    const fallbackDate = listedDate || jstDate(capture.capturedAt);
    const rows = Array.isArray(capture.rows) && capture.rows.length
      ? capture.rows
      : String(capture.text || "").split(/\n+/).map((line) => [line]);
    const purchases = [], skipped = [];
    const seen = new Map();
    let context = "";
    rows.slice(0, MAX_ROWS).forEach((cells, rowIndex) => {
      const own = normalize((Array.isArray(cells) ? cells : [cells]).join(" "));
      const parsed = parseRow(cells, fallbackDate, context);
      if (!parsed) {
        // 買い目のない行に場とレースがあれば、次の行（式別・組番）のために覚えておく
        if (findVenue(own) && findRace(own)) context = own;
        return;
      }
      if (parsed.skip) { skipped.push({ rowIndex, reason: parsed.skip, label: SKIP_LABELS[parsed.skip], text: parsed.text.slice(0, 160) }); return; }
      const p = parsed.purchase;
      if (p.dateAssumed && listedDate) p.dateAssumed = false;
      // 金額は後から入力・修正できるのでIDに含めない（金額を直して送り直すと同じ明細が更新される）。
      const base = `${p.date}-${p.jcd}-${p.raceNo}-${p.ticket}`;
      // 投票照会の通し番号（No）があれば使う。別の画面・絞り込みで取り込んでも、別の購入が同じIDにならない。
      const serial = findSerial(own) || (own !== parsed.text ? findSerial(context) : "");
      if (serial) {
        purchases.push({ ...p, rowIndex, serial, contractId: `tb-${base}-n${serial}`, source: "teleboat-bookmarklet" });
        return;
      }
      // 通し番号がない画面では、同じ画面の中で同じ内容の何件目かで区別する（画面をまたぐと区別できない）
      const occurrence = (seen.get(base) || 0) + 1;
      seen.set(base, occurrence);
      purchases.push({ ...p, rowIndex, serial: "", contractId: `tb-${base}-${occurrence}`, source: "teleboat-bookmarklet" });
    });
    // 詳細から読んだ金額を、通し番号（No）と組番が一致する明細に入れる
    const details = new Map((Array.isArray(capture.details) ? capture.details : []).map(parseDetail).filter((d) => d.no).map((d) => [d.no, d]));
    let detailAmounts = 0;
    for (const p of purchases) {
      const detail = p.serial ? details.get(p.serial) : null;
      if (!detail || p.amount) continue;
      if (detail.ticket === p.ticket && detail.amount) { p.amount = detail.amount; p.amountFromDetail = true; detailAmounts += 1; }
    }
    return { purchases, skipped, fallbackDate, listedDate, detailAmounts, detailCount: details.size, host: String(capture.host || "") };
  }

  function encodeCapture(capture) {
    const json = JSON.stringify(capture);
    const base64 = typeof Buffer !== "undefined" ? Buffer.from(json, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(json)));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeCapture(encoded) {
    const base64 = String(encoded || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = typeof Buffer !== "undefined" ? Buffer.from(padded, "base64").toString("utf8") : decodeURIComponent(escape(atob(padded)));
    return JSON.parse(json);
  }

  // 照会の画面で実行するブックマーク本体。表示中の表の行（隠れたタブの行は除く）のセル文字を集めたあと、各明細の No を順に押して
  // 詳細（金額）を読み、閉じる。最後に取り込みページを開く。このコードは何も送信しない。
  // ブックマークのアドレス欄は1行になるため、関数内には行コメントを書かず、文末は必ずセミコロンで閉じる。
  async function capturePage(importPage, limits) {
    const win = window.open("about:blank", "_blank");
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const text = (node) => String((node && (node.innerText || node.textContent || node.value)) || "").trim();
    const docs = [document];
    for (const frame of Array.from(window.frames)) { try { if (frame.document) docs.push(frame.document); } catch (e) { } }
    const all = (selector) => docs.flatMap((d) => Array.from(d.querySelectorAll(selector)));
    const visible = (node) => node.getClientRects().length > 0;
    const rows = [];
    for (const tr of all("tr")) { if (!visible(tr)) continue; const cells = Array.from(tr.cells).map(text); if (cells.some(Boolean)) rows.push(cells); }
    const body = text(document.body);
    const selects = all("select").map((select) => { const option = select.options[select.selectedIndex]; return option ? (option.text || option.value) : ""; });
    const seen = new Set();
    const buttons = all("a,button,input[type=button],[onclick]").filter((node) => {
      const no = text(node);
      const row = node.closest("tr");
      if (!/^\d{3}$/.test(no) || !row || !visible(row) || seen.has(no)) return false;
      seen.add(no);
      return true;
    }).slice(0, limits.rows);
    const findDetail = (no) => all("div,section,dialog,table,aside").filter((node) => {
      if (!visible(node)) return false;
      const value = text(node);
      return value.length < 1500 && value.includes("閉じる") && /[¥￥]/.test(value) && value.split(/\s+/).includes(no);
    }).sort((a, b) => text(a).length - text(b).length)[0] || null;
    const details = [];
    for (const button of buttons) {
      const no = text(button);
      button.click();
      let box = null;
      for (let i = 0; i < 20 && !box; i += 1) { await sleep(100); box = findDetail(no); }
      if (!box) { if (!details.length) break; continue; }
      details.push({ no, text: text(box).slice(0, 1000) });
      const close = Array.from(box.querySelectorAll("a,button,input,[onclick]")).find((node) => /閉じる|×|close/i.test(text(node) || node.getAttribute("aria-label") || ""));
      if (close) close.click(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(150);
    }
    const data = { v: 2, capturedAt: new Date().toISOString(), host: location.host, head: body.slice(0, limits.head), selects: selects.slice(0, 20), rows: rows.slice(0, limits.rows), details, text: rows.length ? "" : body.slice(0, limits.text) };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const url = importPage + "#d=" + encoded;
    if (win) win.location.href = url; else window.open(url, "_blank");
  }

  function bookmarkletSource(importPage = IMPORT_PAGE) {
    const source = capturePage.toString().replace(/\n\s*/g, " ");
    const limits = { rows: MAX_ROWS, head: MAX_HEAD, text: MAX_TEXT };
    return `javascript:(${source})(${JSON.stringify(importPage)},${JSON.stringify(limits)});void 0;`;
  }

  // 詳細（No を押すと出る小窓）の文字から、組番と金額を読む。金額は最初の「¥」（購入金額）を使う。
  function parseDetail(detail = {}) {
    const value = normalize(detail.text);
    const ticket = findTickets(value)[0] || "";
    const amount = findAmounts(value)[0] || null;
    return { no: String(detail.no || ""), ticket, amount };
  }

  return Object.freeze({ IMPORT_PAGE, VENUES, SKIP_LABELS, normalize, findVenue, findRace, findDate, jstDate, findTickets, findAmounts, findSerial, parseRow, pageDate, parseSummary, parseDetail, parseCapture, encodeCapture, decodeCapture, capturePage, bookmarkletSource });
});
