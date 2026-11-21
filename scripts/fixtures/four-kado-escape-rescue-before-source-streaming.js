"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");

const base = require("../js/practical-selection");
const rescue = require("../js/four-kado-escape-rescue-fixed5");

const START_DATE = "20260824";
const OUT = path.join(
  process.cwd(),
  "data/stats/four-kado-escape-rescue-post-adoption-monitor.json"
);
const DIR = path.join(process.cwd(), "data/predictions");

function ticket(value) {
  const boats = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function input(row) {
  const source = row?.prediction?.preRaceConditions || row?.preRaceConditions;
  if (!source || !Array.isArray(source.boats) || source.boats.length < 5) {
    return null;
  }
  return {
    ...source,
    entries: source.boats.map(boat => ({ ...boat, waku: boat.boatNo })),
    boats: source.boats,
    date: row.date,
    jcd: row.jcd,
    stadiumCode: row.jcd,
    venueCode: row.jcd,
    place: row.place,
    stadiumName: row.place,
    placeName: row.place,
    venueName: row.place,
    raceNo: row.raceNo,
    rno: row.raceNo,
    deadlineAt: row.deadlineAt,
    weather: source.weather || {}
  };
}

function blank() {
  return {
    observedRows: 0,
    settledPostAdoptionRaces: 0,
    comparableRaces: 0,
    targetScenarioRaces: 0,
    selectedTargetScenarioRaces: 0,
    rescueTicketAlreadyPresentRaces: 0,
    replacementEligibleRaces: 0,
    rescueEligibleRaces: 0,
    rescueAppliedRaces: 0,
    productionHits: 0,
    counterfactualHits: 0,
    gains: 0,
    losses: 0,
    sameOutcomeRaces: 0,
    productionStake: 0,
    counterfactualStake: 0,
    productionReturn: 0,
    counterfactualReturn: 0,
    productionTicketCount: 0,
    counterfactualTicketCount: 0
  };
}

function add(summary, row) {
  summary.observedRows += row.observedRows || 0;
  summary.settledPostAdoptionRaces += row.settledPostAdoptionRaces || 0;
  if (!row.comparable) return;

  summary.comparableRaces += 1;
  if (row.targetScenario) summary.targetScenarioRaces += 1;
  if (row.selectedTargetScenario) summary.selectedTargetScenarioRaces += 1;
  if (row.rescueTicketAlreadyPresent) summary.rescueTicketAlreadyPresentRaces += 1;
  if (row.replacementEligible) summary.replacementEligibleRaces += 1;
  if (row.rescueEligible) summary.rescueEligibleRaces += 1;
  if (row.rescueApplied) summary.rescueAppliedRaces += 1;

  summary.productionStake += row.productionStake;
  summary.counterfactualStake += row.counterfactualStake;
  summary.productionTicketCount += row.productionTicketCount;
  summary.counterfactualTicketCount += row.counterfactualTicketCount;

  if (row.productionHit) {
    summary.productionHits += 1;
    summary.productionReturn += row.payout;
  }
  if (row.counterfactualHit) {
    summary.counterfactualHits += 1;
    summary.counterfactualReturn += row.payout;
  }

  if (row.productionHit && !row.counterfactualHit) summary.gains += 1;
  else if (!row.productionHit && row.counterfactualHit) summary.losses += 1;
  else summary.sameOutcomeRaces += 1;
}

function rate(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function done(summary) {
  const productionProfit = summary.productionReturn - summary.productionStake;
  const counterfactualProfit = summary.counterfactualReturn - summary.counterfactualStake;
  return {
    ...summary,
    productionHitRate: rate(summary.productionHits, summary.comparableRaces),
    counterfactualHitRate: rate(summary.counterfactualHits, summary.comparableRaces),
    targetScenarioSelectionRate: rate(
      summary.selectedTargetScenarioRaces,
      summary.targetScenarioRaces
    ),
    replacementEligibilityRate: rate(
      summary.replacementEligibleRaces,
      summary.selectedTargetScenarioRaces
    ),
    rescueApplicationRate: rate(
      summary.rescueAppliedRaces,
      summary.replacementEligibleRaces
    ),
    productionRecoveryRate: rate(summary.productionReturn, summary.productionStake),
    counterfactualRecoveryRate: rate(
      summary.counterfactualReturn,
      summary.counterfactualStake
    ),
    productionProfit,
    counterfactualProfit,
    hitDelta: summary.productionHits - summary.counterfactualHits,
    stakeDelta: summary.productionStake - summary.counterfactualStake,
    returnDelta: summary.productionReturn - summary.counterfactualReturn,
    profitDelta: productionProfit - counterfactualProfit,
    ticketCountDelta:
      summary.productionTicketCount - summary.counterfactualTicketCount
  };
}

function build() {
  const total = blank();
  const byDate = {};
  const samples = [];
  const seen = new Set();
  let latestDate = null;

  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter(name => /^\d{8}\.json$/.test(name)).sort()
    : [];

  for (const name of files) {
    const date = name.slice(0, 8);
    if (date < START_DATE) continue;

    latestDate = date;
    byDate[date] ||= blank();
    const data = JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));

    for (const row of [
      ...(data.predictions || []),
      ...(data.verificationPredictions || [])
    ]) {
      add(total, { observedRows: 1 });
      add(byDate[date], { observedRows: 1 });
      if (row?.result?.settled !== true) continue;

      const key = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const actual = ticket(
        row?.result?.resultTicket || row?.result?.review?.resultTicket
      );
      const predictionInput = input(row);
      if (!actual || !predictionInput) {
        add(total, { settledPostAdoptionRaces: 1 });
        add(byDate[date], { settledPostAdoptionRaces: 1 });
        continue;
      }

      const prediction = global.createPrediction(predictionInput);
      const counterfactual = base.select(prediction);
      const production = rescue.apply(prediction, counterfactual);
      const productionTickets = (production.tickets || []).map(ticket).filter(Boolean);
      const counterfactualTickets = (counterfactual.tickets || [])
        .map(ticket)
        .filter(Boolean);
      const productionSet = new Set(productionTickets);
      const counterfactualSet = new Set(counterfactualTickets);
      const audit = production?.expansionSummary?.fourKadoEscapeRescueFixed5 || null;
      const label = rescue.scenarioLabel(prediction, counterfactual);

      const targetScenario = label === rescue.TARGET_LABEL;
      const selectedTargetScenario =
        targetScenario &&
        counterfactual?.status === "selected" &&
        Array.isArray(counterfactual?.tickets) &&
        counterfactual.tickets.length > 0;
      const rescueTicketAlreadyPresent =
        selectedTargetScenario && counterfactualSet.has(rescue.RESCUE_TICKET);
      const replacementEligible =
        selectedTargetScenario &&
        !rescueTicketAlreadyPresent &&
        Boolean(ticket(counterfactual.tickets[counterfactual.tickets.length - 1]));
      const applied = audit?.applied === true;
      const changed =
        productionTickets.length !== counterfactualTickets.length ||
        [...productionSet].some(value => !counterfactualSet.has(value)) ||
        [...counterfactualSet].some(value => !productionSet.has(value));

      if (changed !== applied) throw new Error(`${key}: rescue audit mismatch`);
      if (applied && !replacementEligible) {
        throw new Error(`${key}: rescue outside replacement-eligible funnel`);
      }
      if (productionTickets.length !== counterfactualTickets.length) {
        throw new Error(`${key}: ticket count changed`);
      }

      const payout = Number(
        row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0
      );
      const summary = {
        settledPostAdoptionRaces: 1,
        comparable: true,
        targetScenario,
        selectedTargetScenario,
        rescueTicketAlreadyPresent,
        replacementEligible,
        rescueEligible: replacementEligible,
        rescueApplied: applied,
        productionHit: productionSet.has(actual),
        counterfactualHit: counterfactualSet.has(actual),
        productionStake: productionTickets.length * 100,
        counterfactualStake: counterfactualTickets.length * 100,
        productionTicketCount: productionTickets.length,
        counterfactualTicketCount: counterfactualTickets.length,
        payout
      };

      add(total, summary);
      add(byDate[date], summary);

      if (targetScenario) {
        samples.push({
          raceKey: key,
          date,
          jcd: row.jcd,
          raceNo: row.raceNo,
          place: row.place || "",
          scenarioLabel: label,
          actual,
          selectedTargetScenario,
          rescueTicketAlreadyPresent,
          replacementEligible,
          rescueApplied: applied,
          rescueTicket: rescue.RESCUE_TICKET,
          replacedTicket: audit?.replacedTicket || "",
          productionHit: summary.productionHit,
          counterfactualHit: summary.counterfactualHit,
          payoutPer100: payout,
          profitDelta:
            (summary.productionHit ? payout : 0) -
            (summary.counterfactualHit ? payout : 0)
        });
      }
    }
  }

  const report = {
    schemaVersion: 2,
    version: "four-kado-escape-rescue-post-adoption-monitor-v2",
    generatedAt: new Date().toISOString(),
    adoptionPr: 610,
    adoptionMergedAt: "2026-08-23T14:07:58Z",
    startDate: START_DATE,
    latestDate,
    method:
      "2026-08-24以降の確定レースをA=現行本番の1-2-4救済あり、B=同じcurrent-main選定から当該救済だけ外した状態で同点数比較。主展開4カド攻め→selected到達→1-2-4既存→置換可能→発動を段階別に監視。8/23は反映前後混在を避けるため除外。",
    productionChanged: false,
    automaticApplication: false,
    total: done(total),
    byDate: Object.fromEntries(
      Object.entries(byDate).map(([date, summary]) => [date, done(summary)])
    ),
    targetScenarioSamples: samples,
    appliedSamples: samples.filter(sample => sample.rescueApplied)
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (require.main === module) console.log(JSON.stringify(build(), null, 2));

module.exports = { START_DATE, blank, done, build };
