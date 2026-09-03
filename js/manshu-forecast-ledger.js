/* =========================================================
  チャッピーボートレースAI
  万舟・波乱・道中変化の別会計予想台帳 v1

  役割:
  - 既存の lightManshuTicketBoard を通常予想へ混ぜず、
    レース前に固定できる「別会計予想」へ正規化する
  - note販売文へ参考予想として追記する
  - 保存済み予想と公式結果を照合し、別会計で集計する

  非変更:
  - 通常予想・実戦厳選・購入保存・オッズ分類・A/Bは変更しない
========================================================= */

(function (root, factory) {
  "use strict";

  const api = factory(root);
  root.ChappyManshuForecastLedger = api;

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = api;
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis,
  function (root) {
    "use strict";

    const VERSION = "manshu-forecast-ledger-v1";
    const SCHEMA_VERSION = 1;
    const CREATE_WRAPPED = Symbol.for(
      "chappy.manshuForecastLedger.createPredictionWrapped"
    );
    const NOTE_WRAPPED = Symbol.for(
      "chappy.manshuForecastLedger.noteGeneratorWrapped"
    );
    const STORAGE_WRAPPED = Symbol.for(
      "chappy.manshuForecastLedger.storageWrapped"
    );

    const state = {
      latestLedger: null,
      byRaceKey: new Map(),
      statsObserver: null,
      statsRenderQueued: false,
      statsRendering: false
    };

    function number(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? parsed
        : fallback;
    }

    function text(value, fallback = "") {
      if (
        value === null ||
        value === undefined
      ) {
        return fallback;
      }
      const normalized = String(value).trim();
      return normalized || fallback;
    }

    function array(value) {
      if (Array.isArray(value)) return value;
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return [];
      }
      return [value];
    }

    function unique(values) {
      return [...new Set(
        array(values)
          .map(value => text(value))
          .filter(Boolean)
      )];
    }

    function uniqueNumbers(values) {
      return [...new Set(
        array(values)
          .map(Number)
          .filter(value =>
            Number.isInteger(value) &&
            value >= 1 &&
            value <= 6
          )
      )].sort((a, b) => a - b);
    }

    function normalizeDate(value) {
      const normalized = text(value)
        .replace(/\D/g, "")
        .slice(0, 8);
      return normalized.length === 8
        ? normalized
        : "";
    }

    function normalizeJcd(value) {
      const normalized = text(value)
        .replace(/\D/g, "");
      return normalized
        ? normalized.padStart(2, "0").slice(-2)
        : "";
    }

    function normalizeRaceNo(value) {
      const raceNo = number(
        text(value).replace(/\D/g, ""),
        0
      );
      return raceNo >= 1 && raceNo <= 12
        ? raceNo
        : 0;
    }

    function buildRaceKey(source = {}) {
      const explicit = text(
        source?.raceKey ||
        source?.predictionRaceKey
      );
      if (explicit) return explicit;

      const race = source?.race || {};
      const date = normalizeDate(
        source?.date ||
        source?.predictionDate ||
        race?.date ||
        race?.raceDate
      );
      const jcd = normalizeJcd(
        source?.jcd ||
        source?.stadiumCode ||
        source?.placeCode ||
        race?.jcd ||
        race?.stadiumCode ||
        race?.placeCode
      );
      const raceNo = normalizeRaceNo(
        source?.raceNo ||
        source?.rno ||
        source?.predictionRaceNo ||
        race?.raceNo ||
        race?.rno
      );

      return date && jcd && raceNo
        ? `${date}-${jcd}-${raceNo}`
        : "";
    }

    function normalizeTicket(value) {
      const ticket = text(
        value?.ticket || value
      ).replace(/\s+/g, "");
      const boats = ticket
        .split("-")
        .map(Number);

      if (
        boats.length !== 3 ||
        boats.some(boat =>
          !Number.isInteger(boat) ||
          boat < 1 ||
          boat > 6
        ) ||
        new Set(boats).size !== 3
      ) {
        return "";
      }

      return boats.join("-");
    }

    function stableHash(value) {
      const input = text(value);
      let hash = 2166136261;

      for (
        let index = 0;
        index < input.length;
        index += 1
      ) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }

      return (hash >>> 0)
        .toString(36)
        .padStart(7, "0");
    }

    function escapeHtml(value) {
      return text(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function forecastType(kind) {
      if (kind === "START_UPSET") {
        return {
          key: "upset",
          label: "波乱予想"
        };
      }
      if (kind === "ROAD_PICKUP") {
        return {
          key: "road-change",
          label: "道中変化予想"
        };
      }
      return {
        key: "manshu",
        label: "万舟予想"
      };
    }

    function compactRole(role) {
      if (!role || typeof role !== "object") {
        return null;
      }

      const boatNo = number(role.boatNo, 0);
      const position = number(role.position, 0);
      if (
        boatNo < 1 ||
        boatNo > 6 ||
        position < 1 ||
        position > 3
      ) {
        return null;
      }

      return {
        boatNo,
        position,
        role: text(role.role),
        label: text(role.label),
        reason: text(role.reason)
      };
    }

    function roleBoats(ticketDetails, predicate) {
      const roles = array(ticketDetails)
        .flatMap(detail => array(detail?.roles))
        .map(compactRole)
        .filter(Boolean)
        .filter(predicate)
        .map(role => role.boatNo);

      return uniqueNumbers(roles);
    }

    function deriveMetadata(
      prediction = {},
      input = {},
      override = {}
    ) {
      const predictionRace = prediction?.race || {};
      const inputRace = input?.race || {};
      const source = {
        ...inputRace,
        ...input,
        ...predictionRace,
        ...prediction,
        ...override
      };
      const raceKey =
        buildRaceKey(override) ||
        buildRaceKey(source);

      return {
        raceKey,
        date:
          normalizeDate(
            override?.date ||
            source?.date ||
            source?.raceDate
          ),
        jcd:
          normalizeJcd(
            override?.jcd ||
            source?.jcd ||
            source?.stadiumCode ||
            source?.placeCode
          ),
        raceNo:
          normalizeRaceNo(
            override?.raceNo ||
            override?.rno ||
            source?.raceNo ||
            source?.rno
          ),
        place:
          text(
            override?.place ||
            source?.place ||
            source?.stadiumName ||
            source?.venueName
          ),
        deadlineAt:
          text(
            override?.deadlineAt ||
            source?.deadlineAt ||
            source?.deadline
          ),
        generatedAt:
          text(
            override?.generatedAt ||
            source?.generatedAt ||
            source?.fetchedAt ||
            source?.retrievedAt ||
            source?.checkedAt
          )
      };
    }

    function buildForecast(
      line,
      metadata,
      index
    ) {
      const kind = text(line?.kind, "OUTER_FOLLOW");
      const type = forecastType(kind);
      const formation = line?.formation || {};
      const expandedTickets = unique(
        array(formation?.expandedTickets)
          .map(normalizeTicket)
          .filter(Boolean)
      );
      if (!expandedTickets.length) return null;

      const ticketDetails = array(line?.ticketDetails);
      const attackerBoatNo = number(
        line?.trigger?.attackerBoatNo ||
        line?.headEvidence?.boatNo ||
        0,
        0
      );
      const remainBoats = roleBoats(
        ticketDetails,
        role =>
          role.position === 2 ||
          /SURVIVOR|ESCAPER|HOLD/.test(role.role)
      );
      const pickupBoats = roleBoats(
        ticketDetails,
        role =>
          role.position === 3 ||
          /PICKUP|FOLLOWER/.test(role.role)
      );
      const allocation = {
        unitYen: number(
          line?.allocation?.unitYen,
          100
        ),
        unitsPerTicket: number(
          line?.allocation?.unitsPerTicket,
          0
        ),
        yenPerTicket: number(
          line?.allocation?.yenPerTicket,
          0
        ),
        totalUnits: number(
          line?.allocation?.totalUnits,
          0
        ),
        totalYen: number(
          line?.allocation?.totalYen,
          0
        ),
        label: text(line?.allocation?.label)
      };
      const identity = [
        metadata.raceKey || "race-pending",
        type.key,
        kind,
        text(formation?.notation),
        expandedTickets.join(",")
      ].join("|");
      const evidence = unique([
        line?.reason,
        line?.headEvidence?.reason,
        line?.trigger?.scenarioLabel,
        ...ticketDetails.flatMap(detail => [
          detail?.summary,
          detail?.reason,
          detail?.scenarioSummary
        ])
      ]);

      return {
        forecastId:
          `mf-${stableHash(identity)}`,
        raceKey: metadata.raceKey,
        forecastType: type.key,
        forecastLabel: type.label,
        rank: number(line?.rank, index + 1),
        kind,
        title: text(line?.title, type.label),
        reason: text(line?.reason),
        formation: {
          notation: text(formation?.notation),
          headBoatNos:
            uniqueNumbers(formation?.headBoatNos),
          secondBoatNos:
            uniqueNumbers(formation?.secondBoatNos),
          thirdBoatNos:
            uniqueNumbers(formation?.thirdBoatNos),
          expandedTickets,
          pointCount: expandedTickets.length
        },
        scenario: {
          type: text(line?.trigger?.scenarioType),
          label: text(line?.trigger?.scenarioLabel),
          score: number(line?.trigger?.scenarioScore, 0),
          attackerBoatNo:
            attackerBoatNo >= 1 &&
            attackerBoatNo <= 6
              ? attackerBoatNo
              : null,
          attackerCourse:
            number(
              line?.trigger?.attackerCourse,
              0
            ) || null,
          isMainScenario:
            line?.trigger?.isMainScenario === true
        },
        roles: {
          attackBoat:
            attackerBoatNo >= 1 &&
            attackerBoatNo <= 6
              ? attackerBoatNo
              : null,
          remainBoats,
          pickupBoats
        },
        evidence,
        allocation,
        referenceStakeYen:
          allocation.totalYen ||
          expandedTickets.length *
            allocation.yenPerTicket,
        generatedAt: metadata.generatedAt,
        status: "pre-race",
        selectionScope:
          "separate-account-forecast",
        noteEligible: true,
        saveEligible: true,
        resultCheckEligible: true,
        purchaseEligible: false,
        affectsNormalTickets: false,
        affectsPracticalSelection: false,
        usesOdds: false,
        usesOfficialResult: false
      };
    }

    function build(
      prediction = {},
      options = {}
    ) {
      const board =
        options?.board ||
        prediction?.lightManshuTicketBoard ||
        prediction?.aiCore?.lightManshuTicketBoard ||
        prediction?.manshuSheet?.lightManshuTicketBoard ||
        null;
      const lines = array(board?.lines);
      if (!board || lines.length < 2) {
        return null;
      }

      const metadata = deriveMetadata(
        prediction,
        options?.input || {},
        options?.metadata || {}
      );
      const forecasts = lines
        .map((line, index) =>
          buildForecast(
            line,
            metadata,
            index
          )
        )
        .filter(Boolean);
      if (forecasts.length < 2) {
        return null;
      }

      const ticketSet = new Set();
      const uniqueForecasts = forecasts
        .map(forecast => {
          const tickets =
            forecast.formation.expandedTickets
              .filter(ticket => {
                if (ticketSet.has(ticket)) {
                  return false;
                }
                ticketSet.add(ticket);
                return true;
              });
          if (!tickets.length) return null;

          const pointCount = tickets.length;
          const yenPerTicket = number(
            forecast.allocation.yenPerTicket,
            0
          );
          return {
            ...forecast,
            formation: {
              ...forecast.formation,
              expandedTickets: tickets,
              pointCount
            },
            referenceStakeYen:
              pointCount * yenPerTicket
          };
        })
        .filter(Boolean);
      if (uniqueForecasts.length < 2) {
        return null;
      }

      const totalTicketCount = uniqueForecasts
        .reduce(
          (sum, forecast) =>
            sum + forecast.formation.pointCount,
          0
        );
      const totalReferenceStakeYen = uniqueForecasts
        .reduce(
          (sum, forecast) =>
            sum + forecast.referenceStakeYen,
          0
        );

      return {
        schemaVersion: SCHEMA_VERSION,
        version: VERSION,
        source:
          "light-manshu-ticket-board-v2",
        title:
          "波乱・道中変化・万舟 別会計予想",
        raceKey: metadata.raceKey,
        date: metadata.date,
        jcd: metadata.jcd,
        raceNo: metadata.raceNo,
        place: metadata.place,
        deadlineAt: metadata.deadlineAt,
        generatedAt: metadata.generatedAt,
        status: "pre-race",
        selectionScope:
          "separate-account-forecast",
        noteEligible: true,
        saveEligible: true,
        resultCheckEligible: true,
        purchaseEligible: false,
        affectsNormalTickets: false,
        affectsPracticalSelection: false,
        usesOdds: false,
        usesOfficialResult: false,
        totalForecastCount:
          uniqueForecasts.length,
        totalTicketCount,
        totalReferenceStakeYen,
        forecasts: uniqueForecasts
      };
    }

    function withRaceMetadata(
      ledger,
      source = {}
    ) {
      if (!ledger) return null;
      const metadata = deriveMetadata(
        ledger,
        source,
        source
      );
      const raceKey =
        metadata.raceKey ||
        ledger.raceKey ||
        buildRaceKey(source);
      const generatedAt =
        text(
          ledger.generatedAt ||
          source.generatedAt ||
          source.savedAt ||
          source.updatedAt
        );
      const forecasts = array(ledger.forecasts)
        .map((forecast, index) => {
          const identity = [
            raceKey || "race-pending",
            forecast.forecastType,
            forecast.kind,
            forecast.formation?.notation,
            array(
              forecast.formation
                ?.expandedTickets
            ).join(",")
          ].join("|");

          return {
            ...forecast,
            forecastId:
              `mf-${stableHash(identity)}`,
            raceKey,
            rank:
              number(
                forecast.rank,
                index + 1
              ),
            generatedAt:
              text(
                forecast.generatedAt ||
                generatedAt
              )
          };
        });

      return {
        ...ledger,
        raceKey,
        date:
          metadata.date || ledger.date || "",
        jcd:
          metadata.jcd || ledger.jcd || "",
        raceNo:
          metadata.raceNo || ledger.raceNo || 0,
        place:
          metadata.place || ledger.place || "",
        deadlineAt:
          metadata.deadlineAt ||
          ledger.deadlineAt ||
          "",
        generatedAt,
        forecasts
      };
    }

    function remember(ledger) {
      if (!ledger) return null;
      state.latestLedger = ledger;
      if (ledger.raceKey) {
        state.byRaceKey.set(
          ledger.raceKey,
          ledger
        );
      }
      return ledger;
    }

    function extractLedger(source = {}) {
      return (
        source?.manshuForecastLedger ||
        source?.manshuSheet?.forecastLedger ||
        source?.aiCore?.manshuForecastLedger ||
        null
      );
    }

    function attachPrediction(
      prediction,
      input = {},
      options = {}
    ) {
      if (
        !prediction ||
        typeof prediction !== "object"
      ) {
        return prediction;
      }

      const existing = extractLedger(prediction);
      const ledger =
        withRaceMetadata(
          existing ||
          build(prediction, {
            input,
            metadata: options?.metadata
          }),
          {
            ...input,
            ...(options?.metadata || {})
          }
        );
      if (!ledger) return prediction;

      remember(ledger);

      return {
        ...prediction,
        manshuForecastLedger: ledger,
        manshuSheet: {
          ...(prediction.manshuSheet || {}),
          forecastLedger: ledger
        },
        aiCore: prediction.aiCore
          ? {
              ...prediction.aiCore,
              manshuForecastLedger: ledger
            }
          : prediction.aiCore
      };
    }

    function resultCombination(result = {}) {
      return normalizeTicket(
        result?.trifecta?.combination ||
        result?.result ||
        result?.combination ||
        result?.winningTicket
      );
    }

    function payoutPer100(result = {}) {
      return number(
        result?.trifecta?.payout ||
        result?.officialPayoutPer100 ||
        result?.payoutPer100 ||
        result?.payout,
        0
      );
    }

    function resultAvailable(result = {}) {
      if (
        result?.void === true ||
        result?.status === "void"
      ) {
        return false;
      }
      return Boolean(
        result?.resultAvailable === true ||
        resultCombination(result)
      );
    }

    function evaluateResult(
      ledger,
      result = {}
    ) {
      if (!ledger) return null;
      const combination =
        resultCombination(result);
      const available =
        resultAvailable(result);
      const voidResult =
        result?.void === true ||
        result?.status === "void";
      const payout =
        payoutPer100(result);
      const forecasts = array(ledger.forecasts)
        .map(forecast => {
          const tickets = unique(
            array(
              forecast?.formation
                ?.expandedTickets
            )
              .map(normalizeTicket)
              .filter(Boolean)
          );
          const hit =
            available &&
            tickets.includes(combination);
          const unitsPerTicket = number(
            forecast?.allocation
              ?.unitsPerTicket,
            0
          );
          const stakeYen = number(
            forecast?.referenceStakeYen,
            tickets.length *
              number(
                forecast?.allocation
                  ?.yenPerTicket,
                0
              )
          );
          const returnYen = hit
            ? payout * unitsPerTicket
            : 0;

          return {
            forecastId:
              text(forecast?.forecastId),
            forecastType:
              text(forecast?.forecastType),
            forecastLabel:
              text(forecast?.forecastLabel),
            formation:
              text(
                forecast?.formation?.notation
              ),
            tickets,
            hit,
            stakeYen,
            returnYen,
            profitYen:
              returnYen - stakeYen
          };
        });
      const stakeYen = forecasts.reduce(
        (sum, forecast) =>
          sum + forecast.stakeYen,
        0
      );
      const returnYen = forecasts.reduce(
        (sum, forecast) =>
          sum + forecast.returnYen,
        0
      );
      const hitForecasts = forecasts.filter(
        forecast => forecast.hit
      );

      return {
        schemaVersion: SCHEMA_VERSION,
        version: VERSION,
        raceKey:
          ledger.raceKey ||
          buildRaceKey(result),
        resultAvailable: available,
        void: voidResult,
        pending:
          !available && !voidResult,
        combination,
        payoutPer100: payout,
        forecastCount: forecasts.length,
        ticketCount: forecasts.reduce(
          (sum, forecast) =>
            sum + forecast.tickets.length,
          0
        ),
        hit:
          hitForecasts.length > 0,
        hitForecastCount:
          hitForecasts.length,
        hitForecastIds:
          hitForecasts.map(
            forecast => forecast.forecastId
          ),
        stakeYen,
        returnYen,
        profitYen:
          returnYen - stakeYen,
        roi:
          stakeYen > 0
            ? Math.round(
                returnYen /
                stakeYen *
                1000
              ) / 10
            : 0,
        forecasts
      };
    }

    function emptyMetric(label) {
      return {
        label,
        raceCount: 0,
        forecastCount: 0,
        ticketCount: 0,
        hitRaceCount: 0,
        hitForecastCount: 0,
        stakeYen: 0,
        returnYen: 0,
        profitYen: 0,
        hitRate: 0,
        roi: 0
      };
    }

    function summarize(
      predictions = [],
      results = []
    ) {
      const resultByRaceKey = new Map(
        array(results)
          .map(result => [
            buildRaceKey(result),
            result
          ])
          .filter(([raceKey]) => raceKey)
      );
      const overall = emptyMetric("別会計予想全体");
      const byType = {
        upset: emptyMetric("波乱予想"),
        "road-change":
          emptyMetric("道中変化予想"),
        manshu: emptyMetric("万舟予想")
      };
      let pendingRaceCount = 0;
      let voidRaceCount = 0;
      const countedRaces = new Set();

      array(predictions).forEach(prediction => {
        const ledger = extractLedger(prediction);
        if (!ledger) return;
        const raceKey =
          ledger.raceKey ||
          buildRaceKey(prediction);
        if (!raceKey || countedRaces.has(raceKey)) {
          return;
        }
        countedRaces.add(raceKey);

        const result = resultByRaceKey.get(raceKey);
        const evaluation =
          result?.manshuForecastEvaluation ||
          evaluateResult(ledger, result || {});
        if (!evaluation) return;
        if (evaluation.void) {
          voidRaceCount += 1;
          return;
        }
        if (!evaluation.resultAvailable) {
          pendingRaceCount += 1;
          return;
        }

        overall.raceCount += 1;
        overall.forecastCount +=
          evaluation.forecastCount;
        overall.ticketCount +=
          evaluation.ticketCount;
        overall.hitRaceCount +=
          evaluation.hit ? 1 : 0;
        overall.hitForecastCount +=
          evaluation.hitForecastCount;
        overall.stakeYen +=
          evaluation.stakeYen;
        overall.returnYen +=
          evaluation.returnYen;

        const raceTypeHits = new Set();
        array(evaluation.forecasts)
          .forEach(forecast => {
            const metric =
              byType[forecast.forecastType] ||
              byType.manshu;
            metric.forecastCount += 1;
            metric.ticketCount +=
              array(forecast.tickets).length;
            metric.hitForecastCount +=
              forecast.hit ? 1 : 0;
            metric.stakeYen +=
              number(forecast.stakeYen, 0);
            metric.returnYen +=
              number(forecast.returnYen, 0);
            if (forecast.hit) {
              raceTypeHits.add(
                forecast.forecastType
              );
            }
          });

        Object.entries(byType)
          .forEach(([key, metric]) => {
            const hasType = array(
              evaluation.forecasts
            ).some(
              forecast =>
                forecast.forecastType === key
            );
            if (hasType) {
              metric.raceCount += 1;
              metric.hitRaceCount +=
                raceTypeHits.has(key)
                  ? 1
                  : 0;
            }
          });
      });

      const finishMetric = metric => {
        const profitYen =
          metric.returnYen -
          metric.stakeYen;
        return {
          ...metric,
          profitYen,
          hitRate:
            metric.raceCount > 0
              ? Math.round(
                  metric.hitRaceCount /
                  metric.raceCount *
                  1000
                ) / 10
              : 0,
          roi:
            metric.stakeYen > 0
              ? Math.round(
                  metric.returnYen /
                  metric.stakeYen *
                  1000
                ) / 10
              : 0
        };
      };

      return {
        schemaVersion: SCHEMA_VERSION,
        version: VERSION,
        separateAccounting: true,
        pendingRaceCount,
        voidRaceCount,
        overall: finishMetric(overall),
        byType: Object.fromEntries(
          Object.entries(byType)
            .map(([key, metric]) => [
              key,
              finishMetric(metric)
            ])
        )
      };
    }

    function formatYen(value) {
      return `${Math.round(number(value, 0))
        .toLocaleString("ja-JP")}円`;
    }

    function formatNoteSection(ledger) {
      if (
        !ledger ||
        !array(ledger.forecasts).length
      ) {
        return "";
      }

      const order = [
        "upset",
        "road-change",
        "manshu"
      ];
      const groups = new Map();
      array(ledger.forecasts)
        .forEach(forecast => {
          const key = text(
            forecast.forecastType,
            "manshu"
          );
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key).push(forecast);
        });

      const sections = order
        .filter(key => groups.has(key))
        .map(key => {
          const forecasts = groups.get(key);
          const label =
            forecasts[0]?.forecastLabel ||
            forecastType("").label;
          const lines = forecasts.flatMap(
            forecast => {
              const roles = [
                forecast.roles?.attackBoat
                  ? `攻め${forecast.roles.attackBoat}号艇`
                  : "",
                array(
                  forecast.roles?.remainBoats
                ).length
                  ? `残し${forecast.roles.remainBoats.join("・")}号艇`
                  : "",
                array(
                  forecast.roles?.pickupBoats
                ).length
                  ? `拾い${forecast.roles.pickupBoats.join("・")}号艇`
                  : ""
              ].filter(Boolean).join("／");
              return [
                `・${forecast.formation?.notation || "フォーメーション未取得"}` +
                  `（${number(forecast.formation?.pointCount, 0)}点／` +
                  `${forecast.allocation?.label || "参考配分なし"}）`,
                forecast.reason
                  ? `　展開：${forecast.reason}`
                  : "",
                roles
                  ? `　役割：${roles}`
                  : "",
                array(
                  forecast.formation
                    ?.expandedTickets
                ).length
                  ? `　内訳：${forecast.formation.expandedTickets.join(" / ")}`
                  : ""
              ].filter(Boolean);
            }
          );

          return [
            `【参考・${label}】`,
            ...lines
          ].join("\n");
        });

      return [
        "【本命とは別会計の参考予想】",
        "通常予想・実戦厳選・購入保存には自動追加しません。レース前に固定し、公式結果とは別会計で検証します。",
        ...sections,
        `参考合計 ${number(ledger.totalTicketCount, 0)}点／${formatYen(ledger.totalReferenceStakeYen)}`
      ].join("\n\n");
    }

    function wrapCreatePrediction(api) {
      if (
        typeof api !== "function" ||
        api[CREATE_WRAPPED]
      ) {
        return api;
      }

      const wrapped = function createPredictionWithManshuForecastLedger(
        input,
        ...rest
      ) {
        const prediction = api.call(
          this,
          input,
          ...rest
        );
        return attachPrediction(
          prediction,
          input
        );
      };

      Object.defineProperty(
        wrapped,
        CREATE_WRAPPED,
        { value: true }
      );
      Object.defineProperty(
        wrapped,
        "name",
        {
          value: api.name || "createPrediction",
          configurable: true
        }
      );
      return wrapped;
    }

    function wrapNoteGenerator(api) {
      if (
        !api ||
        typeof api !== "object" ||
        api[NOTE_WRAPPED] ||
        typeof api.generateArticle !==
          "function"
      ) {
        return api;
      }

      const original =
        api.generateArticle.bind(api);
      const wrapped = {
        ...api,
        generateArticle(
          prediction,
          options = {}
        ) {
          const enrichedPrediction =
            attachPrediction(
              prediction,
              prediction?.race || {}
            );
          const article = original(
            enrichedPrediction,
            options
          );
          if (!article?.ok) return article;

          const ledger =
            extractLedger(
              enrichedPrediction
            );
          const forecastText =
            formatNoteSection(ledger);
          if (!forecastText) return article;

          const originalPaidText =
            text(article.paidText);
          const paidText = [
            originalPaidText,
            forecastText
          ].filter(Boolean).join("\n\n");
          const fullText =
            text(article.fullText)
              .replace(
                originalPaidText,
                paidText
              );

          return {
            ...article,
            paidText,
            fullText,
            manshuForecastLedger: ledger,
            forecastPaidText: forecastText
          };
        }
      };

      Object.defineProperty(
        wrapped,
        NOTE_WRAPPED,
        { value: true }
      );
      return Object.freeze(wrapped);
    }

    function ledgerForSave(
      prediction,
      originalStorage
    ) {
      const existing = extractLedger(prediction);
      const raceKey =
        typeof originalStorage
          ?.buildRaceKey === "function"
          ? originalStorage.buildRaceKey(
              prediction
            )
          : buildRaceKey(prediction);
      const latest =
        state.latestLedger;
      const candidate =
        existing ||
        state.byRaceKey.get(raceKey) ||
        (
          latest &&
          (
            !latest.raceKey ||
            latest.raceKey === raceKey
          )
            ? latest
            : null
        );
      if (!candidate) return null;

      const normalized = withRaceMetadata(
        candidate,
        {
          ...prediction,
          raceKey,
          generatedAt:
            prediction?.generatedAt ||
            prediction?.savedAt ||
            new Date().toISOString()
        }
      );
      remember(normalized);
      return normalized;
    }

    function wrapStorage(api) {
      if (
        !api ||
        typeof api !== "object" ||
        api[STORAGE_WRAPPED]
      ) {
        return api;
      }

      const originalUpsertPrediction =
        typeof api.upsertPrediction === "function"
          ? api.upsertPrediction.bind(api)
          : null;
      const originalUpsertResult =
        typeof api.upsertResult === "function"
          ? api.upsertResult.bind(api)
          : null;
      const originalFindPrediction =
        typeof api.findPredictionByRaceKey === "function"
          ? api.findPredictionByRaceKey.bind(api)
          : null;
      const originalLoadPredictions =
        typeof api.loadPredictionHistory === "function"
          ? api.loadPredictionHistory.bind(api)
          : () => [];
      const originalLoadResults =
        typeof api.loadResults === "function"
          ? api.loadResults.bind(api)
          : () => [];

      const wrapped = {
        ...api,
        upsertPrediction: originalUpsertPrediction
          ? function upsertPredictionWithForecastLedger(
              prediction
            ) {
              const ledger =
                ledgerForSave(
                  prediction,
                  api
                );
              const enriched = ledger
                ? {
                    ...prediction,
                    manshuForecastLedger:
                      ledger,
                    manshuSheet: {
                      ...(prediction?.manshuSheet || {}),
                      forecastLedger: ledger
                    }
                  }
                : prediction;
              const saved =
                originalUpsertPrediction(
                  enriched
                );
              scheduleStatsRender();
              return saved;
            }
          : api.upsertPrediction,
        upsertResult: originalUpsertResult
          ? function upsertResultWithForecastEvaluation(
              result
            ) {
              const raceKey =
                typeof api.buildRaceKey ===
                  "function"
                  ? api.buildRaceKey(result)
                  : buildRaceKey(result);
              const prediction =
                raceKey &&
                originalFindPrediction
                  ? originalFindPrediction(
                      raceKey
                    )
                  : null;
              const ledger =
                extractLedger(prediction) ||
                state.byRaceKey.get(raceKey) ||
                null;
              const evaluation =
                ledger
                  ? evaluateResult(
                      ledger,
                      result
                    )
                  : null;
              const saved =
                originalUpsertResult(
                  evaluation
                    ? {
                        ...result,
                        manshuForecastEvaluation:
                          evaluation
                      }
                    : result
                );
              scheduleStatsRender();
              return saved;
            }
          : api.upsertResult,
        loadManshuForecastPerformance() {
          return summarize(
            originalLoadPredictions(),
            originalLoadResults()
          );
        }
      };

      Object.defineProperty(
        wrapped,
        STORAGE_WRAPPED,
        { value: true }
      );
      return Object.freeze(wrapped);
    }

    function installAssignmentHook(
      property,
      wrapper
    ) {
      const descriptor =
        Object.getOwnPropertyDescriptor(
          root,
          property
        );
      if (
        descriptor &&
        descriptor.configurable === false
      ) {
        return false;
      }

      let current = root[property];
      current = wrapper(current);

      Object.defineProperty(
        root,
        property,
        {
          configurable: true,
          enumerable: true,
          get() {
            return current;
          },
          set(value) {
            current = wrapper(value);
          }
        }
      );
      return true;
    }

    function renderStatsPanel() {
      if (
        state.statsRendering ||
        !root.document
      ) {
        return;
      }
      const host =
        root.document.getElementById(
          "statsArea"
        );
      const storage =
        root.ChappyStorage;
      if (
        !host ||
        typeof storage
          ?.loadManshuForecastPerformance !==
          "function"
      ) {
        return;
      }

      const summary =
        storage
          .loadManshuForecastPerformance();
      const hasData =
        summary.overall.raceCount > 0 ||
        summary.pendingRaceCount > 0;
      const existing =
        host.querySelector(
          "[data-manshu-forecast-performance]"
        );
      if (!hasData) {
        existing?.remove();
        return;
      }

      const signature = JSON.stringify(summary);
      if (
        existing?.dataset?.signature ===
        signature
      ) {
        return;
      }

      const typeRows = Object.values(
        summary.byType
      )
        .filter(metric =>
          metric.raceCount > 0 ||
          metric.forecastCount > 0
        )
        .map(metric => `
          <tr>
            <th>${escapeHtml(metric.label)}</th>
            <td>${escapeHtml(metric.raceCount)}</td>
            <td>${escapeHtml(metric.hitRaceCount)}</td>
            <td>${escapeHtml(metric.hitRate)}%</td>
            <td>${escapeHtml(metric.roi)}%</td>
          </tr>
        `)
        .join("");
      const panel =
        root.document.createElement(
          "article"
        );
      panel.className =
        "dashboard-card manshu-forecast-performance";
      panel.dataset
        .manshuForecastPerformance =
        "true";
      panel.dataset.signature = signature;
      panel.innerHTML = `
        <h3>💣 別会計予想の検証</h3>
        <p>通常予想・実戦厳選とは混ぜず、波乱・道中変化・万舟の参考筋だけを集計します。</p>
        <div class="result-dashboard-grid">
          <div><strong>${escapeHtml(summary.overall.raceCount)}</strong><small>確定レース</small></div>
          <div><strong>${escapeHtml(summary.overall.hitRaceCount)}</strong><small>的中レース</small></div>
          <div><strong>${escapeHtml(summary.overall.hitRate)}%</strong><small>的中率</small></div>
          <div><strong>${escapeHtml(summary.overall.roi)}%</strong><small>回収率</small></div>
        </div>
        <p>参考購入 ${escapeHtml(formatYen(summary.overall.stakeYen))}／払戻 ${escapeHtml(formatYen(summary.overall.returnYen))}／収支 ${escapeHtml(formatYen(summary.overall.profitYen))}</p>
        ${summary.pendingRaceCount
          ? `<p>結果待ち ${escapeHtml(summary.pendingRaceCount)}レース</p>`
          : ""}
        ${typeRows
          ? `<table><thead><tr><th>分類</th><th>R</th><th>的中</th><th>的中率</th><th>回収率</th></tr></thead><tbody>${typeRows}</tbody></table>`
          : ""}
      `;

      state.statsRendering = true;
      try {
        existing?.remove();
        host.appendChild(panel);
      } finally {
        state.statsRendering = false;
      }
    }

    function scheduleStatsRender() {
      if (
        !root.document ||
        state.statsRenderQueued
      ) {
        return;
      }
      state.statsRenderQueued = true;
      root.setTimeout(() => {
        state.statsRenderQueued = false;
        renderStatsPanel();
      }, 0);
    }

    function installStatsObserver() {
      if (
        !root.document ||
        state.statsObserver ||
        typeof root.MutationObserver !==
          "function"
      ) {
        scheduleStatsRender();
        return;
      }
      const host =
        root.document.getElementById(
          "statsArea"
        );
      if (!host) {
        scheduleStatsRender();
        return;
      }
      state.statsObserver =
        new root.MutationObserver(
          mutations => {
            if (state.statsRendering) return;
            const changedOutsidePanel =
              mutations.some(mutation =>
                !mutation.target?.closest?.(
                  "[data-manshu-forecast-performance]"
                )
              );
            if (changedOutsidePanel) {
              scheduleStatsRender();
            }
          }
        );
      state.statsObserver.observe(
        host,
        {
          childList: true,
          subtree: true
        }
      );
      scheduleStatsRender();
    }

    installAssignmentHook(
      "createPrediction",
      wrapCreatePrediction
    );
    installAssignmentHook(
      "ChappyNoteGenerator",
      wrapNoteGenerator
    );
    installAssignmentHook(
      "ChappyStorage",
      wrapStorage
    );

    if (root.document) {
      if (
        root.document.readyState ===
        "loading"
      ) {
        root.document.addEventListener(
          "DOMContentLoaded",
          installStatsObserver,
          { once: true }
        );
      } else {
        installStatsObserver();
      }
      root.addEventListener?.(
        "chappy:view-changed",
        scheduleStatsRender
      );
      root.addEventListener?.(
        "chappy:prediction-rendered",
        scheduleStatsRender
      );
    }

    return Object.freeze({
      VERSION,
      SCHEMA_VERSION,
      buildRaceKey,
      build,
      withRaceMetadata,
      attachPrediction,
      extractLedger,
      evaluateResult,
      summarize,
      formatNoteSection,
      wrapCreatePrediction,
      wrapNoteGenerator,
      wrapStorage,
      renderStatsPanel
    });
  }
);
