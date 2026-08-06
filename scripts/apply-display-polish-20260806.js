"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const renderPath = path.join(root, "js", "render.js");
let render = fs.readFileSync(renderPath, "utf8");

const newDescription =
  "展開を最優先に実戦向けへ厳選。通常は5～7点、独立して成立する展開がある場合のみ最大10点まで追加します。オッズだけでは削除しません。";

if (!render.includes(newDescription)) {
  render = render.replace(
    /展開とコースを優先し、基本5[～〜]7点で厳選。[\s\S]{0,300}?数字・オッズだけによる削除はしていません。/,
    newDescription
  );
}

const sixBoatMarker = "/* ensure all six boat evaluation tabs */";
if (!render.includes(sixBoatMarker)) {
  const oldRaceEntries = `    const raceEntries =
      prediction.race?.entries ||
      prediction.entries ||
      [];

    boatItems.forEach(item => {`;

  const newRaceEntries = `    const raceEntries =
      prediction.race?.entries ||
      prediction.entries ||
      [];

    ${sixBoatMarker}
    const existingBoatNos = new Set(
      boatItems
        .map(item => safeNum(item?.no, 0))
        .filter(no => no >= 1 && no <= 6)
    );

    if (Array.isArray(boatSheet.evaluations)) {
      boatSheet.evaluations
        .slice(0, 6)
        .forEach((item, index) => {
          const boatNo = safeNum(
            item?.no ?? item?.boatNo ?? item?.waku ?? item?.course,
            index + 1
          );
          if (existingBoatNos.has(boatNo)) return;

          const normalized = normalizeSheetItem(
            item,
            item?.role || "osa"
          );
          if (!normalized) return;

          normalized.no = boatNo;
          boatItems.push(normalized);
          existingBoatNos.add(boatNo);
        });
    }

    raceEntries.slice(0, 6).forEach((entry, index) => {
      const boatNo = entryLaneNumber(entry, index);
      if (existingBoatNos.has(boatNo)) return;

      const normalized = normalizeSheetItem(
        { ...entry, no: boatNo },
        entry?.role || "osa"
      );
      if (!normalized) return;

      normalized.no = boatNo;
      normalized.name =
        normalized.name ||
        entry?.name ||
        entry?.racerName ||
        \`${'${boatNo}'}号艇\`;
      normalized.comment =
        normalized.comment ||
        "艇評価の詳細データはありません。出走表情報を表示しています。";
      boatItems.push(normalized);
      existingBoatNos.add(boatNo);
    });

    boatItems.forEach(item => {`;

  if (!render.includes(oldRaceEntries)) {
    throw new Error("raceEntries insertion point not found");
  }
  render = render.replace(oldRaceEntries, newRaceEntries);
}

render = render.replace(
  /const RENDER_VERSION = "[^"]+";/,
  'const RENDER_VERSION = "render-ui-v3.7.0-display-polish";'
);

if (!render.includes(newDescription)) {
  throw new Error("practical selection description was not updated");
}
if (!render.includes(sixBoatMarker)) {
  throw new Error("six boat tab marker was not inserted");
}

fs.writeFileSync(renderPath, render);
console.log("display polish applied");
