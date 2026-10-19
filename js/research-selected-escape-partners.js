/* Research only. This module is never imported by the prediction collector. */
(function (root, factory) {
  'use strict';
  const api = factory();
  root.ChappyResearchSelectedEscapePartners = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const CANDIDATE_ID = 'selected-escape-partner-order-v2';
  const PROFILE_SOURCE = 'research-alternate-escape-partner-roles-v1';
  const array = value => Array.isArray(value) ? value : [];
  const ticketOf = row => typeof row === 'string' ? row : row?.ticket;
  function boats(ticket) {
    if (typeof ticket !== 'string' || !/^[1-6]-[1-6]-[1-6]$/.test(ticket)) return null;
    const values = ticket.split('-').map(Number);
    return new Set(values).size === 3 ? values : null;
  }
  function protectedRow(row) {
    return [row.category, row.displayCategory, row.sourceCategory, ...array(row.categories)]
      .some(value => ['本線', '本命', '流し', 'main', 'flow', 'nagashi'].includes(value));
  }
  function adopted(row) {
    return row && row.qualified !== false && row.isAdopted !== false &&
      !/不成立|除外|非採用|見送り/.test(String(row.status || '')) &&
      Number.isFinite(row.score) && row.score >= 65 &&
      typeof row.reason === 'string' && row.reason.trim().length > 0;
  }
  function select(prediction, baselineSelection, formation) {
    const baseline = baselineSelection?.tickets;
    const unchanged = (reasonCode, targetHead = null, evidence = {}) => ({
      candidateId: CANDIDATE_ID, changed: false, reasonCode, targetHead,
      tickets: baseline, added: [], removed: [], evidence,
      productionChanged: false, automaticApplication: false, usableForPrediction: false
    });
    if (!Array.isArray(baseline) || !baseline.length || baseline.length > 10 ||
        baseline.some(row => !row || typeof row !== 'object' || !boats(row.ticket)) ||
        new Set(baseline.map(row => row.ticket)).size !== baseline.length) {
      return unchanged('INVALID_BASELINE_TICKETS');
    }
    if (baseline.some(row => typeof row.category !== 'string' || !row.category)) {
      return unchanged('BASELINE_CATEGORY_MISSING');
    }
    const captured = baselineSelection.candidateValidationEvidence;
    if (captured?.version !== 'candidate-validation-evidence-v1' || captured.status !== 'captured' ||
        captured.resultUsedForGeneration !== false || !Array.isArray(captured.finalSelectedTickets) ||
        JSON.stringify(captured.finalSelectedTickets) !== JSON.stringify(baseline.map(row => row.ticket)) ||
        !Array.isArray(captured.observations) || !Array.isArray(captured.branches) ||
        !Array.isArray(captured.poolTickets) ||
        baseline.some(row => !captured.poolTickets.includes(row.ticket))) {
      return unchanged('BASELINE_EVIDENCE_MISMATCH');
    }
    const mapping = prediction?.aiCore?.courseMapping || prediction?.courseMapping;
    const courseRows = mapping?.byBoat && typeof mapping.byBoat === 'object'
      ? Object.entries(mapping.byBoat).map(([boatNo, course]) => [Number(boatNo), Number(course)]) : [];
    if (mapping?.formal !== true || courseRows.length !== 6 ||
        new Set(courseRows.map(row => row[0])).size !== 6 ||
        new Set(courseRows.map(row => row[1])).size !== 6 ||
        courseRows.some(row => row.some(value => !Number.isInteger(value) || value < 1 || value > 6))) {
      return unchanged('OFFICIAL_COURSE_MAPPING_UNAVAILABLE');
    }
    const courseByBoat = new Map(courseRows);
    const head = courseRows.find(row => row[1] === 1)[0];
    const main = prediction?.aiCore?.raceScenarios?.mainScenario;
    if (!['threeAttack', 'fourAttack'].includes(main?.type) ||
        Number(main?.attackerBoatNo ?? main?.headBoatNo) === head) {
      return unchanged('MAIN_SCENARIO_OUTSIDE_SCOPE', head);
    }
    const indexes = baseline.map((row, index) =>
      boats(row.ticket)[0] === head && !protectedRow(row) ? index : -1).filter(index => index >= 0);
    if (!indexes.length) return unchanged('NO_SELECTED_ESCAPE_HEAD_SLOTS', head);
    const profiles = formation?.researchAlternateEscapePartnerRoles;
    const scenarioId = `independent:escape:${head}`;
    if (!Array.isArray(profiles) || profiles.length !== 1) return unchanged('ESCAPE_PROFILE_UNAVAILABLE', head);
    const profile = profiles[0];
    if (profile?.source !== PROFILE_SOURCE || profile.theorySource !== 'ai-core-hold-pickup-theory-v2' ||
        profile.scenarioId !== scenarioId || profile.scenarioType !== 'escape' ||
        profile.attackerBoatNo !== head || profile.attackerCourse !== 1 ||
        profile.mainScenarioType !== main.type || profile.mappingFormal !== true ||
        profile.isFormal !== true || profile.isProvisional !== false ||
        !Array.isArray(profile.courses) || profile.courses.length !== 6 ||
        new Set(profile.courses.map(row => row.boatNo)).size !== 6 ||
        new Set(profile.courses.map(row => row.course)).size !== 6 ||
        !profile.courses.every(row => courseByBoat.get(row.boatNo) === row.course)) {
      return unchanged('ESCAPE_PROFILE_MISMATCH', head);
    }
    const validRoles = (rows, limit) => Array.isArray(rows) && rows.length > 0 && rows.length <= limit &&
      new Set(rows.map(row => row?.boatNo)).size === rows.length && rows.every(row => adopted(row) &&
        row.boatNo !== head && courseByBoat.has(row.boatNo) && courseByBoat.get(row.boatNo) === row.course &&
        row.source === PROFILE_SOURCE && row.qualificationSource === PROFILE_SOURCE &&
        row.scenarioId === scenarioId && row.scenarioType === 'escape' && row.attackerBoatNo === head);
    if (!validRoles(profile.secondCandidates, 3) || !validRoles(profile.thirdCandidates, 4)) {
      return unchanged('ESCAPE_PARTNER_ROLE_MISMATCH', head);
    }
    const branchesById = new Map();
    for (const branch of captured.branches) {
      if (!branch || typeof branch.id !== 'string' || branchesById.has(branch.id)) {
        return unchanged('BASELINE_BRANCH_EVIDENCE_MISMATCH', head);
      }
      branchesById.set(branch.id, branch);
    }
    const headProofs = [];
    for (const index of indexes) {
      const selectedTicket = baseline[index].ticket;
      let proof = null;
      for (const observation of captured.observations) {
        if (observation?.ticket !== selectedTicket || observation.valid !== true || observation.purchaseEligible !== true) continue;
        for (const branchId of array(observation.validPurchaseBranchIds)) {
          const branch = branchesById.get(branchId);
          if (!branch || branch.ticket !== selectedTicket || branch.qualified !== true ||
              branch.kind !== 'canonical-formation' || !/^base-formation:(main|cover|flow|hole)$/.test(branch.source || '') ||
              !array(observation.inputBranchIds).includes(branchId) || !branch.scenarioId) continue;
          const claim = array(observation.coverage).find(row => row.branchId === branchId && row.position === 1 &&
            row.boatNo === head && ['head', 'attack', 'alternate-head'].includes(row.role) &&
            array(branch.roles).some(role => role.evaluationId === row.evaluationId && role.boatNo === head &&
              role.role === row.role && JSON.stringify(role.eligiblePositions) === '[1]'));
          if (claim) {
            proof = { ticket: selectedTicket, branchId, scenarioId: branch.scenarioId,
              source: branch.source, evaluationId: claim.evaluationId, role: claim.role, position: 1, boatNo: head };
            break;
          }
        }
        if (proof) break;
      }
      if (!proof) return unchanged('SELECTED_HEAD_QUALIFICATION_UNAVAILABLE', head);
      headProofs.push(proof);
    }
    if (!Array.isArray(formation.safety) || formation.safety.some(row => !boats(ticketOf(row)))) {
      return unchanged('INVALID_HEAD_SPECIFIC_SAFETY_ORDER', head);
    }
    const secondByBoat = new Map(profile.secondCandidates.map(row => [row.boatNo, row]));
    const thirdByBoat = new Map(profile.thirdCandidates.map(row => [row.boatNo, row]));
    const protectedTickets = new Set(baseline.filter(protectedRow).map(row => row.ticket));
    const candidates = [];
    for (const value of formation.safety) {
      const ticket = ticketOf(value);
      const [first, second, third] = boats(ticket);
      if (first !== head || !secondByBoat.has(second) || !thirdByBoat.has(third) ||
          protectedTickets.has(ticket) || candidates.includes(ticket)) continue;
      candidates.push(ticket);
    }
    if (candidates.length < indexes.length) return unchanged('INSUFFICIENT_HEAD_SPECIFIC_SAFETY_CANDIDATES', head,
      { required: indexes.length, available: candidates.length, headProofs });
    const chosen = candidates.slice(0, indexes.length);
    const previous = indexes.map(index => baseline[index].ticket);
    const sameSet = chosen.every(ticket => previous.includes(ticket));
    const provenance = {
      headProofs, partnerSource: PROFILE_SOURCE, partnerScenarioId: scenarioId,
      headEvidenceOrigin: 'baseline-selected-canonical-branch',
      partnerEvidenceOrigin: 'head-specific-safety-hold-pickup-theory',
      sameOriginalBranch: false, v1IndependentBranchesPromoted: false,
      ranking: 'existing-head-specific-safety-order', replacedSlotCount: indexes.length,
      resultsUsedForSelection: false, oddsUsedForSelection: false
    };
    if (sameSet) return unchanged('ALREADY_TOP_K_HEAD_PARTNERS', head, provenance);
    const output = baseline.slice();
    indexes.forEach((index, rank) => {
      const ticket = chosen[rank];
      if (ticket === baseline[index].ticket) return;
      const [, second, third] = boats(ticket);
      const donor = baseline[index];
      const copyRole = row => ({ boatNo: row.boatNo, course: row.course, score: row.score,
        reason: row.reason, source: row.source, scenarioId: row.scenarioId, attackerBoatNo: row.attackerBoatNo });
      output[index] = {
        ticket, category: donor.category,
        ...(typeof donor.displayCategory === 'string' ? { displayCategory: donor.displayCategory } : {}),
        ...(typeof donor.sourceCategory === 'string' ? { sourceCategory: donor.sourceCategory } : {}),
        source: CANDIDATE_ID, researchOnly: true,
        researchEvidence: { candidateId: CANDIDATE_ID, ...provenance,
          headProof: headProofs[rank], safetyRank: candidates.indexOf(ticket) + 1,
          second: copyRole(secondByBoat.get(second)), third: copyRole(thirdByBoat.get(third)) }
      };
    });
    return {
      candidateId: CANDIDATE_ID, changed: true, reasonCode: 'RESELECT_SELECTED_HEAD_PARTNERS', targetHead: head,
      tickets: output, added: chosen.filter(ticket => !previous.includes(ticket)),
      removed: previous.filter(ticket => !chosen.includes(ticket)), evidence: provenance,
      productionChanged: false, automaticApplication: false, usableForPrediction: false
    };
  }
  return Object.freeze({ CANDIDATE_ID, select });
});
