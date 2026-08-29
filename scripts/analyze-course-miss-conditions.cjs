'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadDiscoveryRows,
  rankAnalyses,
} = require('./build-phase10-discovery-analysis.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_JSON = path.join(ROOT, 'reports', 'phase10-course-miss-condition-breakdown.json');
const OUTPUT_MD = path.join(ROOT, 'reports', 'phase10-course-miss-condition-breakdown.md');

const BASELINE_WEIGHTS = Object.freeze({
  courseIndex: 1.0,
  raceFlowIndex: 1.0,
  startIndex: 1.0,
  exhibitionIndex: 1.0,
  remainIndex: 1.0,
  localIndex: 1.0,
  skillIndex: 1.0,
  motorIndex: 1.0,
});

const COMPONENTS = Object.freeze([
  'courseIndex',
  'raceFlowIndex',
  'startIndex',
  'exhibitionIndex',
  'remainIndex',
  'localIndex',
  'skillIndex',
  'motorIndex',
]);

function parseRaceKey(raceKey) {
  const text = String(raceKey || '');
  const match = text.match(/^(\d{8})-(\d{2})-(\d{1,2})$/);
  if (!match) return { date: null, venueCode: null, raceNo: null };
  return { date: match[1], venueCode: match[2], raceNo: Number(match[3]) };
}

function countBy(rows, selector) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(selector(row));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'ja'));
}

function strongestWinnerAdvantage(predicted, winner) {
  let best = null;
  for (const component of COMPONENTS) {
    const predictedValue = Number(predicted?.[component] || 0);
    const winnerValue = Number(winner?.[component] || 0);
    const weightedGap = (winnerValue - predictedValue) * Number(BASELINE_WEIGHTS[component] || 1);
    if (!best || weightedGap > best.weightedGap) {
      best = { component, weightedGap };
    }
  }
  return best || { component: 'unknown', weightedGap: 0 };
}

function buildCourseMissConditionBreakdown(rows) {
  const misses = [];

  for (const row of rows) {
    const ranked = rankAnalyses(row, BASELINE_WEIGHTS);
    if (!Array.isArray(ranked) || ranked.length < 2) continue;

    const predicted = ranked[0]?.analysis;
    const winner = ranked.find((entry) => Number(entry?.analysis?.boat) === Number(row?.winnerBoat))?.analysis;
    if (!predicted || !winner || Number(predicted.boat) === Number(winner.boat)) continue;

    const courseGap = Number(predicted.courseIndex || 0) - Number(winner.courseIndex || 0);
    const flowGap = Number(predicted.raceFlowIndex || 0) - Number(winner.raceFlowIndex || 0);
    if (!(Math.abs(courseGap) > Math.abs(flowGap))) continue;

    const race = parseRaceKey(row.raceKey);
    const winnerRank = ranked.findIndex((entry) => Number(entry?.analysis?.boat) === Number(winner.boat)) + 1;
    const strongest = strongestWinnerAdvantage(predicted, winner);

    misses.push({
      raceKey: row.raceKey,
      date: race.date,
      venueCode: race.venueCode,
      raceNo: race.raceNo,
      predictedBoat: Number(predicted.boat),
      winnerBoat: Number(winner.boat),
      winnerRank,
      path: `${Number(predicted.boat)}>${Number(winner.boat)}`,
      courseGap,
      flowGap,
      strongestWinnerAdvantage: strongest.component,
      strongestWinnerAdvantageGap: strongest.weightedGap,
    });
  }

  const byVenue = countBy(misses, (row) => row.venueCode || 'unknown');
  const byPath = countBy(misses, (row) => row.path);
  const byPredictedBoat = countBy(misses, (row) => row.predictedBoat);
  const byWinnerBoat = countBy(misses, (row) => row.winnerBoat);
  const byWinnerRank = countBy(misses, (row) => row.winnerRank);
  const byStrongestWinnerAdvantage = countBy(misses, (row) => row.strongestWinnerAdvantage);

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      dataset: 'phase10_discovery_only',
      holdoutUsed: false,
      target: 'baseline_top1_misses_attributed_to_courseIndex',
      decisiveMethodStatus: 'not_collected_in_discovery_contract',
    },
    total: misses.length,
    byVenue,
    byPath,
    byPredictedBoat,
    byWinnerBoat,
    byWinnerRank,
    byStrongestWinnerAdvantage,
    rows: misses,
  };
}

function toMarkdown(report) {
  const table = (title, rows, label) => {
    const lines = [`## ${title}`, '', `| ${label} | 件数 | 構成比 |`, '|---|---:|---:|'];
    for (const row of rows.slice(0, 24)) {
      const share = report.total ? ((row.count / report.total) * 100).toFixed(1) : '0.0';
      lines.push(`| ${row.key} | ${row.count} | ${share}% |`);
    }
    return lines.join('\n');
  };

  return [
    '# Phase10 courseIndex miss condition breakdown',
    '',
    `- 対象: Discovery only / courseIndex 起因の baseline 1着予測ミス`,
    `- 件数: **${report.total}**`,
    '- holdout: **未使用**',
    '- 決まり手: Discovery契約に収集項目がないため、このレポートでは断定しない',
    '',
    table('場別', report.byVenue, '場コード'),
    '',
    table('予測艇→実勝者', report.byPath, '経路'),
    '',
    table('予測1着艇別', report.byPredictedBoat, '艇番'),
    '',
    table('実勝者艇別', report.byWinnerBoat, '艇番'),
    '',
    table('実勝者のbaseline順位', report.byWinnerRank, '順位'),
    '',
    table('実勝者が最も上回っていた要素', report.byStrongestWinnerAdvantage, '要素'),
    '',
    '## 次の判断',
    '',
    '- まず偏りが大きい「場 × 予測艇→勝者」の組み合わせを候補化する。',
    '- 全場一律の courseIndex 重み変更は行わない。',
    '- 決まり手は現行Discoveryデータでは未収集なので、別契約で公式結果から追加してから検証する。',
    '- このレポート自体は本番予想ロジックを変更しない。',
    '',
  ].join('\n');
}

function main() {
  const rows = loadDiscoveryRows();
  const report = buildCourseMissConditionBreakdown(rows);
  const json = JSON.stringify(report, null, 2) + '\n';
  const markdown = toMarkdown(report);

  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
    fs.writeFileSync(OUTPUT_JSON, json);
    fs.writeFileSync(OUTPUT_MD, markdown);
  }

  process.stdout.write(json);
}

if (require.main === module) main();

module.exports = {
  BASELINE_WEIGHTS,
  COMPONENTS,
  buildCourseMissConditionBreakdown,
  parseRaceKey,
  strongestWinnerAdvantage,
  toMarkdown,
};
