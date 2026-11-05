"use strict";
// 今日のチャッピー（レース画面先頭のまとめ表示）の検査。
const fs = require("fs");
const assert = require("assert");
const panel = require("../js/home-today-panel.js");

const html = fs.readFileSync("index.html", "utf8");
const home = fs.readFileSync("js/home-dashboard-v2.js", "utf8");
const css = fs.readFileSync("css/home-today-panel.css", "utf8");
const js = fs.readFileSync("js/home-today-panel.js", "utf8");

assert(html.includes("css/home-today-panel.css"), "パネルのCSSを読み込む");
assert(html.indexOf("js/home-today-panel.js") > html.indexOf("js/home-dashboard-v2.js"), "ホーム処理の後に読み込む");
assert(home.includes("openRace: syncAndOpen"), "既存のレース選択処理でAI予想を開く");
assert(css.includes("#raceSection[hidden] #chappyTodayPanel"), "レース画面以外では表示しない");
assert(!/\b(絶対|必勝|確実)\b/.test(js), "断定表現を使わない");
assert(js.includes("20歳以上"), "注意書きを表示する");
assert(!/localStorage|sessionStorage/.test(js), "端末保存に頼らない");
assert(!/practicalTickets|ticket/i.test(js.replace(/\/\/.*$/gm, "")), "買い目そのものはホームに出さない");

const at = iso => Date.parse(iso);
const summary = {
  date: "20261103",
  updatedAt: "2026-11-03T03:40:10.835Z",
  runs: [{ checkedAt: "2026-11-03T03:40:10.331Z", compared: new Array(13).fill({}) }],
  predictions: [
    { raceKey: "a", place: "戸田", raceNo: 1, deadlineAt: "2026-11-03T10:45:00+09:00", selection: { scenarioLabel: "3コース攻め" } },
    { raceKey: "b", place: "芦屋", raceNo: 9, deadlineAt: "2026-11-03T13:05:00+09:00", selection: { scenarioLabel: "1号艇逃げ" } },
    { raceKey: "c", place: "桐生", raceNo: 12, deadlineAt: "2026-11-03T20:40:00+09:00", selection: {} },
    { raceKey: "d", place: "", raceNo: 3 },
    { raceKey: "e", place: "津", raceNo: 13 }
  ]
};

// 12:58 JST: 芦屋9Rはまもなく締切、桐生12Rは先、戸田1Rは締切済み。
let model = panel.buildModel({ summary, nowMs: at("2026-11-03T12:58:00+09:00") });
assert.strictEqual(model.dateLabel, "11月3日(火)");
assert.strictEqual(model.freshness.kind, "ok");
assert.strictEqual(model.freshness.text, "予想データ 12:40 更新");
assert.strictEqual(model.checkedCount, 13);
assert.deepStrictEqual(model.races.map(r => `${r.place}${r.raceNo}:${r.state}`), ["芦屋9:soon", "桐生12:open", "戸田1:closed"], "締切が近い順、締切済みは最後");
assert.strictEqual(model.races[0].remain, "まもなく締切（あと7分）");
assert.strictEqual(model.races[1].remain, "あと7時間42分");
assert.strictEqual(model.races[2].remain, "締切済み");
assert.strictEqual(model.races[0].deadlineText, "13:05");
assert.strictEqual(model.races.length, 3, "場名やR番号が不正な行は出さない");

const out = panel.renderHtml(model, []);
assert(out.includes('data-ct-state="closed"') && out.includes("成績で結果を見る"));
assert(out.includes("展開：1号艇逃げ"));

// 見送りの日。
model = panel.buildModel({ summary: { ...summary, predictions: [] }, nowMs: at("2026-11-03T15:00:00+09:00") });
assert(model.emptyText.includes("条件を満たすレースがありませんでした（最新の確認では13レースを見ました）"));

// 今日の要約がまだ無い: 午前は準備中、13時以降は反映遅れの可能性。
assert.strictEqual(panel.buildModel({ status: "missing", nowMs: at("2026-11-03T10:00:00+09:00") }).freshness.kind, "waiting");
assert.strictEqual(panel.buildModel({ status: "missing", nowMs: at("2026-11-03T14:00:00+09:00") }).freshness.kind, "late");
assert.strictEqual(panel.buildModel({ status: "error", nowMs: at("2026-11-03T14:00:00+09:00") }).freshness.kind, "error");
// 日付ずれ（古いキャッシュなど）は今日のデータとして扱わない。
assert.strictEqual(panel.buildModel({ summary, nowMs: at("2026-11-04T09:00:00+09:00") }).freshness.kind, "late");
// 日付の境目（JST 0時）を正しく扱う。
assert.strictEqual(panel.jst(at("2026-11-03T00:10:00+09:00")).key, "20261103");
assert.strictEqual(panel.jst(at("2026-11-02T23:59:00+09:00")).key, "20261102");

