#!/usr/bin/env node
"use strict";

const assert = require("assert");
const parser = require("../js/teleboat-history-parser.js");
const page = require("../js/purchase-import.js");

// 場名・レース・日付・買い目・金額の読み取り
assert.strictEqual(parser.findVenue("平和島 5R"), "04");
assert.strictEqual(parser.findVenue("びわこ"), "11");
assert.strictEqual(parser.findVenue("津 3R"), "09", "津は単独の語なら採る");
assert.strictEqual(parser.findVenue("津田 3R"), "", "津を含む別の語は採らない");
assert.strictEqual(parser.findRace("12R 3連単"), 12);
assert.strictEqual(parser.findRace("13R"), 0, "1〜12R以外は採らない");
assert.strictEqual(parser.findDate("2026/10/23 14:05"), "20261023");
assert.strictEqual(parser.findDate("2026年2月30日"), "", "実在しない日付は採らない");
assert.deepStrictEqual(parser.findTickets("1－2－3 / 1-1-2 / 4=5=6"), ["1-2-3", "4-5-6"], "全角記号も読み、同じ艇を含む組は除く");
assert.deepStrictEqual(parser.findAmounts("500円 1,200円 50円"), [500, 1200], "100円単位だけ");
assert.strictEqual(parser.jstDate("2026-10-22T16:00:00.000Z"), "20261023", "日本時間の日付");

// 行の解釈: 読めない行は推測で埋めない
assert.deepStrictEqual(parser.parseRow(["2026/10/23", "蒲郡", "7R", "3連単", "1-2-3", "500円"], "20261023").purchase,
  { date: "20261023", jcd: "07", raceNo: 7, ticket: "1-2-3", amount: 500, dateAssumed: false });
assert.strictEqual(parser.parseRow(["日付", "場", "レース", "買い目", "金額"], "20261023"), null, "見出し行は対象外");
assert.strictEqual(parser.parseRow(["蒲郡", "7R", "3連複", "1-2-3", "500円"], "20261023").skip, "not-trifecta");
assert.strictEqual(parser.parseRow(["7R", "3連単", "1-2-3", "500円"], "20261023").skip, "venue-missing");
assert.strictEqual(parser.parseRow(["蒲郡", "3連単", "1-2-3", "500円"], "20261023").skip, "race-missing");
assert.strictEqual(parser.parseRow(["蒲郡", "7R", "3連単", "1-2-3"], "20261023").skip, "amount-missing");
assert.strictEqual(parser.parseRow(["蒲郡", "7R", "3連単", "1-2-3 1-3-2", "500円"], "20261023").skip, "multiple-tickets");
assert.strictEqual(parser.parseRow(["蒲郡", "7R", "3連単", "1-2-3", "500円"], "").skip, "date-missing");
assert.strictEqual(parser.parseRow(["蒲郡", "7R", "3連単", "1-2-3", "500円"], "20261023").purchase.dateAssumed, true, "日付がなければ読み取り日を推定として使う");

// 画面全体: 同じ券を2回買ったときは別の明細にし、取り込み直しても同じIDになる
{
  const capture = {
    v: 1, capturedAt: "2026-10-23T05:00:00.000Z", host: "ib.mbrace.or.jp",
    rows: [
      ["日付", "場", "レース", "式別", "買い目", "金額"],
      ["2026/10/23", "蒲郡", "7R", "3連単", "1-2-3", "500円"],
      ["2026/10/23", "蒲郡", "7R", "3連単", "1-2-3", "500円"],
      ["2026/10/23", "住之江", "12R", "3連単", "4-1-2", "1,000円"],
      ["2026/10/23", "住之江", "12R", "2連単", "4-1", "1,000円"],
      ["2026/10/23", "住之江", "11R", "3連単", "1-2-3 1-3-2", "200円"],
      ["合計", "", "", "", "", "2,000円"]
    ]
  };
  const parsed = parser.parseCapture(capture);
  assert.strictEqual(parsed.purchases.length, 3);
  assert.deepStrictEqual(parsed.purchases.map((p) => p.contractId), ["tb-20261023-07-7-1-2-3-500-1", "tb-20261023-07-7-1-2-3-500-2", "tb-20261023-12-12-4-1-2-1000-1"]);
  assert.strictEqual(parsed.purchases[2].amount, 1000);
  assert.deepStrictEqual(parsed.skipped.map((s) => s.reason), ["multiple-tickets"], "2連単は買い目が3艇でないので対象外、複数買い目は理由付きで残す");
  assert.deepStrictEqual(parser.parseCapture(capture).purchases, parsed.purchases, "同じ画面は同じ結果");
  // 表がない画面は本文の行で読む
  const fromText = parser.parseCapture({ capturedAt: capture.capturedAt, rows: [], text: "蒲郡 7R 3連単 1-2-3 500円\nお知らせ" });
  assert.strictEqual(fromText.purchases.length, 1);
}

