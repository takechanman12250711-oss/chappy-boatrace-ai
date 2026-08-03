"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const missingApi = require(
  "../api/missing.js"
);
const statsBuilder = require(
  "./build-race-stats.js"
);

const {
  MIN_SAMPLES,
  RECENT_MISSING_DAYS,
  RACE_NUMBERS,
  createAllTrifectas,
  buildMissingNumbers,
  buildRaceMissingNumbers,
  daysBetweenDateKeys,
  normalizeDateKey
} = missingApi;

const allTickets = createAllTrifectas();

assert.equal(
  allTickets.length,
  120,
  "3連単は120通り"
);
assert.equal(
  new Set(allTickets).size,
  120,
  "3連単に重複がない"
);
assert.equal(
  RECENT_MISSING_DAYS,
  30,
  "出てない目の基準期間は30日"
);

assert.equal(
  daysBetweenDateKeys(
    "20260703",
    "20260803"
  ),
  31,
  "30日を超えても実日数を返す"
);
assert.equal(
  daysBetweenDateKeys(
    "20240229",
    "20240301"
  ),
  1,
  "閏日を暦日で計算する"
);
assert.equal(
  normalizeDateKey("20260229"),
  "",
  "存在しない日付を拒否する"
);

function buildRaceDayFile({
  date = "20260803",
  collectedAt,
  completedRaces = 0,
  failedRaces = 0
} = {}) {
  const pendingRaces =
    12 - completedRaces - failedRaces;
  const races = Array.from(
    { length: 12 },
    (_, index) => {
      const raceNo = index + 1;
      const completed =
        raceNo <= completedRaces;
      const failed =
        !completed &&
        raceNo <=
          completedRaces + failedRaces;

      return {
        source: "boatrace-official",
        date,
        jcd: "24",
        raceNo,
        resultAvailable: completed,
        status: completed
          ? "finished"
          : "not_finished",
        ...(failed
          ? { error: "公式結果取得失敗" }
          : {}),
        trifecta: completed
          ? { combination: "1-2-3" }
          : null
      };
    }
  );

  return {
    source: "boatrace-official",
    date,
    collectedAt,
    venueCount: 1,
    raceCount: 12,
    completedRaces,
    pendingRaces,
    failedRaces,
    venues: [
      { jcd: "24", place: "大村" }
    ],
    races
  };
}

const beforeJstDayClose =
  buildRaceDayFile({
    collectedAt:
      "2026-08-03T14:59:59.999Z",
    completedRaces: 1
  });
const atJstDayClose =
  buildRaceDayFile({
    collectedAt:
      "2026-08-03T15:00:00.000Z"
  });
const completeBeforeJstDayClose =
  buildRaceDayFile({
    collectedAt:
      "2026-08-03T12:00:00.000Z",
    completedRaces: 12
  });

assert.equal(
  statsBuilder.isRaceDayClosed(
    beforeJstDayClose
  ),
  false,
  "翌日0時JSTより前の開催途中データを締め済みにしない"
);
assert.equal(
  statsBuilder.isRaceDayClosed(
    atJstDayClose
  ),
  true,
  "翌日0時JST以後の公式無結果は中止等の確定状態として扱う"
);
assert.equal(
  statsBuilder.isRaceDayClosed(
    completeBeforeJstDayClose
  ),
  true,
  "全R確定済みなら当日中でも安全に締め済みとする"
);
assert.equal(
  statsBuilder.isRaceDayClosed(
    buildRaceDayFile({
      collectedAt:
        "2026-08-03T15:00:00.000Z",
      completedRaces: 11,
      failedRaces: 1
    })
  ),
  false,
  "取得失敗を含む日は締め済みにしない"
);
const unexpectedVenueRace =
  structuredClone(
    completeBeforeJstDayClose
  );
unexpectedVenueRace.races.push({
  ...unexpectedVenueRace.races[0],
  jcd: "23"
});
unexpectedVenueRace.raceCount += 1;
unexpectedVenueRace.completedRaces += 1;
assert.equal(
  statsBuilder.isRaceDayClosed(
    unexpectedVenueRace
  ),
  false,
  "予定場外の余分なレース行を締め済みとして通さない"
);
assert.deepEqual(
  statsBuilder.collectOfficialRaces(
    [beforeJstDayClose],
    statsBuilder.parseRaceDate(
      "20260802"
    )
  ),
  [],
  "開催途中の完了済みレースも30日統計へ先行混入させない"
);

