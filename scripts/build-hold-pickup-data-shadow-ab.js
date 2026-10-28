"use strict";

/*
  2着・3着候補の「現行（コース固定表）」と「データ併用（shadow）」を、
  保存済みの締切前予想と公式結果で比べる。

  - 1着軸は両方式で同じ（保存原本の最有力展開の1着艇）。
  - 2着・3着の候補数も同じにそろえ、購入点数を同じにして比べる。
  - 保存原本・公式結果は読むだけで書き換えない。
  - 本番の予想・note・コロがしへは使わない。

  使い方:
    node scripts/build-hold-pickup-data-shadow-ab.js
    node scripts/build-hold-pickup-data-shadow-ab.js --from 20260901 --to 20261027
*/

const fs = require("node:fs");
const path = require("node:path");
const shadow = require("./hold-pickup-data-shadow");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const OUT = path.join(
  root,
  "data",
  "analysis",
  "hold-pickup-data-shadow-ab.json"
);
const FORWARD_CONFIG = path.join(
  root,
  "config",
  "hold-pickup-data-shadow-forward-v1.json"
);
const FORWARD_OUT = path.join(
  root,
  "data",
  "analysis",
  "hold-pickup-data-shadow-forward-v1.json"
);
const STAKE = 100;
const SHARES = [0.3, 0.5, 0.7];
/*
  事前に決めた比較は上の3種類（顔ぶれは現行のまま、順番だけデータで決める）。
  OPEN_VARIANTS は結果を見た後に追加した探索で、展開の固定表で外れた艇にも
  下限点を与えて顔ぶれの入れ替えを許す。採用判断の根拠にはしない。
*/
const OPEN_VARIANTS = [
  { id: "open-floor40-share0.5", dataShare: 0.5, ineligibleFloor: 40 },
  { id: "open-floor55-share0.5", dataShare: 0.5, ineligibleFloor: 55 }
];
const VARIANTS = [
  ...SHARES.map((share) => ({
    id: String(share),
    dataShare: share,
    ineligibleFloor: null,
    preregistered: true
  })),
  ...OPEN_VARIANTS.map((variant) => ({
    ...variant,
    preregistered: false
  }))
];
const BOOTSTRAP = 2000;

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function raceKey(date, jcd, raceNo) {
  return `${date}-${String(jcd).padStart(2, "0")}-${Number(raceNo)}`;
}

function loadResults(date) {
  const file = path.join(resultDir, `${date}.json`);
  if (!fs.existsSync(file)) return new Map();
  const source = JSON.parse(fs.readFileSync(file, "utf8"));
  const map = new Map();

  for (const race of source.races || []) {
    if (!race?.resultAvailable || race?.void) continue;
    const combo = race?.trifecta?.combination;
    const payout = Number(race?.trifecta?.payout);
    if (!/^[1-6]-[1-6]-[1-6]$/.test(String(combo || ""))) continue;
    if (!Number.isFinite(payout) || payout <= 0) continue;
    map.set(raceKey(date, race.jcd, race.raceNo), {
      combination: combo,
      payout,
      order: combo.split("-").map(Number)
    });
  }

  return map;
}

