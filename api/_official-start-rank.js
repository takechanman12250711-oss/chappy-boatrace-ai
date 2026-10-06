"use strict";

const { createHash } = require("node:crypto");
const SOURCE = "boatrace-official-course";
const VERSION = "official-course-start-rank-v1";
const TIMEOUT_MS = 3000;
const CACHE_MS = 6 * 60 * 60 * 1000;
const FAILURE_CACHE_MS = 60 * 1000;
const cache = new Map();
const pending = new Map();
const strip = value => String(value || "").replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
const jstDate = value => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date(value)).replaceAll("-", "");

function unavailable(registerNo, status) {
  return { version: VERSION, source: SOURCE, registerNo, status, byCourse: null };
}

function parseOfficialStartRank(html, { registerNo, fetchedAt }) {
  const source = String(html || "");
  const identity = source.match(/<dt\b[^>]*>\s*登録番号\s*<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/i);
  if (!identity || strip(identity[1]) !== registerNo) return unavailable(registerNo, "identity-mismatch");
  const tables = [...source.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map(match => match[0]).filter(table => /<th\b[^>]*>\s*コース別スタート順\s*<\/th>/i.test(table));
  if (tables.length !== 1) return unavailable(registerNo, "table-unavailable");
  const byCourse = {};
  for (const match of tables[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const th = match[1].match(/<th\b[^>]*>([\s\S]*?)<\/th>/i);
    const td = match[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i);
    if (!td) continue;
    const course = th && strip(th[1]);
    const value = strip(td[1]);
    if (!/^[1-6]$/.test(course || "") || Object.hasOwn(byCourse, course)) return unavailable(registerNo, "invalid-table");
    // The official no-data cell repeats its dash in the graph and value spans.
    if (/^-(?:\s+-)?$/.test(value)) byCourse[course] = null;
    else if (/^[1-6]\.\d{2}$/.test(value) && Number(value) <= 6) byCourse[course] = Number(value);
    else return unavailable(registerNo, "invalid-table");
  }
  if (Object.keys(byCourse).length !== 6) return unavailable(registerNo, "incomplete-table");
  return {
    version: VERSION, source: SOURCE, registerNo, status: "available", byCourse,
    sourceUrl: `https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=${registerNo}`,
    sourceSha256: createHash("sha256").update(source).digest("hex"), fetchedAt,
    // The official course page does not state a general-race filter, dates or rank sample sizes.
    population: "general-only-unconfirmed", period: null, sampleCount: null,
    referenceOnly: true
  };
}

async function fetchProfile(registerNo, { fetcher, now, timeoutMs }) {
  const key = `${jstDate(now)}:${registerNo}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const controller = new AbortController();
    let timer;
    let value;
    try {
      // Bound both headers and body. Promise.race also covers fetch implementations ignoring abort.
      value = await Promise.race([
        (async () => {
          const response = await fetcher(`https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=${registerNo}`, {
            headers: { "user-agent": "Mozilla/5.0 ChappyBoatRaceAI/1.0" }, signal: controller.signal
          });
          if (!response.ok) return unavailable(registerNo, "fetch-failed");
          return parseOfficialStartRank(await response.text(), { registerNo, fetchedAt: new Date(now).toISOString() });
        })(),
        new Promise(resolve => { timer = setTimeout(() => {
          controller.abort(); resolve(unavailable(registerNo, "timeout"));
        }, timeoutMs); })
      ]);
    } catch (_) {
      value = unavailable(registerNo, "fetch-failed");
    } finally {
      clearTimeout(timer);
    }
    cache.delete(key);
    cache.set(key, { value, expiresAt: now + (value.status === "available" ? CACHE_MS : FAILURE_CACHE_MS) });
    while (cache.size > 256) cache.delete(cache.keys().next().value);
    return value;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

async function attachOfficialStartRanks(parsed, { date, fetcher = global.fetch, now = Date.now(), timeoutMs = TIMEOUT_MS } = {}) {
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const starts = Array.isArray(parsed?.startExhibition) ? parsed.startExhibition : [];
  // A current, undated profile must never be used to fill historical race inputs.
  const status = String(date) !== jstDate(now) ? "race-date-not-current"
    : entries.length !== 6 || !entries.every(row => Number(row.exhibition?.displayTime) >= 6 && Number(row.exhibition?.displayTime) <= 8)
      || starts.length !== 6 || starts.some(row => row.isOfficialCourse !== true
        || !Number.isInteger(row.boat) || row.boat < 1 || row.boat > 6
        || !Number.isInteger(row.course) || row.course < 1 || row.course > 6)
      || new Set(starts.map(row => row.boat)).size !== 6 || new Set(starts.map(row => row.course)).size !== 6
      ? "awaiting-official-exhibition" : "eligible";
  if (status !== "eligible") return { ...parsed, officialStartRankCollection: { version: VERSION, status, available: 0 } };
  const ids = [...new Set(entries.map(row => String(row.registerNo || "")))];
  if (ids.length !== 6 || ids.some(id => !/^\d{4}$/.test(id))) {
    return { ...parsed, officialStartRankCollection: { version: VERSION, status: "invalid-racer-identities", available: 0 } };
  }
  const profiles = await Promise.all(ids.map(registerNo => fetchProfile(registerNo, { fetcher, now, timeoutMs })));
  const byId = new Map(profiles.map(profile => [profile.registerNo, profile]));
  return {
    ...parsed,
    entries: entries.map(entry => ({ ...entry, officialStartRank: JSON.parse(JSON.stringify(byId.get(String(entry.registerNo)))) })),
    officialStartRankCollection: {
      version: VERSION, status: profiles.every(profile => profile.status === "available") ? "available" : "partial-or-unavailable",
      available: profiles.filter(profile => profile.status === "available").length,
      referenceOnly: true
    }
  };
}

module.exports = { SOURCE, VERSION, parseOfficialStartRank, attachOfficialStartRanks };
