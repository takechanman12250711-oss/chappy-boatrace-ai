"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const css = fs.readFileSync("css/home-dashboard-v2.css", "utf8");
const render = fs.readFileSync("js/render.js", "utf8");
const prediction = fs.readFileSync("js/prediction.js", "utf8");

assert(css.includes("1艇ずつ読むカード型"), "写真基準のカード型出走表を明記する");
assert(css.includes(".v3-entry-card-list"), "6艇カード一覧を定義する");
assert(css.includes(".v3-entry-card-stats"), "全国・当地・M2連率の右列を定義する");
assert(css.includes("46px minmax(0,1fr) 78px"), "通常幅で艇番・選手・3指標を3列表示する");
assert(css.includes("36px minmax(0,1fr) 64px"), "320px級でも右指標を画面内へ収める");
assert(css.includes("color:#5f7187"), "補足文字を小文字でも読めるコントラストへする");
assert(css.includes(".v3-entry-card-meta{display:block;overflow:visible"), "320px級ではメタ情報を折り返して欠落させない");
assert(!css.includes("公式風の5列一覧を維持する"), "旧5列表を完成形として残さない");
assert(render.includes("renderEntryTable(prediction)"), "出走表描画を維持する");
assert(render.includes("entryLaneNumber(entry, index)"), "艇番と機材番号を区別する");
assert(render.includes("e.motor?.secondRate"), "モーター番号ではなく2連率を表示する");
assert(prediction.includes("fCount: toNumberOrNull("), "F回数を正規化後も保持する");
assert(prediction.includes("lCount: toNumberOrNull("), "L回数を正規化後も保持する");
assert(prediction.includes("winRate: toNumberOrNull("), "未取得の勝率を0へ変換しない");
assert(!css.includes("buildMarks("), "印ロジックをCSSへ混ぜない");
assert(!css.includes("buildFormations("), "買い目ロジックをCSSへ混ぜない");

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const sandbox = {
  section: (_title, body) => body,
  emptyBox: message => message,
  boatBadge: no => `<b class="badge" data-lane="${no}">${no}</b>`,
  escapeHtml,
  safeText: (value, fallback = "-") =>
    value === null || value === undefined || value === ""
      ? fallback
      : String(value)
};

vm.runInNewContext(
  [
    "entryLaneNumber",
    "findEntryByLane",
    "firstEntryValue",
    "formatEntryNumber",
    "formatEntryPercent",
    "entryPenaltyCount",
    "renderEntryTable"
  ].map(functionSource).join("\n") +
    "; this.renderEntryTable = renderEntryTable; this.findEntryByLane = findEntryByLane;",
  sandbox
);

const productionEntries = [13, 40, 14, 50, 55, 48].map((equipmentNo, index) => ({
  boat: index + 1,
  boatNo: equipmentNo,
  racerName: index === 0 ? "飯塚 <響>" : `選手${index + 1}`,
  registerNo: String(5100 + index),
  className: index === 0 ? "B2" : "A1",
  branch: "群馬",
  birthPlace: "栃木",
  age: 27 + index,
  weight: 46.5 + index,
  fCount: 0,
  lCount: 0,
  avgSt: 0.21 - index * 0.01,
  nationalWinRate: 3.31 + index,
  localWinRate: 3.59 + index,
  motorNo: 20 + index,
  motor2Rate: 32.32 + index
}));

