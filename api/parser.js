　/* =========================================================
   チャッピーボートレースAI
   api/_parser.js 完全版 v2
   - 出走表解析
   - 直前情報解析
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
    exhibition: {
      displayTime: null,
      tilt: null,
      weight: null,
      adjustedWeight: null,
      propeller: "",
      partsExchange: ""
    },
    rawFound: false,
    rawBlock: ""
  };
}

function getRaceBodyText(html) {
  const text = cleanText(stripHtml(html));
  const startKey = "枠 ボートレーサー 全国 当地 モーター ボート";

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
    blocks.push({
      boat: current.boat,
      text: cleanText(text.slice(current.index, next ? next.index : text.length))
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

  return {
    raw: text,
    courses: [],
    stList,
    results: []
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
  if (!m) return entry;

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
    entries.push(parsed.find((entry) => entry.boat === boat) || emptyEntry(boat));
  }

  return entries;
}

export function parseRaceInfoFromOfficialHtml(html) {
  const text = cleanText(stripHtml(html));
  const titleMatch = text.match(/本日のレース\s+(.+?)\s+出走表/);
  const deadlineMatch = text.match(/締切予定時刻\s+((?:\d{1,2}:\d{2}\s*){1,12})/);

  return {
    title: titleMatch ? cleanText(titleMatch[1]) : "",
    deadlineText: deadlineMatch ? cleanText(deadlineMatch[1]) : "",
    rawText: text.slice(0, 5000)
  };
}

/* =========================================================
   直前情報解析
========================================================= */

function getBeforeBodyText(html) {
  const text = cleanText(stripHtml(html));

  let body = text;

  const start = body.indexOf("枠 写真 ボートレーサー");
  if (start >= 0) body = body.slice(start);

  const end = body.indexOf("部品交換凡例");
  if (end >= 0) body = body.slice(0, end);

  return cleanText(body);
}

function splitBeforeBlocks(text) {
  const blocks = [];
  const starts = [];
  const re = /(?:^|\s)([1-6])\s+([一-龥ぁ-んァ-ヶー\s]{2,16})\s+R\s+進入\s+ST\s+着順/g;

  let m;
  while ((m = re.exec(text)) !== null) {
    starts.push({
      boat: toNumber(m[1]),
      racerName: cleanText(m[2]).replace(/\s+/g, ""),
      index: m.index + m[0].search(/[1-6]/)
    });
  }

  for (let i = 0; i < starts.length; i++) {
    const current = starts[i];
    const next = starts[i + 1];
    blocks.push({
      boat: current.boat,
      racerName: current.racerName,
      text: cleanText(text.slice(current.index, next ? next.index : text.length))
    });
  }

  return blocks;
}

function parseBeforeBlock(block) {
  const text = cleanText(block.text);

  const displayTimeMatch = text.match(/\s(6\.\d{2}|7\.\d{2})\s/);
  const tiltMatch = text.match(/\s(-?0\.5|-?1\.0|-?1\.5|-?2\.0|-?3\.0|0)\s/);
  const weightMatch = text.match(/(\d{2}\.\d)kg/);

  return {
    boat: block.boat,
    racerName: block.racerName,
    exhibition: {
      displayTime: displayTimeMatch ? toNumber(displayTimeMatch[1]) : null,
      tilt: tiltMatch ? toNumber(tiltMatch[1]) : null,
      weight: weightMatch ? toNumber(weightMatch[1]) : null,
      adjustedWeight: null,
      propeller: text.includes("新") ? "新" : "",
      partsExchange: ""
    },
    rawBlock: text
  };
}

function parseStartExhibition(html) {
  const text = cleanText(stripHtml(html));
  const start = text.indexOf("スタート展示");
  if (start < 0) return [];

  const section = text.slice(start, start + 600);
  const stList = [];
  const re = /([1-6])\s+([1-6])\s+\.(\d{2})/g;

  let m;
  while ((m = re.exec(section)) !== null) {
    stList.push({
      course: toNumber(m[1]),
      boat: toNumber(m[2]),
      st: Number(`0.${m[3]}`)
    });
  }

  return stList;
}

function parseWeatherFromBeforeHtml(html) {
  const text = cleanText(stripHtml(html));

  const weather = {
    temperature: null,
    windSpeed: null,
    waterTemperature: null,
    waveHeight: null,
    windDirection: ""
  };

  const tempMatch = text.match(/気温\s+([\d.]+)℃/);
  const windMatch = text.match(/風速\s+([\d.]+)m/);
  const waterMatch = text.match(/水温\s+([\d.]+)℃/);
  const waveMatch = text.match(/波高\s+([\d.]+)cm/);

  weather.temperature = tempMatch ? toNumber(tempMatch[1]) : null;
  weather.windSpeed = windMatch ? toNumber(windMatch[1]) : null;
  weather.waterTemperature = waterMatch ? toNumber(waterMatch[1]) : null;
  weather.waveHeight = waveMatch ? toNumber(waveMatch[1]) : null;

  return weather;
}

export function parseBeforeInfoFromOfficialHtml(html) {
  const bodyText = getBeforeBodyText(html);
  const blocks = splitBeforeBlocks(bodyText);
  const parsedBlocks = blocks.map(parseBeforeBlock);

  const beforeInfo = [];
  for (let boat = 1; boat <= 6; boat++) {
    const found = parsedBlocks.find((item) => item.boat === boat);
    beforeInfo.push(
      found || {
        boat,
        racerName: "",
        exhibition: {
          displayTime: null,
          tilt: null,
          weight: null,
          adjustedWeight: null,
          propeller: "",
          partsExchange: ""
        },
        rawBlock: ""
      }
    );
  }

  return {
    beforeInfo,
    startExhibition: parseStartExhibition(html),
    weather: parseWeatherFromBeforeHtml(html),
    rawText: cleanText(stripHtml(html)).slice(0, 5000)
  };
}

export function mergeEntriesWithBeforeInfo(entries, beforeParsed) {
  return entries.map((entry) => {
    const before = beforeParsed.beforeInfo.find((item) => item.boat === entry.boat);

    return {
      ...entry,
      exhibition: before ? before.exhibition : entry.exhibition
    };
  });
}

export function parseOfficialRaceHtml(entryHtml, beforeHtml = "") {
  const raceInfo = parseRaceInfoFromOfficialHtml(entryHtml);
  const entries = parseEntriesFromOfficialHtml(entryHtml);
  const beforeParsed = beforeHtml
    ? parseBeforeInfoFromOfficialHtml(beforeHtml)
    : {
        beforeInfo: [],
        startExhibition: [],
        weather: {},
        rawText: ""
      };

  return {
    raceInfo,
    entries: mergeEntriesWithBeforeInfo(entries, beforeParsed),
    beforeInfo: beforeParsed.beforeInfo,
    startExhibition: beforeParsed.startExhibition,
    weather: beforeParsed.weather,
    rawBeforeText: beforeParsed.rawText
  };
}