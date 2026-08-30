'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scoreAb = require('../js/effective-score-weight-ab');
const miss = require('./build-effective-score-miss-attribution-report');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'stats', 'flow-suppression-report.json');

const FIXED_ROUTING_RULES = Object.freeze({
  minimumAttackWinCount: 10,
  minimumInnerWinCount: 30,
  minimumRaceFlowSeparation: 1,
  minimumExhibitionSeparation: 1
});

function round4(value) {
  return Number(Number(value || 0).toFixed(4));
}

function avg(rows, key) {
  return rows.length
    ? round4(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length)
    : 0;
}

function summarize(rows) {
  return {
    count: rows.length,
    avg: {
      st: avg(rows, 'st'),
      roleAttack: avg(rows, 'roleAttack'),
      raceFlow: avg(rows, 'raceFlow'),
      exhibition: avg(rows, 'exhibition'),
      courseIndex: avg(rows, 'courseIndex')
    }
  };
}

function compareGroups(attackWin, innerWin) {
  return {
    attackWinMinusInnerWin: {
      st: round4(attackWin.avg.st - innerWin.avg.st),
      roleAttack: round4(attackWin.avg.roleAttack - innerWin.avg.roleAttack),
      raceFlow: round4(attackWin.avg.raceFlow - innerWin.avg.raceFlow),
      exhibition: round4(attackWin.avg.exhibition - innerWin.avg.exhibition),
      courseIndex: round4(attackWin.avg.courseIndex - innerWin.avg.courseIndex)
    }
  };
}

function decideNextStep(attackWin, innerWin, comparison) {
  if (
    attackWin.count < FIXED_ROUTING_RULES.minimumAttackWinCount ||
    innerWin.count < FIXED_ROUTING_RULES.minimumInnerWinCount
  ) {
    return {
      status: 'continue-collecting-discovery',
      nextStep: 'continue-collecting-flow-suppression-discovery',
      raceFlowSuppressionSupported: false,
      reason: `比較群が固定最低件数（外攻め勝ち${FIXED_ROUTING_RULES.minimumAttackWinCount}件、イン勝ち${FIXED_ROUTING_RULES.minimumInnerWinCount}件）に未到達。`
    };
  }

  const delta = comparison.attackWinMinusInnerWin;
  if (delta.raceFlow <= -FIXED_ROUTING_RULES.minimumRaceFlowSeparation) {
    return {
      status: 'discovery-signal-raceflow-separation',
      nextStep: 'validate-raceflow-suppression-on-untouched-holdout',
      raceFlowSuppressionSupported: true,
      reason: `外攻め勝ち群のraceFlow差がイン勝ち群より${Math.abs(delta.raceFlow)}点低く、固定した識別幅${FIXED_ROUTING_RULES.minimumRaceFlowSeparation}点以上。`
    };
  }

  if (
    delta.exhibition >= FIXED_ROUTING_RULES.minimumExhibitionSeparation &&
    attackWin.avg.exhibition > 0 &&
    innerWin.avg.exhibition < 0
  ) {
    return {
      status: 'discovery-closed-raceflow-insufficient-exhibition-signal',
      nextStep: 'validate-st-role-attack-exhibition-on-untouched-holdout',
      raceFlowSuppressionSupported: false,
      reason: `raceFlow群間差${delta.raceFlow}点は固定識別幅に未達。一方、展示差は外攻め勝ち群がイン勝ち群より${delta.exhibition}点高く、符号も外攻め勝ちが正・イン勝ちが負に分かれたため、別仮説として未使用holdoutへ送る。`
    };
  }

  return {
    status: 'discovery-closed-no-separating-signal',
    nextStep: 'close-flow-suppression-without-production-change',
    raceFlowSuppressionSupported: false,
    reason: 'raceFlow単独にも展示を加えた別仮説にも、固定したDiscovery振り分け条件を満たす識別信号がない。'
  };
}

function build() {
  const { weightConfig, settled } = miss.loadDiscovery();
  const baseline = scoreAb.baselineProfile(weightConfig);
  const groups = { attackWin: [], innerWin: [] };

  for (const row of settled.rows) {
    const ranked = scoreAb.rankAnalyses(row.analyses, baseline, weightConfig);
    const one = ranked.find((item) => item.boatNo === 1);
    if (!one || ranked[0]?.boatNo !== 1) continue;

    for (const boatNo of [3, 4]) {
      const outside = ranked.find((item) => item.boatNo === boatNo);
      if (!outside) continue;

      const gap = (key) =>
        (outside.components[key] - one.components[key]) * baseline.weights[key];
      const strongAttack = gap('st') > 0 && gap('roleAttack') > 0;
      const flowSuppressed = gap('raceFlow') < 0;
      if (!strongAttack || !flowSuppressed) continue;

      const record = {
        raceKey: row.raceKey,
        boatNo,
        winner: row.winnerBoatNo,
        st: gap('st'),
        roleAttack: gap('roleAttack'),
        raceFlow: gap('raceFlow'),
        exhibition: gap('exhibition'),
        courseIndex: gap('courseIndex')
      };

      if (row.winnerBoatNo === boatNo) groups.attackWin.push(record);
      else if (row.winnerBoatNo === 1) groups.innerWin.push(record);
    }
  }

  const attackWin = summarize(groups.attackWin);
  const innerWin = summarize(groups.innerWin);
  const comparison = compareGroups(attackWin, innerWin);
  const decision = decideNextStep(attackWin, innerWin, comparison);

  return {
    schemaVersion: 2,
    analysisId: 'flow-suppression-v2',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    humanApprovalRequiredForProduction: true,
    scope: {
      dataset: 'discovery-only',
      holdoutUsed: false,
      definition: '1号艇がbaseline top。3/4号艇がST・攻め役割で優位だがraceFlowで劣位',
      resultUsedForCandidateSelection: false
    },
    fixedRoutingRules: FIXED_ROUTING_RULES,
    attackWin,
    innerWin,
    comparison,
    conclusion: {
      status: decision.status,
      raceFlowSuppressionSupported: decision.raceFlowSuppressionSupported,
      productionRecommendation: 'no-change',
      reason: decision.reason
    },
    nextStep: decision.nextStep,
    records: groups
  };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  return OUTPUT;
}

if (require.main === module) {
  const report = build();
  if (process.argv.includes('--write')) {
    writeReport(report);
    console.log(JSON.stringify({
      output: path.relative(ROOT, OUTPUT),
      attackWin: report.attackWin,
      innerWin: report.innerWin,
      comparison: report.comparison,
      conclusion: report.conclusion,
      nextStep: report.nextStep
    }, null, 2));
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

module.exports = {
  FIXED_ROUTING_RULES,
  summarize,
  compareGroups,
  decideNextStep,
  build,
  writeReport
};
