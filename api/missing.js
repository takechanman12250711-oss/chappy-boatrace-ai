"use strict";

const raceStats = require(
  "../data/stats/trifecta-by-venue-race.json"
);

const MIN_SAMPLES = 30;

function normalizeJcd(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > 24
  ) {
    return "";
  }

  return String(number).padStart(2, "0");
}

function normalizeRaceNo(value) {
  const number = Number(value);

  return Number.isInteger(number) &&
    number >= 1 &&
    number <= 12
      ? number
      : 0;
}

function createAllTrifectas() {
  const tickets = [];

  for (let first = 1; first <= 6; first += 1) {
    for (let second = 1; second <= 6; second += 1) {
      for (let third = 1; third <= 6; third += 1) {
        if (
          new Set([
            first,
            second,
            third
          ]).size !== 3
        ) {
          continue;
        }

        tickets.push(
          `${first}-${second}-${third}`
        );
      }
    }
  }

  return tickets;
}

const ALL_TRIFECTAS =
  Object.freeze(createAllTrifectas());

function buildMissingNumbers(
  stats,
  jcd,
  raceNo
) {
  const pattern =
    stats?.trifectaByVenueRace?.[
      jcd
    ]?.[String(raceNo)] || null;

  const recent =
    pattern?.recent1Year || pattern;

  const all3Years =
    pattern?.all3Years || pattern;

  const sampleSize = Number(
    recent?.totalRaces || 0
  );

  const threeYearSampleSize = Number(
    all3Years?.totalRaces || 0
  );

  const recentCounts =
    recent?.counts &&
    typeof recent.counts === "object"
      ? recent.counts
      : {};

  const threeYearCounts =
    all3Years?.counts &&
    typeof all3Years.counts === "object"
      ? all3Years.counts
      : {};

  const available =
    sampleSize >= MIN_SAMPLES;

  return {
    available,
    sampleSize,
    recentSampleSize: sampleSize,
    threeYearSampleSize,
    reliability:
      recent?.reliability ||
      "low",
    missingNumbers:
      available
        ? ALL_TRIFECTAS
            .filter(ticket =>
              Number(
                recentCounts[ticket] || 0
              ) === 0
            )
            .map(ticket => {
              const threeYearOccurrences =
                Number(
                  threeYearCounts[ticket] || 0
                );

              return {
                ticket,
                occurrences: 0,
                recentOccurrences: 0,
                threeYearOccurrences,
                sampleSize,
                recentSampleSize: sampleSize,
                threeYearSampleSize,
                classification:
                  threeYearOccurrences === 0
                    ? "strong_missing"
                    : "recent_missing",
                label:
                  threeYearOccurrences === 0
                    ? "3年未出"
                    : "直近1年未出"
              };
            })
        : []
  };
}

module.exports =
  async function handler(req, res) {
    try {
      const jcd = normalizeJcd(
        req.query?.jcd
      );

      const raceNo = normalizeRaceNo(
        req.query?.rno
      );

      if (!jcd || !raceNo) {
        return res.status(400).json({
          ok: false,
          error:
            "jcd・rno が正しくありません"
        });
      }

      if (
        raceStats?.source !==
        "boatrace-official"
      ) {
        throw new Error(
          "公式結果統計を確認できません"
        );
      }

      const result =
        buildMissingNumbers(
          raceStats,
          jcd,
          raceNo
        );

      return res.status(200).json({
        ok: true,
        source: "boatrace-official",
        usagePolicy:
          "参考表示のみ。買い目の作成・削除には使用しない",
        stadiumCode: jcd,
        raceNo,
        generatedAt:
          raceStats.generatedAt || "",
        firstDate:
          raceStats.firstDate || "",
        lastDate:
          raceStats.lastDate || "",
        ...result,
        reason: result.available
          ? "同じ開催場・同じR番号の公式結果で出現0回"
          : `同条件の公式結果が${result.sampleSize}レースのため参考判定を停止`
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          String(error)
      });
    }
  };

module.exports.MIN_SAMPLES = MIN_SAMPLES;
module.exports.createAllTrifectas =
  createAllTrifectas;
module.exports.buildMissingNumbers =
  buildMissingNumbers;
