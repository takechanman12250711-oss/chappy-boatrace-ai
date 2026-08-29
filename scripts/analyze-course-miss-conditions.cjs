'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scoreAb = require('../js/effective-score-weight-ab');
const missReport = require('./build-effective-score-miss-attribution-report');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_JSON = path.join(ROOT, 'data', 'stats', 'effective-score-course-miss-condition-breakdown.json');
const OUTPUT_MD = path.join(ROOT, 'data', 'stats', 'effective-score-course-miss-condition-breakdown.md');

function parseRaceKey(raceKey) {
  const text = String(raceKey || '');
  const match = text.match(/^(\d{8})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return { date: null, venueCode: null, raceNo: null };
  return {
    date: match[1],
    venueCode: String(match[2]).padStart(2, '0'),
    raceNo: Number(match[3]),
  };
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

function buildCourseMissConditionBreakdown(options = {}) {
  const { analysisConfig, weightConfig, settled } = missReport.loadDiscovery(options);
  const baseline = scoreAb.baselineProfile(weightConfig);
  const misses = [];

  for (const row of settled.rows) {
    const ranked = scoreAb.rankAnalyses(row.analyses, baseline, weightConfig);
    const top = ranked[0];
    const winner = ranked.find(item => item.boatNo === row.winnerBoatNo);
    if (!winner || top.boatNo === winner.boatNo) continue;

    const contributions = scoreAb.COMPONENT_ORDER.map(key => ({
      key,
      weightedDifference:
        (winner.components[key] - top.components[key]) * baseline.weights[key],
    }));
    const strongestTop = [...contributions]
      .sort((left, right) => left.weightedDifference - right.weightedDifference)[0];
    if (strongestTop.key !== 'courseIndex') continue;

    const strongestWinner = [...contributions]
      .filter(item => item.weightedDifference > 1e-12)
      .sort((left, right) => right.weightedDifference - left.weightedDifference)[0] || null;
    const race = parseRaceKey(row.raceKey);

    misses.push({
      raceKey: row.raceKey,
      date: row.date || race.date,
      venueCode: row.venueCode || row.jcd || race.venueCode,
      raceNo: row.raceNo || race.raceNo,
      predictedBoat: top.boatNo,
      winnerBoat: winner.boatNo,
      winnerRank: winner.rank,
      path: `${top.boatNo}->${winner.boatNo}`,
      rawScoreGap: Number((top.rawTotal - winner.rawTotal).toFixed(6)),
      courseWeightedGap: Number((
        (top.components.courseIndex - winner.components.courseIndex) *
        baseline.weights.courseIndex
      ).toFixed(9)),
      strongestWinnerAdvantage: strongestWinner?.key || 'none',
      strongestWinnerAdvantageGap: strongestWinner
        ? Number(strongestWinner.weightedDifference.toFixed(9))
        : 0,
    });
  }

  const byVenue = countBy(misses, row => row.venueCode || 'unknown');
  const byPath = countBy(misses, row => row.path);
  const byPredictedBoat = countBy(misses, row => row.predictedBoat);
  const byWinnerBoat = countBy(misses, row => row.winnerBoat);
  const byWinnerRank = countBy(misses, row => row.winnerRank);
  const byStrongestWinnerAdvantage = countBy(
    misses,
    row => row.strongestWinnerAdvantage
  );

  return {
    schemaVersion: 1,
    analysisId: 'effective-score-course-miss-condition-breakdown-v1',
    generatedAt: analysisConfig.createdAt,
    source: {
      upstreamAnalysisId: analysisConfig.analysisId,
      sourceCommit: analysisConfig.sourceCommit,
      discoveryDates: analysisConfig.cohort.discoveryDates,
    },
    scope: {
      dataset: 'discovery-only',
      holdoutUsed: false,
      target: 'baseline top-1 misses whose strongest baseline-top weighted advantage is courseIndex',
      decisiveMethodStatus: 'not-collected-in-current-discovery-contract',
      productionChanged: false,
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
    '# courseIndex 主因ミスの条件分解',
    '',
    '- 対象: Discovery only / courseIndex が baseline 側最大優位だった1着予測ミス',
    `- 件数: **${report.total}**`,
    '- holdout: **未使用**',
    '- 本番予想ロジック: **変更なし**',
    '- 決まり手: 現行Discovery契約に収集項目がないため、このレポートでは断定しない',
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
    '- 偏りが大きい「場 × 予測艇→勝者」を条件付き仮説の候補にする。',
    '- 全場一律の courseIndex 重み変更は行わない。',
    '- 決まり手は公式結果から分析契約へ追加した後に、場・コースと交差検証する。',
    '- この分析だけで本番採用を決めない。',
    '',
  ].join('\n');
}

function main() {
  const report = buildCourseMissConditionBreakdown();
  const json = `${JSON.stringify(report, null, 2)}\n`;
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
  OUTPUT_JSON,
  OUTPUT_MD,
  buildCourseMissConditionBreakdown,
  parseRaceKey,
  toMarkdown,
};
