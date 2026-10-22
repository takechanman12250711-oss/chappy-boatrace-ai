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

function datesFromPaths(paths) {
  return [
    ...new Set(
      (Array.isArray(paths) ? paths : [])
        .map(value =>
          String(value || "")
            .trim()
            .replaceAll("\\", "/")
        )
        .map(value => {
          const match = value.match(
            /^data\/predictions\/(\d{8})\.json$/
          );
          return match?.[1] || "";
        })
        .filter(Boolean)
    )
  ].sort();
}

function outputLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function modifiedPredictionSourceDates(
  rootDirectory = process.cwd()
) {
  const paths = [
    ...outputLines(
      git(
        rootDirectory,
        [
          "diff",
          "--name-only",
          "--",
          "data/predictions"
        ]
      )
    ),
    ...outputLines(
      git(
        rootDirectory,
        [
          "diff",
          "--cached",
          "--name-only",
          "--",
          "data/predictions"
        ]
      )
    ),
    ...outputLines(
      git(
        rootDirectory,
        [
          "ls-files",
          "--others",
          "--exclude-standard",
          "--",
          "data/predictions"
        ]
      )
    )
  ];
  return datesFromPaths(paths);
}

function cleanupRestoredPredictionSources({
  rootDirectory = process.cwd(),
  all = false,
  date = "",
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date()
} = {}) {
  const dates = all
    ? archiveApi.archivedSourceDates(
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

  const cleanupResults = dates.map(
    targetDate => {
      const sourcePath =
        archiveApi.sourcePathFor(
          rootDirectory,
          targetDate
        );
      if (!fs.existsSync(sourcePath)) {
        return {
          date: targetDate,
          status: "source-missing"
        };
      }

      const archivePath =
        archiveApi.archivePathFor(
          rootDirectory,
          targetDate
        );
      const metadataPath =
        archiveApi.metadataPathFor(
          rootDirectory,
          targetDate
        );
      if (
        !fs.existsSync(archivePath) ||
        !fs.existsSync(metadataPath)
      ) {
        throw new Error(
          `復元済み原本のarchiveが不足しています：${targetDate}`
        );
      }

      const metadata =
        archiveApi.validateMetadata(
          JSON.parse(
            fs.readFileSync(
              metadataPath,
              "utf8"
            )
          ),
          targetDate
        );
      if (
        fs.statSync(sourcePath).size !==
          Number(metadata.sourceBytes)
      ) {
        throw new Error(
          `復元後に日次予想原本の容量が変わりました：${targetDate}`
        );
      }

      const rawPath = relativeGitPath(
        rootDirectory,
        sourcePath
      );
      if (isTracked(rootDirectory, rawPath)) {
        git(
          rootDirectory,
          [
            "restore",
            "--worktree",
            "--",
            rawPath
          ]
        );
        return {
          date: targetDate,
          status: "tracked-restored"
        };
      }

      fs.unlinkSync(sourcePath);
      return {
        date: targetDate,
        status: "untracked-removed"
      };
    }
  );

  return {
    dates,
    cleanupResults,
    cleanedCount:
      cleanupResults.filter(result =>
        result.status !== "source-missing"
      ).length
  };
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
    ? modifiedPredictionSourceDates(
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
  const archivedResults = archiveResults.filter(
    result => result.status === "archived"
  );
  // Only validated archives replace their expanded raw JSON. Do not create
  // temporary raw Git blobs that the reset below would immediately unstage.
  const archivedRawPaths = archivedResults.map(
    result => relativeGitPath(
      rootDirectory,
      result.sourcePath
    )
  );

  git(
    rootDirectory,
    [
      "add",
      "--",
      "data/predictions",
      ":(exclude)data/predictions/index.json",
      ":(exclude)data/predictions/.*",
      ...archivedRawPaths.map(rawPath =>
        `:(exclude)${rawPath}`
      )
    ]
  );

  archivedResults
    .forEach(result => {
      const rawPath = relativeGitPath(
        rootDirectory,
        result.sourcePath
      );
      git(
        rootDirectory,
        ["reset", "--no-refresh", "--", rawPath]
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
  if (
    archiveApi.hasFlag(
      "cleanup-restored"
    )
  ) {
    const result =
      cleanupRestoredPredictionSources({
        all
      });
    console.log(
      `復元済み日次予想原本を片付け：${result.cleanedCount}件`
    );
    return;
  }
  const result = preparePredictionGitSave({
    all
  });

  if (!result.archiveResults.length) {
    console.log(
      "変更された日次予想原本はありません"
    );
    return;
  }

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
  datesFromPaths,
  outputLines,
  modifiedPredictionSourceDates,
  cleanupRestoredPredictionSources,
  preparePredictionGitSave,
  main
};
