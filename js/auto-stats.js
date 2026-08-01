/* =========================================================
  自動予想の履歴・結果を結果分析用へ変換
========================================================= */

(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyAutoStats = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const boatIdentity =
    root?.ChappyBoatIdentity ||
    (
      typeof require === "function"
        ? require("./boat-identity")
        : null
    );

  function isBoatIdentityQuarantined(record) {
    const inspection =
      boatIdentity?.inspectPrediction(
        record
      );
    return (
      inspection?.checked === true &&
      inspection?.valid === false
    );
  }

  function normalizeTicket(value) {
    const boats = String(value || "").match(/[1-6]/g) || [];
    return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
  }

  function selectionGenerationKey(
    item
  ) {
    const evidence =
      item?.prediction
        ?.verificationEvidence
        ||
      item?.verificationEvidence
        ||
      {};
    const generation =
      evidence?.generation || {};
    const reference =
      item?.shadowV2Reference ||
      {};
    const values = [
      generation
        ?.logicFingerprint,
      generation
        ?.confidenceDefinitionVersion,
      generation
        ?.ticketPolicyVersion,
      Number(
        evidence
          ?.roleSchemaVersion || 0
      ) >= 1
        ? Number(
            evidence
              .roleSchemaVersion
          )
        : "",
      Number(
        evidence
          ?.theorySchemaVersion || 0
      ) >= 1
        ? Number(
            evidence
              .theorySchemaVersion
          )
        : "",
      evidence
        ?.theorySetFingerprint,
      item?.selection?.evaluator,
      reference.evaluatorVersion,
      reference.cohortKey,
      reference.logicFingerprint,
      reference.theoryInputVersion,
      Number.isFinite(
        Number(
          item
            ?.selection
            ?.threshold
        )
      )
        ? Number(
            item
              .selection
              .threshold
          )
        : ""
    ].map(value =>
      String(value || "").trim()
    );

    return values.every(Boolean)
      ? JSON.stringify(values)
      : "";
  }

  function classifySelectionCohort(
    item,
    activeGenerationKey = ""
  ) {
    const selection =
      item?.selection || {};
    const generationKey =
      selectionGenerationKey(item);
    const hasGeneration =
      Boolean(generationKey);

    if (
      selection.evaluator !==
        "shadow-selection-v2"
    ) {
      return {
        key: "legacy",
        generationKey,
        active: false,
        thresholdComparable:
          false
      };
    }

    if (!hasGeneration) {
      return {
        key:
          "v2_missing_generation",
        generationKey,
        active: false,
        thresholdComparable:
          false
      };
    }

    if (!activeGenerationKey) {
      return {
        key:
          "v2_no_active_generation",
        generationKey,
        active: false,
        thresholdComparable:
          false
      };
    }

    if (
      generationKey !==
        activeGenerationKey
    ) {
      return {
        key:
          "v2_other_generation",
        generationKey,
        active: false,
        thresholdComparable:
          false
      };
    }

    if (
      selection.ready !== true ||
      selection.status !==
        "ready" ||
      !Number.isFinite(
        Number(selection.score)
      )
    ) {
      return {
        key: "v2_not_ready",
        generationKey,
        active: true,
        thresholdComparable:
          false
      };
    }

    const score =
      Number(selection.score);
    return {
      key:
        score >= 70
          ? "v2_70_plus"
          : score >= 60
            ? "v2_60_69"
            : "v2_ready_below_60",
      generationKey,
      active: true,
      thresholdComparable:
        true
    };
  }

  function normalizeIndex(data) {
    const predictions = [];
    const results = [];
    const selectedRecords = (
      Array.isArray(data?.predictions)
        ? data.predictions
        : []
    ).filter(
      item =>
        !isBoatIdentityQuarantined(
          item
        )
    );
    const verificationRecords = (
      Array.isArray(
        data?.verificationPredictions
      )
        ? data.verificationPredictions
        : []
    ).filter(
      item =>
        !isBoatIdentityQuarantined(
          item
        )
    );
    const selectedRaceKeys = new Set(
      selectedRecords
        .map(item => String(item?.raceKey || ""))
        .filter(Boolean)
    );
    const allIndexed = [
      ...selectedRecords,
      ...verificationRecords
    ];
    const activeGenerationKey =
      allIndexed
        .filter(
          item =>
            item?.selection
              ?.evaluator ===
              "shadow-selection-v2"
        )
        .map(item => ({
          item,
          key:
            selectionGenerationKey(
              item
            )
        }))
        .filter(row =>
          row.key
        )
        .sort((a, b) =>
          String(
            b.item?.selectedAt ||
            ""
          ).localeCompare(
            String(
              a.item?.selectedAt ||
              ""
            )
          )
        )[0]?.key ||
      "";

    function append(item, predictionSource) {
      const raceKey = String(item?.raceKey || "");
      if (!raceKey) return;
      const cohort =
        classifySelectionCohort(
          item,
          activeGenerationKey
        );

      predictions.push({
        ...(item?.prediction || {}),
        raceKey,
        date: item?.date || "",
        jcd: item?.jcd || "",
        place: item?.place || "",
        raceNo: item?.raceNo || 0,
        savedAt: item?.selectedAt || "",
        automaticSelection: item?.selection || null,
        verificationMode: item?.verificationMode ||
          (predictionSource === "automatic" ? "selected" : "shadow"),
        scoreBand: cohort.key,
        selectionCohort:
          cohort.key,
        selectionGenerationKey:
          cohort.generationKey,
        selectionActiveCohort:
          cohort.active,
        thresholdComparable:
          cohort
            .thresholdComparable,
        predictionSource
      });

      const resultTicket = normalizeTicket(item?.result?.resultTicket);
      if (item?.result?.settled && resultTicket) {
        results.push({
          raceKey,
          date: item?.date || "",
          jcd: item?.jcd || "",
          place: item?.place || "",
          raceNo: item?.raceNo || 0,
          recordType: "official_result",
          resultSource: "boatrace-official",
          result: resultTicket,
          officialPayoutPer100: Number(item?.result?.payout || 0),
          officialPopularity: item?.result?.popularity ?? null,
          winningMethod: item?.result?.winningMethod || "",
          finishers: item?.result?.finishers || [],
          starts: item?.result?.starts || [],
          officialCheckedAt: item?.result?.settledAt || "",
          automaticResult: true,
          verificationMode: item?.verificationMode ||
            (predictionSource === "automatic" ? "selected" : "shadow"),
          scoreBand: cohort.key,
          selectionCohort:
            cohort.key,
          selectionGenerationKey:
            cohort.generationKey,
          selectionActiveCohort:
            cohort.active,
          thresholdComparable:
            cohort
              .thresholdComparable,
          automaticVerification:
            item?.result?.verification || item?.result || null
        });
      }
    }

    selectedRecords
      .forEach(item => append(item, "automatic"));

    verificationRecords
      .filter(item => !selectedRaceKeys.has(String(item?.raceKey || "")))
      .forEach(item => append(item, "automatic_shadow"));

    const runs = (Array.isArray(data?.runs) ? data.runs : []).map(run => ({ ...run }));
    const shadowV2Predictions = (
      Array.isArray(data?.shadowV2Predictions)
        ? data.shadowV2Predictions
        : []
    )
      .filter(
        item =>
          !isBoatIdentityQuarantined(
            item
          )
      )
      .map(item => ({ ...item }));

    return {
      predictions,
      results,
      runs,
      shadowV2Predictions,
      activeGenerationKey,
      selectedCount: selectedRaceKeys.size,
      shadowCount: predictions.filter(
        item => item.predictionSource === "automatic_shadow"
      ).length
    };
  }

  const SHADOW_V2_MILESTONES = Object.freeze([100, 250, 500]);

  function percentage(count, total) {
    const safeCount = Number(count);
    const safeTotal = Number(total);
    return Number.isFinite(safeCount) && safeTotal > 0
      ? Math.round((safeCount / safeTotal) * 1000) / 10
      : 0;
  }

  function buildResultHeadline(summary = {}) {
    const practicalCount = Math.max(0, Number(summary?.practicalCount) || 0);
    const practicalHits = Math.max(0, Number(summary?.practicalHits) || 0);
    const totalStake = Math.max(0, Number(summary?.totalStake) || 0);
    const totalReturn = Math.max(0, Number(summary?.totalReturn) || 0);
    const scenarioComparableCount = Math.max(
      0,
      Number(summary?.scenarioComparableCount) || 0
    );
    const scenarioHits = Math.max(0, Number(summary?.scenarioHits) || 0);

    return {
      practicalCount,
      practicalHits,
      practicalHitRate: percentage(practicalHits, practicalCount),
      totalStake,
      totalReturn,
      simulatedRecoveryRate: totalStake
        ? Math.round((totalReturn / totalStake) * 1000) / 10
        : 0,
      scenarioComparableCount,
      scenarioHits,
      scenarioMatchRate: percentage(
        scenarioHits,
        scenarioComparableCount
      )
    };
  }

  function toTimestamp(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function preferShadowV2Record(current, candidate) {
    if (!current) return candidate;

    const quality = item =>
      (item?.officialResultUsedForEvaluation === true ? -16 : 0) +
      (item?.calibrationEligible === true ? 4 : 0) +
      (item?.complete === true ? 2 : 0) +
      (item?.readiness?.allComponentsFormal === true ? 1 : 0);

    const qualityGap = quality(candidate) - quality(current);
    if (qualityGap !== 0) return qualityGap > 0 ? candidate : current;

    return toTimestamp(candidate?.capturedAt) >= toTimestamp(current?.capturedAt)
      ? candidate
      : current;
  }

  function buildShadowV2Progress(
    records,
    options = {}
  ) {
    const source = Array.isArray(records) ? records.filter(Boolean) : [];
    const officialResultRaceKeys =
      options?.officialResultRaceKeys instanceof Set
        ? options.officialResultRaceKeys
        : new Set(
            Array.isArray(options?.officialResultRaceKeys)
              ? options.officialResultRaceKeys.map(String)
              : []
          );
    const identified = source
      .filter(item => String(item?.cohortKey || ""))
      .sort((a, b) => toTimestamp(b?.capturedAt) - toTimestamp(a?.capturedAt));
    const latest = identified[0] || null;
    const cohortKey = String(latest?.cohortKey || "");
    const cohortSource = cohortKey
      ? source.filter(item => String(item?.cohortKey || "") === cohortKey)
      : [];
    const uniqueByRace = new Map();

    cohortSource.forEach(item => {
      const raceKey = String(item?.raceKey || item?.recordKey || "");
      if (!raceKey) return;
      uniqueByRace.set(
        raceKey,
        preferShadowV2Record(uniqueByRace.get(raceKey), item)
      );
    });

    const cohortRecords = Array.from(uniqueByRace.values());
    const completeCount = cohortRecords.filter(item => item?.complete === true).length;
    const calibrationRecords = cohortRecords.filter(
      item =>
        item?.calibrationEligible === true &&
        item?.officialResultUsedForEvaluation !== true
    );
    const eligibleCount = calibrationRecords.length;
    const resultJoinedCount = calibrationRecords.filter(
      item => officialResultRaceKeys.has(String(item?.raceKey || ""))
    ).length;
    const awaitingResultCount = Math.max(
      0,
      eligibleCount - resultJoinedCount
    );
    const target = SHADOW_V2_MILESTONES.at(-1);
    const nextMilestone =
      SHADOW_V2_MILESTONES.find(value => resultJoinedCount < value) || target;
    const logicFingerprint = String(
      latest?.versions?.logicFingerprint ||
      cohortKey.split(":")[0] ||
      ""
    );

    return {
      cohortKey,
      logicFingerprint,
      recordCount: cohortRecords.length,
      completeCount,
      eligibleCount,
      resultJoinedCount,
      awaitingResultCount,
      excludedCount: Math.max(0, cohortRecords.length - eligibleCount),
      target,
      nextMilestone,
      remainingToNext: Math.max(0, nextMilestone - resultJoinedCount),
      progressPercent: target
        ? Math.min(100, Math.round((resultJoinedCount / target) * 1000) / 10)
        : 0,
      milestones: SHADOW_V2_MILESTONES.map(value => ({
        value,
        reached: resultJoinedCount >= value
      }))
    };
  }

  return {
    SHADOW_V2_MILESTONES,
    normalizeTicket,
    selectionGenerationKey,
    classifySelectionCohort,
    normalizeIndex,
    buildResultHeadline,
    buildShadowV2Progress
  };
});
