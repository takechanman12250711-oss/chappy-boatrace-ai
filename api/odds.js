// api/odds.js v2
// 公式3連単オッズ取得API
// 例: /api/odds?jcd=19&rno=7&date=20260624

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { jcd, date, debug } = req.query;
  const rno = String(req.query.rno || "").replace("R", "");

  if (!jcd || !rno || !date) {
    return res.status(400).json({
      ok: false,
      error: "jcd, rno, date が必要です"
    });
  }

  const url =
    `https://www.boatrace.jp/owpc/pc/race/odds3t` +
    `?rno=${rno}&jcd=${jcd}&hd=${date}`;

  try {
    const html = await fetchHtml(url);
const text = cleanText(html);

console.log(text.substring(0,5000));

const start =
  text.indexOf("3連単オッズ") > -1
    ? text.indexOf("3連単オッズ")
    : 0;

const target = text.substring(start);

const odds = parseOddsFromHtml(html);
const numbers = extractNumberStream(target);

    return res.status(200).json({
      ok: true,
      source: "boatrace.jp",
      jcd,
      rno,
      date,
      count: odds.length,
      odds,
      url,
      debug: debug === "1"
        ? {
           targetSample: target.slice(0, 3000),
numbersSample: extractNumberStream(target).slice(0, 300)
          }
        : null
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
      url
    });
  }
};

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      "Accept-Language": "ja-JP,ja;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": "https://www.boatrace.jp/"
    }
  });

  if (!res.ok) {
    throw new Error(`公式オッズ取得失敗: ${res.status}`);
  }

  return await res.text();
}

function parseOddsFromHtml(html) {
  const odds = [];

  // 公式ページの中にある data-* や表示HTMLから拾う
  // まず「1-2-3 12.3」型
  const text = cleanText(html);

  const hyphenPattern =
    /\b([1-6])[-－]([1-6])[-－]([1-6])\s+(\d+(?:\.\d+)?)\b/g;

  let m;
  while ((m = hyphenPattern.exec(text)) !== null) {
    addOdds(odds, m[1], m[2], m[3], m[4]);
  }

  // 次に公式PC表の並びから復元
  // 3連単表は「1頭」「2頭」…の6ブロックに分かれ、
  // 各ブロック内に相手・3着・オッズが縦に並ぶ。
  const tableText = extractOddsAreaText(html);
  const tokens = tokenize(tableText);

  const rebuilt = rebuildFromOfficialTokens(tokens);
  for (const item of rebuilt) {
    addOdds(odds, item.first, item.second, item.third, item.odds);
  }

  return uniqueOdds(odds).sort((a, b) => a.odds - b.odds);
}

function extractOddsAreaText(html) {
  let s = String(html || "");

  // odds3tページのメイン部分だけなるべく切る
  const startKeys = [
    "3連単オッズ",
    "oddsTable",
    "table1",
    "is-p3-0"
  ];

  let start = -1;
  for (const key of startKeys) {
    start = s.indexOf(key);
    if (start >= 0) break;
  }

  if (start >= 0) s = s.slice(start);

  const endKeys = [
    "締切時オッズ",
    "レース開始後",
    "ボートレースガイドはこちら",
    "PAGE TOP"
  ];

  let end = -1;
  for (const key of endKeys) {
    end = s.indexOf(key);
    if (end >= 0) break;
  }

  if (end > 0) s = s.slice(0, end);

  return cleanText(s);
}

function rebuildFromOfficialTokens(tokens) {
  const result = [];

  for (let first = 1; first <= 6; first++) {
    const start = findHeadBlock(tokens, first);
    if (start < 0) continue;

    const nextStarts = [];
    for (let f = first + 1; f <= 6; f++) {
      const idx = findHeadBlock(tokens, f, start + 1);
      if (idx >= 0) nextStarts.push(idx);
    }

    const end = nextStarts.length ? Math.min(...nextStarts) : tokens.length;
    const block = tokens.slice(start + 1, end);

    const parsed = parseHeadBlock(first, block);
    result.push(...parsed);
  }

  return result;
}

function findHeadBlock(tokens, first, from = 0) {
  for (let i = from; i < tokens.length; i++) {
    if (tokens[i] === String(first)) {
      const around = tokens.slice(i, i + 8).join(" ");
      if (around.includes("号") || around.includes("選手") || isLikelyHeadStart(tokens, i)) {
        return i;
      }
    }
  }
  return -1;
}

function isLikelyHeadStart(tokens, i) {
  // 頭ブロック直後は相手艇番号とオッズが連続しやすい
  let nums = 0;
  for (let k = i + 1; k < Math.min(tokens.length, i + 20); k++) {
    if (/^[1-6]$/.test(tokens[k]) || /^\d+\.\d+$/.test(tokens[k]) || /^\d+$/.test(tokens[k])) nums++;
  }
  return nums >= 10;
}

function parseHeadBlock(first, block) {
  const result = [];

  // 公式PC表の見た目は各1着艇ごとに
  // 2着艇 -> 3着艇 -> オッズ の並びが続く。
  let currentSecond = null;

  for (let i = 0; i < block.length - 1; i++) {
    const t = block[i];

    if (/^[1-6]$/.test(t) && Number(t) !== first) {
      const next = block[i + 1];

      // 次が1-6なら「2着艇」の見出しっぽい
      if (/^[1-6]$/.test(next) && Number(next) !== first && Number(next) !== Number(t)) {
        currentSecond = Number(t);
        continue;
      }

      // 次がオッズなら currentSecond - t - odds と見る
      if (currentSecond && isOdds(next)) {
        const third = Number(t);
        if (third !== first && third !== currentSecond) {
          result.push({
            first,
            second: currentSecond,
            third,
            odds: Number(next)
          });
        }
      }
    }
  }

  return result;
}

function tokenize(text) {
  return String(text || "")
    .replace(/[^\d.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function extractNumberStream(text) {
  return String(text || "").match(/\d+(?:\.\d+)?/g) || [];
}

function isOdds(v) {
  if (!/^\d+(?:\.\d+)?$/.test(String(v))) return false;
  const n = Number(v);
  return n >= 1.0 && n <= 9999.9;
}

function addOdds(list, first, second, third, oddsValue) {
  const a = Number(first);
  const b = Number(second);
  const c = Number(third);
  const odds = Number(oddsValue);

  if (![a, b, c].every(x => x >= 1 && x <= 6)) return;
  if (a === b || a === c || b === c) return;
  if (!Number.isFinite(odds) || odds <= 0) return;

  list.push({
    key: `${a}-${b}-${c}`,
    first: a,
    second: b,
    third: c,
    odds
  });
}

function uniqueOdds(list) {
  const map = new Map();

  for (const item of list) {
    if (!map.has(item.key)) {
      map.set(item.key, item);
    }
  }

  return [...map.values()];
}

function cleanText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/tr>/gi, " ")
    .replace(/<\/td>/gi, " ")
    .replace(/<\/th>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
