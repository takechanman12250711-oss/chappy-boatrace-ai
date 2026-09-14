'use strict';
function exhibitionSnapshot(data, capturedAt) {
  const entries = data?.entries || [];
  const starts = data?.startExhibition || [];
  const number = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const boats = entries.map(e => Number(e.boat));
  const valid = entries.length === 6 && new Set(boats).size === 6 && boats.every(b => b >= 1 && b <= 6) &&
    entries.every(e => number(e.exhibition?.displayTime) && Number(e.exhibition.displayTime) > 0) &&
    starts.length === 6 && new Set(starts.map(e => Number(e.boat))).size === 6 &&
    new Set(starts.map(e => Number(e.course))).size === 6 && starts.every(e => Number(e.course) >= 1 && Number(e.course) <= 6) &&
    starts.every(e => boats.includes(Number(e.boat)) && number(e.st) && e.mappingSource === 'official-start-image');
  return { version: 'note-exhibition-v1', ready: valid, capturedAt,
    entries: entries.map(e => ({ boat: e.boat, exhibition: { displayTime: e.exhibition?.displayTime ?? null } })),
    startExhibition: starts.map(e => ({ boat: e.boat, course: e.course, st: e.st, mappingSource: e.mappingSource })) };
}
function requireExhibition(record) {
  const snapshot = record?.exhibitionSnapshot;
  const time = Date.parse(snapshot?.capturedAt);
  if (!snapshot || snapshot.version !== 'note-exhibition-v1' || !exhibitionSnapshot(snapshot, snapshot.capturedAt).ready ||
      !Number.isFinite(time) || time > Date.parse(record.selectedAt) || time >= Date.parse(record.deadlineAt)) {
    throw new Error('note_exhibition_not_verified');
  }
}
module.exports = { exhibitionSnapshot, requireExhibition };
