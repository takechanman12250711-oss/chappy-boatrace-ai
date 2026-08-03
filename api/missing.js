"use strict";

const raceStats = require(
  "../data/stats/trifecta-by-venue-race.json"
);

const MIN_SAMPLES = 30;
const RECENT_MISSING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const RACE_NUMBERS = Object.freeze(
  Array.from(
    { length: 12 },
    (_, index) => index + 1
  )
);

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

function normalizeDateKey(value) {
  const text = String(value || "").trim();

  if (!/^\d{8}$/.test(text)) {
    return "";
  }

  const date = new Date(Date.UTC(
    Number(text.slice(0, 4)),
    Number(text.slice(4, 6)) - 1,
    Number(text.slice(6, 8))
  ));

  return date
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "") === text
      ? text
      : "";
}

function daysBetweenDateKeys(
  startDate,
  endDate
) {
  const start = normalizeDateKey(
    startDate
  );
  const end = normalizeDateKey(
    endDate
  );

  if (!start || !end || end < start) {
    return null;
  }

  const parse = value => Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8))
  );

  return Math.floor(
    (parse(end) - parse(start)) /
    DAY_MS
  );
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

function appearanceRate(
  occurrences,
  sampleSize
) {
  const count = Number(occurrences || 0);
  const total = Number(sampleSize || 0);

  return total > 0
    ? Number(
        (
          count * 100 /
          total
        ).toFixed(4)
      )
    : null;
}

function compareScarcity(a, b) {
  return (
    Number(a.recentOccurrences || 0) -
      Number(b.recentOccurrences || 0) ||
    Number(b.missingDays || 0) -
      Number(a.missingDays || 0) ||
    a.ticket.localeCompare(b.ticket)
  );
}

function buildMissingNumbers(
  stats,
  jcd,
  requestedDate = ""
) {
  const venue =
    stats?.trifectaByVenue?.[
      jcd
    ] || null;

  const recent =
    venue?.recent30Days || null;
  const history =
    venue?.all3Years || null;

  const dataThroughDate =
    normalizeDateKey(
      venue?.dataThroughDate ||
      stats?.dataThroughDate ||
      stats?.lastDate
    );

  const defaultAsOfDate =
    normalizeDateKey(
      venue?.asOfDate ||
      stats?.asOfDate ||
      dataThroughDate
    );

  const normalizedRequestedDate =
    normalizeDateKey(requestedDate);

  const unsupportedReferenceDate =
    Boolean(
      normalizedRequestedDate &&
      normalizedRequestedDate !==
        defaultAsOfDate
    );

  const asOfDate =
    normalizedRequestedDate &&
    !unsupportedReferenceDate
      ? normalizedRequestedDate
      : defaultAsOfDate;

  const windowStartDate =
    normalizeDateKey(
      venue?.windowStartDate ||
      stats?.recentWindowStartDate
    );

  const historyStartDate =
    normalizeDateKey(
      venue?.historyStartDate ||
      stats?.historyStartDate ||
      stats?.firstDate
    );

  const continuousHistoryStartDate =
    normalizeDateKey(
      venue?.continuousHistoryStartDate ||
      stats?.continuousHistoryStartDate
    );

  const sampleSize = Number(
    recent?.totalRaces || 0
  );
  const recentWindowComplete =
    venue?.recentWindowComplete === true;
  const historySampleSize = Number(
    history?.totalRaces || 0
  );
  const recentCounts =
    recent?.counts || {};
  const lastOccurrenceDates =
    history?.lastOccurrenceDates || {};

  const available = Boolean(
    venue &&
    recent &&
    history &&
    asOfDate &&
    historyStartDate &&
    continuousHistoryStartDate &&
    recentWindowComplete &&
    sampleSize >= MIN_SAMPLES &&
    historySampleSize >= MIN_SAMPLES &&
    !unsupportedReferenceDate
  );

  const rows = available
    ? ALL_TRIFECTAS
        .map(ticket => {
          const recentOccurrences =
            Number(
              recentCounts[ticket] || 0
            );

          const lastOccurrenceDate =
            normalizeDateKey(
              lastOccurrenceDates[
                ticket
              ]
            );

          const exactLastOccurrence =
            Boolean(
              lastOccurrenceDate &&
              lastOccurrenceDate >=
                continuousHistoryStartDate
            );

          const lowerBound =
            !exactLastOccurrence;

          const missingDays =
            daysBetweenDateKeys(
              exactLastOccurrence
                ? lastOccurrenceDate
                : continuousHistoryStartDate,
              asOfDate
            );

          return {
            ticket,
            occurrences:
              recentOccurrences,
            recentOccurrences,
            sampleSize,
            recentSampleSize:
              sampleSize,
            historySampleSize,
            recentRate:
              appearanceRate(
                recentOccurrences,
                sampleSize
              ),
            lastOccurrenceDate:
              exactLastOccurrence
                ? lastOccurrenceDate
                : "",
            lastKnownOccurrenceDate:
              lastOccurrenceDate,
            missingDays:
              Number(missingDays || 0),
            missingDaysLowerBound:
              lowerBound,
            classification:
              Number(missingDays || 0) >
                RECENT_MISSING_DAYS
                ? "over_30_days"
                : recentOccurrences === 0
                  ? "recent_missing"
                  : "low_frequency",
            label:
              lowerBound
                ? `${Number(missingDays || 0)}日以上未出`
                : `${Number(missingDays || 0)}日未出`
          };
        })
        .filter(item =>
          item.recentOccurrences === 0
        )
        .sort(compareScarcity)
    : [];

  return {
    available,
    scope: "venue-all-races",
    includedRaceNos: [...RACE_NUMBERS],
    insufficientRaceNos: [],
    asOfDate,
    dataThroughDate,
    windowDays:
      RECENT_MISSING_DAYS,
    windowStartDate,
    historyStartDate,
    continuousHistoryStartDate,
    recentWindowComplete,
    unresolvedRecentRaces:
      Number(
        venue?.unresolvedRecentRaces || 0
      ),
    sampleSize,
    recentSampleSize: sampleSize,
    historySampleSize,
    reliability:
      sampleSize >= 100
        ? "high"
        : sampleSize >= MIN_SAMPLES
          ? "medium"
          : "low",
    rankingBasis:
      "zero-in-recent-30-days-then-missing-days",
    missingNumbers: rows,
    reason: unsupportedReferenceDate
      ? "指定日の直前30日だけを安全に再現できないため参考表示を停止"
      : available
        ? "開催場の1R〜12Rを合算し、直近30日で出ていない目を未出現日数の長い順に表示"
        : recentWindowComplete
          ? "直近30日の公式結果と最終出現日を確認できません"
          : "直近30日に未確定結果が残っているため参考表示を停止"
  };
}

