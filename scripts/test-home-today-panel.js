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

// 実データ（手元にあれば）で例外なく組み立てられる。
const dir = "data/predictions/summaries";
if (fs.existsSync(dir)) {
  for (const name of fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n)).slice(-14)) {
    const data = JSON.parse(fs.readFileSync(`${dir}/${name}`, "utf8"));
    const d = name.slice(0, 8);
    const noon = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T12:00:00+09:00`);
    const m = panel.buildModel({ summary: data, nowMs: noon });
    assert.strictEqual(m.freshness.kind, "ok", `${name} を今日のデータとして読める`);
    assert(panel.renderHtml(m).includes("今日のチャッピー"));
  }
}

console.log("ok home today panel");
