'use strict';
const k = require('./note-korogashi-lifecycle.cjs');
const { jstDate } = require('./note-marketing-content');
const POLICY = 'daily-normal-first-eligible-v1';
function enabled(config) {
  const a = config.autoStart;
  if (a === undefined) return false;
  if (!a || a.policy !== POLICY || typeof a.enabled !== 'boolean' || a.articleSeries !== 'normal' ||
      a.maxCoursesPerDay !== 1 || a.targetYen !== 100000 || a.maxLegs !== 3)
    throw Error('korogashi_autostart_config_invalid');
  return a.enabled;
}
// Select only an already published, fully verified source. This function does
// not load results, register a course, publish, or change an existing request.
async function withAutoStart(config, state, {rows, source, now}) {
  const requests = k.requests(config);
  k.validateState(state);
  if (!enabled(config)) return {config, status:'disabled', skipped:[]};
  const day = jstDate(now);
  // Explicit requests and failed/finished attempts also consume today's slot.
  const occupied = [...requests, ...Object.values(state.plans).map(p=>p.request)]
    .some(r=>r.date===day && r.firstPublicationKey.endsWith(':normal'));
  if (occupied) return {config, status:'daily_course_exists', skipped:[]};
  const candidates = rows.filter(r=>r.articleSeries==='normal' &&
    r.raceKey?.startsWith(day+'-') && Date.parse(r.deadlineAt)-now>120000)
    .sort((a,b)=>Date.parse(a.deadlineAt)-Date.parse(b.deadlineAt) || a.publicationKey.localeCompare(b.publicationKey));
  const skipped=[];
  for (const row of candidates) {
    try {
      const r=k.request({id:`daily-${day}-normal-100000`,date:day,firstPublicationKey:row.publicationKey,
        targetYen:100000,maxLegs:3,selectionPolicy:k.POLICY});
      const {bytes,receipt}=await source(row);
      k.makeLeg(row,receipt,bytes,{balanceYen:null,legs:[]},now);
      return {config:{...config,requests:[...requests,r]},status:'selected',publicationKey:r.firstPublicationKey,skipped};
    } catch(e) {skipped.push({publicationKey:row.publicationKey,reason:e.message});}
  }
  return {config,status:'no_eligible_published_race',skipped};
}
module.exports={POLICY,enabled,withAutoStart};