// 受け渡し（#d=...）の往復と、ブックマークの構文
{
  const capture = { v: 1, capturedAt: "2026-10-23T05:00:00.000Z", host: "x", rows: [["蒲郡", "7R", "3連単", "1-2-3", "500円", "日本語"]] };
  const encoded = parser.encodeCapture(capture);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/, "アドレスに入る文字だけ");
  assert.deepStrictEqual(parser.decodeCapture(encoded), capture);
  assert.deepStrictEqual(page.readHashCapture(`#d=${encoded}`), capture);
  assert.strictEqual(page.readHashCapture(""), null);
  assert.ok(page.readHashCapture("#d=AAAA").error, "壊れたデータはエラーとして扱う");
  const source = parser.bookmarkletSource();
  assert.ok(source.startsWith("javascript:"));
  assert.doesNotThrow(() => new Function(source.slice("javascript:".length)), "ブックマークは構文として正しい");
  assert.ok(!/fetch|XMLHttpRequest|sendBeacon/.test(source), "ブックマークは何も送信しない");
  assert.ok(source.includes(parser.IMPORT_PAGE));
}

// 警告の表示
{
  const lines = page.summarizeGuardrails({
    days: { "20261023": { level: "warning", netSpentYen: 11000, limitYen: 10000, stakeYen: 11000, pendingStakeYen: 11000 }, "20261022": { level: "ok", netSpentYen: 0, limitYen: 10000, stakeYen: 1000, pendingStakeYen: 0 } },
    months: { "202610": { level: "notice", netSpentYen: 41000, budgetYen: 50000, stakeYen: 60000 } },
    warnings: [{ level: "warning", message: "2026-10-23の負けが上限10,000円に達しました（現在11,000円）。今日はここで止める目安です。" }]
  }, "20261023");
  assert.deepStrictEqual(lines.map((line) => line.level), ["warning", "ok", "notice", "warning"]);
  assert.match(lines[0].text, /^今日の負け 11,000円/);
  assert.match(lines[1].text, /^10\/22の負け/);
  assert.match(lines[2].text, /^今月の負け 41,000円 ／ 予算 50,000円（購入 60,000円）/);
  assert.strictEqual(page.todayJst(Date.parse("2026-10-22T15:30:00Z")), "20261023");
}

// API呼び出し: 認証ヘッダー付きで送り、失敗はエラーにする
(async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ ok: true, received: 1 }) }; };
  const result = await page.callApi(ok, "secret", { method: "POST", body: { purchases: [] } });
  assert.strictEqual(result.received, 1);
  assert.strictEqual(calls[0].url, "https://chappy-boatrace-api.vercel.app/api/purchases");
  assert.strictEqual(calls[0].init.headers.Authorization, "Bearer secret");
  assert.strictEqual(calls[0].init.headers["Content-Type"], "application/json");
  const denied = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, error: "購入同期の認証に失敗しました" }) });
  await assert.rejects(page.callApi(denied, "bad"), /認証に失敗/);
  console.log("purchase-import: all checks passed");
})().catch((error) => { console.error(error); process.exit(1); });
