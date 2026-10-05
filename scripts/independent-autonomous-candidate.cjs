'use strict';
// A new research hypothesis, NOT a port of Chat's judgment or a publication source.
// Only official pre-race facts enter the selector. No normal AI, odds or results.
const crypto = require('node:crypto');
const VERSION = 'independent-exhibition-dominance-v1';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const finite = n => typeof n === 'number' && Number.isFinite(n);
const boat = n => Number.isInteger(n) && n >= 1 && n <= 6;
const sameSix = rows => Array.isArray(rows) && rows.length === 6 && rows.every(r => boat(r.boat)) && new Set(rows.map(r => r.boat)).size === 6;
function officialInput(data, target, now = Date.now()) {
  const date = data?.date, jcd = String(data?.stadiumCode || '').padStart(2, '0');
  if (data?.ok !== true || data.source !== 'boatrace-official' || !/^\d{8}$/.test(date) ||
      jcd !== target.jcd || data.raceNo !== target.raceNo ||
      !/^(0[1-9]|1\d|2[0-4])$/.test(jcd) || !Number.isInteger(target.raceNo) || target.raceNo < 1 || target.raceNo > 12 ||
      new Date(now + 9*3600000).toISOString().slice(0,10).replaceAll('-', '') !== date ||
      !(Date.parse(data.fetchedAt) <= now && now < Date.parse(target.deadlineAt) - 120000) ||
      new Date(Date.parse(target.deadlineAt) + 9*3600000).toISOString().slice(0,10).replaceAll('-', '') !== date) throw Error('autonomous_official_identity_or_time_invalid');
  const urls = [data.entryUrl, data.beforeInfoUrl];
  urls.forEach((raw, i) => {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || !['www.boatrace.jp','boatrace.jp'].includes(u.hostname) || u.username || u.password || u.port ||
        u.pathname !== '/owpc/pc/race/' + ['racelist','beforeinfo'][i] || u.searchParams.get('hd') !== date ||
        u.searchParams.get('jcd') !== jcd || Number(u.searchParams.get('rno')) !== target.raceNo) throw Error('autonomous_official_url_invalid');
  });
  if (!sameSix(data.entries) || !sameSix(data.startExhibition) ||
      new Set(data.startExhibition.map(r=>r.course)).size !== 6 || data.startExhibition.some(r=>!boat(r.course) || !finite(r.st) || r.st < 0 || r.mappingSource !== 'official-start-image') ||
      data.entries.some(r=>!finite(r.exhibition?.displayTime) || r.exhibition.displayTime <= 0)) return null;
  // Explicit projection prevents accidental import of model scores/history/tickets.
  const rows = data.entries.map(e => {
    const s = data.startExhibition.find(r => r.boat === e.boat);
    return {boat:e.boat, course:s.course, st:s.st, marker:String(s.marker || ''), displayTime:e.exhibition.displayTime};
  }).sort((a,b)=>a.boat-b.boat);
  return {version:'independent-official-facts-v1', raceKey:`${date}-${jcd}-${target.raceNo}`, date, jcd,
    raceNo:target.raceNo, deadlineAt:target.deadlineAt, observedAt:data.fetchedAt,
    provenance:'parsed-official-response', urls, rows};
}
function select(input) {
  const base = {version:VERSION, status:'skipped', reason:'', kind:null, head:null, tickets:[],
    usableForPrediction:false, automaticApplication:false, chatEquivalent:false,
    unsupportedJudgment:['turn-tactics','remain-pickup','local-water','skill','motor']};
  const skip = reason => ({...base,reason});
  if (!sameSix(input?.rows) || new Set(input.rows.map(r=>r.course)).size !== 6 || input.rows.some(r=>!boat(r.course) ||
      !finite(r.st) || r.st < 0 || !finite(r.displayTime) || r.displayTime <= 0 || typeof r.marker !== 'string')) throw Error('autonomous_facts_invalid');
  const rows = input.rows;
  if (rows.some(r => r.marker)) return skip('start_marker_present');
  // Hypothesis: one strictly quickest exhibition starter, with no slower display
  // time than any opponent, is a possible head. This is NOT a proven race flow.
  const heads = rows.filter(a => rows.every(b => a.boat === b.boat || (a.st < b.st && a.displayTime <= b.displayTime)));
  if (heads.length !== 1) return skip('no_unique_exhibition_dominance');
  const head = heads[0], others = rows.filter(r=>r.boat !== head.boat), candidates=[];
  for (const b of others) for (const c of others) if (b.boat !== c.boat) candidates.push([b,c]);
  // Both finishing positions are preserved. Cross-position tradeoffs stay tied;
  // display time only breaks equal ST comparisons, never an ST disadvantage.
  const dominates = (a,b) => {
    for (const key of ['st','displayTime']) {
      const delta=a.map((r,i)=>r[key]-b[i][key]);
      if (delta.every(n=>n===0)) continue;
      return delta.every(n=>n<=0) && delta.some(n=>n<0);
    }
    return false;
  };
  const front = candidates.filter(a=>!candidates.some(b=>dominates(b,a)));
  if (!front.length || front.length > 7) return {...skip('ambiguous_ticket_front'),head:head.boat,kind:head.course===1?'escape':'upset'};
  return {...base,status:'selected',reason:'unique_head_and_complete_first_front',head:head.boat,
    kind:head.course===1?'escape':'upset',tickets:front.map(r=>[head.boat,...r.map(b=>b.boat)].join('-')).sort(),
    evidence:{headCourse:head.course,headST:head.st,headDisplayTime:head.displayTime}};
}
module.exports = {VERSION, hash, officialInput, select};
