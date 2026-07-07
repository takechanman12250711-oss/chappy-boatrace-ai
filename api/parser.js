/* =========================================================
   チャッピーボートレースAI
   api/parser.js 完全版
   役割：
   - 公式HTMLを解析
   - 出走表を6艇JSON化
   - 依存ライブラリなし
========================================================= */

export function stripHtml(html) {
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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function zenToHan(text) {
  return String(text || "").replace(/[０-９．]/g, (ch) => {
    const map = { "．": "." };
    return map[ch] || String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  });
}

export function cleanText(text) {
  return zenToHan(text)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toNumber(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function emptyEntry(boat) {
  return {
    boat,
    boatLabel: `${boat}号艇`,
    registerNo: "",
    className: "",
    racerName: "",
    branch: "",
    birthPlace: "",
    age: null,
    weight: null,
    fCount: null,
    lCount: null,
    avgSt: null,

    nationalWinRate: null,
    national2Rate: null,
    national3Rate: null,

    localWinRate: null,
    local2Rate: null,
    local3Rate: null,

    motorNo: null,
    motor2Rate: null,
    motor3Rate: null,

    boatNo: null,
    boat2Rate: null,
    boat3Rate: null,

    currentRace: {
      raw: "",
      courses: [],
      stList: [],
      results: []
    },

    rawFound: false,
    rawBlock: ""
  };
}

function getRaceBodyText(html) {
  const text = cleanText(stripHtml(html));

  const startKey = "枠 ボートレーサー 全国 当地 モーター ボート";
  const endKey = "今節成績";

  let body = text;

  const start = body.indexOf(startKey);
  if (start >= 0) body = body.slice(start + startKey.length);

  const end = body.indexOf("モーター・ボート変更時");
  if (end >= 0) body = body.slice(0, end);

  return cleanText(body);
}

function splitEntryBlocks(text) {
  const blocks = [];

  const starts = [];
  const re = /(?:^|\s)([1-6])\s+(\d{4})\s*\/\s*(A1|A2|B1|B2)\s+/g;

  let m;
  while ((m = re.exec(text)) !== null) {
    starts.push({
      boat: toNumber(m[1]),
      index: m.index + m[0].search(/[1-6]/)
    });
  }

  for (let i = 0; i < starts.length; i++) {
    const current = starts[i];
    const next = starts[i + 1];
    const block = text.slice(current.index, next ? next.index : text.length);

    blocks.push({
      boat: current.boat,
      text: cleanText(block)
    });
  }

  return blocks;
}

function parseCurrentRace(rawTail) {
  const text = cleanText(rawTail);

  const stList = [];
  const stRe = /\.(\d{2})/g;
  let stMatch;

  while ((stMatch = stRe.exec(text)) !== null) {
    stList.push(Number(`0.${stMatch[1]}`));
  }

  const results = [];
  const resultRe = /[１-６1-6転妨失欠ＦL]/g;
  let resultMatch;

  while ((resultMatch = resultRe.exec(text)) !== null) {
    const v = zenToHan(resultMatch[0]);
    if (/^[1-6]$/.test(v) || ["転", "妨", "失", "欠", "F", "L"].includes(v)) {
      results.push(v);
    }
  }

  return {
    raw: text,
    courses: [],
    stList,
    results
  };
}

function parseEntryBlock(block) {
  const text = cleanText(block.text);
  const entry = emptyEntry(block.boat);
  entry.rawBlock = text;

  const mainRe = new RegExp(
    "^" +
      "([1-6])\\s+" +
      "(\\d{4})\\s*\\/\\s*(A1|A2|B1|B2)\\s+" +
      "(.+?)\\s+" +
      "([^\\s\\/]+)\\/([^\\s\\/]+)\\s+" +
      "(\\d+)歳\\/([\\d.]+)kg\\s+" +
      "F(\\d+)\\s+L(\\d+)\\s+" +
      "([\\d.]+)\\s+" +
      "([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+" +
      "([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+" +
      "(\\d+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+" +
      "(\\d+)\\s+([\\d.]+)\\s+([\\d.]+)" +
      "(.*)$"
  );

  const m = text.match(mainRe);

  if (!m) {
    return entry;
  }

  entry.boat = toNumber(m[1]);
  entry.boatLabel = `${m[1]}号艇`;
  entry.registerNo = m[2];
  entry.className = m[3];
  entry.racerName = cleanText(m[4]).replace(/\s+/g, "");
  entry.branch = m[5];
  entry.birthPlace = m[6];
  entry.age = toNumber(m[7]);
  entry.weight = toNumber(m[8]);
  entry.fCount = toNumber(m[9]);
  entry.lCount = toNumber(m[10]);
  entry.avgSt = toNumber(m[11]);

  entry.nationalWinRate = toNumber(m[12]);
  entry.national2Rate = toNumber(m[13]);
  entry.national3Rate = toNumber(m[14]);

  entry.localWinRate = toNumber(m[15]);
  entry.local2Rate = toNumber(m[16]);
  entry.local3Rate = toNumber(m[17]);

  entry.motorNo = toNumber(m[18]);
  entry.motor2Rate = toNumber(m[19]);
  entry.motor3Rate = toNumber(m[20]);

  entry.boatNo = toNumber(m[21]);
  entry.boat2Rate = toNumber(m[22]);
  entry.boat3Rate = toNumber(m[23]);

  entry.currentRace = parseCurrentRace(m[24]);
  entry.rawFound = true;

  return entry;
}

export function parseEntriesFromOfficialHtml(html) {
  const bodyText = getRaceBodyText(html);
  const blocks = splitEntryBlocks(bodyText);

  const parsed = blocks.map(parseEntryBlock);

  const entries = [];

  for (let boat = 1; boat <= 6; boat++) {
    const found = parsed.find((entry) => entry.boat === boat);
    entries.push(found || emptyEntry(boat));
  }

  return entries;
}

export function parseRaceInfoFromOfficialHtml(html) {
  const text = cleanText(stripHtml(html));

  const titleMatch = text.match(/HOME .*? ([^ ]+?) 出走表/);
  const deadlineMatch = text.match(/締切予定時刻\s+((?:\d{1,2}:\d{2}\s*){1,12})/);

  return {
    title: titleMatch ? cleanText(titleMatch[1]) : "",
    deadlineText: deadlineMatch ? cleanText(deadlineMatch[1]) : "",
    rawText: text.slice(0, 5000)
  };
}

export function parseOfficialRaceHtml(entryHtml) {
  return {
    raceInfo: parseRaceInfoFromOfficialHtml(entryHtml),
    entries: parseEntriesFromOfficialHtml(entryHtml)
  };
}