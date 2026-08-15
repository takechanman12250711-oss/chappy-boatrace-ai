"use strict";

const archiveApi = require(
  "./daily-prediction-source-archive"
);

function restorePredictionSources({
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

  return dates.map(targetDate =>
    archiveApi.restorePredictionSource({
      rootDirectory,
      date: targetDate
    })
  );
}

function main() {
  const all = archiveApi.hasFlag("all");
  const results = restorePredictionSources({
    all
  });

  if (!results.length) {
    console.log(
      "復元対象の日次予想原本archiveはありません"
    );
    return;
  }

  results.forEach(result => {
    if (result.status === "restored") {
      console.log(
        `日次予想原本を復元：${result.date}・` +
        `${result.archiveBytes} → ${result.sourceBytes} bytes`
      );
      return;
    }
    console.log(
      `日次予想原本archiveなし：${result.date}`
    );
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  restorePredictionSources,
  main
};
