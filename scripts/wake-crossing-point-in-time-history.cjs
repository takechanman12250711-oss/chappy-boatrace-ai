'use strict';
// 公式結果の原本から、各レース日の「前日まで3年間」だけを使って選手の実進入コース別決まり手を再構築する。
// 予想時に保存された racerSkillTheory がない過去レースを、結果の後付けなしで判定するための入力。
// build-race-stats.js の窓（最新日を含む1095日）と同じ幅を、レース前日を最新日として使う。
const fs = require('node:fs');
const path = require('node:path');

const THREE_YEAR_DAYS = 1095;
const DATE_FILE = /^\d{8}\.json$/;
const METHOD_CODES = ['', '逃げ', '差し', 'まくり', 'まくり差し', '抜き', '恵まれ'];
const METHOD_INDEX = new Map(METHOD_CODES.map((key, index) => [key, index]));

function dayNumber(yyyymmdd) {
  const s = String(yyyymmdd || '');
  if (!/^\d{8}$/.test(s)) return NaN;
  return Math.floor(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))) / 86400000);
}

// racer registerNo -> flat Int32Array-like rows [day, course, win, methodCode]
function buildIndex(resultsDir) {
  const byRacer = new Map();
  const seen = new Set();
  const coveredDays = new Set();
  const unavailableByDay = new Map();
  let races = 0;
  if (!fs.existsSync(resultsDir)) return { byRacer, races, firstDay: NaN, lastDay: NaN, coveredDays, unavailableByDay };
  let firstDay = NaN, lastDay = NaN;
  for (const name of fs.readdirSync(resultsDir).filter(n => DATE_FILE.test(n)).sort()) {
    // 壊れた日次ファイルを黙って飛ばすと3年履歴が過少になり判定が変わるため、読めなければ失敗させる。
    const filePath = path.join(resultsDir, name);
    let file;
    try { file = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (error) { throw new Error(`results file unreadable: ${filePath}: ${error.message}`); }
    if (file?.source !== 'boatrace-official') continue;
    const fileDay = dayNumber(String(file.date || name.slice(0, 8)).replace(/\D/g, ''));
    if (Number.isFinite(fileDay)) coveredDays.add(fileDay);
    for (const race of Array.isArray(file.races) ? file.races : []) {
      if (!race?.resultAvailable || race.source !== 'boatrace-official') {
        if (Number.isFinite(fileDay)) unavailableByDay.set(fileDay, (unavailableByDay.get(fileDay) || 0) + 1);
        continue;
      }
      const date = String(race.date || file.date || name.slice(0, 8)).replace(/\D/g, '');
      const id = `${date}-${race.jcd}-${race.raceNo}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const day = dayNumber(date);
      if (!Number.isFinite(day)) continue;
      races++;
      if (!(firstDay <= day)) firstDay = day;
      if (!(lastDay >= day)) lastDay = day;
      const courseByBoat = new Map((Array.isArray(race.starts) ? race.starts : [])
        .map(s => [Number(s?.boat), Number(s?.course)]));
      const method = METHOD_INDEX.get(String(race.winningMethod || '').replace(/\s+/g, '')) || 0;
      for (const finisher of Array.isArray(race.finishers) ? race.finishers : []) {
        const registerNo = String(finisher?.registerNo || '').trim();
        const course = courseByBoat.get(Number(finisher?.boat));
        if (!registerNo || !Number.isInteger(course) || course < 1 || course > 6) continue;
        const win = Number(finisher.rank) === 1 ? 1 : 0;
        let rows = byRacer.get(registerNo);
        if (!rows) byRacer.set(registerNo, rows = []);
        rows.push(day, course, win, win ? method : 0);
      }
    }
  }
  return { byRacer, races, firstDay, lastDay, coveredDays, unavailableByDay };
}

// Window: [raceDay - 1095, raceDay - 1]  (latest = previous day, inclusive 1095 days)
// options.gapFree: 窓内で結果ファイルが丸ごと欠けた日がある場合、最後の欠け日の翌日から始める。
function windowBounds(index, raceDate, options = {}) {
  const raceDay = dayNumber(raceDate);
  if (!Number.isFinite(raceDay)) return null;
  const end = raceDay - 1;
  let start = end - (THREE_YEAR_DAYS - 1);
  if (options.gapFree) {
    for (let day = end; day >= start; day--) {
      if (!index.coveredDays.has(day)) { start = day + 1; break; }
    }
  }
  return { start, end };
}
function windowCoverage(index, raceDate, options = {}) {
  const bounds = windowBounds(index, raceDate, options);
  if (!bounds) return null;
  let missingDays = 0, unavailableRaces = 0;
  for (let day = bounds.start; day <= bounds.end; day++) {
    if (!index.coveredDays.has(day)) missingDays++;
    unavailableRaces += index.unavailableByDay.get(day) || 0;
  }
  return { days: bounds.end - bounds.start + 1, missingDays, unavailableRaces };
}
function historyAsOf(index, registerNo, course, raceDate, options = {}) {
  const rows = index.byRacer.get(String(registerNo || '').trim());
  const bounds = windowBounds(index, raceDate, options);
  if (!rows || !bounds) return null;
  const { start, end } = bounds;
  let starts = 0, wins = 0;
  const counts = new Map();
  for (let i = 0; i < rows.length; i += 4) {
    const day = rows[i];
    if (day < start || day > end || rows[i + 1] !== course) continue;
    starts++;
    if (rows[i + 2]) {
      wins++;
      const key = METHOD_CODES[rows[i + 3]] || '不明';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return {
    starts,
    wins,
    winningMethods: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, count }))
  };
}

// 締切前保存の出走情報（preRaceConditions.boats）から判定用rolesを作る。
// 公式展示の進入（courseOfficial）がある場合だけその進入、なければ枠番をコースとする（ai-coreと同じ扱い）。
function pointInTimeRoles(index, record, raceDate, options = {}) {
  const prediction = record?.prediction || record || {};
  const conditions = prediction?.preRaceConditions || record?.preRaceConditions || {};
  const boats = Array.isArray(conditions.boats) ? conditions.boats : [];
  if (!boats.length) return { roles: null, mapping: 'boats-missing' };
  const formal = boats.length === 6 && boats.every(b => b?.courseOfficial === true && Number(b?.course) >= 1 && Number(b?.course) <= 6)
    && new Set(boats.map(b => Number(b.course))).size === 6 && new Set(boats.map(b => Number(b?.boatNo))).size === 6;
  const roles = boats.map(b => {
    const boatNo = Number(b?.boatNo);
    const course = formal ? Number(b.course) : boatNo;
    const history = b?.registerNo ? historyAsOf(index, b.registerNo, course, raceDate, options) : null;
    return { boatNo, course, courseHistory: history ? { all3Years: history } : null };
  });
  return { roles, mapping: formal ? 'official-exhibition-course' : 'boat-number' };
}

module.exports = { THREE_YEAR_DAYS, dayNumber, buildIndex, historyAsOf, pointInTimeRoles, windowBounds, windowCoverage };
