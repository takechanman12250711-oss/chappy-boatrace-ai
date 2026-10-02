'use strict';
// Research only. Existing scenario branches determine eligible tickets; no odds.
const old = require('../js/outer-attack-ticket-shadow');
const { requireExhibition } = require('./note-exhibition');
const VERSION = 'outer-attack-all-scenarios-v1';
const normalize = old.normalizeTicket;
function compactPool(prediction) {
  const built = require('../js/evaluated-scenario-candidates').build(prediction);
  return { version: VERSION, candidatePool: (built.candidatePool || []).map(c => ({
    ticket: c.ticket, sourceCategory: c.sourceCategory, evidenceQualified: c.evidenceQualified === true,
    purchaseEligible: c.purchaseEligible === true, priorityScore: c.priorityScore,
    candidateKind: c.candidateKind, branchIds: c.branchIds || []
  })) };
}
function diagnose(record) {
  const pool = old.candidatePool(record), a = old.snapshotA(record), signal = old.detectSignal(record);
  const existing = new Set(a.entries.map(t => t.ticket));
  return { poolCount: pool.length, qualifiedCount: pool.filter(c => c.evidenceQualified === true).length,
    signal: signal.status, categories: Object.fromEntries(['cover','flow','hole'].map(category => {
      const rows = pool.filter(c => c.evidenceQualified === true && c.sourceCategory === category);
      const positions = rows.filter(c => [1,2].includes(normalize(c).split('-').map(Number).indexOf(signal.targetBoatNo)));
      return [category, { categoryCount: rows.length, targetPositionCount: positions.length,
        alreadySelectedCount: positions.filter(c => existing.has(c.ticket)).length,
        replacementCount: positions.filter(c => !existing.has(c.ticket)).length }];
    })) };
}
function capture(record, baseline, built) {
  requireExhibition(record);
  if (record.reviewEvidence?.officialResultUsedForPrediction !== false || record.reviewEvidence?.predictionMode !== 'server_pre_deadline') throw Error('research_not_pre_race');
  const a = baseline.map(normalize);
  if (!a.length || a.length > 10 || a.some(t => !t) || new Set(a).size !== a.length) throw Error('research_invalid_baseline');
  const courses = Object.fromEntries(record.exhibitionSnapshot.startExhibition.map(r => [r.boat, r.course]));
  const branches = (built.branches || []).filter(b => b.qualified === true && Number(courses[b.attackerBoatNo]) >= 3);
  const attackers = [...new Set(branches.map(b => Number(b.attackerBoatNo)))].sort();
  // Protect the production head and atomic two-ticket formation. Replace the
  // last other ticket only, one-for-one, using existing candidate priority.
  const protectedCategories = new Set(['main','本命','本線','flow','流し','フォーメーション']);
  let index = -1;
  baseline.forEach((t,i) => { const cat=t.sourceCategory||t.categoryKey||t.displayCategory||t.category||t.selectionTier; if(cat && !protectedCategories.has(cat)) index=i; });
  const variants = {};
  for (const boat of attackers) for (const position of [1,2,3]) {
    const ids = new Set(branches.filter(b => Number(b.attackerBoatNo) === boat).map(b => b.id));
    const candidates = (built.candidatePool || []).filter(c => c.evidenceQualified === true && normalize(c) &&
      c.ticket.split('-').map(Number)[position-1] === boat && (c.branchIds || []).some(id => ids.has(id)))
      .sort((l,r) => Number(r.purchaseEligible === true)-Number(l.purchaseEligible === true) ||
        Number(r.priorityScore || 0)-Number(l.priorityScore || 0) || l.ticket.localeCompare(r.ticket));
    const candidate = candidates.find(c => !a.includes(c.ticket));
    const b = [...a]; if (candidate && index >= 0) b[index] = candidate.ticket;
    variants[`boat${boat}-position${position}`] = { boat, course: courses[boat], position,
      status: !candidates.length ? 'no-grounded-candidate' : !candidate ? 'already-covered' : index < 0 ? 'no-unprotected-ticket' : 'changed',
      candidateCount: candidates.length, a, b,
      evidence: candidate ? { ticket: candidate.ticket, branchIds: candidate.branchIds.filter(id=>ids.has(id)),
        priorityScore: candidate.priorityScore, candidateKind: candidate.candidateKind } : null };
  }
  return { version: VERSION, raceKey: record.raceKey, capturedAt: record.selectedAt,
    deadlineAt: record.deadlineAt, method: record.reviewEvidence.method,
    sourceCommit: process.env.GITHUB_SHA || null, unitYen: 100,
    productionChanged: false, automaticApplication: false, resultUsedForGeneration: false,
    status: attackers.length ? 'captured' : 'no-grounded-outer-attack', attackers,
    multipleAttackers: attackers.length > 1, variants };
}
function valid(r, record) {
  if (!r || r.version !== VERSION || r.raceKey !== record.raceKey || r.capturedAt !== record.selectedAt ||
    r.deadlineAt !== record.deadlineAt || !/^[a-f0-9]{64}$/.test(r.method || '') || r.method !== record.reviewEvidence?.method ||
    r.productionChanged !== false || r.automaticApplication !== false || r.resultUsedForGeneration !== false || r.unitYen !== 100) return false;
  const a=record.practicalTickets.map(normalize);
  const courses=Object.fromEntries(record.exhibitionSnapshot.startExhibition.map(x=>[x.boat,Number(x.course)]));
  if (!Array.isArray(r.attackers) || new Set(r.attackers).size!==r.attackers.length ||
    r.attackers.some(b=>!Number.isInteger(b)||b<1||b>6||!(courses[b]>=3)) ||
    !r.variants || Object.keys(r.variants).length!==r.attackers.length*3 ||
    r.attackers.some(b=>[1,2,3].some(p=>{const v=r.variants[`boat${b}-position${p}`];return !v||v.boat!==b||v.course!==courses[b]||v.position!==p;}))) return false;
  return Object.values(r.variants || {}).every(v=>Array.isArray(v.a) && Array.isArray(v.b) &&
    JSON.stringify(v.a)===JSON.stringify(a) && v.b.length===a.length && new Set(v.b).size===a.length && v.b.every(normalize) &&
    (v.status==='changed' ? v.a.filter((t,i)=>t!==v.b[i]).length===1 && v.evidence?.branchIds?.length>0 : JSON.stringify(v.a)===JSON.stringify(v.b)));
}
module.exports={VERSION,compactPool,diagnose,capture,valid};
