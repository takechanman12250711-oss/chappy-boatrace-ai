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
assert.strictEqual(parser.parseRow(["蒲郡", "7R", "3連単", "1-2-3"], "20261023").purchase.amount, null, "金額がない画面は空で返し、取り込みページで入力する");
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
  assert.deepStrictEqual(parsed.purchases.map((p) => p.contractId), ["tb-20261023-07-7-1-2-3-1", "tb-20261023-07-7-1-2-3-2", "tb-20261023-12-12-4-1-2-1"], "金額は後から直せるのでIDに含めない");
  assert.strictEqual(parsed.purchases[2].amount, 1000);
  assert.deepStrictEqual(parsed.skipped.map((s) => s.reason), ["multiple-tickets"], "2連単は買い目が3艇でないので対象外、複数買い目は理由付きで残す");
  assert.deepStrictEqual(parser.parseCapture(capture).purchases, parsed.purchases, "同じ画面は同じ結果");
  // 表がない画面は本文の行で読む
  const fromText = parser.parseCapture({ capturedAt: capture.capturedAt, rows: [], text: "蒲郡 7R 3連単 1-2-3 500円\nお知らせ" });
  assert.strictEqual(fromText.purchases.length, 1);
}

// BOAT RACE公式の投票照会（2026-10-20の画面を元にした形）: 金額は一覧になく、日付は画面上部、1件が2行に分かれる
{
  const capture = {
    v: 1, capturedAt: "2026-10-23T00:38:00.000Z", host: "www.boatrace.jp",
    head: "投票照会 2026年 10月20日 検索 的中・払戻 別 結果 件数：24",
    selects: ["全て", "全て", "全て"],
    rows: [
      ["No", "レース場", "レース", "返還", "レース結果"],
      ["式別", "組番"],
      ["001", "江戸川", "1R", "なし", "結果"],
      ["3連単", "1 - 2 - 6"],
      ["002", "江戸川", "1R", "なし", "結果"],
      ["3連単", "2 - 3 - 6"],
      ["008", "桐生", "10R", "なし", "結果"],
      ["3連単", "1 - 2 - 5"],
      ["024", "下関", "12R", "なし", "結果"],
      ["3連単", "1 - 2 - 6"]
    ]
  };
  const parsed = parser.parseCapture(capture);
  assert.strictEqual(parsed.listedDate, "20261020", "照会日は画面上部から読む（取り込んだ日ではない）");
  assert.deepStrictEqual(parsed.purchases.map((p) => `${p.date} ${p.jcd} ${p.raceNo}R ${p.ticket} ${p.amount}`),
    ["20261020 03 1R 1-2-6 null", "20261020 03 1R 2-3-6 null", "20261020 01 10R 1-2-5 null", "20261020 19 12R 1-2-6 null"]);
  assert.ok(parsed.purchases.every((p) => p.dateAssumed === false));
  assert.deepStrictEqual(parsed.purchases.map((p) => p.contractId),
    ["tb-20261020-03-1-1-2-6-n001", "tb-20261020-03-1-2-3-6-n002", "tb-20261020-01-10-1-2-5-n008", "tb-20261020-19-12-1-2-6-n024"], "通し番号（No）をIDに使う");
  // 同じ券を別の購入で2回買い、別々の画面（絞り込み）で取り込んでも、別のIDになる
  const first = parser.parseCapture({ ...capture, rows: [["001", "江戸川", "1R", "なし", "結果"], ["3連単", "1 - 2 - 6"]] });
  const second = parser.parseCapture({ ...capture, rows: [["005", "江戸川", "1R", "なし", "結果"], ["3連単", "1 - 2 - 6"]] });
  assert.notStrictEqual(first.purchases[0].contractId, second.purchases[0].contractId);
  assert.strictEqual(parser.findSerial("100円 1-2-3"), "", "金額の数字は通し番号にしない");
  assert.deepStrictEqual(parsed.skipped, []);
  // 1行にまとまった形でも同じ
  const oneRow = parser.parseCapture({ ...capture, rows: [["001", "江戸川", "1R", "なし", "3連単", "1-2-6"]] });
  assert.strictEqual(oneRow.purchases[0].ticket, "1-2-6");
  // 選択欄の年・月・日からも読む
  assert.strictEqual(parser.pageDate({ head: "投票照会", selects: ["全て", "2026", "10", "20"] }), "20261020");
  assert.strictEqual(parser.pageDate({ head: "投票照会", selects: ["全て"] }), "");
}

