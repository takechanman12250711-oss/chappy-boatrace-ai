'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { requireExhibition } = require('./note-exhibition');
const VERSION = 'outer-attack-live-source-v1';
function validSource(source) {
  const r = source?.record, s = source?.snapshot;
  if (source?.version !== VERSION || !r || !s ||
      !/^\d{8}-(0[1-9]|1\d|2[0-4])-([1-9]|1[0-2])$/.test(r.raceKey) ||
      r.raceKey !== `${r.date}-${r.jcd}-${r.raceNo}` ||
      !Number.isFinite(Date.parse(r.selectedAt)) || !Number.isFinite(Date.parse(r.deadlineAt)) ||
      Date.parse(r.selectedAt) >= Date.parse(r.deadlineAt) ||
      r.reviewEvidence?.predictionMode !== 'server_pre_deadline' ||
      r.reviewEvidence?.officialResultUsedForPrediction !== false ||
      s.experimentId !== 'outer-attack-ticket-shadow-v1' || s.sourceRaceKey !== r.raceKey ||
      s.captureAt !== r.selectedAt || s.captureKey !== `${r.raceKey}|${r.selectedAt}` ||
      s.resultUsedForGeneration !== false || s.productionChanged !== false || s.automaticApplication !== false) return false;
  try { requireExhibition(r); } catch { return false; }
  const tickets = (r.practicalTickets || []).map(t => typeof t === 'string' ? t : t.ticket).sort();
  return tickets.length > 0 && tickets.length <= 10 && new Set(tickets).size === tickets.length &&
    tickets.every(t => /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3) &&
    JSON.stringify(tickets) === JSON.stringify((s.a?.entries || []).map(t => t.ticket).sort());
}
function saveSource(record, practicalTickets, { rootDir, now = Date.now() }) {
  const { raceKey, date, jcd, raceNo, selectedAt, deadlineAt, exhibitionSnapshot, reviewEvidence } = record;
  const source = { version: VERSION, record: { raceKey, date, jcd, raceNo, selectedAt, deadlineAt,
    exhibitionSnapshot, reviewEvidence, practicalTickets }, snapshot: record.outerAttackShadow };
  if (!validSource(source) || now >= Date.parse(deadlineAt) || now < Date.parse(selectedAt)) throw new Error('outer_live_source_invalid');
  const bytes = JSON.stringify(source) + '\n';
  const digest = createHash('sha256').update(bytes).digest('hex');
  const file = path.join(rootDir, 'data/outer-attack-sources', date, `${raceKey}-${digest}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    try { fs.linkSync(temp, file); } catch (error) {
      if (error.code !== 'EEXIST' || !fs.lstatSync(file).isFile() || fs.readFileSync(file, 'utf8') !== bytes) throw error;
    }
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return file;
}
module.exports = { VERSION, validSource, saveSource };