function countsWith(
  defaultCount,
  overrides = {}
) {
  return Object.fromEntries(
    allTickets.map(ticket => [
      ticket,
      Object.hasOwn(
        overrides,
        ticket
      )
        ? overrides[ticket]
        : defaultCount
    ])
  );
}

function buildVenueSummary(
  recentOverrides,
  lastOccurrenceDates
) {
  return {
    asOfDate: "20260803",
    dataThroughDate: "20260802",
    windowDays: 30,
    windowStartDate: "20260704",
    historyStartDate: "20230805",
    continuousHistoryStartDate:
      "20250401",
    recentWindowComplete: true,
    unresolvedRecentRaces: 0,
    recent30Days: {
      totalRaces: 204,
      reliability: "high",
      counts: countsWith(
        1,
        recentOverrides
      )
    },
    all3Years: {
      totalRaces: 7209,
      reliability: "high",
      counts: countsWith(3),
      lastOccurrenceDates:
        lastOccurrenceDates || {}
    }
  };
}

const stats = {
  source: "boatrace-official",
  firstDate: "20230722",
  lastDate: "20260802",
  asOfDate: "20260803",
  dataThroughDate: "20260802",
  recentWindowStartDate: "20260704",
  historyStartDate: "20230805",
  continuousHistoryStartDate:
    "20250401",
  trifectaByVenue: {
    "23": buildVenueSummary(
      {
        "1-2-3": 0
      },
      {
        "1-2-3": "20260701"
      }
    ),
    "24": buildVenueSummary(
      {
        "6-5-4": 0,
        "6-5-3": 0,
        "5-6-4": 0,
        "4-6-5": 0
      },
      {
        "6-5-3": "20250301",
        "5-6-4": "20250601",
        "4-6-5": "20260703"
      }
    )
  },
  trifectaByVenueRace: {
    "24": {
      "1": {
        recent1Year: {
          totalRaces: 40,
          reliability: "medium",
          counts: {
            "1-2-3": 1
          }
        },
        all3Years: {
          totalRaces: 100,
          reliability: "high",
          counts: {
            "1-2-3": 3
          }
        }
      }
    }
  }
};

const available = buildMissingNumbers(
  stats,
  "24",
  "20260803"
);

assert.equal(available.available, true);
assert.equal(
  available.scope,
  "venue-all-races"
);
assert.deepEqual(
  available.includedRaceNos,
  RACE_NUMBERS
);
assert.equal(
  available.sampleSize,
  204
);
assert.equal(
  available.windowDays,
  30
);
assert.equal(
  available.windowStartDate,
  "20260704"
);
assert.equal(
  available.missingNumbers.length,
  4,
  "直近30日で0回の目だけを返す"
);

assert.deepEqual(
  available.missingNumbers.map(
    item => item.ticket
  ),
  [
    "6-5-3",
    "6-5-4",
    "5-6-4",
    "4-6-5"
  ],
  "未出日数の長い順、同率は出目順"
);

const lowerBound =
  available.missingNumbers.find(
    item => item.ticket === "6-5-4"
  );
assert.equal(
  lowerBound.missingDaysLowerBound,
  true
);
assert.equal(
  lowerBound.missingDays,
  daysBetweenDateKeys(
    "20250401",
    "20260803"
  )
);
assert.match(
  lowerBound.label,
  /日以上未出$/,
  "履歴欠落前は正確値を捏造せず下限表示"
);

const exact31Days =
  available.missingNumbers.find(
    item => item.ticket === "4-6-5"
  );
assert.equal(
  exact31Days.missingDays,
  31
);
assert.equal(
  exact31Days.label,
  "31日未出"
);

assert.equal(
  available.missingNumbers.some(
    item => Object.hasOwn(item, "odds")
  ),
  false,
  "API応答へオッズを混ぜない"
);

const otherVenue = buildMissingNumbers(
  stats,
  "23",
  "20260803"
);
assert.deepEqual(
  otherVenue.missingNumbers.map(
    item => item.ticket
  ),
  ["1-2-3"],
  "他場の結果を混ぜない"
);

const historicalDate =
  buildMissingNumbers(
    stats,
    "24",
    "20260802"
  );
assert.equal(
  historicalDate.available,
  false,
  "静的30日窓と一致しない過去日は未来情報混入を防ぐ"
);
assert.deepEqual(
  historicalDate.missingNumbers,
  []
);

const staleFutureDate =
  buildMissingNumbers(
    stats,
    "24",
    "20260804"
  );
