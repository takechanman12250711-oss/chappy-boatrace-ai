'use strict';
// Exploratory only. Never imported by prediction generation or forward capture.
const frozen = require('./research-escape-partners.cjs');
const VERSION = 'partner-third-evidence-guard-v1';
function select(row) {
  const original = frozen.select(row, {samples:0, pairs:{}});
  if (original.reason) return original;
  const removed = original.baseline.filter(t => !original.guarded.includes(t));
  const added = original.guarded.filter(t => !original.baseline.includes(t));
  // Presence in any saved observation protects a third-place role. Absence is
  // not evidence that the boat cannot finish third; this is a conservative gate.
  const protectedThirds = removed.filter(ticket => row.evidence.stageHistory.candidateDecisions
    .some(d => d.ticket === ticket && d.branchIds?.length && frozen.groundedPositions(d).includes(3)));
  const incompleteAdditions = added.filter(ticket =>
    !original.rankingEvidence.find(d => d.ticket === ticket)?.completeRoles);
  const thirdGuardApplied = protectedThirds.length > 0 || incompleteAdditions.length > 0;
  return {...original, thirdGuardApplied, protectedThirds, incompleteAdditions,
    thirdGuard: [...(thirdGuardApplied ? original.baseline : original.guarded)]};
}
module.exports = {VERSION, select};
