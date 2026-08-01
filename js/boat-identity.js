/* =========================================================
  艇番整合性
  - 枠・艇番とボート機材番号を分離する
  - 1〜6号艇の重複・欠落を検出する
  - 保存済み予想の選手名取り違えを検出する
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyBoatIdentity = Object.freeze(api);
  }
})(
  typeof window !== "undefined" ? window : globalThis,
  function () {
    "use strict";

    const VERSION = "boat-identity-v1.0.0";
    const EXPECTED_BOATS = Object.freeze([1, 2, 3, 4, 5, 6]);

    function toBoatNo(value) {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 6
      ) {
        return value;
      }

      const text = String(value ?? "").trim();
      const match = text.match(/^([1-6])(?:\s*(?:号艇|枠|コース))?$/);
      return match ? Number(match[1]) : 0;
    }

    function primaryBoatNo(entry) {
      if (!entry || typeof entry !== "object") return 0;

      for (const value of [entry.waku, entry.frame, entry.boat]) {
        const boatNo = toBoatNo(value);
        if (boatNo) return boatNo;
      }

      return 0;
    }

    function compatibleBoatNo(entry) {
      if (!entry || typeof entry !== "object") return 0;
      return toBoatNo(entry.boatNo);
    }

    function inspectEntries(
      entries,
      {
        allowBoatNoFallback = false
      } = {}
    ) {
      const rows = Array.isArray(entries) ? entries : [];
      const primary = rows.map(primaryBoatNo);
      const hasPrimary = primary.some(Boolean);
      const boatNos = hasPrimary
        ? primary
        : allowBoatNoFallback
          ? rows.map(compatibleBoatNo)
          : rows.map(() => 0);
      const conflictingIndexes = rows
        .map((entry, index) => {
          const canonicalValues = [
            entry?.waku,
            entry?.frame,
            entry?.boat
          ]
            .map(toBoatNo)
            .filter(Boolean);
          return new Set(
            canonicalValues
          ).size > 1
            ? index
            : -1;
        })
        .filter(index => index >= 0);
      const source = hasPrimary
        ? "waku-frame-boat"
        : boatNos.some(Boolean)
          ? "boatNo-compatible"
          : "unresolved";
      const counts = new Map();

      boatNos.forEach(boatNo => {
        if (!boatNo) return;
        counts.set(boatNo, (counts.get(boatNo) || 0) + 1);
      });

      const duplicates = EXPECTED_BOATS.filter(
        boatNo => (counts.get(boatNo) || 0) > 1
      );
      const missing = EXPECTED_BOATS.filter(
        boatNo => !counts.has(boatNo)
      );
      const invalidIndexes = boatNos
        .map((boatNo, index) => (boatNo ? -1 : index))
        .filter(index => index >= 0);
      const reasons = [];

      if (rows.length !== 6) {
        reasons.push({
          code: "entry_count",
          label: `出走データ${rows.length}/6艇`
        });
      }
      if (duplicates.length) {
        reasons.push({
          code: "duplicate_boat",
          label: `${duplicates.join("・")}号艇が重複`
        });
      }
      if (conflictingIndexes.length) {
        reasons.push({
          code: "conflicting_boat",
          label:
            `枠・艇番の不一致${conflictingIndexes.length}件`
        });
      }
      if (missing.length) {
        reasons.push({
          code: "missing_boat",
          label: `${missing.join("・")}号艇が欠落`
        });
      }
      if (invalidIndexes.length) {
        reasons.push({
          code: "invalid_boat",
          label: `艇番未確定${invalidIndexes.length}件`
        });
      }

      return {
        version: VERSION,
        checked: true,
        valid:
          rows.length === 6 &&
          duplicates.length === 0 &&
          missing.length === 0 &&
          invalidIndexes.length === 0 &&
          conflictingIndexes.length === 0,
        source,
        boatNos,
        duplicates,
        missing,
        invalidIndexes,
        conflictingIndexes,
        reasons
      };
    }

    function normalizeName(value) {
      return String(value ?? "")
        .replace(/[\s　]+/g, "")
        .trim();
    }

    function claimName(claim) {
      return normalizeName(
        claim?.name ??
        claim?.playerName ??
        claim?.racerName
      );
    }

    function claimBoatNo(claim) {
      return toBoatNo(
        claim?.boatNo ??
        claim?.no ??
        claim?.boat
      );
    }

    function collectClaims(prediction) {
      const mainSheet = prediction?.mainSheet || {};
      const marks = prediction?.marks || {};
      const raceFlow = prediction?.raceFlow || {};
      return [
        mainSheet.honmei || marks.honmei,
        mainSheet.taikou || marks.taikou,
        mainSheet.ana || marks.ana,
        mainSheet.osae || marks.osae,
        ...(Array.isArray(mainSheet.evaluations)
          ? mainSheet.evaluations
          : []),
        ...(Array.isArray(raceFlow.attackBoats)
          ? raceFlow.attackBoats
          : []),
        ...(Array.isArray(raceFlow.dangerBoats)
          ? raceFlow.dangerBoats
          : []),
        ...(Array.isArray(raceFlow.pickupBoats)
          ? raceFlow.pickupBoats
          : []),
        ...(Array.isArray(raceFlow.holdBoats)
          ? raceFlow.holdBoats
          : [])
      ].filter(claim => claim && typeof claim === "object");
    }

    function inspectPrediction(recordOrPrediction) {
      const record =
        recordOrPrediction || {};
      const prediction =
        record?.prediction &&
        typeof record.prediction === "object"
          ? record.prediction
          : record?.predictionReference &&
              typeof record.predictionReference === "object"
            ? record.predictionReference
            : record;
      const conditionBoats =
        prediction?.preRaceConditions?.boats ||
        record?.snapshot?.boats ||
        record?.preRaceConditions?.boats;
      const evaluations =
        prediction?.mainSheet?.evaluations;
      const reasons = [];
      let checked = false;
      let conditionInspection = null;
      let evaluationInspection = null;
      const canonicalNames = new Map();

      if (Array.isArray(conditionBoats) && conditionBoats.length) {
        checked = true;
        conditionInspection = inspectEntries(
          conditionBoats,
          { allowBoatNoFallback: true }
        );
        reasons.push(
          ...conditionInspection.reasons
            .filter(reason =>
              [
                "duplicate_boat",
                "invalid_boat",
                "conflicting_boat"
              ].includes(reason.code) ||
              conditionBoats.length >= 6
            )
        );
        conditionBoats.forEach((boat, index) => {
          const boatNo = conditionInspection.boatNos[index];
          const name = claimName(boat);
          if (boatNo && name) canonicalNames.set(boatNo, name);
        });
      }

      if (Array.isArray(evaluations) && evaluations.length) {
        checked = true;
        evaluationInspection = inspectEntries(
          evaluations,
          { allowBoatNoFallback: true }
        );
        const knownEvaluationReasons =
          evaluationInspection.reasons
            .filter(reason =>
              [
                "duplicate_boat",
                "invalid_boat",
                "conflicting_boat"
              ].includes(reason.code) ||
              evaluations.length >= 6
            );
        if (knownEvaluationReasons.length) {
          reasons.push(
            ...knownEvaluationReasons.map(reason => ({
              ...reason,
              code: `evaluation_${reason.code}`,
              label: `6艇評価：${reason.label}`
            }))
          );
        }
      }

      if (canonicalNames.size) {
        const mismatches = [];

        collectClaims(prediction).forEach(claim => {
          const boatNo = claimBoatNo(claim);
          const actualName = claimName(claim);
          const expectedName = canonicalNames.get(boatNo) || "";

          if (
            boatNo &&
            actualName &&
            expectedName &&
            actualName !== expectedName
          ) {
            mismatches.push({
              boatNo,
              expectedName,
              actualName
            });
          }
        });

        const uniqueMismatches = [
          ...new Map(
            mismatches.map(item => [
              `${item.boatNo}:${item.expectedName}:${item.actualName}`,
              item
            ])
          ).values()
        ];

        if (uniqueMismatches.length) {
          reasons.push({
            code: "name_mismatch",
            label: uniqueMismatches
              .map(item =>
                `${item.boatNo}号艇は${item.expectedName}ですが${item.actualName}を参照`
              )
              .join("／"),
            mismatches: uniqueMismatches
          });
        }
      }

      const uniqueReasons = [
        ...new Map(
          reasons.map(reason => [
            `${reason.code}:${reason.label}`,
            reason
          ])
        ).values()
      ];

      return {
        version: VERSION,
        checked,
        valid: uniqueReasons.length === 0,
        reasons: uniqueReasons,
        conditionInspection,
        evaluationInspection
      };
    }

    function reasonText(inspection) {
      return (Array.isArray(inspection?.reasons)
        ? inspection.reasons
        : [])
        .map(reason => String(reason?.label || "").trim())
        .filter(Boolean)
        .join("／");
    }

    return {
      VERSION,
      EXPECTED_BOATS,
      toBoatNo,
      primaryBoatNo,
      inspectEntries,
      inspectPrediction,
      reasonText
    };
  }
);
