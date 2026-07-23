/* =========================================================
  モーター・整備・新エンジン理論 Ver2
  - 既存 motor 指数の入力だけを置き換える
  - 展開・印・買い目へ別枠加点しない
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(
  typeof window !== "undefined" ? window : globalThis,
  function (root) {
    "use strict";

    const VERSION = "motor-maintenance-theory-v2.0.0";
    const ENTRY_KEYS = ["entries", "boats", "racers", "entry", "raceEntries"];

    function number(value, fallback = null) {
      if (value === null || value === undefined || value === "") return fallback;
      const parsed = Number(String(value).replace(/[％%]/g, "").replace(/[^\d.\-]/g, ""));
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, number(value, min)));
    }

    function round(value, digits = 1) {
      const scale = 10 ** digits;
      return Math.round(number(value, 0) * scale) / scale;
    }

    function average(values, fallback = null) {
      const valid = values.map((value) => number(value, null)).filter((value) => value !== null);
      return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : fallback;
    }

    function boatNo(entry, index) {
      return number(entry?.boatNo ?? entry?.boat ?? entry?.waku ?? entry?.course, index + 1);
    }

    function findEntries(data) {
      for (const key of ENTRY_KEYS) {
        if (Array.isArray(data?.[key])) return { key, entries: data[key] };
      }
      return { key: "entries", entries: [] };
    }

    function valueOf(entry, keys) {
      for (const key of keys) {
        const path = key.split(".");
        let current = entry;
        for (const segment of path) current = current?.[segment];
        const parsed = number(current, null);
        if (parsed !== null) return parsed;
      }
      return null;
    }

    function listOf(entry, keys) {
      for (const key of keys) {
        const path = key.split(".");
        let current = entry;
        for (const segment of path) current = current?.[segment];
        if (Array.isArray(current)) return current;
        if (typeof current === "string" && current.trim()) {
          return current.split(/[,/・\s]+/).filter(Boolean);
        }
      }
      return [];
    }

    function rankMap(entries, getter, points) {
      const rows = entries
        .map((entry, index) => ({ boatNo: boatNo(entry, index), value: getter(entry) }))
        .filter((row) => row.value !== null && row.value > 0)
        .sort((a, b) => a.value - b.value);
      return new Map(rows.map((row, index) => [row.boatNo, points[index] ?? 0]));
    }

    function currentSeriesSt(entry) {
      const values = listOf(entry, ["currentSeries.st", "currentRace.st", "series.st", "thisTermSt"])
        .map((value) => number(value, null))
        .filter((value) => value !== null && value >= 0);
      return {
        values,
        count: values.length,
        average: average(values, null),
        spread: values.length >= 2 ? Math.max(...values) - Math.min(...values) : null
      };
    }

    function currentResults(entry) {
      return listOf(entry, ["thisTermResults", "currentResults", "seriesResults", "results"])
        .map((value) => number(value, null))
        .filter((value) => value !== null && value >= 1 && value <= 6);
    }

    function partsText(entry) {
      const raw =
        entry?.partsExchange ?? entry?.parts ?? entry?.maintenance ??
        entry?.beforeInfo?.partsExchange ?? entry?.beforeInfo?.parts ?? "";
      return Array.isArray(raw) ? raw.join("・").trim() : String(raw || "").trim();
    }

    function isNewEnvironment(data, core) {
      try {
        if (typeof core?.isNewEngineMode === "function") return Boolean(core.isNewEngineMode(data));
      } catch (_) {}
      const text = JSON.stringify(data || {});
      return Boolean(
        data?.isNewEngine || data?.newEngine || data?.isNewFuel || data?.newFuel ||
        data?.raceInfo?.isNewEngine || data?.raceInfo?.newEngine ||
        /新エンジン|新型エンジン|新モーター|新燃料/.test(text)
      );
    }

    function motorRecord(entry, newEnvironment) {
      const motor2 = valueOf(entry, ["motorRate", "motor2Rate", "motorTwoRate", "motorWinRate", "motor.twoRate"]);
      const motor3 = valueOf(entry, ["motor3Rate", "motorThreeRate", "motor.threeRate"]);
      const boat2 = valueOf(entry, ["boatRate", "boat2Rate", "boatTwoRate", "boat.twoRate"]);
      const available = motor2 !== null || motor3 !== null || boat2 !== null;
      if (!available) return { value: 0, available: false, motor2, motor3, boat2 };

      let score = 7;
      if (motor2 !== null) score += clamp((motor2 - 25) * 0.22, 0, 5);
      if (motor3 !== null) score += clamp((motor3 - 40) * 0.10, 0, 2);
      if (boat2 !== null) score += clamp((boat2 - 25) * 0.08, 0, 1);
      score = clamp(round(score), 0, 15);
      if (newEnvironment) score = round(score * 0.45);
      return { value: score, available: true, motor2, motor3, boat2 };
    }

    function encodeMotorScore(score, newEnvironment) {
      const target = newEnvironment ? clamp(score, 35, 65) : clamp(score, 25, 75);
      const preDampingTarget = newEnvironment ? 50 + (target - 50) / 0.45 : target;
      const delta = (preDampingTarget - 50) / 1.17;
      return {
        motorRate: round(30 + delta, 2),
        motor2Rate: round(30 + delta, 2),
        motor3Rate: round(45 + delta, 2),
        boatRate: round(30 + delta, 2)
      };
    }

    function buildContext(entries) {
      return {
        exhibition: rankMap(entries, (entry) => valueOf(entry, ["exhibitionTime", "tenjiTime", "displayTime"]), [18, 15, 12, 9, 6, 3]),
        lap: rankMap(entries, (entry) => valueOf(entry, ["lapTime", "oneLapTime", "roundTime", "turnTime"]), [12, 10, 8, 6, 4, 2]),
        exhibitionSt: rankMap(entries, (entry) => valueOf(entry, ["exhibitionSt", "exhibitionST", "tenjiSt", "displaySt"]), [5, 4, 3, 2, 1, 0])
      };
    }

    function scoreEntry(entry, index, data, context, core) {
      const no = boatNo(entry, index);
      const results = currentResults(entry);
      const currentSt = currentSeriesSt(entry);
      const averageSt = valueOf(entry, ["averageSt", "averageST", "avgSt", "avgST", "nationalSt"]);
      const supportSt = currentSt.count >= 2 ? currentSt.average : averageSt;
      const newEnvironment = isNewEnvironment(data, core);

      const exhibition = context.exhibition.get(no) || 0;
      const lap = context.lap.get(no) || 0;
      const exhibitionFoot = clamp(exhibition + lap, 0, 30);
      const hasExhibitionEvidence = exhibition > 0 || lap > 0;

      let currentRoad = 0;
      if (results.length) {
        const avgFinish = average(results, 3.5);
        const top3Rate = results.filter((rank) => rank <= 3).length / results.length;
        currentRoad += clamp(round((4.5 - avgFinish) * 3 + top3Rate * 5), 0, 12);
      }
      if (currentSt.count >= 2 && currentSt.spread !== null) {
        currentRoad += currentSt.spread <= 0.04 ? 8 : currentSt.spread <= 0.07 ? 6 : currentSt.spread <= 0.10 ? 4 : 2;
      } else if (currentSt.count === 1) {
        currentRoad += 3;
      }
      currentRoad = clamp(currentRoad, 0, 20);
      const hasCurrentEvidence = results.length > 0 || currentSt.count > 0;

      let startGoing = context.exhibitionSt.get(no) || 0;
      if (supportSt !== null) {
        startGoing += supportSt <= 0.12 ? 10 : supportSt <= 0.14 ? 8 : supportSt <= 0.16 ? 6 : supportSt <= 0.18 ? 4 : supportSt <= 0.20 ? 2 : 0;
      }
      startGoing = clamp(startGoing, 0, 15);

      const motor = motorRecord(entry, newEnvironment);
      const maintenance = partsText(entry);
      const exhibitionTime = valueOf(entry, ["exhibitionTime", "tenjiTime", "displayTime"]);
      const lapTime = valueOf(entry, ["lapTime", "oneLapTime", "roundTime", "turnTime"]);
      const strongEvidence = Boolean(
        currentRoad >= 10 &&
        (
          (exhibitionTime !== null && exhibitionTime <= 6.85) ||
          (lapTime !== null && lapTime <= 37.20)
        )
      );
      const moderateEvidence = Boolean(
        currentRoad >= 8 &&
        (
          (exhibitionTime !== null && exhibitionTime <= 6.95) ||
          (lapTime !== null && lapTime <= 37.60)
        )
      );
      const maintenanceEffect = maintenance
        ? strongEvidence ? 10 : moderateEvidence ? 6 : 0
        : 5;
      const environmentReliability = newEnvironment
        ? hasExhibitionEvidence && hasCurrentEvidence ? 10
          : hasExhibitionEvidence || hasCurrentEvidence ? 6
            : 0
        : 10;

      const score = round(clamp(
        exhibitionFoot + currentRoad + startGoing + motor.value + maintenanceEffect + environmentReliability,
        0,
        100
      ));
      const hasFootEvidence = hasExhibitionEvidence || hasCurrentEvidence;
      const isFormal = hasFootEvidence && (!newEnvironment || hasExhibitionEvidence || hasCurrentEvidence);
      const encoded = isFormal ? encodeMotorScore(score, newEnvironment) : null;

      return {
        boatNo: no,
        score,
        grade: score >= 85 ? "S" : score >= 75 ? "A" : score >= 65 ? "B" : score >= 55 ? "C" : "D",
        isFormal,
        newEnvironment,
        hasExhibitionEvidence,
        hasCurrentEvidence,
        maintenance,
        maintenanceImproved: Boolean(maintenance && moderateEvidence),
        weightPolicy: "既存motor枠内・追加加点なし",
        components: {
          exhibitionFoot,
          currentRoad,
          startGoing,
          motorRecord: motor.value,
          maintenanceEffect,
          environmentReliability
        },
        originalMotor: {
          motor2: motor.motor2,
          motor3: motor.motor3,
          boat2: motor.boat2
        },
        encodedMotor: encoded
      };
    }

    function enhanceData(data, core) {
      if (!data || typeof data !== "object") {
        return { data, theory: { version: VERSION, isFormal: false, rows: [] } };
      }
      const source = findEntries(data);
      const context = buildContext(source.entries);
      const rows = source.entries.map((entry, index) => scoreEntry(entry, index, data, context, core));
      const transformed = source.entries.map((entry, index) => {
        const row = rows[index];
        if (!row.isFormal || !row.encodedMotor) return { ...entry, motorMaintenanceTheoryV2: row };
        return {
          ...entry,
          ...row.encodedMotor,
          motorMaintenanceTheoryV2: row
        };
      });
      const nextData = {
        ...data,
        [source.key]: transformed,
        motorMaintenanceTheoryV2: {
          version: VERSION,
          isFormal: rows.some((row) => row.isFormal),
          rows,
          weightPolicy: "既存motor枠内・追加加点なし"
        }
      };
      for (const key of ENTRY_KEYS) {
        if (key !== source.key && Array.isArray(data[key]) && data[key] === source.entries) nextData[key] = transformed;
      }
      return { data: nextData, theory: nextData.motorMaintenanceTheoryV2 };
    }

    function install(core) {
      if (!core || typeof core !== "object" || core.__motorMaintenanceTheoryV2Installed) return core;
      const originalBuild = typeof core.buildPredictionData === "function" ? core.buildPredictionData.bind(core) : null;
      const originalBoatAnalyses = typeof core.buildBoatAnalyses === "function" ? core.buildBoatAnalyses.bind(core) : null;

      if (originalBuild) {
        core.buildPredictionData = function (data) {
          const enhanced = enhanceData(data, core);
          const result = originalBuild(enhanced.data);
          if (result && typeof result === "object") result.motorMaintenanceTheoryV2 = enhanced.theory;
          return result;
        };
        core.analyze = core.buildPredictionData;
      }
      if (originalBoatAnalyses) {
        core.buildBoatAnalyses = function (data) {
          const enhanced = enhanceData(data, core);
          const result = originalBoatAnalyses(enhanced.data);
          if (Array.isArray(result)) {
            Object.defineProperty(result, "motorMaintenanceTheoryV2", {
              value: enhanced.theory,
              enumerable: false,
              configurable: true
            });
          }
          return result;
        };
      }
      Object.defineProperty(core, "__motorMaintenanceTheoryV2Installed", {
        value: true,
        enumerable: false,
        configurable: false
      });
      return core;
    }

    const api = Object.freeze({ version: VERSION, enhanceData, install });
    root.ChappyMotorMaintenanceV2 = api;

    const previous = Object.getOwnPropertyDescriptor(root, "ChappyAICore");
    const previousGet = previous?.get ? previous.get.bind(root) : null;
    const previousSet = previous?.set ? previous.set.bind(root) : null;
    let storedCore = previousGet ? previousGet() : root.ChappyAICore;
    if (storedCore) storedCore = install(storedCore);

    try {
      Object.defineProperty(root, "ChappyAICore", {
        configurable: true,
        enumerable: true,
        get() {
          const current = previousGet ? previousGet() : storedCore;
          return current ? install(current) : current;
        },
        set(value) {
          if (previousSet) {
            previousSet(value);
            storedCore = previousGet ? previousGet() : value;
          } else {
            storedCore = value;
          }
          storedCore = install(storedCore);
        }
      });
    } catch (error) {
      if (storedCore) install(storedCore);
      if (typeof console !== "undefined") console.warn("[MotorMaintenanceV2] AIコア接続フォールバック", error);
    }

    return api;
  }
);
