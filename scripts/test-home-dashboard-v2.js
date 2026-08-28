"use strict";
const fs = require("fs");
const assert = require("assert");
const vm = require("node:vm");

const html = fs.readFileSync("index.html", "utf8");
const js = fs.readFileSync("js/home-dashboard-v2.js", "utf8");
const css = fs.readFileSync("css/home-dashboard-v2.css", "utf8");

assert(html.includes("css/home-dashboard-v2.css"), "ホームCSSを読み込む");
assert(html.includes("js/home-dashboard-v2.js"), "ホームJSを読み込む");
assert(js.includes("今日のおすすめレース"), "今日のおすすめを表示する");
assert(/slice\(0,\s*3\)/.test(js), "おすすめを3件に絞る");
assert(js.includes("モーニング"), "開催区分フィルターを持つ");
assert(js.includes("syncAndOpen"), "既存レース選択へ同期する");
assert(js.includes("fetchButton.click()"), "レース選択後に既存取得処理を自動実行する");
assert(css.includes("repeat(3"), "下部ナビをホーム・AI予想・成績分析の3項目にする");
assert(css.includes("[hidden]{display:none!important}"), "追加レイアウトCSSがタブの非表示状態を上書きしない");
assert(!html.includes('data-view="menu"') && !js.includes('data-view="menu"'), "未実装メニューを表示しない");
assert(!js.includes("homeFavoriteBtn"), "保存されない見せかけのお気に入り操作を表示しない");
assert(!html.includes('data-view="race"') && !js.includes('data-view="race"'), "ホームと重複するレース検索タブを表示しない");
assert(js.includes('ensure?.("stats")'), "成績分析へ先に切り替えてから必要機能を読み込む");
assert(!js.includes("root.scrollTo({ top: 0"), "タブ操作でホーム先頭へ強制移動しない");
assert(js.includes("sessionStorage"), "ホームデータを短期キャッシュする");
assert(js.includes("requestAnimationFrame") && js.includes("scheduleRefresh"), "最新データ取得を初期描画直後の次フレームへ回す");
assert(js.includes("HOME_REQUEST_TIMEOUT_MS"), "ホーム通信を無期限待機させない");
assert(js.includes("deadlineMs > Date.now()"), "CDNキャッシュ中でも締切済みレースを選択対象から外す");
assert(js.includes("scheduleError"), "開催情報の取得失敗を開催なしと区別する");
assert(js.includes("data-home-retry"), "開催情報の取得失敗を画面から再試行できる");
assert(js.includes("selectionReady"), "判定可能なレースだけをおすすめ候補にする");
assert(js.includes("recommendationThreshold"), "要約の選定基準点をおすすめへ引き継ぐ");
assert(js.includes("現在、締切前の勝負対象レースはありません"), "対象0件を見送りで埋めず明示する");
assert(js.includes("› を押して1R〜12Rを表示"), "未取得の開催詳細を『情報なし』と誤表示しない");
assert(js.includes('`終了 ${time}`'), "終了レースは時刻だけでなく終了状態も表示する");
assert(js.includes('aria-label="${esc(place)} ${num(race.raceNo)}R ${esc(deadlineLabel)}"'), "終了状態を読み上げ名にも含める");
assert(!js.includes("開催情報なし"), "詳細未取得を開催なしと誤認させない");
assert(js.includes('document.visibilityState === "hidden"'), "非表示中はおすすめ締切タイマーを止める");
assert(js.includes("scheduleRecommendationExpiry"), "表示中は最寄り締切でおすすめを再判定する");
assert(js.includes("recommendationCandidates"), "上位レース終了時に次の候補を繰り上げられるよう全候補を保持する");
assert(js.includes("compared: state.recommendationCandidates"), "締切再判定は表示中3件だけでなく全候補を使う");
assert(js.includes("view !== state.currentView"), "選択中のAIタブ再タップで進行中の読込を中断しない");
assert(js.includes("const changed = state.currentView !== view"), "同じタブの再タップで重い更新イベントを再送しない");
assert(js.includes("if (state.refreshPromise) return state.refreshPromise"), "更新連打でもホーム通信を1本にまとめる");
const performSyncSource = js.slice(js.indexOf("async function performSyncAndOpen"), js.indexOf("function syncAndOpen"));
assert(performSyncSource.includes("scheduleData"), "ホーム概要の対象レースを予想選択へ直接渡す");
assert(!performSyncSource.includes("prefetchVenue"), "予想開始前に16秒級の開催詳細取得を始めない");
assert(js.includes("cancelPredictionLoading"), "予想読込中に別タブへ移動した場合は永久スピナーを解除する");
assert(js.includes('oddsStatus.textContent = "取得失敗"'), "レース取得失敗をAI予想ヘッダーにも表示する");
assert(!/state\.updatedAt\s*=\s*new Date\(\)/.test(js), "画面更新時刻を要約判定時刻で上書きしない");
assert(css.includes("home-v2-recommend-list"), "おすすめカード表示を持つ");
assert(css.includes("home-v2-venue"), "開催場を横一列で表示する");
assert(css.includes("is-skip"), "見送り色分けを持つ");
assert(!js.includes("buildMarks("), "印ロジックを変更しない");
assert(!js.includes("buildFormations("), "買い目ロジックを変更しない");

