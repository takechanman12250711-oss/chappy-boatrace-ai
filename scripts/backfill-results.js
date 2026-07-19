// scripts/backfill-results.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  spawnSync
} = require("node:child_process");

const MAX_DAYS_PER_RUN = 31;

function readArgument(name) {
  const prefix = `--${name}=`;

  const argument =
    process.argv.find(value =>
      value.startsWith(prefix)
    );

  return String(
    argument?.slice(prefix.length) ||
    process.env[
      `BACKFILL_${name.toUpperCase()}`
    ] ||
    ""
  )
    .replaceAll("-", "")
    .replaceAll("/", "")
    .trim();
}

function parseDateKey(
  value,
  label
) {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(
      `${label}はYYYYMMDD形式で指定してください：` +
      `${value || "未指定"}`
    );
  }

  const year =
    Number(value.slice(0, 4));

  const month =
    Number(value.slice(4, 6));

  const day =
    Number(value.slice(6, 8));

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(
      `${label}の日付が正しくありません：${value}`
    );
  }

  return date;
}

function formatDateKey(date) {
  return [
    date.getUTCFullYear(),

    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0"),

    String(
      date.getUTCDate()
    ).padStart(2, "0")
  ].join("");
}

function addDays(
  date,
  amount
) {
  const next =
    new Date(date.getTime());

  next.setUTCDate(
    next.getUTCDate() +
    amount
  );

  return next;
}

function createDateKeys(
  fromDate,
  toDate
) {
  const dates = [];

  for (
    let current =
      new Date(
        fromDate.getTime()
      );

    current <= toDate;

    current =
      addDays(current, 1)
  ) {
    dates.push(
      formatDateKey(current)
    );
  }

  return dates;
}

function isCollectedFile(
  filePath,
  date
) {
  if (
    !fs.existsSync(filePath)
  ) {
    return false;
  }

  try {
    const data =
      JSON.parse(
        fs.readFileSync(
          filePath,
          "utf8"
        )
      );

    return (
      data?.source ===
        "boatrace-official" &&
      String(
        data?.date || ""
      ) === date &&
      Number(
        data?.completedRaces || 0
      ) > 0
    );
  } catch (error) {
    console.warn(
      `既存ファイルを再取得します：${date} ` +
      `(${error?.message || error})`
    );

    return false;
  }
}

function runNodeScript(
  scriptPath,
  args = []
) {
  const result =
    spawnSync(
      process.execPath,
      [
        scriptPath,
        ...args
      ],
      {
        cwd:
          process.cwd(),

        env:
          process.env,

        stdio:
          "inherit"
      }
    );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${path.basename(
        scriptPath
      )}が終了コード` +
      `${result.status}で失敗しました`
    );
  }
}

async function main() {
  const fromText =
    readArgument("from");

  const toText =
    readArgument("to");

  const fromDate =
    parseDateKey(
      fromText,
      "開始日"
    );

  const toDate =
    parseDateKey(
      toText,
      "終了日"
    );

  if (fromDate > toDate) {
    throw new Error(
      "開始日は終了日以前にしてください：" +
      `${fromText} - ${toText}`
    );
  }

  const dates =
    createDateKeys(
      fromDate,
      toDate
    );

  if (
    dates.length >
    MAX_DAYS_PER_RUN
  ) {
    throw new Error(
      "1回に取得できるのは最大" +
      `${MAX_DAYS_PER_RUN}日です：` +
      `${dates.length}日`
    );
  }

  const collectScript =
    path.join(
      process.cwd(),
      "scripts",
      "collect-results.js"
    );

  const statsScript =
    path.join(
      process.cwd(),
      "scripts",
      "build-race-stats.js"
    );

  const resultsDirectory =
    path.join(
      process.cwd(),
      "data",
      "results"
    );

  let collected = 0;
  let skipped = 0;

  console.log(
    "過去結果バックフィル：" +
    `${fromText} - ${toText}` +
    `（${dates.length}日）`
  );

  for (
    const [
      index,
      date
    ] of dates.entries()
  ) {
    const outputPath =
      path.join(
        resultsDirectory,
        `${date}.json`
      );

    if (
      isCollectedFile(
        outputPath,
        date
      )
    ) {
      skipped += 1;

      console.log(
        `[${index + 1}/` +
        `${dates.length}] ` +
        `${date} ` +
        "取得済みのためスキップ"
      );

      continue;
    }

    console.log(
      `[${index + 1}/` +
      `${dates.length}] ` +
      `${date} 収集開始`
    );

    runNodeScript(
      collectScript,
      [`--date=${date}`]
    );

    collected += 1;
  }

  console.log(
    "公式結果の統計を再集計します"
  );

  runNodeScript(
    statsScript
  );

  console.log(
    "バックフィル完了：" +
    `新規${collected}日／` +
    `スキップ${skipped}日／` +
    `合計${dates.length}日`
  );
}

main().catch(error => {
  console.error(
    error?.message || error
  );

  process.exitCode = 1;
});