function collectRaces(from, to, variants = VARIANTS) {
  const days = fs
    .readdirSync(predictionDir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .map((name) => name.slice(0, 8))
    .filter((date) => date >= from && date <= to)
    .sort();
  const races = [];

  for (const date of days) {
    const results = loadResults(date);
    if (!results.size) continue;
    const source = JSON.parse(
      fs.readFileSync(path.join(predictionDir, `${date}.json`), "utf8")
    );
    const records = [
      ...(source.predictions || []),
      ...(source.verificationPredictions || [])
    ];
    const seen = new Set();

    for (const record of records) {
      const basis =
        record?.prediction?.practicalSelection
          ?.frameRiseFallReplayBasis;
      if (!basis) continue;
      const key = raceKey(
        record.date || date,
        record.jcd,
        record.raceNo
      );
      if (seen.has(key)) continue;
      const result = results.get(key);
      if (!result) continue;
      seen.add(key);
      // 元データは大きいため、ここで評価して結果だけ持つ。
      const evals = {};
      for (const variant of variants) {
        evals[variant.id] = shadow.evaluateRace(basis, variant);
      }
      if (!evals[variants[0].id]) continue;
      races.push({ key, date, result, evals });
    }
  }

  return races;
}

function settle(tickets, result) {
  const cost = tickets.length * STAKE;
  const hit = tickets.includes(result.combination);
  return {
    cost,
    returned: hit ? result.payout * (STAKE / 100) : 0,
    hit
  };
}

function emptyTotals() {
  return { races: 0, tickets: 0, cost: 0, returned: 0, hits: 0 };
}

function add(totals, settled, ticketCount) {
  totals.races += 1;
  totals.tickets += ticketCount;
  totals.cost += settled.cost;
  totals.returned += settled.returned;
  totals.hits += settled.hit ? 1 : 0;
}

function finish(totals) {
  return {
    ...totals,
    hitRate: totals.races
      ? Math.round((totals.hits / totals.races) * 1000) / 10
      : null,
    roi: totals.cost
      ? Math.round((totals.returned / totals.cost) * 1000) / 10
      : null
  };
}

// 同じレースを組にした再標本化で、回収率の差の95%区間を出す。
function pairedBootstrap(pairs, seed = 20261028) {
  if (!pairs.length) return null;
  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const diffs = [];

  for (let i = 0; i < BOOTSTRAP; i += 1) {
    let bc = 0;
    let br = 0;
    let dc = 0;
    let dr = 0;
    for (let j = 0; j < pairs.length; j += 1) {
      const p = pairs[Math.floor(rand() * pairs.length)];
      bc += p.base.cost;
      br += p.base.returned;
      dc += p.data.cost;
      dr += p.data.returned;
    }
    diffs.push((dc ? dr / dc : 0) * 100 - (bc ? br / bc : 0) * 100);
  }

  diffs.sort((a, b) => a - b);
  const at = (q) =>
    Math.round(diffs[Math.floor(q * (diffs.length - 1))] * 10) / 10;
  return { low: at(0.025), high: at(0.975) };
}

function placementRates(rows) {
  let headRight = 0;
  let baseSecond = 0;
  let dataSecond = 0;
  let baseThird = 0;
  let dataThird = 0;

  for (const row of rows) {
    const [first, second, third] = row.result.order;
    if (first !== row.eval.head) continue;
    headRight += 1;
    if (row.eval.baseline.hold.includes(second)) baseSecond += 1;
    if (row.eval.data.hold.includes(second)) dataSecond += 1;
    if (row.eval.baseline.pickup.includes(third)) baseThird += 1;
    if (row.eval.data.pickup.includes(third)) dataThird += 1;
  }

  const pct = (n) =>
    headRight ? Math.round((n / headRight) * 1000) / 10 : null;
  return {
    headRightRaces: headRight,
    secondInHoldCandidates: {
      baseline: pct(baseSecond),
      data: pct(dataSecond)
    },
    thirdInPickupCandidates: {
      baseline: pct(baseThird),
      data: pct(dataThird)
    }
  };
}

function variety(rows, side) {
  const byScenario = {};
  for (const row of rows) {
    const key = `${row.eval.scenarioType}:${row.eval.head}`;
    byScenario[key] = byScenario[key] || new Set();
    byScenario[key].add(row.eval[side].main.join(" "));
  }
  const counts = Object.values(byScenario).map((set) => set.size);
  return {
    groups: counts.length,
    distinctMainPatterns: counts.reduce((a, b) => a + b, 0)
  };
}

function summarize(rows) {
  const out = {};

  for (const kind of ["main", "formation"]) {
    const base = emptyTotals();
    const data = emptyTotals();
    const pairs = [];

    for (const row of rows) {
      const b = settle(row.eval.baseline[kind], row.result);
      const d = settle(row.eval.data[kind], row.result);
      add(base, b, row.eval.baseline[kind].length);
      add(data, d, row.eval.data[kind].length);
      pairs.push({ base: b, data: d });
    }

    const baseFinal = finish(base);
    const dataFinal = finish(data);
    out[kind] = {
      baseline: baseFinal,
      data: dataFinal,
      roiDiff:
        baseFinal.roi === null || dataFinal.roi === null
          ? null
          : Math.round((dataFinal.roi - baseFinal.roi) * 10) / 10,
      roiDiffCi95: pairedBootstrap(pairs)
    };
  }

  out.placement = placementRates(rows);
  out.variety = {
    baseline: variety(rows, "baseline"),
    data: variety(rows, "data")
  };
  out.changedMainRaces = rows.filter(
    (row) =>
      row.eval.baseline.main.join(" ") !==
      row.eval.data.main.join(" ")
  ).length;
  return out;
}

function sha256(file) {
  return require("node:crypto")
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

/*
  前向き（これからのレース）比較。方式・開始日は config で固定済み。
  評価コードが固定時から変わっていたら集計しない（後出し防止）。
*/
function forward() {
  const config = JSON.parse(fs.readFileSync(FORWARD_CONFIG, "utf8"));
  const modulePath = path.join(root, config.frozenModule.path);
  const actualSha = sha256(modulePath);
  const base = {
    schemaVersion: 1,
    id: config.id,
    generatedAt: new Date().toISOString(),
    usableForPrediction: false,
    automaticApplication: false,
    adoptionGate: config.adoptionGate,
    prospectiveStartDate: config.prospectiveStartDate,
    variant: config.variant,
    checkpointRaces: config.checkpointRaces,
    frozenModuleSha256: config.frozenModule.sha256,
    actualModuleSha256: actualSha
  };

  if (actualSha !== config.frozenModule.sha256) {
    const report = {
      ...base,
      status: "frozen-module-mismatch",
      message: "評価コードが固定時から変わっているため集計しません"
    };
    fs.mkdirSync(path.dirname(FORWARD_OUT), { recursive: true });
    fs.writeFileSync(FORWARD_OUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const variant = {
    id: "forward",
    dataShare: config.variant.dataShare,
    ineligibleFloor: config.variant.ineligibleFloor
  };
  const races = collectRaces(
    config.prospectiveStartDate,
    arg("--to", "99999999"),
    [variant]
  );
  const rows = races.map((race) => ({
    key: race.key,
    date: race.date,
    result: race.result,
    eval: race.evals.forward
  }));
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const report = {
    ...base,
    status:
      rows.length >= config.checkpointRaces
        ? "checkpoint-reached"
        : "collecting",
    period: {
      from: dates[0] || null,
      to: dates[dates.length - 1] || null,
      days: dates.length,
      races: rows.length,
      remainingToCheckpoint: Math.max(
        0,
        config.checkpointRaces - rows.length
      )
    },
    summary: rows.length ? summarize(rows) : null
  };

  fs.mkdirSync(path.dirname(FORWARD_OUT), { recursive: true });
  fs.writeFileSync(FORWARD_OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      { status: report.status, period: report.period },
      null,
      2
    )
  );
}

function main() {
  if (process.argv.includes("--forward")) {
    forward();
    return;
  }
  const from = arg("--from", "00000000");
  const to = arg("--to", "99999999");
  const races = collectRaces(from, to);
  const dates = [...new Set(races.map((race) => race.date))].sort();
  const splitDate = dates[Math.floor(dates.length / 2)] || "";
  const variants = {};

  for (const variant of VARIANTS) {
    const rows = races
      .map((race) => ({
        key: race.key,
        date: race.date,
        result: race.result,
        eval: race.evals[variant.id]
      }))
      .filter((row) => row.eval);

    variants[variant.id] = {
      preregistered: variant.preregistered,
      dataShare: variant.dataShare,
      ineligibleFloor: variant.ineligibleFloor,
      all: summarize(rows),
      firstHalf: summarize(rows.filter((r) => r.date < splitDate)),
      secondHalf: summarize(rows.filter((r) => r.date >= splitDate))
    };
  }

  const report = {
    schemaVersion: 1,
    version: shadow.VERSION,
    generatedAt: new Date().toISOString(),
    usableForPrediction: false,
    automaticApplication: false,
    adoptionGate: "未登録（本人の判断待ち）",
    stakePerTicket: STAKE,
    source: {
      predictions: "data/predictions/YYYYMMDD.json の predictions と verificationPredictions（締切前保存の frameRiseFallReplayBasis）",
      results: "data/results/YYYYMMDD.json の公式3連単（返還・未確定は除外）"
    },
    period: {
      from: dates[0] || null,
      to: dates[dates.length - 1] || null,
      days: dates.length,
      races: races.length,
      splitDate
    },
    method: {
      head: "両方式とも保存原本の最有力展開の1着艇（変更なし）",
      candidateCounts: "2着・3着候補の数は現行と同じ（購入点数をそろえる）",
      main: "2着候補を上から順に、重ならない最上位の3着候補と組む（noteの先頭3点と同じ組み方）",
      formation: "1着軸 → 2着候補 → 3着候補 の全券",
      dataWeights: shadow.DATA_WEIGHTS,
      primaryDataShare: shadow.DEFAULT_DATA_SHARE,
      sensitivityShares: SHARES,
      exploratoryVariants: OPEN_VARIANTS
    },
    variants
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  const primary = variants[String(shadow.DEFAULT_DATA_SHARE)].all;
  console.log(
    JSON.stringify(
      { period: report.period, primary },
      null,
      2
    )
  );
}

if (require.main === module) main();

module.exports = { settle, summarize, pairedBootstrap };