const documentStub = {
  readyState: "loading",
  addEventListener() {}
};
const context = {
  window: {},
  document: documentStub,
  console
};
vm.runInNewContext(js, context, {
  filename: "js/home-dashboard-v2.js"
});

const home = context.window.ChappyHomeDashboardV2;
assert.equal(typeof home?.selectRecommendations, "function", "おすすめ資格判定を検証可能にする");
assert.equal(typeof home?.summaryCheckedAt, "function", "要約判定時刻を検証可能にする");

const now = Date.parse("2026-08-03T10:00:00+09:00");
const future = minute => `2026-08-03T10:${String(minute).padStart(2, "0")}:00+09:00`;
const evaluation = score => ({
  honmei: { score, reasons: [] },
  manshu: { score: 30, reasons: [] }
});
const candidate = (jcd, place, raceNo, score, extra = {}) => ({
  jcd,
  place,
  raceNo,
  score,
  selectionReady: true,
  evaluation: evaluation(Math.min(score, 85)),
  deadlineAt: "2026-08-03T09:00:00+09:00",
  ...extra
});
const venue = (jcd, place, currentRaceNo, deadlineAt, selectable = true) => ({
  jcd,
  place,
  currentRaceNo,
  deadlineAt,
  selectable,
  status: selectable ? "before_deadline" : "closed"
});

const run = {
  checkedAt: "2026-08-03T00:55:00.000Z",
  threshold: 70,
  compared: [
    candidate("01", "桐生", 5, 82),
    candidate("02", "戸田", 3, 79),
    candidate("03", "江戸川", 2, 76),
    candidate("04", "平和島", 1, 74),
    candidate("05", "多摩川", 1, 99, { selectionReady: false }),
    candidate("06", "浜名湖", 1, 69),
    candidate("07", "蒲郡", 2, 91),
    candidate("08", "常滑", 1, 88),
    candidate("09", "津", 1, 86),
    candidate("10", "三国", 1, 84)
  ]
};
const schedule = [
  venue("01", "桐生", 5, future(40)),
  venue("02", "戸田", 3, future(35)),
  venue("03", "江戸川", 2, future(30)),
  venue("04", "平和島", 1, future(25)),
  venue("05", "多摩川", 1, future(45)),
  venue("06", "浜名湖", 1, future(45)),
  venue("07", "蒲郡", 3, future(45)),
  venue("08", "常滑", 1, "2026-08-03T09:59:00+09:00"),
  venue("09", "津", 1, future(45), false)
];

const selected = home.selectRecommendations(run, schedule, now);
assert.equal(selected.length, 3, "全条件を満たすレースだけ最大3件にする");
assert.deepEqual(
  Array.from(selected, item => item.place),
  ["桐生", "戸田", "江戸川"],
  "基準未達・判定不能・終了済み・締切後・選択不可・schedule不在を除外する"
);
assert.equal(selected[0].deadlineAt, future(40), "表示締切は古い要約でなく公式scheduleを使う");
assert.ok(selected.every(item => item.decision?.key !== "skip"), "見送り判定をおすすめへ含めない");

const sixtyPointCandidates = [
  candidate("11", "びわこ", 1, 59.9),
  candidate("12", "住之江", 1, 60),
  candidate("13", "尼崎", 1, 69.9)
];
const sixtyPointSchedule = [
  venue("11", "びわこ", 1, future(45)),
  venue("12", "住之江", 1, future(45)),
  venue("13", "尼崎", 1, future(45))
];
const selectedAtSixty = home.selectRecommendations({
  threshold: 60,
  compared: sixtyPointCandidates
}, sixtyPointSchedule, now);
assert.deepEqual(
  Array.from(selectedAtSixty, item => item.score),
  [69.9, 60],
  "60点世代では60.0〜69.9点もホーム候補にし、59.9点は除外する"
);
assert.equal(
  home.selectRecommendations({
    threshold: 70,
    compared: sixtyPointCandidates
  }, sixtyPointSchedule, now).length,
  0,
  "旧70点世代は遡及して60点判定へ変更しない"
);

const skipOnly = home.selectRecommendations({
  threshold: 50,
  compared: [
    candidate("11", "びわこ", 1, 55, { evaluation: evaluation(55) }),
    candidate("12", "住之江", 1, 95, { type: "見送り" })
  ]
}, [
  venue("11", "びわこ", 1, future(45)),
  venue("12", "住之江", 1, future(45))
], now);
assert.equal(skipOnly.length, 0, "低評価または明示的な見送り判定は表示しない");

const empty = home.selectRecommendations({
  threshold: 70,
  compared: [candidate("12", "住之江", 1, 90, { selectionReady: false })]
}, [venue("12", "住之江", 1, future(45))], now);
assert.equal(empty.length, 0, "勝負対象がなければ空配列を返す");

assert.equal(
  home.summaryCheckedAt(
    { updatedAt: "2026-08-03T01:10:00.000Z" },
    { checkedAt: "2026-08-03T00:55:00.000Z" }
  ).toISOString(),
  "2026-08-03T00:55:00.000Z",
  "最終更新には要約runのcheckedAtを優先する"
);
console.log("承認済みホーム画面・高速化 回帰テスト: 合格");