// HTMLを埋め込む値はエスケープする。
const evil = panel.renderHtml(panel.buildModel({
  summary: { ...summary, predictions: [{ place: "<img src=x>", raceNo: 1, deadlineAt: "2026-11-03T20:00:00+09:00", selection: { scenarioLabel: "<b>x" } }] },
  nowMs: at("2026-11-03T12:00:00+09:00")
}));
assert(!evil.includes("<img") && !evil.includes("<b>x"), "外部データをそのままHTMLにしない");

// 最近の予想。
const recent = panel.buildRecent([{ date: "20261102", summary }, { date: "20261101", summary: { predictions: [] } }], at("2026-11-03T12:00:00+09:00"));
assert.strictEqual(recent[0].label, "11/2(月)");
assert.strictEqual(recent[1].races.length, 0);
assert(panel.renderHtml(model, recent).includes("見送り"));


// 公式結果（着順）の表示。的中判定はせず、着順だけを見せる。
const results = {
  date: "20261103",
  races: [
    { jcd: "02", raceNo: 1, status: "finished", resultAvailable: true, void: false,
      finishers: [{ rank: 1, boat: 3 }, { rank: 2, boat: 1 }, { rank: 3, boat: 5 }, { rank: 4, boat: 2 }] },
    { jcd: "21", raceNo: 9, status: "not_finished", resultAvailable: false, void: false, finishers: [] },
    { jcd: "01", raceNo: 12, status: "void", resultAvailable: false, void: true, finishers: [] },
    { jcd: "05", raceNo: 2, status: "finished", resultAvailable: true, void: false,
      finishers: [{ rank: 1, boat: 2 }, { rank: 2, boat: 4 }, { rank: 2, boat: 6 }] }
  ]
};
assert.deepStrictEqual(panel.resultOf(results, "02", 1), { kind: "finished", text: "公式結果 3-1-5" });
assert.strictEqual(panel.resultOf(results, "21", 9).kind, "pending");
assert.strictEqual(panel.resultOf(results, "01", 12).kind, "void");
assert.strictEqual(panel.resultOf(results, "05", 2).kind, "check", "同着は着順を作らない");
assert.strictEqual(panel.resultOf(results, "03", 1), null, "結果が無いレースは何も出さない");
assert.strictEqual(panel.resultOf(null, "02", 1), null);

const withJcd = { ...summary, predictions: [
  { raceKey: "20261103-02-1", place: "戸田", raceNo: 1, deadlineAt: "2026-11-03T10:45:00+09:00", selection: {} },
  { raceKey: "20261103-01-12", jcd: "01", place: "桐生", raceNo: 12, deadlineAt: "2026-11-03T20:40:00+09:00", selection: {} }
] };
let rm = panel.buildModel({ summary: withJcd, results, nowMs: at("2026-11-03T12:58:00+09:00") });
const toda = rm.races.find(r => r.place === "戸田");
assert.strictEqual(toda.result.text, "公式結果 3-1-5", "raceKey から場コードを読む");
let rhtml = panel.renderHtml(rm, []);
assert(rhtml.includes("公式結果 3-1-5"), "締切済みのカードに着順を出す");
assert.strictEqual((rhtml.match(/ct-result /g) || []).length, 1, "締切前のレースには結果欄を出さない");
// 日付がちがう結果ファイルは使わない。
rm = panel.buildModel({ summary: withJcd, results: { ...results, date: "20261102" }, nowMs: at("2026-11-03T12:58:00+09:00") });
assert.strictEqual(rm.races.find(r => r.place === "戸田").result, null, "別の日の結果を混ぜない");
// 最近の予想にも着順を出す。
const recentWithResult = panel.buildRecent([{ date: "20261103", summary: withJcd, results }], at("2026-11-04T12:00:00+09:00"));
rhtml = panel.renderHtml(model, recentWithResult);
assert(rhtml.includes("→ 公式結果 3-1-5") && rhtml.includes("レース不成立"));
// 着順の値もエスケープ対象の外部データとして扱い、1〜6以外は着順にしない。
assert.strictEqual(panel.resultOf({ races: [{ jcd: "02", raceNo: 1, status: "finished", resultAvailable: true,
  finishers: [{ rank: 1, boat: "<b>" }, { rank: 2, boat: 1 }, { rank: 3, boat: 2 }] }] }, "02", 1).kind, "check");

// 実データ（手元にあれば）で例外なく組み立てられる。
const dir = "data/predictions/summaries";
if (fs.existsSync(dir)) {
  for (const name of fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n)).slice(-14)) {
    const data = JSON.parse(fs.readFileSync(`${dir}/${name}`, "utf8"));
    const d = name.slice(0, 8);
    const noon = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00+09:00`);
    const resultPath = `data/results/${d}.json`;
    const dayResults = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, "utf8")) : null;
    const m = panel.buildModel({ summary: data, nowMs: noon + 11.5 * 3600000, results: dayResults });
    for (const race of m.races) {
      if (dayResults && race.state === "closed") assert(race.result, `${name} ${race.place}${race.raceNo}R の公式結果を引ける`);
    }
    assert.strictEqual(m.freshness.kind, "ok", `${name} を今日のデータとして読める`);
    assert(panel.renderHtml(m).includes("今日のチャッピー"));
  }
}

console.log("ok home today panel");
