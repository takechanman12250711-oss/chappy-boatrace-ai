/* =========================================================
  自動予想の履歴・結果を結果分析用へ変換
========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyAutoStats = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function normalizeTicket(value) {
    const boats = String(value || "").match(/[1-6]/g) || [];
    return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
  }

  function normalizeIndex(data) {
    const predictions = [];
    const results = [];
    const selectedRaceKeys = new Set(
      (Array.isArray(data?.predictions) ? data.predictions : [])
        .map(item => String(item?.raceKey || ""))
        .filter(Boolean)
    );

    function append(item, predictionSource) {
      const raceKey = String(item?.raceKey || "");
      if (!raceKey) return;

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
        scoreBand: item?.scoreBand ||
          (Number(item?.selection?.score || 0) >= 70 ? "70_plus" : "under_70"),
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
          scoreBand: item?.scoreBand ||
            (Number(item?.selection?.score || 0) >= 70 ? "70_plus" : "under_70"),
          automaticVerification:
            item?.result?.verification || item?.result || null
        });
      }
    }

    (Array.isArray(data?.predictions) ? data.predictions : [])
      .forEach(item => append(item, "automatic"));

    (Array.isArray(data?.verificationPredictions)
      ? data.verificationPredictions
      : [])
      .filter(item => !selectedRaceKeys.has(String(item?.raceKey || "")))
      .forEach(item => append(item, "automatic_shadow"));

    const runs = (Array.isArray(data?.runs) ? data.runs : []).map(run => ({ ...run }));
    const shadowV2Predictions = (
      Array.isArray(data?.shadowV2Predictions)
        ? data.shadowV2Predictions
        : []
    ).map(item => ({ ...item }));

    return {
      predictions,
      results,
      runs,
      shadowV2Predictions,
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

  function verificationCohortKeyOf(
    record
  ) {
    const explicit = String(
      record
        ?.verificationCohortKey || ""
    ).trim();
    if (explicit) return explicit;

    const versions =
      record?.versions || {};
    const storedCohortKey = String(
      record?.cohortKey || ""
    ).trim();
    const parts =
      storedCohortKey.split(":");
    const logicFingerprint = String(
      versions?.logicFingerprint ||
      parts[0] ||
      "local"
    );
    const referenceGenerationId =
      String(
        versions
          ?.referenceGenerationId ||
        ""
      ).trim();
    const evaluator = String(
      versions?.evaluator ||
      record?.evaluatorVersion ||
      parts[2] ||
      "unknown-evaluator"
    );
    const configHash = String(
      versions?.configHash ||
      parts[3] ||
      "unknown-config"
    );
    const prediction = String(
      versions?.prediction ||
      parts[4] ||
      "unknown-prediction"
    );
    const aiCore = String(
      versions?.aiCore ||
      parts[5] ||
      "unknown-core"
    );

    if (referenceGenerationId) {
      const stableCohort =
        storedCohortKey || [
          logicFingerprint,
          referenceGenerationId,
          evaluator,
          configHash,
          prediction,
          aiCore
        ].join(":");
      return `explicit-v1:${stableCohort}`;
    }

    return [
      "legacy-v1",
      logicFingerprint,
      evaluator,
      configHash,
      prediction,
      aiCore
    ].join(":");
  }

  function shadowV2ScoreOf(record) {
    const rawScore =
      record?.evaluation?.totalScore;
    if (
      rawScore === null ||
      rawScore === undefined ||
      rawScore === ""
    ) {
      return null;
    }
    const score = Number(rawScore);
    return Number.isFinite(score)
      ? score
      : null;
  }

  function shadowV2ScoreBandOf(
    record
  ) {
    if (
      record?.calibrationEligible !==
        true ||
      record
        ?.officialResultUsedForEvaluation ===
        true
    ) {
      return "ineligible";
    }
    const score =
      shadowV2ScoreOf(record);
    if (score === null) {
      return "ineligible";
    }
    if (score >= 70) return "70_plus";
    if (score >= 60) return "60_69";
    return "under_60";
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
      .filter(item =>
        item?.calibrationEligible ===
          true &&
        item
          ?.officialResultUsedForEvaluation !==
          true &&
        shadowV2ScoreOf(item) !== null
      )
      .map(item => ({
        ...item,
        verificationCohortKey:
          verificationCohortKeyOf(item)
      }))
      .sort((a, b) => toTimestamp(b?.capturedAt) - toTimestamp(a?.capturedAt));
    const latest = identified[0] || null;
    const verificationCohortKey =
      String(
        latest
          ?.verificationCohortKey || ""
      );
    const cohortKey = String(
      latest?.cohortKey || ""
    );
    const cohortSource =
      verificationCohortKey
      ? source
          .map(item => ({
            ...item,
            verificationCohortKey:
              verificationCohortKeyOf(
                item
              )
          }))
          .filter(
            item =>
              item
                .verificationCohortKey ===
              verificationCohortKey
          )
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
    const calibrationRecords =
      cohortRecords.filter(
      item =>
        item?.calibrationEligible === true &&
        item?.officialResultUsedForEvaluation !== true &&
        shadowV2ScoreOf(item) !== null
    );
    const verificationRecords =
      calibrationRecords.filter(
        item =>
          Number(
            shadowV2ScoreOf(item)
          ) >= 60
      );
    const referenceOnlyRecords =
      calibrationRecords.filter(
        item =>
          Number(
            shadowV2ScoreOf(item)
          ) < 60
      );
    const score70PlusRecords =
      verificationRecords.filter(
        item =>
          Number(
            shadowV2ScoreOf(item)
          ) >= 70
      );
    const score60To69Records =
      verificationRecords.filter(
        item =>
          Number(
            shadowV2ScoreOf(item)
          ) < 70
      );
    const hasJoinedResult = item =>
      item?.verificationResult
        ?.settled === true ||
      officialResultRaceKeys.has(
        String(item?.raceKey || "")
      );
    const eligibleCount =
      verificationRecords.length;
    const resultJoinedCount = verificationRecords.filter(
      hasJoinedResult
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
      verificationCohortKey
        .split(":")[1] ||
      cohortKey.split(":")[0] ||
      ""
    );

    return {
      cohortKey,
      verificationCohortKey,
      logicFingerprint,
      recordCount: cohortRecords.length,
      completeCount,
      eligibleCount,
      score70PlusCount:
        score70PlusRecords.length,
      score60To69Count:
        score60To69Records.length,
      referenceOnlyCount:
        referenceOnlyRecords.length,
      score70PlusResultJoinedCount:
        score70PlusRecords.filter(
          hasJoinedResult
        ).length,
      score60To69ResultJoinedCount:
        score60To69Records.filter(
          hasJoinedResult
        ).length,
      resultJoinedCount,
      awaitingResultCount,
      excludedCount: Math.max(
        0,
        cohortRecords.length -
          calibrationRecords.length
      ),
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
    normalizeIndex,
    buildResultHeadline,
    verificationCohortKeyOf,
    shadowV2ScoreOf,
    shadowV2ScoreBandOf,
    buildShadowV2Progress
  };
});
