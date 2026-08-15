"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  execFileSync,
  spawnSync
} = require("node:child_process");
const archiveApi = require(
  "./daily-prediction-source-archive"
);

function git(
  rootDirectory,
  args,
  options = {}
) {
  return execFileSync(
    "git",
    args,
    {
      cwd: rootDirectory,
      encoding: "utf8",
      stdio:
        options.stdio ||
        ["ignore", "pipe", "pipe"]
    }
  );
}

function isTracked(
  rootDirectory,
  relativePath
) {
  const result = spawnSync(
    "git",
    [
      "ls-files",
      "--error-unmatch",
      "--",
      relativePath
    ],
    {
      cwd: rootDirectory,
      encoding: "utf8",
      stdio: "ignore"
    }
  );
  return result.status === 0;
}

function relativeGitPath(
  rootDirectory,
  absolutePath
) {
  return path.relative(
    rootDirectory,
    absolutePath
  ).split(path.sep).join("/");
}

function rawSaveLimitFromEnv(
  env = process.env
) {
  const configured = Number(
    env
      .DAILY_PREDICTION_RAW_SAVE_LIMIT_BYTES ||
    archiveApi
      .DEFAULT_RAW_SAVE_LIMIT_BYTES
  );
  if (
    !Number.isInteger(configured) ||
    configured < 1 ||
    configured >=
      archiveApi.GIT_BLOB_LIMIT_BYTES
  ) {
    throw new Error(
      "日次予想原本のGit保存上限が不正です"
    );
  }
  return configured;
}

function preparePredictionGitSave({
  rootDirectory = process.cwd(),
  all = false,
  date = "",
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date(),
  rawSaveLimitBytes =
    rawSaveLimitFromEnv(env)
} = {}) {
  const dates = all
    ? archiveApi.predictionSourceDates(
        rootDirectory
      )
    : [
        date ||
        archiveApi.resolveTargetDate({
          argv,
          env,
          now
        })
      ];
  const archiveResults = dates.map(
    targetDate =>
      archiveApi.archivePredictionSource({
        rootDirectory,
        date: targetDate,
        rawSaveLimitBytes
      })
  );

  git(
    rootDirectory,
    [
      "add",
      "--",
      "data/predictions",
      ":(exclude)data/predictions/index.json"
    ]
  );

  archiveResults
    .filter(result =>
      result.status === "archived"
    )
    .forEach(result => {
      const rawPath = relativeGitPath(
        rootDirectory,
        result.sourcePath
      );
      git(
        rootDirectory,
        ["reset", "--", rawPath]
      );

      if (
        isTracked(
          rootDirectory,
          rawPath
        )
      ) {
        git(
          rootDirectory,
          [
            "restore",
            "--worktree",
            "--",
            rawPath
          ]
        );
      } else if (
        fs.existsSync(result.sourcePath)
      ) {
        fs.unlinkSync(result.sourcePath);
      }
    });

  return {
    dates,
    archiveResults,
    archivedCount:
      archiveResults.filter(result =>
        result.status === "archived"
      ).length,
    rawGitSafeCount:
      archiveResults.filter(result =>
        result.status === "raw-git-safe"
      ).length,
    missingCount:
      archiveResults.filter(result =>
        result.status === "source-missing"
      ).length
  };
}

function main() {
  const all = archiveApi.hasFlag("all");
  const result = preparePredictionGitSave({
    all
  });

  result.archiveResults.forEach(item => {
    if (item.status === "archived") {
      console.log(
        `日次予想原本を圧縮保存：${item.date}・` +
        `${item.sourceBytes} → ${item.archiveBytes} bytes` +
        "（生JSONはGit commit対象外）"
      );
      return;
    }
    if (item.status === "raw-git-safe") {
      console.log(
        `日次予想原本を通常保存：${item.date}・` +
        `${item.sourceBytes} bytes`
      );
      return;
    }
    console.log(
      `日次予想原本なし：${item.date}`
    );
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  git,
  isTracked,
  relativeGitPath,
  rawSaveLimitFromEnv,
  preparePredictionGitSave,
  main
};