assert.equal(
  staleFutureDate.available,
  false,
  "未収集日の経過日数を作らない"
);

const insufficientStats =
  structuredClone(stats);
insufficientStats
  .trifectaByVenue["24"]
  .recent30Days.totalRaces =
  MIN_SAMPLES - 1;
assert.equal(
  buildMissingNumbers(
    insufficientStats,
    "24",
    "20260803"
  ).available,
  false,
  "場全体の直近30日標本が不足したら表示しない"
);

const unresolvedStats =
  structuredClone(stats);
unresolvedStats
  .trifectaByVenue["24"]
  .recentWindowComplete = false;
unresolvedStats
  .trifectaByVenue["24"]
  .unresolvedRecentRaces = 1;
assert.equal(
  buildMissingNumbers(
    unresolvedStats,
    "24",
    "20260803"
  ).available,
  false,
  "未確定結果を0回として順位へ混ぜない"
);

const legacy = buildRaceMissingNumbers(
  stats,
  "24",
  1
);
assert.equal(
  legacy.scope,
  "venue-race"
);
assert.equal(
  legacy.sampleSize,
  40,
  "旧jcd+rno APIは移行互換として維持"
);

const tracked =
  statsBuilder.createVenueTrifectaSummary();
statsBuilder.addTrifectaRace(
  tracked.all3Years,
  {
    date: "20260701",
    trifecta: {
      combination: "1-2-3"
    }
  }
);
statsBuilder.addTrifectaRace(
  tracked.all3Years,
  {
    date: "20260705",
    trifecta: {
      combination: "1-2-3"
    }
  }
);
assert.equal(
  tracked.all3Years
    .lastOccurrenceDates["1-2-3"],
  "20260705",
  "統計生成時に最新の最終出現日を保持"
);

const continuousStart =
  statsBuilder
    .findContinuousHistoryStartDate(
      [
        {
          source: "boatrace-official",
          date: "20260701"
        },
        {
          source: "boatrace-official",
          date: "20260703"
        },
        {
          source: "boatrace-official",
          date: "20260704"
        }
      ],
      statsBuilder.parseRaceDate(
        "20260704"
      )
    );
assert.equal(
  continuousStart
    .toISOString()
    .slice(0, 10),
  "2026-07-03",
  "履歴欠落の翌日を連続履歴の開始日にする"
);

const venueQuality =
  statsBuilder.buildVenueHistoryQuality(
    [
      {
        source: "boatrace-official",
        date: "20260703",
        races: []
      },
      {
        source: "boatrace-official",
        date: "20260704",
        races: [
          {
            jcd: "24",
            resultAvailable: false,
            trifecta: null,
            error: "公式結果取得失敗"
          },
          {
            jcd: "23",
            resultAvailable: true,
            trifecta: {
              combination: "1-2-3"
            }
          }
        ]
      }
    ],
    {
      latestDate:
        statsBuilder.parseRaceDate(
          "20260704"
        ),
      baseStartDate:
        statsBuilder.parseRaceDate(
          "20260703"
        ),
      recentStartDate:
        statsBuilder.parseRaceDate(
          "20260703"
        )
    }
  );
assert.equal(
  venueQuality["24"]
    .recentWindowComplete,
  false,
  "場別の未確定結果を検出する"
);
assert.equal(
  venueQuality["23"]
    .recentWindowComplete,
  true,
  "他場の未確定結果を混ぜない"
);

const renderSource = fs.readFileSync(
  path.resolve(
    __dirname,
    "../js/render.js"
  ),
  "utf8"
);
assert.match(
  renderSource,
  /開催場の1R〜12Rを合算/,
  "画面で場別全R合算を明示"
);
assert.match(
  renderSource,
  /未出現日数/,
  "画面で日数基準を明示"
);
assert.doesNotMatch(
  renderSource,
  /現在オッズは順位確定後の参考表示/,
  "出てない目からオッズ説明を削除"
);

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

async function testVenueHandler() {
  const response = responseRecorder();

  await missingApi(
    {
      query: {
        jcd: "24",
        scope: "venue"
      }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.body.scope,
    "venue-all-races"
  );
  assert.equal(
    Object.hasOwn(
      response.body,
      "raceNo"
    ),
    false
  );
  assert.equal(
    JSON.stringify(response.body)
      .includes('"odds"'),
    false,
    "本番形の応答にもオッズを含めない"
  );
}

testVenueHandler()
  .then(() => {
    console.log(
      "開催場別・直近30日・未出現日数の集計テストに合格しました"
    );
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