// トークンの保存: チェックを外すと消える
{
  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
  page.saveToken(storage, "secret", true);
  assert.strictEqual(page.loadToken(storage), "secret");
  page.saveToken(storage, "secret", false);
  assert.strictEqual(page.loadToken(storage), "");
}

// 詳細（No を押すと出る小窓）の金額を明細に入れる（2026-10-20 No 001 の小窓を元にした形）
{
  const detailText = "001 受付番号 002 レース場 三国 レース 1R 式別 3連単 組番 1 - 2 - 6 購入金額 ¥5,000 返還 なし 払戻金 ¥0 合計 ¥0 閉じる";
  assert.deepStrictEqual(parser.parseDetail({ no: "001", text: detailText }), { no: "001", ticket: "1-2-6", amount: 5000 });
  const capture = {
    v: 2, capturedAt: "2026-10-23T00:38:00.000Z", host: "www.boatrace.jp", head: "投票照会 2026年 10月20日",
    rows: [["001", "三国", "1R", "なし", "結果"], ["3連単", "1 - 2 - 6"], ["002", "三国", "1R", "なし", "結果"], ["3連単", "2 - 3 - 6"], ["003", "三国", "1R", "なし", "結果"], ["3連単", "2 - 1 - 3"]],
    details: [{ no: "001", text: detailText }, { no: "002", text: "002 三国 1R 3連単 2 - 3 - 6 ¥3,000 なし ¥0 ¥0 閉じる" }, { no: "003", text: "003 三国 1R 3連単 1 - 2 - 3 ¥9,000 閉じる" }]
  };
  const parsed = parser.parseCapture(capture);
  assert.deepStrictEqual(parsed.purchases.map((p) => p.amount), [5000, 3000, null], "組番が一致する詳細だけ使う");
  assert.strictEqual(parsed.detailAmounts, 2);
  assert.strictEqual(parsed.purchases[0].amountFromDetail, true);
}

// 投票照会の「合計」タブ（2026-10-20の画面を元にした形）
{
  const summary = parser.parseSummary({
    head: "投票照会 2026年 10月20日 合計収支",
    rows: [["購入レース数", "6"], ["的中レース数", "0"], ["的中率", "0%"], ["購入金額", "¥76,000"], ["払戻金額", "¥0"], ["回収率", "0%"]]
  });
  assert.deepStrictEqual(summary, { date: "20261020", stakeYen: 76000, payoutYen: 0, races: 6, hitRaces: 0 });
  assert.strictEqual(parser.parseSummary({ head: "2026年10月20日", rows: [["購入金額", "¥76,000"]] }), null, "払戻金額がなければ合計とみなさない");
  assert.strictEqual(parser.parseSummary({ head: "照会", rows: [["購入金額", "¥76,000"], ["払戻金額", "¥0"]] }), null, "日付がなければ使わない");
  assert.strictEqual(parser.parseCapture({ head: "2026年10月20日", rows: [["購入金額", "¥76,000"], ["払戻金額", "¥0"]] }).purchases.length, 0, "合計タブは明細として読まない");
  assert.strictEqual(page.amountCheck(76000, summary), "入力した金額の合計 76,000円 ／ 照会の購入金額 76,000円（一致）");
  assert.match(page.amountCheck(12000, summary), /あと 64,000円/);
  assert.match(page.amountCheck(80000, summary), /4,000円 多い/);
  assert.strictEqual(page.amountCheck(1000, undefined), "");
  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
  page.saveSummary(storage, summary);
  assert.deepStrictEqual(page.loadSummaries(storage)["20261020"], summary);
}

// 金額の入力
assert.strictEqual(page.validAmount("500"), 500);
assert.strictEqual(page.validAmount("1,000円"), 1000);
assert.strictEqual(page.validAmount("150"), 0, "100円単位だけ");
assert.strictEqual(page.validAmount(""), 0);

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
  assert.ok(!/fetch|XMLHttpRequest|sendBeacon|navigator\./.test(source), "ブックマークは何も送信しない");
  assert.ok(!/\n/.test(source), "アドレス欄に入る1行");
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
