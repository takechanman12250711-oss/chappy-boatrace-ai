/* =========================================================
  100Rごとの精度検証・改善提案

  同一世代・締切前・完成入力・公式結果確定済みだけを使う。
  提案を返すだけで、予想ロジック・重み・印・買い目は変更しない。
========================================================= */

(function (root, factory) {
  const calibration =
    typeof module === "object" && module.exports
      ? require("./prediction-calibration")
      : root?.ChappyPredictionCalibration;
  const verification =
    typeof module === "object" && module.exports
      ? require("./prediction-verification")
      : root?.ChappyPredictionVerification;
  const readiness =
    typeof module === "object" && module.exports
      ? require("./verification-readiness")
      : root?.ChappyVerificationReadiness;
  const suggestions =
    typeof module === "object" && module.exports
      ? require("./improvement-suggestions")
      : root?.ChappyImprovementSuggestions;
  const api = factory(
    calibration,
    verification,
    readiness,
    suggestions
  );

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ChappyImprovementReview = api;
  }
})(
  typeof window !== "undefined" ? window : globalThis,
  function (
    Calibration,
    Verification,
    Readiness,
    Suggestions
  ) {
    "use strict";

    const SCHEMA_VERSION = 1;
    const TARGET =
      "same-generation-complete-100-race-review-v1";
    const REVIEW_SIZE = 100;
    const MAX_REPORTS = 1;
    const MAX_HISTORY = 20;
    const MIN_COMPARISON_SAMPLE = 30;
    const MAX_EXCLUSION_EXAMPLES_PER_REASON =
      3;

    function reviewGenerationKey(
      predictionGenerationKey,
      selectorCohortKey,
      theorySetFingerprint,
      selectionThreshold
    ) {
      const predictionKey =
        String(
          predictionGenerationKey ||
          ""
        );
      const selectorKey =
        String(
          selectorCohortKey ||
          ""
        );
      const theoryKey =
        String(
          theorySetFingerprint ||
          ""
        );
      const threshold =
        Number(selectionThreshold);
      const thresholdKey =
        Number.isFinite(threshold)
          ? String(threshold)
          : "";
      return (
        predictionKey &&
        selectorKey &&
        theoryKey &&
        thresholdKey
      )
        ? JSON.stringify([
            predictionKey,
            selectorKey,
            theoryKey,
            thresholdKey
          ])
        : "";
    }

    function percentage(count, total) {
      const safeCount = Number(count);
      const safeTotal = Number(total);
      return Number.isFinite(safeCount) && safeTotal > 0
        ? Math.round(
            safeCount /
            safeTotal *
            1000
          ) / 10
        : 0;
    }

    function money(value) {
      const number = Number(value);
      return Number.isFinite(number)
        ? Math.round(number)
        : 0;
    }

    function resultOf(record) {
      return (
        record?.result ||
        record?.officialResult ||
        null
      );
    }

    function verificationOf(record) {
      const result = resultOf(record);
      return (
        result?.verification ||
        result?.automaticVerification ||
        result ||
        null
      );
    }

    function evidenceOf(record) {
      const prediction =
        record?.prediction || {};
      return (
        prediction
          .verificationEvidence ||
        prediction
          .practicalSelection
          ?.verificationEvidence ||
        null
      );
    }

    function raceKeyOf(record) {
      const direct =
        String(
          record?.raceKey || ""
        ).trim();
      if (direct) return direct;

      const date =
        String(record?.date || "")
          .replace(/\D/g, "");
      const jcd =
        String(record?.jcd || "")
          .padStart(2, "0");
      const raceNo =
        Number(record?.raceNo || 0);

      return (
        date.length === 8 &&
        /^\d{2}$/.test(jcd) &&
        raceNo >= 1 &&
        raceNo <= 12
      )
        ? `${date}-${jcd}-${raceNo}`
        : "";
    }

    function confirmedPreDeadline(record) {
      const selectedAt = [
        record?.selectedAt,
        record?.capturedAt
      ]
        .map(value =>
          Date.parse(value || "")
        )
        .find(Number.isFinite);
      const deadlineAt =
        Date.parse(
          record?.deadlineAt || ""
        );

      if (
        Number.isFinite(selectedAt) &&
        Number.isFinite(deadlineAt)
      ) {
        return selectedAt < deadlineAt;
      }

      const timing =
        record?.timing ||
        record?.prediction?.timing ||
        {};
      return (
        timing.beforeDeadline === true ||
        timing.preDeadline === true
      );
    }

    function scenarioStatus(record) {
      const detail =
        verificationOf(record);
      return String(
        detail
          ?.scenarioVerification
          ?.status ||
        ""
      );
    }

    function selectedAssessment(record) {
      const result =
        resultOf(record);
      if (
        !result ||
        result.settled !== true
      ) {
        return {
          eligible: false,
          reason: "notSettled"
        };
      }

      const evidence =
        evidenceOf(record);
      if (
        Number(
          evidence
            ?.roleSchemaVersion || 0
        ) < 1 ||
        Number(
          evidence
            ?.theorySchemaVersion || 0
        ) < 1
      ) {
        return {
          eligible: false,
          reason: "legacySchema"
        };
      }
      const theorySetFingerprint =
        String(
          evidence
            ?.theorySetFingerprint ||
          ""
        ).trim();
      if (!theorySetFingerprint) {
        return {
          eligible: false,
          reason:
            "missingTheorySetFingerprint"
        };
      }

      if (
        Calibration
          ?.isRetrospectiveRecord?.(
            record
          )
      ) {
        return {
          eligible: false,
          reason:
            "retrospectiveReference"
        };
      }

      if (
        Calibration
          ?.officialResultWasUsed?.(
            record
          ) ||
        record?.shadowV2
          ?.officialResultUsedForEvaluation ===
          true
      ) {
        return {
          eligible: false,
          reason:
            "officialResultLeakage"
        };
      }

      const selection =
        record?.selection || {};
      if (
        selection.evaluator !==
          "shadow-selection-v2"
      ) {
        return {
          eligible: false,
          reason:
            "unsupportedEvaluator"
        };
      }

      const shadowV2 =
        record?.shadowV2 || {};
      if (
        shadowV2.complete !== true ||
        shadowV2
          .calibrationEligible !==
          true ||
        String(
          shadowV2.status || ""
        )
          .trim()
          .toLowerCase() !== "ready"
      ) {
        return {
          eligible: false,
          reason:
            "incompleteShadowV2"
        };
      }

      const verificationMode =
        String(
          record
            ?.verificationMode || ""
        )
          .trim()
          .toLowerCase();
      const predictionMode =
        String(
          record
            ?.prediction
            ?.predictionMode || ""
        )
          .trim()
          .toLowerCase();
      if (
        verificationMode !==
          "selected" ||
        predictionMode !==
          "server_pre_deadline"
      ) {
        return {
          eligible: false,
          reason:
            "unsupportedCohort"
        };
      }

      if (
        selection.ready !== true ||
        selection.qualified !== true ||
        selection.selected !== true ||
        String(
          selection.status || ""
        )
          .trim()
          .toLowerCase() !== "ready"
      ) {
        return {
          eligible: false,
          reason: "incompleteInput"
        };
      }

      if (
        !confirmedPreDeadline(record)
      ) {
        return {
          eligible: false,
          reason:
            "preDeadlineUnconfirmed"
        };
      }

      const raceKey =
        raceKeyOf(record);
      if (!raceKey) {
        return {
          eligible: false,
          reason: "missingRaceKey"
        };
      }

      const generation =
        Calibration
          ?.normalizeGeneration?.(
            evidence?.generation
          ) || {};
      const generationKey =
        Calibration
          ?.generationKey?.(
            generation
          ) || "";
      if (!generationKey) {
        return {
          eligible: false,
          reason: "missingGeneration"
        };
      }
      const selectorCohortKey =
        String(
          shadowV2
            ?.cohortKey || ""
        );
      if (!selectorCohortKey) {
        return {
          eligible: false,
          reason:
            "missingSelectorCohort"
        };
      }
      const selectionThreshold =
        Number(selection.threshold);
      if (
        !Number.isFinite(
          selectionThreshold
        )
      ) {
        return {
          eligible: false,
          reason:
            "invalidSelectionDecision"
        };
      }
      const combinedGenerationKey =
        reviewGenerationKey(
          generationKey,
          selectorCohortKey,
          theorySetFingerprint,
          selectionThreshold
        );

      const internalMode =
        Calibration
          ?.normalizeMode?.(
            record
              ?.prediction
              ?.internalEvaluation
              ?.mode
          ) || "";
      if (!internalMode) {
        return {
          eligible: false,
          reason: "missingMode"
        };
      }

      const status =
        scenarioStatus(record);
      const scenarioComparable =
        status === "matched" ||
        status === "missed";

      const selectionScore =
        Number(selection.score);
      if (
        !Number.isFinite(selectionScore) ||
        selectionScore <
          selectionThreshold
      ) {
        return {
          eligible: false,
          reason:
            "invalidSelectionDecision"
        };
      }

      return {
        eligible: true,
        sample: {
          raceKey,
          generation,
          predictionGenerationKey:
            generationKey,
          selectorCohortKey,
          theorySetFingerprint,
          selectionThreshold,
          generationKey:
            combinedGenerationKey,
          mode:
            internalMode,
          cohort: "selected",
          selected: true,
          selectionScore,
          scenarioComparable,
          matched:
            status === "matched"
        }
      };
    }

    function shadowAssessment(record) {
      const result =
        resultOf(record);
      if (
        !result ||
        result.settled !== true
      ) {
        return {
          eligible: false,
          reason: "notSettled"
        };
      }

      const evidence =
        evidenceOf(record);
      if (
        Number(
          evidence
            ?.roleSchemaVersion || 0
        ) < 1 ||
        Number(
          evidence
            ?.theorySchemaVersion || 0
        ) < 1
      ) {
        return {
          eligible: false,
          reason: "legacySchema"
        };
      }
      const theorySetFingerprint =
        String(
          evidence
            ?.theorySetFingerprint ||
          ""
        ).trim();
      if (!theorySetFingerprint) {
        return {
          eligible: false,
          reason:
            "missingTheorySetFingerprint"
        };
      }

      if (
        Calibration
          ?.isRetrospectiveRecord?.(
            record
          )
      ) {
        return {
          eligible: false,
          reason:
            "retrospectiveReference"
        };
      }

      if (
        Calibration
          ?.officialResultWasUsed?.(
            record
          ) ||
        record?.shadowV2
          ?.officialResultUsedForEvaluation ===
          true
      ) {
        return {
          eligible: false,
          reason:
            "officialResultLeakage"
        };
      }

      const verificationMode =
        String(
          record
            ?.verificationMode || ""
        )
          .trim()
          .toLowerCase();
      const predictionMode =
        String(
          record
            ?.prediction
            ?.predictionMode || ""
        )
          .trim()
          .toLowerCase();
      const selection =
        record?.selection || {};

      if (
        selection.evaluator !==
          "shadow-selection-v2"
      ) {
        return {
          eligible: false,
          reason:
            "unsupportedEvaluator"
        };
      }

      const shadowV2 =
        record?.shadowV2 || {};
      if (
        shadowV2.complete !== true ||
        shadowV2
          .calibrationEligible !==
          true ||
        String(
          shadowV2.status || ""
        )
          .trim()
          .toLowerCase() !== "ready"
      ) {
        return {
          eligible: false,
          reason:
            "incompleteShadowV2"
        };
      }

      if (
        verificationMode !== "shadow" ||
        predictionMode !==
          "server_pre_deadline_shadow"
      ) {
        return {
          eligible: false,
          reason:
            "unsupportedCohort"
        };
      }

      if (
        selection.ready !== true ||
        selection.selected === true ||
        String(
          selection.status || ""
        )
          .trim()
          .toLowerCase() !== "ready"
      ) {
        return {
          eligible: false,
          reason: "incompleteInput"
        };
      }

      if (
        !confirmedPreDeadline(record)
      ) {
        return {
          eligible: false,
          reason:
            "preDeadlineUnconfirmed"
        };
      }

      const raceKey =
        raceKeyOf(record);
      if (!raceKey) {
        return {
          eligible: false,
          reason: "missingRaceKey"
        };
      }

      const generation =
        Calibration
          ?.normalizeGeneration?.(
            evidence?.generation
          ) || {};
      const generationKey =
        Calibration
          ?.generationKey?.(
            generation
          ) || "";
      if (!generationKey) {
        return {
          eligible: false,
          reason: "missingGeneration"
        };
      }
      const selectorCohortKey =
        String(
          shadowV2
            ?.cohortKey || ""
        );
      if (!selectorCohortKey) {
        return {
          eligible: false,
          reason:
            "missingSelectorCohort"
        };
      }
      const selectionThreshold =
        Number(selection.threshold);
      if (
        !Number.isFinite(
          selectionThreshold
        )
      ) {
        return {
          eligible: false,
          reason:
            "invalidSelectionDecision"
        };
      }
      const combinedGenerationKey =
        reviewGenerationKey(
          generationKey,
          selectorCohortKey,
          theorySetFingerprint,
          selectionThreshold
        );

      const internalMode =
        Calibration
          ?.normalizeMode?.(
            record
              ?.prediction
              ?.internalEvaluation
              ?.mode
          ) || "";
      if (!internalMode) {
        return {
          eligible: false,
          reason: "missingMode"
        };
      }

      const status =
        scenarioStatus(record);
      const scenarioComparable =
        status === "matched" ||
        status === "missed";

      const selectionScore =
        Number(selection.score);
      if (
        !Number.isFinite(
          selectionScore
        )
      ) {
        return {
          eligible: false,
          reason:
            "missingSelectionScore"
        };
      }

      return {
        eligible: true,
        sample: {
          raceKey,
          generation,
          predictionGenerationKey:
            generationKey,
          selectorCohortKey,
          theorySetFingerprint,
          selectionThreshold,
          generationKey:
            combinedGenerationKey,
          cohort: "shadow",
          selected: false,
          selectionScore,
          scenarioComparable,
          matched:
            status === "matched"
        }
      };
    }

    function assessReviewRecord(record) {
      const mode =
        String(
          record
            ?.verificationMode || ""
        )
          .trim()
          .toLowerCase();

      return mode === "selected"
        ? selectedAssessment(record)
        : shadowAssessment(record);
    }

    function createExclusions() {
      return {
        notSettled: 0,
        legacySchema: 0,
        retrospectiveReference: 0,
        officialResultLeakage: 0,
        calibrationUnavailable: 0,
        unsupportedCohort: 0,
        incompleteInput: 0,
        preDeadlineUnconfirmed: 0,
        missingRaceKey: 0,
        missingGeneration: 0,
        missingSelectorCohort: 0,
        missingTheorySetFingerprint:
          0,
        missingMode: 0,
        unsupportedEvaluator: 0,
        incompleteShadowV2: 0,
        scenarioNotComparable: 0,
        missingSelectionScore: 0,
        invalidSelectionDecision:
          0,
        duplicateRace: 0,
        nonActiveGeneration: 0
      };
    }

    function recordTimestamp(record) {
      return [
        record?.selectedAt,
        record?.capturedAt,
        record?.deadlineAt,
        record?.result?.settledAt
      ]
        .map(value =>
          Date.parse(value || "")
        )
        .find(Number.isFinite) || 0;
    }

    function preferSample(current, candidate) {
      if (!current) return candidate;
      return (
        recordTimestamp(
          candidate.record
        ) >=
        recordTimestamp(
          current.record
        )
      )
        ? candidate
        : current;
    }

    function collectSamples(
      records,
      options = {}
    ) {
      const source =
        Array.isArray(records)
          ? records.filter(Boolean)
          : [];
      const activeGeneration =
        Calibration
          ?.normalizeGeneration?.(
            options.activeGeneration ||
            Calibration
              ?.DEFAULT_GENERATION
          ) || {};
      const activeGenerationKey =
        Calibration
          ?.generationKey?.(
            activeGeneration
          ) || "";
      const inferredSelectorCohortKey =
        source
          .map(record => ({
            key:
              String(
                record
                  ?.shadowV2
                  ?.cohortKey || ""
              ),
            timestamp:
              recordTimestamp(
                record
              )
          }))
          .filter(row =>
            row.key
          )
          .sort(
            (left, right) =>
              right.timestamp -
              left.timestamp
          )[0]?.key ||
        "";
      const activeSelectorCohortKey =
        String(
          options
            .activeSelectorCohortKey ||
          inferredSelectorCohortKey
        );
      const inferredTheorySetFingerprint =
        source
          .map(record => ({
            key:
              String(
                evidenceOf(record)
                  ?.theorySetFingerprint ||
                ""
              ),
            timestamp:
              recordTimestamp(record)
          }))
          .filter(row =>
            row.key
          )
          .sort(
            (left, right) =>
              right.timestamp -
              left.timestamp
          )[0]?.key ||
        "";
      const activeTheorySetFingerprint =
        String(
          options
            .activeTheorySetFingerprint ||
          inferredTheorySetFingerprint
        );
      const inferredSelectionThreshold =
        source
          .map(record => ({
            value:
              Number(
                record
                  ?.selection
                  ?.threshold
              ),
            timestamp:
              recordTimestamp(record)
          }))
          .filter(row =>
            Number.isFinite(
              row.value
            )
          )
          .sort(
            (left, right) =>
              right.timestamp -
              left.timestamp
          )[0]?.value;
      const activeSelectionThreshold =
        Number(
          options
            .activeSelectionThreshold ??
          inferredSelectionThreshold
        );
      const activeReviewGenerationKey =
        reviewGenerationKey(
          activeGenerationKey,
          activeSelectorCohortKey,
          activeTheorySetFingerprint,
          activeSelectionThreshold
        );
      const exclusions =
        createExclusions();
      const exclusionExamples =
        {};
      const selectedByRace =
        new Map();
      const shadowByRace =
        new Map();
      const addExclusion = (
        reason,
        record,
        fallbackRaceKey = ""
      ) => {
        const code =
          String(
            reason ||
            "unsupportedCohort"
          );
        exclusions[code] =
          Number(
            exclusions[code] || 0
          ) + 1;

        const representativeRaceKey =
          raceKeyOf(record) ||
          String(
            fallbackRaceKey ||
            record?.raceKey ||
            ""
          ).trim();
        if (!representativeRaceKey) {
          return;
        }

        const examples =
          Array.isArray(
            exclusionExamples[code]
          )
            ? exclusionExamples[code]
            : [];
        if (
          examples.includes(
            representativeRaceKey
          ) ||
          examples.length >=
            MAX_EXCLUSION_EXAMPLES_PER_REASON
        ) {
          return;
        }

        exclusionExamples[code] = [
          ...examples,
          representativeRaceKey
        ];
      };

      source.forEach(record => {
        const assessment =
          assessReviewRecord(record);

        if (!assessment.eligible) {
          addExclusion(
            assessment.reason,
            record
          );
          return;
        }

        if (
          assessment
            .sample
            .generationKey !==
          activeReviewGenerationKey
        ) {
          addExclusion(
            "nonActiveGeneration",
            record,
            assessment
              .sample
              .raceKey
          );
          return;
        }

        const raceKey =
          assessment.sample.raceKey;
        const candidate = {
          sample:
            assessment.sample,
          record
        };
        const target =
          assessment.sample.selected
            ? selectedByRace
            : shadowByRace;
        const existing =
          target.get(raceKey);
        if (existing) {
          addExclusion(
            "duplicateRace",
            record,
            raceKey
          );
        }
        target.set(
          raceKey,
          preferSample(
            existing,
            candidate
          )
        );
      });

      const sortRows = rows =>
        Array.from(
          rows.values()
        )
          .sort((a, b) =>
            recordTimestamp(a.record) -
              recordTimestamp(b.record) ||
            a.sample.raceKey.localeCompare(
              b.sample.raceKey,
              "ja",
              { numeric: true }
            )
          );
      const samples =
        sortRows(selectedByRace);
      const shadowSamples =
        sortRows(shadowByRace)
          .filter(row =>
            !selectedByRace.has(
              row.sample.raceKey
            )
          );

      return {
        activeGeneration,
        activePredictionGenerationKey:
          activeGenerationKey,
        activeSelectorCohortKey,
        activeTheorySetFingerprint,
        activeSelectionThreshold:
          Number.isFinite(
            activeSelectionThreshold
          )
            ? activeSelectionThreshold
            : null,
        activeGenerationKey:
          activeReviewGenerationKey,
        sourceCount:
          source.length,
        exclusions,
        exclusionExamples,
        samples,
        shadowSamples
      };
    }

    function scenarioMatched(row) {
      return (
        row?.sample?.matched ===
          true ||
        scenarioStatus(
          row.record
        ) === "matched"
      );
    }

    function scenarioComparable(
      row
    ) {
      if (
        typeof row?.sample
          ?.scenarioComparable ===
          "boolean"
      ) {
        return row.sample
          .scenarioComparable;
      }
      const status =
        scenarioStatus(row.record);
      return (
        status === "matched" ||
        status === "missed"
      );
    }

    function groupAccuracy(
      rows,
      getLabel
    ) {
      const groups =
        new Map();

      rows
        .filter(
          scenarioComparable
        )
        .forEach(row => {
        const label =
          String(
            getLabel(row) ||
            "不明"
          );
        if (!groups.has(label)) {
          groups.set(label, {
            label,
            attempts: 0,
            matched: 0
          });
        }
        const group =
          groups.get(label);
        group.attempts += 1;
        if (scenarioMatched(row)) {
          group.matched += 1;
        }
      });

      return Array.from(
        groups.values()
      )
        .map(group => ({
          ...group,
          matchRate:
            percentage(
              group.matched,
              group.attempts
            )
        }))
        .sort((a, b) =>
          b.attempts -
            a.attempts ||
          a.label.localeCompare(
            b.label,
            "ja"
          )
        );
    }

    function normalizeRoleRows(
      summary
    ) {
      return (
        Array.isArray(
          summary?.roleSummary
        )
          ? summary.roleSummary
          : []
      )
        .filter(
          row =>
            Number(
              row?.attempts || 0
            ) > 0
        )
        .map(row => ({
          key:
            String(row?.key || ""),
          label:
            String(
              row?.label ||
              row?.key ||
              "役割"
            ),
          attempts:
            Number(
              row?.attempts || 0
            ),
          matched:
            Number(
              row?.matched || 0
            ),
          top3:
            Number(
              row?.top3 || 0
            ),
          matchRate:
            percentage(
              row?.matched,
              row?.attempts
            ),
          top3Rate:
            percentage(
              row?.top3,
              row?.attempts
            )
        }));
    }

    function normalizeTicketRows(
      summary
    ) {
      return (
        Array.isArray(
          summary
            ?.ticketCategorySummary
        )
          ? summary
              .ticketCategorySummary
          : []
      )
        .filter(
          row =>
            Number(
              row?.attempts || 0
            ) > 0
        )
        .map(row => ({
          label:
            String(
              row?.label ||
              "買い目区分"
            ),
          attempts:
            Number(
              row?.attempts || 0
            ),
          matched:
            Number(
              row?.matched || 0
            ),
          matchRate:
            percentage(
              row?.matched,
              row?.attempts
            )
        }));
    }

    function buildScoreBands(rows) {
      const definitions =
        Readiness?.SCORE_BANDS || [];

      return definitions.map(
        definition => {
          const bandRows =
            rows.filter(row =>
              Readiness
                ?.findScoreBand?.(
                  row
                    .sample
                    .selectionScore
                )
                ?.key ===
              definition.key
            );
          const comparableRows =
            bandRows.filter(
              scenarioComparable
            );
          const selectedCount =
            comparableRows.filter(
              row =>
                row.sample.selected
            ).length;
          const matched =
            comparableRows.filter(
              scenarioMatched
            ).length;

          return {
            key: definition.key,
            label:
              definition.label,
            count:
              comparableRows.length,
            totalCount:
              bandRows.length,
            selectedCount,
            shadowCount:
              comparableRows.length -
              selectedCount,
            matched,
            scenarioMatchRate:
              percentage(
                matched,
                comparableRows.length
              )
          };
        }
      );
    }

    function missTypeSummary(
      details
    ) {
      const labels = [
        "的中",
        "頭外れ",
        "相手抜け",
        "着順違い",
        "完全抜け"
      ];

      return labels.map(label => {
        const count =
          details.filter(
            detail =>
              detail?.missType ===
              label
          ).length;
        return {
          label,
          count,
          percentage:
            percentage(
              count,
              details.length
            )
        };
      });
    }

    function theoryGroups(
      summary
    ) {
      const misses =
        Math.max(
          0,
          Number(
            summary
              ?.practicalCount || 0
          ) -
          Number(
            summary
              ?.practicalHits || 0
          )
        );

      return (
        Array.isArray(
          summary
            ?.priorityStageSummary
        )
          ? summary
              .priorityStageSummary
          : []
      )
        .filter(
          row =>
            Number(
              row?.count || 0
            ) > 0
        )
        .map(row => ({
          label:
            String(
              row?.label ||
              "判定段階不明"
            ),
          count:
            Number(
              row?.count || 0
            ),
          percentage:
            percentage(
              row?.count,
              misses
            )
        }));
    }

    function cohortAccuracy(rows) {
      const comparableRows =
        rows.filter(
          scenarioComparable
        );
      const matched =
        comparableRows.filter(
          scenarioMatched
        ).length;
      return {
        count:
          comparableRows.length,
        totalCount:
          rows.length,
        matched,
        scenarioMatchRate:
          percentage(
            matched,
            comparableRows.length
          )
      };
    }

    function buildMetrics(
      rows,
      comparisonShadowRows = []
    ) {
      const selectedRows =
        Array.isArray(rows)
          ? rows
          : [];
      const shadowRows =
        Array.isArray(
          comparisonShadowRows
        )
          ? comparisonShadowRows
          : [];
      const allDetails =
        selectedRows
          .map(row =>
            verificationOf(
              row.record
            )
          )
          .filter(Boolean);
      const selectedDetails =
        allDetails;
      const allSummary =
        Verification?.buildSummary
          ? Verification.buildSummary(
              allDetails
            )
          : {};
      const selectedSummary =
        Verification?.buildSummary
          ? Verification.buildSummary(
              selectedDetails
            )
          : {};
      const selectedAccuracy =
        cohortAccuracy(selectedRows);
      const shadowAccuracy =
        cohortAccuracy(shadowRows);
      const comparisonReady =
        selectedAccuracy.count >=
          MIN_COMPARISON_SAMPLE &&
        shadowAccuracy.count >=
          MIN_COMPARISON_SAMPLE;
      const totalStake =
        money(
          selectedSummary
            ?.totalStake
        );
      const totalReturn =
        money(
          selectedSummary
            ?.totalReturn
        );
      const practicalCount =
        Number(
          selectedSummary
            ?.practicalCount || 0
        );
      const practicalHits =
        Number(
          selectedSummary
            ?.practicalHits || 0
        );

      return {
        accuracy: {
          count:
            selectedRows.length,
          scenarioComparable:
            selectedRows.filter(
              scenarioComparable
            ).length,
          scenarioMatched:
            selectedRows.filter(
              scenarioMatched
            ).length,
          scenarioMatchRate:
            percentage(
              selectedRows.filter(
                scenarioMatched
              ).length,
              selectedRows.filter(
                scenarioComparable
              ).length
            ),
          roles:
            normalizeRoleRows(
              allSummary
            ),
          scoreBands:
            buildScoreBands([
              ...selectedRows,
              ...shadowRows
            ])
        },
        selectionComparison: {
          ready:
            comparisonReady,
          minimumPerCohort:
            MIN_COMPARISON_SAMPLE,
          selected:
            selectedAccuracy,
          shadow:
            shadowAccuracy,
          difference:
            comparisonReady
              ? Math.round(
                  (
                    selectedAccuracy
                      .scenarioMatchRate -
                    shadowAccuracy
                      .scenarioMatchRate
                  ) * 10
                ) / 10
              : null
        },
        selectedPerformance: {
          count:
            selectedRows.length,
          practicalCount,
          practicalHits,
          hitRate:
            percentage(
              practicalHits,
              practicalCount
            ),
          totalStake,
          totalReturn,
          profit:
            totalReturn -
            totalStake,
          recoveryRate:
            totalStake > 0
              ? Math.round(
                  totalReturn /
                  totalStake *
                  1000
                ) / 10
              : null,
          ticketCategories:
            normalizeTicketRows(
              selectedSummary
            ),
          roleSupportPerformance:
            Array.isArray(
              selectedSummary
                ?.rolePerformanceSummary
            )
              ? selectedSummary
                  .rolePerformanceSummary
              : [],
          theorySupportPerformance:
            selectedSummary
              ?.theoryPerformanceSummary ||
            {
              status:
                "collecting_pre_race_attribution",
              rows: []
            },
          misses:
            missTypeSummary(
              selectedDetails
            ),
          theoryStages:
            theoryGroups(
              selectedSummary
            )
        },
        venueGroups:
          groupAccuracy(
            selectedRows,
            row =>
              row.record?.place ||
              `場コード${
                row.record?.jcd || ""
              }`
          ),
        scenarioGroups:
          groupAccuracy(
            selectedRows,
            row =>
              verificationOf(
                row.record
              )?.scenarioTitle ||
              row.record
                ?.prediction
                ?.raceFlow
                ?.title ||
              "不明"
          )
      };
    }

    function hashText(value) {
      let hash = 2166136261;
      const text =
        String(value || "");
      for (
        let index = 0;
        index < text.length;
        index += 1
      ) {
        hash ^=
          text.charCodeAt(index);
        hash = Math.imul(
          hash,
          16777619
        );
      }
      return (
        hash >>> 0
      )
        .toString(16)
        .padStart(8, "0");
    }

    function proposalOnly(value) {
      return {
        ...(value || {}),
        action: "proposal_only",
        approvalRequired: true,
        autoApply: false,
        applicationLock: true,
        decision: "pending",
        applied: false
      };
    }

    function buildReport(
      reviewNo,
      windowRows,
      windowShadowRows,
      cumulativeRows,
      cumulativeShadowRows,
      activeGenerationKey
    ) {
      const first =
        windowRows[0];
      const last =
        windowRows.at(-1);
      const windowMetrics =
        buildMetrics(
          windowRows,
          windowShadowRows
        );
      const cumulativeMetrics =
        buildMetrics(
          cumulativeRows,
          cumulativeShadowRows
        );
      const selected =
        windowMetrics
          .selectedPerformance;
      const suggestionResult =
        Suggestions
          ?.buildImprovementSuggestions
          ? Suggestions
              .buildImprovementSuggestions({
                reviewCount:
                  windowRows.length,
                settledCount:
                  windowRows.length,
                practicalCount:
                  selected
                    .practicalCount,
                practicalHits:
                  selected
                    .practicalHits,
                selectedCount:
                  selected.count,
                recoveryRate:
                  selected
                    .recoveryRate,
                sampleLabel:
                  "今回の同一世代・完成入力100R・",
                venueGroups:
                  windowMetrics
                    .venueGroups,
                scenarioGroups:
                  windowMetrics
                    .scenarioGroups,
                missTypeSummary:
                  selected.misses,
                roleGroups:
                  windowMetrics
                    .accuracy.roles,
                theoryGroups:
                  selected
                    .theoryStages,
                selectionComparison:
                  windowMetrics
                    .selectionComparison
              })
          : {
              suggestions: []
            };
      return {
        batchId:
          `review-${reviewNo}-` +
          hashText(
            [
              activeGenerationKey,
              reviewNo,
              ...windowRows.map(
                row =>
                  row.sample
                    .raceKey
              ),
              "proposal-rules-v1"
            ].join("|")
          ),
        generationKey:
          activeGenerationKey,
        reviewNo,
        milestone:
          reviewNo * REVIEW_SIZE,
        proposalBasis:
          "latest-100-race-window",
        range: {
          fromRace:
            (
              reviewNo - 1
            ) * REVIEW_SIZE + 1,
          toRace:
            reviewNo *
            REVIEW_SIZE,
          firstRaceKey:
            first?.sample
              ?.raceKey || "",
          lastRaceKey:
            last?.sample
              ?.raceKey || ""
        },
        window:
          windowMetrics,
        cumulative:
          cumulativeMetrics,
        proposals:
          (
            suggestionResult
              .suggestions || []
          ).map(proposalOnly),
        status:
          suggestionResult
            .suggestions
            ?.length
            ? "approval_required"
            : "no_change_proposed",
        action: "proposal_only",
        approvalRequired: true,
        autoApply: false,
        applicationLock: true,
        decision: "pending",
        applied: false,
        automaticApplication:
          false
      };
    }

    function buildImprovementReview(
      records,
      options = {}
    ) {
      const collected =
        collectSamples(
          records,
          options
        );
      const samples =
        collected.samples;
      const shadowSamples =
        collected.shadowSamples;
      const completedReviewCount =
        Math.floor(
          samples.length /
          REVIEW_SIZE
        );
      const reports = [];

      for (
        let reviewNo = 1;
        reviewNo <=
          completedReviewCount;
        reviewNo += 1
      ) {
        const end =
          reviewNo *
          REVIEW_SIZE;
        const cumulativeRows =
          samples.slice(0, end);
        const lastTimestamp =
          recordTimestamp(
            cumulativeRows
              .at(-1)
              ?.record
          );
        const cumulativeShadowRows =
          shadowSamples.filter(
            row =>
              recordTimestamp(
                row.record
              ) <=
              lastTimestamp
          );
        const previousTimestamp =
          reviewNo === 1
            ? Number
                .NEGATIVE_INFINITY
            : recordTimestamp(
                samples[
                  end -
                  REVIEW_SIZE -
                  1
                ]?.record
              );
        const windowShadowRows =
          cumulativeShadowRows.filter(
            row =>
              recordTimestamp(
                row.record
              ) >
              previousTimestamp
          );
        reports.push(
          buildReport(
            reviewNo,
            samples.slice(
              end -
              REVIEW_SIZE,
              end
            ),
            windowShadowRows,
            cumulativeRows,
            cumulativeShadowRows,
            collected
              .activeGenerationKey
          )
        );
      }

      const currentWindowCount =
        samples.length %
        REVIEW_SIZE;
      const nextReviewAt =
        (
          completedReviewCount + 1
        ) * REVIEW_SIZE;
      const reportHistory =
        reports
          .map(report => {
            const proposals =
              Array.isArray(
                report.proposals
              )
                ? report.proposals
                : [];

            return {
              batchId:
                report.batchId,
              generationKey:
                report.generationKey,
              reviewNo:
                report.reviewNo,
              milestone:
                report.milestone,
              range:
                report.range,
              proposalBasis:
                report
                  .proposalBasis,
              status:
                report.status,
              action:
                report.action,
              approvalRequired:
                report
                  .approvalRequired,
              autoApply:
                report.autoApply,
              applicationLock:
                report
                  .applicationLock,
              decision:
                report.decision,
              applied:
                report.applied,
              proposalCount:
                proposals.length,
              proposalTargets:
                proposals.map(
                  proposal => ({
                    category:
                      String(
                        proposal
                          ?.category ||
                        ""
                      ),
                    target:
                      String(
                        proposal
                          ?.target ||
                        ""
                      ),
                    priority:
                      String(
                        proposal
                          ?.priority ||
                        ""
                      )
                  })
                ),
              proposalDigest:
                hashText(
                  JSON.stringify(
                    proposals
                  )
                ),
              archivePath:
                `improvement-reviews/${report.batchId}.json`
            };
          })
          .slice(-MAX_HISTORY);

      return {
        schemaVersion:
          SCHEMA_VERSION,
        target:
          TARGET,
        action: "proposal_only",
        approvalRequired: true,
        autoApply: false,
        applicationLock: true,
        decision: "pending",
        applied: false,
        generatedAt:
          options.generatedAt ||
          new Date().toISOString(),
        reviewSize:
          REVIEW_SIZE,
        activeGeneration:
          collected
            .activeGeneration,
        activePredictionGenerationKey:
          collected
            .activePredictionGenerationKey,
        activeSelectorCohortKey:
          collected
            .activeSelectorCohortKey,
        activeTheorySetFingerprint:
          collected
            .activeTheorySetFingerprint,
        activeSelectionThreshold:
          collected
            .activeSelectionThreshold,
        activeGenerationKey:
          collected
            .activeGenerationKey,
        source: {
          recordCount:
            collected.sourceCount,
          eligibleCount:
            samples.length,
          selectedCount:
            samples.length,
          shadowCount:
            shadowSamples.length,
          excluded:
            collected.exclusions,
          excludedExamples:
            collected
              .exclusionExamples
        },
        progress: {
          completedReviewCount,
          currentWindowCount,
          remainingToNext:
            REVIEW_SIZE -
            currentWindowCount,
          nextReviewAt
        },
        reportRetention: {
          detailedLatest:
            MAX_REPORTS,
          history:
            "latest_milestones_metadata",
          historyLatest:
            MAX_HISTORY,
          proposalArchives:
            "all_milestones_full_reports",
          sourceRebuildable:
            true
        },
        reportHistory,
        reports:
          reports.slice(
            -MAX_REPORTS
          ),
        ...(
          options
            .includeArchiveReports ===
          true
            ? {
                archiveReports:
                  reports
              }
            : {}
        ),
        safety: {
          action: "proposal_only",
          proposalOnly: true,
          autoApply: false,
          automaticApplication:
            false,
          approvalRequired: true,
          applicationLock: true,
          decision: "pending",
          applied: false,
          predictionLogicChanged:
            false,
          ticketSelectionChanged:
            false
        }
      };
    }

    return {
      SCHEMA_VERSION,
      TARGET,
      REVIEW_SIZE,
      MAX_REPORTS,
      MAX_HISTORY,
      MIN_COMPARISON_SAMPLE,
      MAX_EXCLUSION_EXAMPLES_PER_REASON,
      reviewGenerationKey,
      assessReviewRecord,
      collectSamples,
      buildMetrics,
      proposalOnly,
      buildImprovementReview
    };
  }
);
