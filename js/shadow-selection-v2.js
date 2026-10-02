/* =========================================================
  自動選定V2 8項目評価

  - 締切2分前以前に観測した完全データを固定保存する
  - 8項目をそれぞれ0〜100点で記録する
  - 校正対象として成立した総合点だけを60点の自動選定へ使う
  - 買い目構成・note本文・オッズ・公式結果には接続しない
========================================================= */

(function (root, factory) {
  "use strict";

  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyShadowSelectionV2 = Object.freeze(api);
  }
})(
  typeof window !== "undefined" ? window : globalThis,
  function (root) {
    "use strict";

    const VERSION = "shadow-selection-v2.0.1-boat-identity";
    const boatIdentity =
      root?.ChappyBoatIdentity ||
      (typeof require === "function"
        ? require("./boat-identity")
        : null);
    const SCHEMA_VERSION = 2;
    const CUTOFF_SECONDS = 120;
    const TIDAL_WATER_TYPES = new Set([
      "海水",
      "汽水",
      "河口",
      "河川"
    ]);
    const PRIORITY = Object.freeze([
      { key: "flow", label: "展開" },
      { key: "course", label: "コース" },
      { key: "stSlit", label: "ST・スリット" },
      { key: "exhibition", label: "展示・足" },
      { key: "holdPickup", label: "残し・拾い" },
      { key: "localWater", label: "当地・水面" },
      { key: "skill", label: "技量" },
      { key: "motor", label: "モーター" }
    ]);
    const WEIGHT_PROFILES = Object.freeze({
      normal: Object.freeze({
        id: "shadow-v2-normal-v1",
        weights: Object.freeze({
          flow: 30,
          course: 20,
          stSlit: 15,
          exhibition: 12,
          holdPickup: 9,
          localWater: 7,
          skill: 4,
          motor: 3
        })
      }),
      newEngine: Object.freeze({
        id: "shadow-v2-new-engine-v1",
        weights: Object.freeze({
          flow: 30,
          course: 20,
          stSlit: 16,
          exhibition: 14,
          holdPickup: 9,
          localWater: 7,
          skill: 3,
          motor: 1
        })
      })
    });

    function numberOrNull(value) {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }

    function round(value, digits = 1) {
      const factor = 10 ** digits;
      return Math.round(Number(value) * factor) / factor;
    }

    function scoreOrNull(value) {
      const number = numberOrNull(value);
      if (number === null) return null;
      return round(Math.max(0, Math.min(100, number)), 1);
    }

    function boatNoOf(value) {
      const boatNo = Number(
        value?.boatNo ??
        value?.boat ??
        value?.no ??
        value?.waku ??
        value
      );
      return boatNo >= 1 && boatNo <= 6 ? boatNo : null;
    }

    function sourceLabel(value, fallback = "") {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (value && typeof value === "object") {
        return String(
          value.label ||
          value.source ||
          fallback
        ).trim();
      }
      return String(fallback).trim();
    }

    function hashText(value) {
      let hash = 0x811c9dc5;
      const text = String(value || "");

      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }

      return (hash >>> 0).toString(16).padStart(8, "0");
    }

    function rolesOf(theory) {
      return Array.isArray(theory?.roles)
        ? theory.roles
        : [];
    }

    function roleFor(theory, boatNo) {
      return rolesOf(theory).find(
        role => boatNoOf(role) === boatNo
      ) || null;
    }

    function rowFor(theory, boatNo) {
      return (
        Array.isArray(theory?.rows)
          ? theory.rows
          : []
      ).find(
        row => boatNoOf(row) === boatNo
      ) || null;
    }

    function bestNestedRole(theory, key) {
      const candidates = rolesOf(theory)
        .map(role => ({
          boatNo: boatNoOf(role),
          detail: role?.[key] || null,
          score: scoreOrNull(role?.[key]?.score)
        }))
        .filter(
          role =>
            role.boatNo &&
            role.score !== null
        );
      const formal = candidates.filter(
        role => role.detail?.isFormal === true
      );
      const source = formal.length ? formal : candidates;

      return [...source].sort(
        (a, b) =>
          b.score - a.score ||
          a.boatNo - b.boatNo
      )[0] || null;
    }

    function averageScores(...values) {
      const scores = values
        .map(scoreOrNull)
        .filter(value => value !== null);

      if (!scores.length || scores.length !== values.length) {
        return null;
      }

      return round(
        scores.reduce((sum, value) => sum + value, 0) /
          scores.length,
        1
      );
    }

    function component(
      key,
      label,
      score,
      {
        source = "",
        focusBoatNo = null,
        focusBoatNos = null,
        formal = null,
        reasons = [],
        detail = null
      } = {}
    ) {
      return {
        key,
        label,
        score: scoreOrNull(score),
        source: sourceLabel(source),
        focusBoatNo: boatNoOf(focusBoatNo),
        focusBoatNos: focusBoatNos || null,
        formal:
          formal === true
            ? true
            : formal === false
              ? false
              : null,
        reasons:
          (Array.isArray(reasons) ? reasons : [reasons])
            .map(reason => String(reason || "").trim())
            .filter(Boolean),
        detail: detail || null
      };
    }

    function entriesOf(data) {
      for (const key of [
        "entries",
        "boats",
        "racers",
        "entry",
        "raceEntries"
      ]) {
        if (Array.isArray(data?.[key])) {
          return data[key];
        }
      }
      return [];
    }

    function axisBoatNoOf(core, scenario, preparedRaceData) {
      const direct =
        boatNoOf(core?.raceScenarios?.attacker) ||
        boatNoOf(scenario?.attackerBoatNo) ||
        boatNoOf(scenario?.headBoatNo) ||
        boatNoOf(core?.marks?.honmei) ||
        boatNoOf(scenario?.outcome?.firstCandidates?.[0]) ||
        boatNoOf(core?.mainSheet?.honmei);

      if (direct) return direct;

      const attackerCourse = Number(
        scenario?.attackerCourse ??
        scenario?.attacker ??
        0
      );
      if (attackerCourse < 1 || attackerCourse > 6) {
        return null;
      }

      const entry = entriesOf(preparedRaceData).find((row, index) => {
        const course = Number(
          row?.exhibitionCourse ??
          row?.beforeInfo?.exhibitionCourse ??
          row?.course ??
          index + 1
        );
        return course === attackerCourse;
      });

      return boatNoOf(entry);
    }

    function motorComponentScore(
      row,
      preparedRaceData,
      coreApi,
      analysis
    ) {
      const original = row?.originalMotor || {};
      const motorInput = {
        motor2Rate: numberOrNull(original.motor2),
        motor3Rate: numberOrNull(original.motor3),
        boat2Rate: numberOrNull(original.boat2)
      };
      const hasOriginal =
        motorInput.motor2Rate !== null ||
        motorInput.motor3Rate !== null ||
        motorInput.boat2Rate !== null;

      if (
        hasOriginal &&
        typeof coreApi?.calcMotorIndex === "function"
      ) {
        return {
          score: coreApi.calcMotorIndex(
            motorInput,
            preparedRaceData
          ),
          recomputed: true,
          original: motorInput
        };
      }

      return {
        score: analysis?.indexes?.motor,
        recomputed: false,
        original: motorInput
      };
    }

    function extractComponents(
      prediction = {},
      preparedRaceData = {},
      coreApi = null
    ) {
      const core =
        prediction?.aiCore ||
        prediction?.ai ||
        prediction ||
        {};
      const scenario =
        core?.raceScenarios?.mainScenario ||
        null;
      const axisBoatNo = axisBoatNoOf(
        core,
        scenario,
        preparedRaceData
      );
      const courseTheory =
        core?.courseStructureTheory ||
        prediction?.courseStructureTheory;
      const stTheory =
        core?.stSlitTheory ||
        prediction?.stSlitTheory;
      const exhibitionTheory =
        core?.exhibitionPerformanceTheory ||
        prediction?.exhibitionPerformanceTheory;
      const holdPickupTheory =
        core?.holdPickupTheory ||
        core?.raceScenarios?.holdPickupTheory ||
        prediction?.holdPickupTheory;
      const localWaterTheory =
        preparedRaceData?.localWaterTheoryV2 || {};
      const motorTheory =
        preparedRaceData?.motorMaintenanceTheoryV2 || {};
      const preparedEntries =
        typeof coreApi?.getRaceEntries === "function"
          ? coreApi.getRaceEntries(
              preparedRaceData
            )
          : entriesOf(preparedRaceData);
      const axisEntry =
        preparedEntries.find(
          row => boatNoOf(row) === axisBoatNo
        ) || null;
      const referenceCourseRole =
        axisEntry &&
        typeof coreApi
          ?.buildCourseStructureEvaluation === "function"
          ? coreApi.buildCourseStructureEvaluation(
              axisEntry,
              preparedEntries,
              preparedRaceData
            )
          : null;
      const referenceStRole =
        axisEntry &&
        typeof coreApi
          ?.buildStFoundationEvaluation === "function"
          ? coreApi.buildStFoundationEvaluation(
              axisEntry,
              preparedEntries,
              preparedRaceData
            )
          : null;
      const courseRole = referenceCourseRole || roleFor(
        courseTheory,
        axisBoatNo
      );
      const stRole = referenceStRole || roleFor(
        stTheory,
        axisBoatNo
      );
      const exhibitionRole = roleFor(
        exhibitionTheory,
        axisBoatNo
      );
      const localWaterRole = rowFor(
        localWaterTheory,
        axisBoatNo
      );
      const motorRole = rowFor(
        motorTheory,
        axisBoatNo
      );
      const analysis = (
        Array.isArray(core?.analyses)
          ? core.analyses
          : []
      ).find(
        row => boatNoOf(row) === axisBoatNo
      ) || null;
      const hold = bestNestedRole(
        holdPickupTheory,
        "hold"
      );
      const pickup = bestNestedRole(
        holdPickupTheory,
        "pickup"
      );
      const holdPickupScore = averageScores(
        hold?.score,
        pickup?.score
      );
      const motor = motorComponentScore(
        motorRole,
        preparedRaceData,
        coreApi,
        analysis
      );
      const components = [
        component(
          "flow",
          "展開",
          scenario?.score,
          {
            source: "ai-core-race-scenarios",
            focusBoatNo: axisBoatNo,
            formal: Boolean(scenario),
            reasons: scenario?.label,
            detail: scenario
              ? {
                  type: String(scenario.type || ""),
                  label: String(scenario.label || "")
                }
              : null
          }
        ),
        component(
          "course",
          "コース",
          courseRole?.score,
          {
            source:
              referenceCourseRole
                ? "ai-core-course-structure-v2:shadow-reference"
                : courseTheory?.source,
            focusBoatNo: axisBoatNo,
            formal: courseRole?.isFormal,
            reasons: courseRole?.reason,
            detail: courseRole
              ? {
                  course: numberOrNull(courseRole.course),
                  status: String(courseRole.status || "")
                }
              : null
          }
        ),
        component(
          "stSlit",
          "ST・スリット",
          stRole?.score,
          {
            source:
              referenceStRole
                ? "ai-core-st-slit-theory-v2:shadow-reference"
                : stTheory?.source,
            focusBoatNo: axisBoatNo,
            formal: stRole?.isFormal,
            reasons: stRole?.reason,
            detail: stRole
              ? {
                  course: numberOrNull(stRole.course),
                  status: String(stRole.status || ""),
                  samples: numberOrNull(stRole.samples)
                }
              : null
          }
        ),
        component(
          "exhibition",
          "展示・足",
          exhibitionRole?.score,
          {
            source: exhibitionTheory?.source,
            focusBoatNo: axisBoatNo,
            formal: exhibitionRole?.isFormal,
            reasons: exhibitionRole?.reason,
            detail: exhibitionRole
              ? {
                  mode: String(exhibitionRole.mode || ""),
                  status: String(exhibitionRole.status || "")
                }
              : null
          }
        ),
        component(
          "holdPickup",
          "残し・拾い",
          holdPickupScore,
          {
            source: holdPickupTheory?.source ||
              "ai-core-hold-pickup-theory-v2",
            focusBoatNos: {
              hold: hold?.boatNo || null,
              pickup: pickup?.boatNo || null
            },
            formal:
              hold?.detail?.isFormal === true &&
              pickup?.detail?.isFormal === true,
            reasons: [
              hold?.detail?.reason,
              pickup?.detail?.reason
            ],
            detail: {
              holdScore: hold?.score ?? null,
              pickupScore: pickup?.score ?? null
            }
          }
        ),
        component(
          "localWater",
          "当地・水面",
          localWaterRole?.score,
          {
            source:
              localWaterTheory?.version ||
              "local-water-theory-v2",
            focusBoatNo: axisBoatNo,
            formal: localWaterRole?.isFormal,
            reasons: [
              localWaterRole?.hasLocalEvidence
                ? "当地成績あり"
                : "当地成績不足",
              localWaterRole?.hasConditionEvidence
                ? "風・波の実測あり"
                : "風・波の実測不足",
              localWaterRole?.hasReliableSample
                ? "当地12走以上"
                : "当地12走未満"
            ],
            detail: localWaterRole
              ? {
                  localStarts:
                    numberOrNull(localWaterRole.localStarts),
                  waterType:
                    String(localWaterRole.waterType || ""),
                  windType:
                    String(localWaterRole.windType || "")
                }
              : null
          }
        ),
        component(
          "skill",
          "技量",
          analysis?.indexes?.national,
          {
            source: "ai-core-national-index",
            focusBoatNo: axisBoatNo,
            formal:
              scoreOrNull(analysis?.indexes?.national) !== null,
            reasons: "全国成績から算出した技量指数",
            detail: analysis
              ? {
                  playerName:
                    String(
                      analysis.playerName ||
                      analysis.racerName ||
                      ""
                    )
                }
              : null
          }
        ),
        component(
          "motor",
          "モーター",
          motor.score,
          {
            source:
              motor.recomputed
                ? `${motorTheory?.version || "motor-maintenance-theory-v2"}:original-motor`
                : "ai-core-motor-index-fallback",
            focusBoatNo: axisBoatNo,
            formal:
              motorRole?.isFormal === true &&
              motor.recomputed === true,
            reasons:
              motor.recomputed
                ? "補正前モーター値から再計算"
                : "補正前モーター値を再計算できないため暫定",
            detail: {
              originalMotor: motor.original,
              theoryFormal:
                motorRole?.isFormal === true
            }
          }
        )
      ];

      return {
        axisBoatNo,
        scenario: scenario
          ? {
              type: String(scenario.type || ""),
              label: String(scenario.label || ""),
              score: scoreOrNull(scenario.score)
            }
          : null,
        components
      };
    }

    function timingOf(
      deadlineAt,
      capturedAt,
      cutoffSeconds = CUTOFF_SECONDS
    ) {
      const deadline = Date.parse(deadlineAt || "");
      const captured = Date.parse(capturedAt || "");

      if (
        !Number.isFinite(deadline) ||
        !Number.isFinite(captured)
      ) {
        return {
          policy: "at_or_before_deadline_minus_120s",
          cutoffSeconds,
          secondsBeforeDeadline: null,
          beforeCutoff: null,
          afterDeadline: null
        };
      }

      const secondsBeforeDeadline = Math.floor(
        (deadline - captured) / 1000
      );

      return {
        policy: "at_or_before_deadline_minus_120s",
        cutoffSeconds,
        secondsBeforeDeadline,
        beforeCutoff:
          secondsBeforeDeadline >= cutoffSeconds,
        afterDeadline:
          secondsBeforeDeadline < 0
      };
    }

    function countSnapshotBoats(snapshot, predicate) {
      return (
        Array.isArray(snapshot?.boats)
          ? snapshot.boats
          : []
      ).filter(predicate).length;
    }

    function buildAvailability(
      snapshot = {},
      prediction = {}
    ) {
      const raw = snapshot?.dataAvailability || {};
      const core =
        prediction?.aiCore ||
        prediction?.ai ||
        prediction ||
        {};
      const surface =
        core?.waterWeatherTheory?.surface ||
        prediction?.waterWeatherTheory?.surface ||
        {};
      const waterType = String(
        surface?.waterType ||
        snapshot?.weather?.waterType ||
        ""
      );
      const tideRequired =
        surface?.isTidal === true ||
        TIDAL_WATER_TYPES.has(waterType);
      const value = (key, fallback = 0) => {
        const number = numberOrNull(raw[key]);
        return number === null ? fallback : number;
      };
      const officialCourses = value(
        "officialCourses",
        countSnapshotBoats(
          snapshot,
          boat => boat?.courseOfficial === true
        )
      );
      const skill = value(
        "skill",
        countSnapshotBoats(
          snapshot,
          boat =>
            Boolean(boat?.className) &&
            numberOrNull(boat?.nationalWinRate) !== null &&
            numberOrNull(boat?.localWinRate) !== null
        )
      );
      const motor = value(
        "motor",
        countSnapshotBoats(
          snapshot,
          boat =>
            numberOrNull(boat?.motor2Rate) !== null &&
            numberOrNull(boat?.motor3Rate) !== null
        )
      );

      return {
        entries: value("entries"),
        officialCourses,
        averageST: value("averageST"),
        currentST: value("currentST"),
        exhibitionST: value("exhibitionST"),
        exhibitionTime: value("exhibitionTime"),
        lapTime: value("lapTime"),
        skill,
        motor,
        windDirection:
          raw.windDirection === true,
        wind: raw.wind === true,
        wave: raw.wave === true,
        tideRequired,
        tideAvailable: raw.tide === true,
        tideStatus:
          tideRequired
            ? raw.tide === true
              ? "acquired"
              : "missing"
            : "not_applicable"
      };
    }

    function buildMissingReasons(
      availability,
      timing,
      components
    ) {
      const missing = [];
      const requireSix = [
        ["entries", "6艇の出走データ"],
        ["officialCourses", "6艇の公式進入"],
        ["averageST", "6艇の平均ST"],
        ["exhibitionST", "6艇の展示ST"],
        ["exhibitionTime", "6艇の展示タイム"],
        ["skill", "6艇の技量データ"],
        ["motor", "6艇のモーターデータ"]
      ];

      requireSix.forEach(([key, label]) => {
        if (Number(availability?.[key] || 0) >= 6) {
          return;
        }
        missing.push({
          code: `data.${key}`,
          label,
          expected: 6,
          actual: Number(availability?.[key] || 0)
        });
      });

      [
        ["windDirection", "風向"],
        ["wind", "風速"],
        ["wave", "波高"]
      ].forEach(([key, label]) => {
        if (availability?.[key] === true) return;
        missing.push({
          code: `data.${key}`,
          label,
          expected: true,
          actual: false
        });
      });

      if (
        availability?.tideRequired === true &&
        availability?.tideAvailable !== true
      ) {
        missing.push({
          code: "data.tide",
          label: "潮汐場の現在潮位・潮流",
          expected: true,
          actual: false
        });
      }

      components.forEach(item => {
        if (item.score !== null) return;
        missing.push({
          code: `component.${item.key}`,
          label: `${item.label}スコア`,
          expected: "0〜100",
          actual: null
        });
      });

      if (timing?.beforeCutoff === null) {
        missing.push({
          code: "timing.deadline",
          label: "締切時刻",
          expected: "valid_datetime",
          actual: null
        });
      } else if (timing.beforeCutoff !== true) {
        missing.push({
          code: "timing.cutoff",
          label: "締切2分前以前の取得",
          expected: `>=${timing.cutoffSeconds}s`,
          actual: timing.secondsBeforeDeadline
        });
      }

      return missing;
    }

    function compactMark(value) {
      const boatNo = boatNoOf(value);
      return boatNo
        ? {
            boatNo,
            name: String(
              value?.name ||
              value?.playerName ||
              value?.racerName ||
              ""
            )
          }
        : null;
    }

    function compactTicket(value) {
      const ticket = String(
        value?.ticket ||
        value?.bet ||
        value?.combination ||
        ""
      ).trim();

      if (!ticket) return null;

      return {
        ticket,
        category: String(
          value?.category ||
          value?.type ||
          value?.role ||
          ""
        )
      };
    }

    function buildRecord({
      raceKey = "",
      date = "",
      jcd = "",
      place = "",
      raceNo = 0,
      deadlineAt = "",
      capturedAt = new Date().toISOString(),
      sourceCommit = "",
      logicFingerprint = "",
      referenceGenerationId = "",
      referenceDataFingerprint = "",
      theoryInputVersion = "",
      selection = null,
      preRaceConditions = {},
      preparedRaceData = {},
      practicalTickets = [],
      prediction = {},
      coreApi = null
    } = {}) {
      const extracted = extractComponents(
        prediction,
        preparedRaceData,
        coreApi
      );
      const coreNewEngineMode =
        typeof coreApi?.isNewEngineMode === "function"
          ? coreApi.isNewEngineMode(
              preparedRaceData
            ) === true
          : null;
      const newEngineMode =
        coreNewEngineMode !== null
          ? coreNewEngineMode
          : (
              preRaceConditions?.newEngineMode === true ||
              prediction?.isNewEngineMode === true ||
              prediction?.newEngine?.active === true ||
              prediction?.newEngine?.updated === true ||
              prediction?.aiCore
                ?.newEnvironmentTheory
                ?.isActive === true
            );
      const profile = newEngineMode
        ? WEIGHT_PROFILES.newEngine
        : WEIGHT_PROFILES.normal;
      const weightedComponents = extracted.components.map(item => {
        const weight = Number(profile.weights[item.key] || 0);
        return {
          ...item,
          weight,
          contribution:
            item.score === null
              ? null
              : round(item.score * weight / 100, 2)
        };
      });
      const componentScoresComplete =
        weightedComponents.every(
          item => item.score !== null
        );
      const totalScore = componentScoresComplete
        ? round(
            weightedComponents.reduce(
              (sum, item) =>
                sum + Number(item.contribution || 0),
              0
            ),
            1
          )
        : null;
      const timing = timingOf(
        deadlineAt,
        capturedAt,
        CUTOFF_SECONDS
      );
      const availability = buildAvailability(
        preRaceConditions,
        prediction
      );
      const missingReasons = buildMissingReasons(
        availability,
        timing,
        weightedComponents
      );
      const boatIdentityInspection =
        boatIdentity?.inspectPrediction?.({
          snapshot: preRaceConditions,
          prediction
        }) || null;
      if (
        boatIdentityInspection?.checked === true &&
        boatIdentityInspection.valid === false
      ) {
        missingReasons.push({
          code: "data.boatIdentity",
          label:
            boatIdentity.reasonText?.(
              boatIdentityInspection
            ) || "1〜6号艇の対応が不整合",
          expected: "unique_boats_1_to_6",
          actual: "invalid"
        });
      }
      const allComponentsFormal =
        weightedComponents.every(
          item => item.formal === true
        );
      const logicFingerprintValue =
        String(
          logicFingerprint || ""
        ).trim();
      const referenceFingerprintValue =
        String(
          referenceDataFingerprint || ""
        ).trim();
      const referenceGenerationValue =
        String(
          referenceGenerationId || ""
        ).trim();
      const fingerprintAvailable = value =>
        Boolean(value) &&
        value.toLowerCase() !==
          "unavailable";
      const versionIdentityComplete =
        fingerprintAvailable(
          logicFingerprintValue
        ) &&
        fingerprintAvailable(
          referenceGenerationValue
        ) &&
        fingerprintAvailable(
          referenceFingerprintValue
        );
      const eligibilityReasons =
        weightedComponents
          .filter(item => item.formal !== true)
          .map(item => ({
            code: `component.${item.key}.provisional`,
            label: `${item.label}が暫定`,
            expected: true,
            actual: item.formal
          }));
      [
        {
          key: "logicFingerprint",
          value: logicFingerprintValue,
          label: "ロジック世代"
        },
        {
          key: "referenceGenerationId",
          value: referenceGenerationValue,
          label: "参照データ生成世代"
        },
        {
          key: "referenceDataFingerprint",
          value: referenceFingerprintValue,
          label: "参照データ世代"
        }
      ].forEach(identity => {
        if (
          fingerprintAvailable(
            identity.value
          )
        ) {
          return;
        }

        eligibilityReasons.push({
          code:
            `version.${identity.key}.unknown`,
          label:
            `${identity.label}を識別できない`,
          expected:
            "stable_fingerprint",
          actual:
            identity.value || null
        });
      });
      const complete = missingReasons.length === 0;
      const calibrationEligible =
        complete &&
        allComponentsFormal &&
        versionIdentityComplete;
      const dataComplete = !missingReasons.some(
        reason => reason.code.startsWith("data.")
      );
      const componentComplete = !missingReasons.some(
        reason => reason.code.startsWith("component.")
      );
      const timingComplete = !missingReasons.some(
        reason => reason.code.startsWith("timing.")
      );
      const configHash = hashText(
        JSON.stringify({
          priority: PRIORITY,
          profile: profile.id,
          weights: profile.weights,
          cutoffSeconds: CUTOFF_SECONDS
        })
      );
      const versions = {
        sourceCommit: String(sourceCommit || ""),
        logicFingerprint:
          logicFingerprintValue,
        referenceGenerationId:
          referenceGenerationValue,
        referenceDataFingerprint:
          referenceFingerprintValue,
        evaluator: VERSION,
        config: profile.id,
        configHash,
        prediction: String(prediction?.version || ""),
        aiCore: String(
          prediction?.aiCore?.version ||
          prediction?.ai?.version ||
          ""
        ),
        theoryInput: String(theoryInputVersion || "")
      };
      const normalizedRaceKey =
        String(raceKey || "") ||
        `${date}-${String(jcd).padStart(2, "0")}-${Number(raceNo || 0)}`;

      return {
        schemaVersion: SCHEMA_VERSION,
        evaluatorVersion: VERSION,
        recordKey: [
          normalizedRaceKey,
          versions.logicFingerprint || "local",
          versions.referenceDataFingerprint ||
            "unknown-reference",
          versions.configHash
        ].join(":"),
        raceKey: normalizedRaceKey,
        date: String(date || ""),
        jcd: String(jcd || "").padStart(2, "0"),
        place: String(place || ""),
        raceNo: Number(raceNo || 0),
        verificationMode: "shadow_v2",
        capturedAt,
        deadlineAt: String(deadlineAt || ""),
        timing,
        status:
          calibrationEligible
            ? "ready"
            : complete
              ? "provisional"
              : timing.beforeCutoff === false
                ? "cutoff_missed"
                : timing.beforeCutoff === null
                  ? "deadline_unknown"
                  : "incomplete",
        complete,
        calibrationEligible,
        completeness: {
          status: complete ? "complete" : "incomplete",
          complete,
          eligibleForCalibration:
            calibrationEligible,
          availability,
          missingReasons,
          eligibilityReasons
        },
        readiness: {
          dataComplete,
          componentComplete,
          timingComplete,
          formalComponentCount:
            weightedComponents.filter(
              item => item.formal === true
            ).length,
          allComponentsFormal,
          versionIdentityComplete
        },
        missingReasonCodes:
          missingReasons.map(reason => reason.code),
        missingReasons,
        eligibilityReasonCodes:
          eligibilityReasons.map(reason => reason.code),
        eligibilityReasons,
        availability,
        boatIdentity: boatIdentityInspection,
        profile: {
          id: profile.id,
          mode:
            newEngineMode
              ? "new_engine"
              : "normal",
          weights: { ...profile.weights }
        },
        evaluation: {
          totalScore,
          priority:
            PRIORITY.map(item => item.label),
          axisBoatNo: extracted.axisBoatNo,
          scenario: extracted.scenario,
          components: weightedComponents
        },
        versions,
        cohortKey: [
          versions.logicFingerprint || "local",
          versions.referenceGenerationId ||
            "unknown-reference-generation",
          versions.evaluator,
          versions.configHash,
          versions.prediction || "unknown-prediction",
          versions.aiCore || "unknown-core"
        ].join(":"),
        selectionReference: selection
          ? {
              type: String(selection.type || ""),
              score: numberOrNull(selection.score),
              threshold: numberOrNull(selection.threshold),
              qualified: selection.qualified === true
            }
          : null,
        predictionReference: {
          mode: String(
            prediction?.predictionMode ||
            "server_pre_deadline_shadow"
          ),
          raceFlow: {
            title:
              String(prediction?.raceFlow?.title || ""),
            summary:
              String(prediction?.raceFlow?.summary || "")
          },
          marks: {
            honmei:
              compactMark(prediction?.mainSheet?.honmei),
            taikou:
              compactMark(prediction?.mainSheet?.taikou),
            ana:
              compactMark(prediction?.mainSheet?.ana),
            osae:
              compactMark(prediction?.mainSheet?.osae)
          },
          practicalTickets:
            (
              Array.isArray(practicalTickets)
                ? practicalTickets
                : []
            )
              .map(compactTicket)
              .filter(Boolean)
        },
        snapshot: preRaceConditions,
        officialResultUsedForEvaluation: false,
        usagePolicy:
          "校正対象の総合点は60点の自動選定へ使用。買い目構成・note内容・オッズ・公式結果は変更しない"
      };
    }

    function capturedTime(record) {
      const time = Date.parse(record?.capturedAt || "");
      return Number.isFinite(time) ? time : 0;
    }

    function qualityOf(record) {
      const availability =
        record?.availability || {};
      const sixKeys = [
        "entries",
        "officialCourses",
        "averageST",
        "exhibitionST",
        "exhibitionTime",
        "skill",
        "motor"
      ];
      const sixScore = sixKeys.reduce(
        (sum, key) =>
          sum + Math.min(
            6,
            Number(availability[key] || 0)
          ),
        0
      );
      const booleanScore = [
        "windDirection",
        "wind",
        "wave"
      ].filter(
        key => availability[key] === true
      ).length;
      const tideScore =
        availability.tideRequired !== true ||
        availability.tideAvailable === true
          ? 1
          : 0;
      const numericComponents =
        (
          record?.evaluation?.components || []
        ).filter(
          item => item?.score !== null
        ).length;
      const formalComponents = Number(
        record?.readiness?.formalComponentCount || 0
      );

      return (
        sixScore * 100 +
        booleanScore * 10 +
        tideScore * 10 +
        numericComponents * 2 +
        formalComponents
      );
    }

    function preferenceRank(record) {
      if (record?.calibrationEligible === true) return 5;
      if (
        record?.complete === true &&
        record?.timing?.beforeCutoff === true
      ) {
        return 4;
      }
      if (record?.timing?.beforeCutoff === true) return 3;
      if (record?.complete === true) return 2;
      return 1;
    }

    function preferSnapshot(existing, incoming) {
      if (!existing) return incoming;
      if (!incoming) return existing;

      const existingRank = preferenceRank(existing);
      const incomingRank = preferenceRank(incoming);

      if (existingRank !== incomingRank) {
        return incomingRank > existingRank
          ? incoming
          : existing;
      }

      const existingQuality = qualityOf(existing);
      const incomingQuality = qualityOf(incoming);

      if (existingQuality !== incomingQuality) {
        return incomingQuality > existingQuality
          ? incoming
          : existing;
      }

      const existingTime = capturedTime(existing);
      const incomingTime = capturedTime(incoming);
      const beforeCutoff =
        existing?.timing?.beforeCutoff === true &&
        incoming?.timing?.beforeCutoff === true;

      if (beforeCutoff) {
        return incomingTime >= existingTime
          ? incoming
          : existing;
      }

      return incomingTime < existingTime
        ? incoming
        : existing;
    }

    function upsertSnapshots(existing, incoming) {
      const output = Array.isArray(existing)
        ? [...existing]
        : [];

      (
        Array.isArray(incoming)
          ? incoming
          : []
      ).forEach(record => {
        const key =
          String(record?.recordKey || "") ||
          String(record?.raceKey || "");
        if (!key) return;

        const index = output.findIndex(item =>
          (
            String(item?.recordKey || "") ||
            String(item?.raceKey || "")
          ) === key
        );

        if (index < 0) {
          output.push(record);
          return;
        }

        output[index] = preferSnapshot(
          output[index],
          record
        );
      });

      return output;
    }

    return {
      VERSION,
      SCHEMA_VERSION,
      CUTOFF_SECONDS,
      PRIORITY,
      WEIGHT_PROFILES,
      extractComponents,
      timingOf,
      buildAvailability,
      buildRecord,
      preferSnapshot,
      upsertSnapshots
    };
  }
);
