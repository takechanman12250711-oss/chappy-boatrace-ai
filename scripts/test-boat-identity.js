"use strict";

const assert = require("node:assert/strict");
const boatIdentity = require(
  "../js/boat-identity"
);

const names = [
  "濱本優一",
  "末永祐輝",
  "島田一生",
  "竹内来",
  "梶原正",
  "加藤政彦"
];
const equipmentNumbers = [
  22, 13, 28, 30, 1, 47
];
const officialEntries = names.map(
  (racerName, index) => ({
    boat: index + 1,
    boatNo:
      equipmentNumbers[index],
    racerName
  })
);

const officialInspection =
  boatIdentity.inspectEntries(
    officialEntries
  );
assert.equal(
  officialInspection.valid,
  true
);
assert.equal(
  officialInspection.source,
  "waku-frame-boat"
);
assert.deepEqual(
  officialInspection.boatNos,
  [1, 2, 3, 4, 5, 6],
  "機材番号1を5号艇の艇番として採用しない"
);

const compatibleInspection =
  boatIdentity.inspectEntries(
    names.map((racerName, index) => ({
      boatNo: index + 1,
      racerName
    })),
    { allowBoatNoFallback: true }
  );
assert.equal(
  compatibleInspection.valid,
  true,
  "艇番だけを持つ内部保存形式は互換入力として扱う"
);

const rawBoatNoOnly =
  boatIdentity.inspectEntries(
    names.map((racerName, index) => ({
      boatNo: index + 1,
      racerName
    })),
    { allowBoatNoFallback: false }
  );
assert.equal(
  rawBoatNoOnly.valid,
  false,
  "公式raw入力では機材番号boatNoを艇番へ代用しない"
);

const conflictingInspection =
  boatIdentity.inspectEntries([
    { waku: 1, boat: 5 },
    { waku: 2, boat: 2 },
    { waku: 3, boat: 3 },
    { waku: 4, boat: 4 },
    { waku: 5, boat: 5 },
    { waku: 6, boat: 6 }
  ]);
assert.equal(
  conflictingInspection.valid,
  false
);
assert.deepEqual(
  conflictingInspection
    .conflictingIndexes,
  [0],
  "waku・frame・boat間の矛盾を隔離する"
);

const duplicateEntries =
  officialEntries.map(entry => ({
    ...entry
  }));
duplicateEntries[4].boat = 1;
const duplicateInspection =
  boatIdentity.inspectEntries(
    duplicateEntries
  );
assert.equal(
  duplicateInspection.valid,
  false
);
assert.deepEqual(
  duplicateInspection.duplicates,
  [1]
);
assert.deepEqual(
  duplicateInspection.missing,
  [5]
);

const canonicalConditions =
  names.map((racerName, index) => ({
    boatNo: index + 1,
    racerName
  }));
const brokenPrediction = {
  preRaceConditions: {
    boats: canonicalConditions
  },
  mainSheet: {
    honmei: {
      boatNo: 2,
      name: "末永祐輝"
    },
    taikou: {
      boatNo: 1,
      name: "梶原正"
    },
    evaluations:
      names.map((name, index) => ({
        boatNo:
          [1, 2, 3, 4, 1, 6][index],
        name
      }))
  }
};
const brokenInspection =
  boatIdentity.inspectPrediction(
    brokenPrediction
  );
assert.equal(
  brokenInspection.checked,
  true
);
assert.equal(
  brokenInspection.valid,
  false
);
assert.ok(
  brokenInspection.reasons.some(
    reason =>
      reason.code ===
        "evaluation_duplicate_boat"
  )
);
assert.ok(
  brokenInspection.reasons.some(
    reason =>
      reason.code ===
        "name_mismatch"
  )
);

const compactBroken = {
  prediction: {
    preRaceConditions: {
      boats: canonicalConditions
    },
    mainSheet: {
      taikou: {
        boatNo: 1,
        name: "梶原正"
      }
    }
  }
};
assert.equal(
  boatIdentity.inspectPrediction(
    compactBroken
  ).valid,
  false,
  "評価配列を省いた保存形式も選手名照合で隔離する"
);

const shadowBroken = {
  snapshot: {
    boats: canonicalConditions
  },
  predictionReference: {
    marks: {
      taikou: {
        boatNo: 1,
        name: "梶原正"
      }
    }
  }
};
assert.equal(
  boatIdentity.inspectPrediction(
    shadowBroken
  ).valid,
  false,
  "V2シャドー形式も同じ艇番不整合として隔離する"
);

const legacyInspection =
  boatIdentity.inspectPrediction({
    mainSheet: {
      honmei: { boatNo: 1 }
    }
  });
assert.equal(
  legacyInspection.checked,
  false
);
assert.equal(
  legacyInspection.valid,
  true,
  "照合材料がない旧記録は既知不整合として誤隔離しない"
);

console.log("艇番整合性テスト: 合格");
