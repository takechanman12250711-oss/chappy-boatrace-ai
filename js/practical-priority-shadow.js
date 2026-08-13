(function (root, factory) {
  "use strict";

  const api = factory();
  root.ChappyPracticalPriorityShadow = api;

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = api;
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis,
  function () {
    "use strict";

    const VERSION = "1.0.0";
    const PROTECTED_CATEGORIES =
      Object.freeze(["本線", "流し"]);
    const REQUIRED_REASON_CODE =
      "CANDIDATE_ONLY_EVALUATION";
    const REQUIRED_FIRST_FORMATION_BRANCH =
      "formation:flow";
    const PRIORITY_SCORE_EXCLUSIVE_MINIMUM =
      90;
    const REQUIRED_SOURCE_SELECTION_FINGERPRINT =
      "evaluated-scenarios-v1|internal-score-v1|practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5-coursefailclosed1";
    const REQUIRED_STRUCTURED_ROLES =
      Object.freeze([
        Object.freeze({
          position: 1,
          role: "head"
        }),
        Object.freeze({
          position: 2,
          role: "hold"
        }),
        Object.freeze({
          position: 3,
          role: "pickup"
        })
      ]);
    const CONTRACT = Object.freeze({
      mode: "prospective-shadow-only",
      source: "already-produced-practical-selection",
      sourceCollection: "candidateOutcomes",
      candidateSelected: false,
      candidateReasonCode:
        REQUIRED_REASON_CODE,
      firstFormationBranch:
        REQUIRED_FIRST_FORMATION_BRANCH,
      headBoatNo: 1,
      exactStructuredRoles:
        REQUIRED_STRUCTURED_ROLES,
      priorityScoreExclusiveMinimum:
        PRIORITY_SCORE_EXCLUSIVE_MINIMUM,
      sourceSelectionFingerprint:
        REQUIRED_SOURCE_SELECTION_FINGERPRINT,
      protectedSelectedCategories:
        PROTECTED_CATEGORIES,
      weakestOrder:
        "priorityScore-asc,ticket-asc",
      candidateOrder:
        "priorityScore-desc,ticket-asc",
      replacementCondition:
        "candidate-priority-strictly-greater",
      replacementMode: "same-index-one-for-one",
      sourceTicketMustBeUnique: true,
      mutatesSelection: false,
      automaticApplication: false,
      usableForPrediction: false
    });

    function contractHash(value) {
      let hash = 2166136261;
      const text = JSON.stringify(value);
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    }

    const LOGIC_FINGERPRINT =
      `practical-priority-shadow-v1-${contractHash(CONTRACT)}`;

    function arrayify(value) {
      return Array.isArray(value)
        ? value
        : [];
    }

    function ticketOf(value) {
      const ticket = String(
        value?.ticket ?? value ?? ""
      ).trim();

      if (
        !/^[1-6]-[1-6]-[1-6]$/.test(
          ticket
        )
      ) {
        return "";
      }

      return new Set(
        ticket.split("-")
      ).size === 3
        ? ticket
        : "";
    }

    function priorityScoreOf(row) {
      const score = Number(
        row?.priorityScore
      );
      return Number.isFinite(score)
        ? score
        : 0;
    }

    function firstFormationBranch(row) {
      const branchId = arrayify(
        row?.branchIds
      )
        .map(String)
        .find(id =>
          /^formation:[^:]+:/.test(id)
        );

      return branchId
        ? branchId
            .split(":")
            .slice(0, 2)
            .join(":")
        : "";
    }

    function hasExactStructuredRoles(
      row,
      ticket
    ) {
      const boats = ticket
        .split("-")
        .map(Number);
      const roles = arrayify(
        row?.roleLabels
      )
        .filter(role =>
          role?.structured === true
        )
        .map(role => ({
          position: Number(
            role?.position
          ),
          role: String(
            role?.role || ""
          ),
          boatNo: Number(
            role?.boatNo || 0
          )
        }))
        .sort(
          (left, right) =>
            left.position -
              right.position ||
            left.role.localeCompare(
              right.role
            ) ||
            left.boatNo - right.boatNo
        );

      return (
        roles.length ===
          REQUIRED_STRUCTURED_ROLES.length &&
        REQUIRED_STRUCTURED_ROLES.every(
          (required, index) =>
            roles[index].position ===
              required.position &&
            roles[index].role ===
              required.role &&
            roles[index].boatNo ===
              boats[index]
        )
      );
    }

    function candidateRejectionReasons(
      row,
      sourceTicketCount,
      selectedTicketSet
    ) {
      const reasons = [];
      const ticket = ticketOf(row);
      const score = priorityScoreOf(row);

      if (row?.selected !== false) {
        reasons.push(
          "NOT_UNSELECTED"
        );
      }
      if (
        String(row?.reasonCode || "") !==
        REQUIRED_REASON_CODE
      ) {
        reasons.push(
          "WRONG_REASON_CODE"
        );
      }
      if (!ticket) {
        reasons.push("INVALID_TICKET");
      }
      if (
        ticket &&
        selectedTicketSet.has(ticket)
      ) {
        reasons.push(
          "TICKET_ALREADY_SELECTED"
        );
      }
      if (
        ticket &&
        sourceTicketCount.get(ticket) !== 1
      ) {
        reasons.push(
          "SOURCE_TICKET_NOT_UNIQUE"
        );
      }
      if (
        firstFormationBranch(row) !==
        REQUIRED_FIRST_FORMATION_BRANCH
      ) {
        reasons.push(
          "WRONG_FIRST_FORMATION_BRANCH"
        );
      }
      if (
        !ticket ||
        Number(ticket.split("-")[0]) !== 1
      ) {
        reasons.push("WRONG_HEAD");
      }
      if (
        !ticket ||
        !hasExactStructuredRoles(
          row,
          ticket
        )
      ) {
        reasons.push(
          "STRUCTURED_ROLE_CONTRACT_MISMATCH"
        );
      }
      if (
        score <=
        PRIORITY_SCORE_EXCLUSIVE_MINIMUM
      ) {
        reasons.push(
          "PRIORITY_NOT_ABOVE_90"
        );
      }

      return reasons;
    }

    function countByReason(rows) {
      const counts = {};

      rows.forEach(row => {
        row.rejectionReasons.forEach(
          reason => {
            counts[reason] =
              (counts[reason] || 0) + 1;
          }
        );
      });

      return counts;
    }

    function baseResult(
      baseTickets,
      diagnostics,
      status,
      reasonCode,
      sourceSelectionFingerprint
    ) {
      return {
        version: VERSION,
        logicFingerprint:
          LOGIC_FINGERPRINT,
        contract: CONTRACT,
        status,
        reasonCode,
        sourceSelectionFingerprint,
        eligible: false,
        applicationMode: "shadow-only",
        automaticApplication: false,
        usableForPrediction: false,
        affectsPrediction: false,
        affectsTickets: false,
        baseTickets: [...baseTickets],
        shadowTickets: [...baseTickets],
        replacement: null,
        diagnostics
      };
    }

    function build(selection = {}) {
      const generation =
        selection?.verificationEvidence?.generation || {};
      const sourceSelectionParts = [
        String(generation.logicFingerprint || ""),
        String(generation.confidenceDefinitionVersion || ""),
        String(generation.ticketPolicyVersion || "")
      ];
      const sourceSelectionFingerprint =
        sourceSelectionParts.every(Boolean)
          ? sourceSelectionParts.join("|")
          : "";
      const selectedRows = arrayify(
        selection?.tickets
      );
      const baseTickets = selectedRows
        .map(ticketOf);
      const selectedTicketSet =
        new Set(
          baseTickets.filter(Boolean)
        );
      const selectedSourceIsUnique =
        baseTickets.length ===
          selectedTicketSet.size &&
        baseTickets.every(Boolean);
      const sourceOutcomes = arrayify(
        selection?.candidateOutcomes
      );
      const sourceTicketCount =
        new Map();

      sourceOutcomes.forEach(row => {
        const ticket = ticketOf(row);
        if (!ticket) return;
        sourceTicketCount.set(
          ticket,
          (sourceTicketCount.get(ticket) ||
            0) + 1
        );
      });

      const evaluatedCandidates =
        sourceOutcomes.map(
          (row, sourceIndex) => ({
            row,
            sourceIndex,
            ticket: ticketOf(row),
            priorityScore:
              priorityScoreOf(row),
            rejectionReasons:
              candidateRejectionReasons(
                row,
                sourceTicketCount,
                selectedTicketSet
              )
          })
        );
      const eligibleCandidates =
        evaluatedCandidates
          .filter(candidate =>
            candidate.rejectionReasons
              .length === 0
          )
          .sort(
            (left, right) =>
              right.priorityScore -
                left.priorityScore ||
              left.ticket.localeCompare(
                right.ticket
              )
          );
      const replaceableSelected =
        selectedRows
          .map((row, selectedIndex) => ({
            row,
            selectedIndex,
            ticket: ticketOf(row),
            priorityScore:
              priorityScoreOf(row),
            category: String(
              row?.category || ""
            )
          }))
          .filter(row =>
            row.ticket &&
            !PROTECTED_CATEGORIES.includes(
              row.category
            )
          )
          .sort(
            (left, right) =>
              left.priorityScore -
                right.priorityScore ||
              left.ticket.localeCompare(
                right.ticket
              )
          );
      const best =
        eligibleCandidates[0] || null;
      const weakest =
        replaceableSelected[0] || null;
      const diagnostics = {
        sourceSelectionFingerprintValid:
          sourceSelectionFingerprint ===
          REQUIRED_SOURCE_SELECTION_FINGERPRINT,
        selectedSourceIsUnique,
        selectedCount:
          selectedRows.length,
        protectedSelectedCount:
          selectedRows.length -
          replaceableSelected.length,
        replaceableSelectedCount:
          replaceableSelected.length,
        sourceOutcomeCount:
          sourceOutcomes.length,
        uniqueSourceTicketCount:
          sourceTicketCount.size,
        eligibleCandidateCount:
          eligibleCandidates.length,
        rejectedCandidateCounts:
          countByReason(
            evaluatedCandidates
          )
      };

      if (
        sourceSelectionFingerprint !==
        REQUIRED_SOURCE_SELECTION_FINGERPRINT
      ) {
        return baseResult(
          baseTickets,
          diagnostics,
          "invalid-selection-generation",
          "SOURCE_SELECTION_GENERATION_MISMATCH",
          sourceSelectionFingerprint
        );
      }

      if (!selectedSourceIsUnique) {
        return baseResult(
          baseTickets,
          diagnostics,
          "invalid-selection-source",
          "SELECTED_SOURCE_NOT_UNIQUE",
          sourceSelectionFingerprint
        );
      }
      if (!best) {
        return baseResult(
          baseTickets,
          diagnostics,
          "no-eligible-candidate",
          "NO_ELIGIBLE_CANDIDATE",
          sourceSelectionFingerprint
        );
      }
      if (!weakest) {
        return baseResult(
          baseTickets,
          diagnostics,
          "no-replaceable-selected-ticket",
          "NO_REPLACEABLE_SELECTED_TICKET",
          sourceSelectionFingerprint
        );
      }
      if (
        best.priorityScore <=
        weakest.priorityScore
      ) {
        return baseResult(
          baseTickets,
          diagnostics,
          "candidate-not-stronger",
          "CANDIDATE_NOT_STRICTLY_STRONGER",
          sourceSelectionFingerprint
        );
      }

      const shadowTickets = [
        ...baseTickets
      ];
      shadowTickets[
        weakest.selectedIndex
      ] = best.ticket;
      const replacement = {
        sourceOutcomeIndex:
          best.sourceIndex,
        selectedIndex:
          weakest.selectedIndex,
        addedTicket: best.ticket,
        addedPriorityScore:
          best.priorityScore,
        addedReasonCode:
          REQUIRED_REASON_CODE,
        addedFirstFormationBranch:
          REQUIRED_FIRST_FORMATION_BRANCH,
        removedTicket:
          weakest.ticket,
        removedPriorityScore:
          weakest.priorityScore,
        removedCategory:
          weakest.category,
        priorityScoreDelta:
          best.priorityScore -
          weakest.priorityScore,
        ticketCountBefore:
          baseTickets.length,
        ticketCountAfter:
          shadowTickets.length
      };

      return {
        version: VERSION,
        logicFingerprint:
          LOGIC_FINGERPRINT,
        contract: CONTRACT,
        status: "eligible-replacement",
        reasonCode:
          "SHADOW_REPLACEMENT_ELIGIBLE",
        sourceSelectionFingerprint,
        eligible: true,
        applicationMode: "shadow-only",
        automaticApplication: false,
        usableForPrediction: false,
        affectsPrediction: false,
        affectsTickets: false,
        baseTickets,
        shadowTickets,
        replacement,
        diagnostics
      };
    }

    return Object.freeze({
      VERSION,
      LOGIC_FINGERPRINT,
      CONTRACT,
      PROTECTED_CATEGORIES,
      REQUIRED_REASON_CODE,
      REQUIRED_FIRST_FORMATION_BRANCH,
      PRIORITY_SCORE_EXCLUSIVE_MINIMUM,
      REQUIRED_SOURCE_SELECTION_FINGERPRINT,
      REQUIRED_STRUCTURED_ROLES,
      build
    });
  }
);
