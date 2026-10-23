(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyTeleboatHistory = api;
})(typeof window === "undefined" ? null : window, function () {
  "use strict";

  // テレボートの投票履歴（照会）画面から、1タップのブックマークで読み取った表を購入明細に変換する。
  // 画面の作りが変わってもブックマークを登録し直さずに直せるよう、読み取り後の解釈はすべてここで行う。
  // 読み取れなかった行は推測で埋めず、理由付きで skipped に残して画面で確認してもらう。

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
    return [...text.matchAll(/(\d[\d,]*)\s*円/g)]
      .map((match) => Number(match[1].replace(/,/g, "")))
      .filter((amount) => Number.isSafeInteger(amount) && amount > 0 && amount % 100 === 0);
  }

  function parseRow(cells, fallbackDate) {
    const text = normalize((Array.isArray(cells) ? cells : [cells]).join(" "));
    const tickets = findTickets(text);
    if (!tickets.length) return null; // 見出しや合計など、買い目のない行は対象外
    if (OTHER_BET_TYPES.test(text) && !/3連単/.test(text)) return { skip: "not-trifecta", text };
    const jcd = findVenue(text), raceNo = findRace(text);
    if (!jcd) return { skip: "venue-missing", text };
    if (!raceNo) return { skip: "race-missing", text };
    const amounts = findAmounts(text);
    if (!amounts.length) return { skip: "amount-missing", text };
    if (tickets.length > 1) return { skip: "multiple-tickets", text };
    const date = findDate(text) || fallbackDate;
    if (!date) return { skip: "date-missing", text };
    return { purchase: { date, jcd, raceNo, ticket: tickets[0], amount: amounts[0], dateAssumed: !findDate(text) }, text };
  }

  const SKIP_LABELS = Object.freeze({
    "not-trifecta": "3連単以外の券",
    "venue-missing": "場名が読めない",
    "race-missing": "レース番号が読めない",
    "amount-missing": "金額が読めない",
    "multiple-tickets": "1行に複数の買い目（フォーメーション等）",
    "date-missing": "日付が読めない"
  });

  // capture: ブックマークが渡す { v, capturedAt, host, rows: [[セル...]...], text }
  function parseCapture(capture = {}) {
    const fallbackDate = jstDate(capture.capturedAt);
    const rows = Array.isArray(capture.rows) && capture.rows.length
      ? capture.rows
      : String(capture.text || "").split(/\n+/).map((line) => [line]);
    const purchases = [], skipped = [];
    const seen = new Map();
    rows.slice(0, MAX_ROWS).forEach((cells, rowIndex) => {
      const parsed = parseRow(cells, fallbackDate);
      if (!parsed) return;
      if (parsed.skip) { skipped.push({ rowIndex, reason: parsed.skip, label: SKIP_LABELS[parsed.skip], text: parsed.text.slice(0, 160) }); return; }
      const p = parsed.purchase;
      // 同じ画面を取り込み直しても重複しないよう、同じ内容の何件目かまで含めた安定したIDにする
      const base = `${p.date}-${p.jcd}-${p.raceNo}-${p.ticket}-${p.amount}`;
      const occurrence = (seen.get(base) || 0) + 1;
      seen.set(base, occurrence);
      purchases.push({ ...p, rowIndex, contractId: `tb-${base}-${occurrence}`, source: "teleboat-bookmarklet" });
    });
    return { purchases, skipped, fallbackDate, host: String(capture.host || "") };
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

  // テレボートの画面で実行するブックマーク。表のセル文字だけを集め、取り込みページを開く。
  // 送信は取り込みページで確認してから行う（このコードは何も送信しない）。
  function bookmarkletSource(importPage = IMPORT_PAGE) {
    const body = `(()=>{const docs=[document];for(const f of Array.from(window.frames)){try{if(f.document)docs.push(f.document)}catch(e){}}` +
      `const rows=[];for(const d of docs){for(const tr of Array.from(d.querySelectorAll('tr'))){const c=Array.from(tr.cells).map(x=>(x.innerText||x.textContent||'').trim());if(c.some(Boolean))rows.push(c)}}` +
      `const data={v:1,capturedAt:new Date().toISOString(),host:location.host,rows:rows.slice(0,${MAX_ROWS}),text:rows.length?'':(document.body.innerText||'').slice(0,${MAX_TEXT})};` +
      `const b=btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');` +
      `window.open(${JSON.stringify(importPage)}+'#d='+b,'_blank')})();`;
    return `javascript:${body}`;
  }

  return Object.freeze({ IMPORT_PAGE, VENUES, SKIP_LABELS, normalize, findVenue, findRace, findDate, jstDate, findTickets, findAmounts, parseRow, parseCapture, encodeCapture, decodeCapture, bookmarkletSource });
});
