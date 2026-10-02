"use strict";

const assert = require(
  "node:assert/strict"
);
const fs = require("node:fs");
const path = require("node:path");
const api = require(
  "../js/result-void-compat"
);

function starts(markers) {
  const boats = [1, 3, 4, 2, 6, 5];
  return boats.map(
    (boat, index) => {
      const marker =
        markers[index] || "";
      return {
        course: index + 1,
        boat,
        marker,
        falseStart:
          marker === "F",
        lateStart:
          marker === "L"
      };
    }
  );
}

function pendingResult(markers) {
  return {
    ok: true,
    resultAvailable: false,
    status: "not_finished",
    trifecta: null,
    starts: starts(markers)
  };
}

[
  ["F", "F", "F", "F", "F", "F"],
  ["L", "L", "L", "L", "L", "L"],
  ["F", "L", "F", "L", "F", "L"]
].forEach(markers => {
  const normalized =
    api.normalize(
      pendingResult(markers)
    );
  assert.equal(
    normalized.status,
    "void"
  );
  assert.equal(
    normalized.void,
    true
  );
  assert.equal(
    normalized.voidReason,
    "all-boats-f-l"
  );
  assert.equal(
    normalized.resultAvailable,
    false
  );
});

const partial = pendingResult([
  "F", "F", "F", "F", "F", ""
]);
assert.equal(
  api.normalize(partial),
  partial,
  "6艇中1艇でも通常なら未確定を維持する"
);

const normalPending =
  pendingResult([]);
assert.equal(
  api.normalize(normalPending),
  normalPending,
  "通常未確定6艇を変更しない"
);

const missingAvailability = {
  ...pendingResult([
    "F", "F", "F", "F", "F", "F"
  ])
};
delete missingAvailability
  .resultAvailable;
assert.equal(
  api.normalize(
    missingAvailability
  ),
  missingAvailability,
  "resultAvailable欠落を不成立にしない"
);

const duplicatedBoat =
  pendingResult([
    "F", "F", "F", "F", "F", "F"
  ]);
duplicatedBoat.starts =
  duplicatedBoat.starts.map(
    item => ({ ...item, boat: 1 })
  );
assert.equal(
  api.normalize(duplicatedBoat),
  duplicatedBoat,
  "艇番1〜6が揃わない異常データを不成立にしない"
);

const trifectaPresent = {
  ...pendingResult([
    "F", "F", "F", "F", "F", "F"
  ]),
  trifecta: {
    combination: "1-2-3"
  }
};
assert.equal(
  api.normalize(trifectaPresent),
  trifectaPresent,
  "3連単成立データを不成立にしない"
);

const settled = {
  ok: true,
  resultAvailable: true,
  status: "finished",
  trifecta: {
    combination: "1-2-3"
  },
  starts: []
};
assert.equal(
  api.normalize(settled),
  settled,
  "通常確定結果を変更しない"
);

const apiVoid = {
  ok: true,
  resultAvailable: false,
  status: "void",
  starts: []
};
assert.equal(
  api.normalize(apiVoid),
  apiVoid,
  "APIが返した不成立結果を維持する"
);
assert.equal(
  api.isVoidResult(apiVoid),
  true
);

api.normalize(
  pendingResult([
    "F", "F", "F", "F", "F", "F"
  ])
);
assert.equal(
  api.normalize(normalPending),
  normalPending,
  "前レースの不成立状態を別レースへ持ち越さない"
);

const root = path.join(
  __dirname,
  ".."
);
const indexSource = fs.readFileSync(
  path.join(root, "index.html"),
  "utf8"
);
const scriptSource = fs.readFileSync(
  path.join(root, "js", "script.js"),
  "utf8"
);
assert.ok(
  indexSource.indexOf(
    '<script src="js/result-void-compat.js'
  ) < indexSource.indexOf(
    '<script src="js/app-runtime-loader.js'
  ),
  "互換判定をアプリ本体より先に読み込む"
);
assert.match(
  scriptSource,
  /compatibility\.normalize/
);
assert.match(
  scriptSource,
  /不成立（全艇F\/L）/
);
assert.match(
  scriptSource,
  /振り返り予想と不成立結果を表示しました/
);
assert.doesNotMatch(
  fs.readFileSync(
    path.join(
      root,
      "js",
      "result-void-compat.js"
    ),
    "utf8"
  ),
  /MutationObserver|root\.fetch\s*=/,
  "常駐DOM監視とグローバルfetch差し替えを行わない"
);

console.log(
  "result void compatibility tests passed"
);
