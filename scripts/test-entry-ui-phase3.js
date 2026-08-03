"use strict";
const fs = require("fs");
const assert = require("assert");
const vm = require("node:vm");

const css = fs.readFileSync("css/home-dashboard-v2.css", "utf8");
const render = fs.readFileSync("js/render.js", "utf8");

assert(css.includes("公式風の5列一覧"), "出走表を公式風の一覧として維持する");
assert(css.includes(".v3-entry-grid-table"), "既存出走表を対象にする");
assert(css.includes("34px minmax(80px,1fr) 44px 50px 54px"), "スマホでも5列を1画面に収める");
assert(css.includes("28px minmax(58px,1fr) 34px 38px 42px"), "320px級の狭い画面でも右端の当地勝率を切らない");
assert(!css.includes(".v3-entry-grid-table .v3-entry-head{display:none}"), "列名ヘッダーを隠さない");
assert(!css.includes("grid-template-areas:\"boat player\" \"boat stats\""), "出走表を2段カードへ変形しない");
assert(css.includes(".v3-entry-player"), "選手名と級別を一覧に表示する");
assert(css.includes(".v3-entry-num"), "ST・モーター・当地勝率を一覧に表示する");
assert(render.includes("renderEntryTable(prediction)"), "既存出走表描画を維持する");
assert(render.includes("entryLaneNumber(entry, index)"), "API形式ごとに艇番と機材番号を判別する");
assert(render.includes("findEntryByLane(entries, lane)"), "艇評価の選手情報も同じ艇番判定を使う");
assert(render.includes("e.className || e.grade"), "正規化済み級別を表示する");
assert(render.includes("e.localWinRate ??"), "正規化済み当地勝率を表示する");
assert(!css.includes("buildMarks("), "印ロジックを変更しない");
assert(!css.includes("buildFormations("), "買い目ロジックを変更しない");

function functionSource(name) {
  const start = render.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} が存在する`);
  const open = render.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < render.length; index += 1) {
    if (render[index] === "{") depth += 1;
    if (render[index] === "}") depth -= 1;
    if (depth === 0) return render.slice(start, index + 1);
  }
  throw new Error(`${name} の終端が見つかりません`);
}

const sandbox = {
  section: (_title, body) => body,
  emptyBox: message => message,
  boatBadge: no => `<b data-boat="${no}">${no}</b>`,
  boatColor: () => ({ border: "#000" }),
  escapeHtml: value => String(value ?? "")
};
vm.runInNewContext(
  `${functionSource("entryLaneNumber")}; ${functionSource("findEntryByLane")}; ${functionSource("renderEntryTable")}; this.renderEntryTable = renderEntryTable; this.findEntryByLane = findEntryByLane;`,
  sandbox
);
const productionEntries = [13, 40, 14, 50, 55, 48].map((boatNo, index) => ({
  boat: index + 1,
  boatNo,
  name: `選手${index + 1}`,
  className: "A1",
  averageSt: "0.15",
  motorNo: 10 + index,
  localWinRate: "6.50"
}));
const entryHtml = sandbox.renderEntryTable({ race: { entries: productionEntries } });
assert.deepEqual(
  [...entryHtml.matchAll(/data-boat="(\d+)"/g)].map(match => Number(match[1])),
  [1, 2, 3, 4, 5, 6],
  "本番APIのboatを艇番1〜6として表示し、boatNoは艇番へ使わない"
);

const normalizedEntries = [11, 12, 13, 14, 15, 16].map((equipmentNo, index) => ({
  boatNo: index + 1,
  boat: { no: equipmentNo },
  course: index === 0 ? 2 : index === 1 ? 1 : index + 1,
  name: `正規化選手${index + 1}`,
  className: "A1",
  averageSt: "0.14",
  motorNo: 20 + index,
  localWinRate: "6.80"
}));
const normalizedHtml = sandbox.renderEntryTable({ race: { entries: normalizedEntries } });
assert.deepEqual(
  [...normalizedHtml.matchAll(/data-boat="(\d+)"/g)].map(match => Number(match[1])),
  [1, 2, 3, 4, 5, 6],
  "正規化後のboatオブジェクトを機材情報として扱い、boatNoの艇番1〜6を表示する"
);
assert.equal(
  sandbox.findEntryByLane(normalizedEntries, 4)?.name,
  "正規化選手4",
  "艇評価カードの級別補完でも正規化後の4号艇を正しく照合する"
);
console.log("出走表5列一覧 回帰テスト: 合格");
