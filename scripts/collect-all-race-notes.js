'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { prepareNoteInput } = require('./prepare-note-input');
const { auditNotePublication } = require('./note-publication-audit');
const { saveNoteDraftBundle } = require('./note-draft-bundle');
const { publicationPayload } = require('./note-publication-source');
const { exhibitionSnapshot } = require('./note-exhibition');
const { createDisplayCandidates } = require('../js/note-generator');

async function allRaceTargets(date, loadSchedule, now = Date.now()) {
  const index = await loadSchedule({ date });
  if (index?.ok !== true || index.date !== date) throw new Error('all_race_schedule_invalid');
  const targets = [], failures = [];
  for (const venue of index.venues || []) {
    const jcd = String(venue.jcd).padStart(2, '0');
    try {
      const response = await loadSchedule({ date, jcd });
      if (response?.ok !== true || response.date !== date || response.selectedVenue?.jcd !== jcd) {
        throw new Error('venue_schedule_identity_mismatch');
      }
      for (const race of response.selectedVenue.races || []) {
        if (race.selectable && Date.parse(race.deadlineAt) - now > 120000) {
          targets.push({ jcd, place: venue.place, eventGrade: venue.eventGrade || '', eventTitle: venue.eventTitle || '',
            raceNo: race.raceNo, deadlineAt: race.deadlineAt, forced: false });
        }
      }
    } catch (error) { failures.push({ jcd, reason: error.message }); }
  }
  return { targets: targets.sort((a, b) => Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt)), failures };
}

function existingRaces(date, rootDir, now) {
  const dir = path.join(rootDir, 'data/note-drafts', date);
  const ready = new Set();
  for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    try {
      const source = path.posix.join('data/note-drafts', date, file);
      const bytes = JSON.parse(fs.readFileSync(path.join(rootDir, source), 'utf8'));
      if (bytes.record?.publicationPolicy !== 'all-races-v1') continue;
      ready.add(publicationPayload(source, rootDir, now).raceKey);
    } catch { /* Unusable snapshots never prevent a fresh collection. */ }
  }
  return ready;
}

async function collectAllRaceNotes({ date, loadSchedule, evaluate, createPrediction,
  createPracticalSelection, generateArticle, compactPrediction, fetchOdds,
  dryRun = false, rootDir = process.cwd(), now = Date.now } = {}) {
  const { targets, failures } = await allRaceTargets(date, loadSchedule, now());
  const existing = existingRaces(date, rootDir, now());
  const pending = targets.filter(r => !existing.has(`${date}-${r.jcd}-${r.raceNo}`));
  const summary = { date, targetCount: targets.length, existing: targets.length - pending.length,
    evaluated: 0, waitingExhibition: 0, generated: 0, saved: 0, failures };
  // Keep the existing prediction engine and its bounded API workers. Scores and
  // V2 research completeness do not decide whether a race is covered here.
  const result = await evaluate(pending);
  for (const attempt of result.attempts || []) {
    if (attempt.status !== 'evaluated') failures.push({ jcd: attempt.jcd, raceNo: attempt.raceNo,
      reason: attempt.error || attempt.status });
  }
  for (const item of result.comparison || []) {
    summary.evaluated++;
    const raceKey = `${date}-${item.jcd}-${item.raceNo}`;
    try {
      const exhibition = exhibitionSnapshot(item.rawRaceData || item.raceData, new Date(now()).toISOString());
      if (!exhibition.ready) { summary.waitingExhibition++; continue; }
      const prediction = createPrediction(item.raceData);
      prediction.race = { ...prediction.race, grade: item.eventGrade || prediction.race?.grade || '' };
      prediction.predictionMode = 'server_pre_deadline';
      prediction.officialResultUsedForPrediction = false;
      const baseline = structuredClone(createPracticalSelection(prediction));
      const record = { reviewEvidence: require('./race-review-evidence').reviewEvidence(prediction), publicationPolicy: 'all-races-v1', exhibitionSnapshot: exhibition, raceKey, date, jcd: item.jcd,
        place: item.place, raceNo: item.raceNo, deadlineAt: item.deadlineAt,
        selectedAt: new Date(now()).toISOString() };
      // Freeze the existing A/B experiment while full pre-race evidence is present.
      try {
        const selection = global.ChappyPracticalSelection?.select?.(prediction) || prediction.practicalSelection;
        record.practicalSelectionEvidence = require('./practical-selection-evidence').capture(record, baseline, selection);
        record.outerAttackShadow = require('../js/outer-attack-ticket-shadow').buildSnapshot({
        ...record, evaluatedScenarioCandidates: require('../js/evaluated-scenario-candidates').build(prediction),
        prediction: { practicalTickets: baseline,
          practicalSelection: selection }
      }, { now: record.selectedAt }); } catch (error) {
        record.outerAttackShadow = { status: 'capture-error', error: String(error.message).slice(0, 160) };
      }
      // Research evidence must survive an article audit failure. No publishing here.
      if (!dryRun) {
        try { require('./outer-attack-live-source').saveSource(record, baseline, { rootDir, now: now() }); }
        catch (error) { failures.push({ raceKey, reason: error.message }); }
      }
      const prepared = await prepareNoteInput({ prediction, baseline, record, fetchOdds, now });
      record.prediction = compactPrediction(prepared.prediction, prepared.baseline, item.raceData);
      record.prediction.candidate24Tickets = createDisplayCandidates(prepared.prediction, prepared.baseline);
      const article = generateArticle(prepared.prediction, { practicalTickets: prepared.baseline });
      const audit = auditNotePublication({ article, record, baselinePracticalTickets: prepared.baseline,
        now: new Date(now()).toISOString() });
      if (!audit.contentReady) {
        failures.push({ raceKey, reason: article.error || 'content_audit_blocked',
          issues: audit.issues.map(i => i.code) });
        continue;
      }
      record.note = { audit };
      summary.generated++;
      if (!dryRun) {
        const saved = saveNoteDraftBundle({ article, record, baselinePracticalTickets: prepared.baseline,
          oddsSnapshot: prepared.oddsSnapshot, sourceCommit: process.env.GITHUB_SHA || null }, { rootDir });
        if (saved.status !== 'saved') throw new Error('note_source_not_saved');
        summary.saved++;
      }
    } catch (error) { failures.push({ raceKey, reason: error.message }); }
  }
  console.log(`NOTE_ALL_RACES=${JSON.stringify(summary)}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `全レース原稿: 対象${summary.targetCount}R / 保存済み${summary.existing}R / 展示待ち${summary.waitingExhibition}R / 今回保存${summary.saved}R / 取得・生成の問題${failures.length}件\n\n` +
    failures.map(f => `- ${f.raceKey || [f.jcd, f.raceNo].filter(Boolean).join('-')}: ${f.reason}`).join('\n') + '\n');
  return summary;
}

module.exports = { allRaceTargets, existingRaces, collectAllRaceNotes };
