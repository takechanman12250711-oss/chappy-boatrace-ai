'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { requireExhibition } = require('./note-exhibition');
const VERSION = 'omura-reporter-reference-v1';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const urlFor = (date, raceNo) => `https://omurakyotei.jp/yosou/m/chokuzen.php?day=${date}&race=${raceNo}`;
function text(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(?:br\b[^>]*|\/p|\/div|\/tr)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&#x([a-f\d]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').normalize('NFKC');
}
function tickets(value, allowNone = false) {
  const s = value.normalize('NFKC').trim().replace(/[−‐–]/g, '-');
  if (allowNone && /^(?:なし|無し)$/.test(s)) return [];
  const parts = s.split(/[\s、,\/]+/).filter(Boolean), out = new Set();
  if (!parts.length) throw new Error('tickets_missing');
  for (const part of parts) {
    // A single '=' means reverse the adjacent finishing positions. Unknown
    // notation is rejected in full, never partially parsed as fewer tickets.
    const m = part.match(/^([1-6]+)([-=])([1-6]+)([-=])([1-6]+)$/);
    if (!m || (m[2] === '=' && m[4] === '=')) throw new Error('ticket_notation_unsupported');
    for (const a of m[1]) for (const b of m[3]) for (const c of m[5]) {
      if (new Set([a,b,c]).size !== 3) continue;
      out.add(`${a}-${b}-${c}`);
      if (m[2] === '=') out.add(`${b}-${a}-${c}`);
      if (m[4] === '=') out.add(`${a}-${c}-${b}`);
    }
  }
  if (!out.size) throw new Error('tickets_empty');
  return [...out].sort();
}
function decode(bytes) {
  // This page's HTTP header says UTF-8 while its actual bytes and meta tag
  // are Shift_JIS. Use the document declaration; do not salvage mojibake.
  const header = Buffer.from(bytes).subarray(0, 2048).toString('latin1');
  const encoding = /charset\s*=\s*["']?shift[_-]jis/i.test(header) ? 'shift_jis' : 'utf-8';
  return { html: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding };
}
function parsePage(bytes, { date, raceNo }) {
  const { html, encoding } = decode(bytes), plain = text(html);
  if (/公開までしばらくお待ちください/.test(plain)) return { status: 'not_published', encoding };
  if (plain.includes('展示航走後の直前生予想') && /<div\s+class=["']tinymce["']>\s*<\/div>/i.test(html) &&
      html.includes(`syussou.php?day=${date}&amp;race=${raceNo}`)) return { status: 'not_published', encoding };
  if (!plain.includes('展示航走後の直前生予想') || !plain.includes('[記者の直前予想]'))
    throw new Error('post_exhibition_section_missing');
  const identity = plain.match(/(\d{4})年(\d{2})月(\d{2})日\s*(\d{1,2})R/);
  if (!identity || identity.slice(1,4).join('') !== date || Number(identity[4]) !== raceNo)
    throw new Error('source_race_mismatch');
  const deadline = plain.match(/場外締切予定時刻\s*(\d{2}:\d{2})/);
  const updated = plain.match(/更新時間\s*:\s*(\d{2}:\d{2})/);
  if (!deadline || !updated) throw new Error('source_time_missing');
  const iso = time => `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${time}:00+09:00`;
  const section = plain.split('[記者の直前予想]')[1];
  const main = section.match(/【本命】([^【]*)/), aim = section.match(/【狙い目】([^【]*)/);
  if (!main || !aim) throw new Error('reporter_tickets_missing');
  const exhibition = [];
  const rows = html.matchAll(/<td\s+rowspan=["']2["'][^>]*>([1-6])<\/td>\s*<td\s+colspan=["']7["'][^>]*>[\s\S]*?<\/td>\s*<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const m of rows) {
    const cells = [...m[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => text(c[1]).trim());
    if (cells.length !== 7 || !/^F?(?:0?\.\d{2})$/.test(cells[0]) || !/^\d\.\d{2}$/.test(cells[1]))
      throw new Error('source_exhibition_incomplete');
    const st = Number(cells[0].replace('F', '')) * (cells[0].startsWith('F') ? -1 : 1);
    exhibition.push({ boat: Number(m[1]), course: exhibition.length + 1, st, displayTime: Number(cells[1]) });
  }
  if (exhibition.length !== 6 || new Set(exhibition.map(e=>e.boat)).size !== 6)
    throw new Error('source_exhibition_incomplete');
  return { status: 'ready', encoding, raceKey: `${date}-24-${raceNo}`,
    deadlineAt: iso(deadline[1]), updatedAt: iso(updated[1]),
    mainTickets: tickets(main[1]), aimTickets: tickets(aim[1], true), exhibition };
}
function normalizeTickets(values) {
  if (!Array.isArray(values) || !values.length || values.length > 10) throw new Error('chappy_tickets_invalid');
  const result = values.map(t => typeof t === 'string' ? t : t.ticket);
  if (result.some(t => typeof t !== 'string' || !/^[1-6]-[1-6]-[1-6]$/.test(t) || new Set(t.split('-')).size !== 3) ||
      new Set(result).size !== result.length) throw new Error('chappy_tickets_invalid');
  return result.sort();
}
function validateBundle(bundle, file, bytes, now) {
  const r = bundle?.record;
  if (bundle?.version !== 'note-draft-bundle-v1' || r?.publicationPolicy !== 'all-races-v1' ||
      r?.jcd !== '24' || r.raceKey !== `${r.date}-24-${r.raceNo}` || !/^\d{8}-24-([1-9]|1[0-2])$/.test(r.raceKey) ||
      !Number.isInteger(r.raceNo) ||
      file !== `data/note-drafts/${r.date}/${r.raceKey}-${hash(bytes)}.json` ||
      r.reviewEvidence?.predictionMode !== 'server_pre_deadline' || r.reviewEvidence?.officialResultUsedForPrediction !== false)
    throw new Error('chappy_source_invalid');
  requireExhibition(r);
  const captured = Date.parse(r.selectedAt), deadline = Date.parse(r.deadlineAt);
  if (!Number.isFinite(now) || !Number.isFinite(captured) || !Number.isFinite(deadline) || captured > now ||
      deadline - now <= 120000) throw new Error('outside_capture_window');
  if (now - captured > 15 * 60000) throw new Error('chappy_snapshot_older_than_15_minutes');
  const practical = normalizeTickets(bundle.baselinePracticalTickets);
  if (JSON.stringify(practical) !== JSON.stringify(normalizeTickets(r.prediction?.practicalTickets)))
    throw new Error('chappy_baseline_mismatch');
  return { r, practical };
}
function buildCapture({ bundle, file, bytes, responseBytes, startedAt, capturedAt, sourceCommit = null }) {
  // An event SHA can differ from the checkout on workflow reruns. Never infer
  // the executed code version from GITHUB_SHA; the collector passes its HEAD.
  if (sourceCommit !== null && (typeof sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(sourceCommit)))
    throw new Error('execution_source_commit_invalid');
  const now = Date.parse(capturedAt), { r, practical } = validateBundle(bundle, file, bytes, now);
  const page = parsePage(responseBytes, r);
  const common = { version: VERSION, raceKey: r.raceKey, date: r.date, capturedAt, startedAt,
    productionChanged: false, automaticProductionChange: false, usableForPrediction: false,
    sourceCommit,
    source: { url: urlFor(r.date, r.raceNo), sha256: hash(responseBytes), ...page },
    chappy: { sourcePath: file, sourceSha256: hash(bytes), capturedAt: r.selectedAt, deadlineAt: r.deadlineAt,
      method: r.reviewEvidence.method || null,
      mainBoat: r.prediction?.mainSheet?.honmei?.boatNo ?? null, practicalTickets: practical,
      exhibitionSnapshot: r.exhibitionSnapshot } };
  if (page.status !== 'ready') return { ...common, status: page.status };
  const start = Date.parse(startedAt), updated = Date.parse(page.updatedAt), deadline = Date.parse(page.deadlineAt);
  if (!Number.isFinite(start) || start > now || start < Date.parse(r.selectedAt) ||
      !Number.isFinite(updated) || !Number.isFinite(deadline) || updated > now || updated >= deadline || deadline - now <= 120000)
    return { ...common, status: 'source_time_invalid' };
  const snap = r.exhibitionSnapshot;
  const sameExhibition = page.exhibition.every(e => {
    const entry = snap.entries.find(v => Number(v.boat) === e.boat);
    const s = snap.startExhibition.find(v => Number(v.boat) === e.boat);
    return s && entry && Number(s.course) === e.course && Math.abs(Number(s.st) - e.st) < 0.001 &&
      Math.abs(Number(entry.exhibition.displayTime) - e.displayTime) < 0.001;
  });
  const gapSeconds = (now - Date.parse(r.selectedAt)) / 1000;
  const positions = values => [0,1,2].map(i => [...new Set(values.map(t => Number(t.split('-')[i])))].sort());
  return { ...common, status: sameExhibition ? 'captured' : 'exhibition_mismatch',
    comparison: { sameExhibition, captureGapSeconds: gapSeconds, withinFiveMinutes: gapSeconds <= 300,
      deadlineDifferenceSeconds: (deadline - Date.parse(r.deadlineAt)) / 1000,
      chappyTicketCount: practical.length, reporterMainTicketCount: page.mainTickets.length,
      reporterAimTicketCount: page.aimTickets.length, equalMainTicketCount: practical.length === page.mainTickets.length,
      chappyPositions: positions(practical), reporterMainPositions: positions(page.mainTickets),
      sharedMainTickets: practical.filter(t => page.mainTickets.includes(t)) } };
}
function saveCapture(value, root) {
  if (value.version !== VERSION || !/^\d{8}-24-([1-9]|1[0-2])$/.test(value.raceKey) || value.raceKey.slice(0,8) !== value.date)
    throw new Error('reference_identity_invalid');
  const bytes = JSON.stringify(value) + '\n', digest = hash(bytes);
  const file = path.join(root, 'data/omura-reference', value.date, `${value.raceKey}-${digest}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
    try { fs.linkSync(temp, file); } catch (error) {
      if (error.code !== 'EEXIST' || !fs.lstatSync(file).isFile() || fs.readFileSync(file, 'utf8') !== bytes) throw error;
    }
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return file;
}
module.exports = { VERSION, hash, urlFor, text, tickets, decode, parsePage, validateBundle, buildCapture, saveCapture };