function buildRaceMissingNumbers(
  stats,
  jcd,
  raceNo
) {
  const pattern =
    stats?.trifectaByVenueRace?.[
      jcd
    ]?.[String(raceNo)] || null;

  const recent =
    pattern?.recent1Year || null;

  const all3Years =
    pattern?.all3Years || null;

  const sampleSize = Number(
    recent?.totalRaces || 0
  );

  const threeYearSampleSize = Number(
    all3Years?.totalRaces || 0
  );

  const recentCounts =
    recent?.counts || {};

  const threeYearCounts =
    all3Years?.counts || {};

  const available =
    sampleSize >= MIN_SAMPLES;

  return {
    available,
    scope: "venue-race",
    sampleSize,
    recentSampleSize: sampleSize,
    threeYearSampleSize,
    reliability:
      recent?.reliability ||
      "low",
    missingNumbers: available
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
              recentSampleSize:
                sampleSize,
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

      const venueScope =
        String(
          req.query?.scope || ""
        ).trim() === "venue";

      const requestedDate =
        req.query?.date === undefined
          ? ""
          : normalizeDateKey(
              req.query?.date
            );

      const raceNo = venueScope
        ? 0
        : normalizeRaceNo(
            req.query?.rno
          );

      if (
        !jcd ||
        (!venueScope && !raceNo) ||
        (
          req.query?.date !== undefined &&
          !requestedDate
        )
      ) {
        return res.status(400).json({
          ok: false,
          error:
            venueScope
              ? "jcd・date が正しくありません"
              : "jcd・rno が正しくありません"
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
        venueScope
          ? buildMissingNumbers(
              raceStats,
              jcd,
              requestedDate
            )
          : buildRaceMissingNumbers(
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
        ...(venueScope
          ? {}
          : { raceNo }),
        generatedAt:
          raceStats.generatedAt || "",
        firstDate:
          raceStats.firstDate || "",
        lastDate:
          raceStats.lastDate || "",
        ...result,
        reason: result.reason ||
          (result.available
          ? venueScope
            ? "選択した開催場の1R〜12Rを合算し、直近30日基準の未出現日数順に表示"
            : "同じ開催場・同じR番号の公式結果で出現0回"
          : venueScope &&
              result.insufficientRaceNos
                ?.length
            ? `1R〜12Rの公式結果が不足（${result.insufficientRaceNos.join("・")}R）`
            : venueScope
              ? "選択した開催場の公式結果を確認できません"
              : `同条件の公式結果が${result.sampleSize}レースのため参考判定を停止`)
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
module.exports.RECENT_MISSING_DAYS =
  RECENT_MISSING_DAYS;
module.exports.RACE_NUMBERS = RACE_NUMBERS;
module.exports.createAllTrifectas =
  createAllTrifectas;
module.exports.buildMissingNumbers =
  buildMissingNumbers;
module.exports.buildRaceMissingNumbers =
  buildRaceMissingNumbers;
module.exports.compareScarcity =
  compareScarcity;
module.exports.normalizeDateKey =
  normalizeDateKey;
module.exports.daysBetweenDateKeys =
  daysBetweenDateKeys;