const productionHtml = sandbox.renderEntryTable({ race: { entries: productionEntries } });
assert.equal(
  (productionHtml.match(/class="v3-entry-card"/g) || []).length,
  6,
  "出走表は6艇を6枚のカードで表示する"
);
assert.deepEqual(
  [...productionHtml.matchAll(/class="v3-entry-card" data-boat="(\d+)"/g)]
    .map(match => Number(match[1])),
  [1, 2, 3, 4, 5, 6],
  "公式raw形式ではboatを艇番、boatNoを機材番号として扱う"
);
assert.match(productionHtml, /飯塚 &lt;響&gt;/, "選手名をHTMLエスケープする");
assert.match(productionHtml, /role="list" aria-label="出走表 6艇"/, "出走表を支援技術へ一覧として伝える");
assert.match(productionHtml, /role="listitem" aria-label="1号艇 飯塚 &lt;響&gt;"/, "各カードへ艇番と選手名の読み上げ名を付ける");
assert.match(productionHtml, /<h3>飯塚 &lt;響&gt;<\/h3>/, "各選手名をカード見出しにする");
assert.match(productionHtml, /aria-label="モーター2連率 32\.32%"/, "M値をモーター2連率として読み上げる");
assert.match(productionHtml, /5100<i aria-hidden="true">\|<\/i>B2<i aria-hidden="true">\|<\/i>群馬\/栃木/, "登録・級別・支部・出身を表示する");
assert.match(productionHtml, /27歳\/46\.5kg/, "年齢と体重を表示する");
assert.match(productionHtml, /平均ST 0\.21<i aria-hidden="true">\|<\/i>F0<i aria-hidden="true">\|<\/i>L0/, "平均STとF0/L0を欠落させない");
assert.match(productionHtml, /全国 <strong>3\.31<\/strong>/, "全国勝率を表示する");
assert.match(productionHtml, /当地 <strong>3\.59<\/strong>/, "当地勝率を表示する");
assert.match(productionHtml, /M <strong aria-hidden="true">32\.32%<\/strong>/, "モーター2連率を表示する");
assert(!productionHtml.includes('M <strong aria-hidden="true">20'), "モーター番号を2連率として表示しない");

const normalizedEntries = [11, 12, 13, 14, 15, 16].map((equipmentNo, index) => ({
  boatNo: index + 1,
  boat: { no: equipmentNo },
  course: index === 0 ? 2 : index === 1 ? 1 : index + 1,
  name: `正規化選手${index + 1}`,
  registerNo: String(5200 + index),
  className: "A1",
  branch: "福岡",
  birthplace: "福岡",
  age: 30 + index,
  weight: 52,
  fCount: index === 5 ? null : 0,
  lCount: index === 5 ? null : 0,
  avgST: index === 5 ? null : "0.14",
  national: { winRate: index === 5 ? null : 6.2 },
  local: { winRate: index === 5 ? null : 6.8 },
  motor: { no: 20 + index, secondRate: index === 5 ? null : 41.72 },
  raw:
    index === 5
      ? { motor2Rate: "-" }
      : { fCount: 0, lCount: 0 }
}));

const normalizedHtml = sandbox.renderEntryTable({ race: { entries: normalizedEntries } });
assert.deepEqual(
  [...normalizedHtml.matchAll(/class="v3-entry-card" data-boat="(\d+)"/g)]
    .map(match => Number(match[1])),
  [1, 2, 3, 4, 5, 6],
  "正規化形式ではboatオブジェクトを機材、boatNoを艇番として扱う"
);
assert.equal(
  sandbox.findEntryByLane(normalizedEntries, 4)?.name,
  "正規化選手4",
  "艇評価と出走表が同じ艇番判定を使う"
);
assert.match(normalizedHtml, /平均ST -<i aria-hidden="true">\|<\/i>F-<i aria-hidden="true">\|<\/i>L-/, "未取得値を0で捏造しない");
assert.match(normalizedHtml, /全国 <strong>-<\/strong>/, "未取得の全国勝率はハイフン表示にする");
assert.match(normalizedHtml, /M <strong aria-hidden="true">-<\/strong>/, "未取得のモーター率はハイフン表示にする");

const predictionSandbox = { console };
predictionSandbox.window = predictionSandbox;
vm.runInNewContext(
  prediction,
  predictionSandbox
);
const missingRatePrediction =
  predictionSandbox.createPrediction({
    stadiumCode: "23",
    stadiumName: "唐津",
    raceNo: 12,
    date: "20260803",
    entries: Array.from(
      { length: 6 },
      (_, index) => ({
        boat: index + 1,
        racerName: `未取得選手${index + 1}`,
        className: "A2",
        avgSt: 0.15,
        motor2Rate: 35
      })
    )
  });
assert.equal(
  missingRatePrediction.race.entries[0]
    .national.winRate,
  null,
  "本番の正規化経路でも未取得の全国勝率をnullで保持する"
);
assert.equal(
  missingRatePrediction.race.entries[0]
    .local.winRate,
  null,
  "本番の正規化経路でも未取得の当地勝率をnullで保持する"
);
const missingRateHtml = sandbox.renderEntryTable(
  missingRatePrediction
);
assert.match(
  missingRateHtml,
  /全国 <strong>-<\/strong>/,
  "本番正規化後も未取得勝率を0.00と表示しない"
);

console.log("出走表6艇カード 回帰テスト: 合格");
