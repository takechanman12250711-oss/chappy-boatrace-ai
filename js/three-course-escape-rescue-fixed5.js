(function(root){
  "use strict";

  const VERSION = "20260823-three-course-134-v1";
  const TARGET_LABEL = "3コース攻め";
  const RESCUE_TICKET = "1-3-4";
  const RESCUE_CATEGORY = "検証済み救済";
  const RESCUE_TIER = "検証済み1点置換";

  function ticketOf(row){
    return String(row?.ticket || row || "");
  }

  function scenarioLabel(prediction,result){
    return String(
      result?.verificationEvidence?.mainScenario?.label ||
      result?.evidence?.raceFlow?.title ||
      prediction?.verificationEvidence?.mainScenario?.label ||
      prediction?.predictedScenarioTitle ||
      prediction?.raceFlow?.title ||
      prediction?.raceFlow?.scenario?.title ||
      ""
    ).trim();
  }

  function rescueMetadata(replacedTicket,index){
    return {
      applied: true,
      version: VERSION,
      targetLabel: TARGET_LABEL,
      ticket: RESCUE_TICKET,
      replacedTicket,
      index
    };
  }

  function replaceVerificationTicket(verificationEvidence,index,replacedTicket){
    if(!verificationEvidence || !Array.isArray(verificationEvidence.tickets)) return verificationEvidence;
    const tickets = verificationEvidence.tickets.map((row,i)=>
      i===index
        ? {
            ticket: RESCUE_TICKET,
            categories: [RESCUE_CATEGORY],
            selectionTier: RESCUE_TIER,
            branchIds: [],
            roleClaims: [],
            theoryClaims: [],
            threeCourseEscapeRescueFixed5: rescueMetadata(replacedTicket,index)
          }
        : row
    );
    return {...verificationEvidence,tickets};
  }

  function apply(prediction,result){
    if(!result || result.status !== "selected" || !Array.isArray(result.tickets) || !result.tickets.length) return result;
    if(scenarioLabel(prediction,result) !== TARGET_LABEL) return result;
    if(result.tickets.some(row=>ticketOf(row)===RESCUE_TICKET)) return result;

    const index = result.tickets.length - 1;
    const current = result.tickets[index];
    const replacedTicket = ticketOf(current);
    if(!replacedTicket) return result;

    const reason = `${TARGET_LABEL}時の検証済みイン逃げ救済として、点数を増やさず${replacedTicket}を${RESCUE_TICKET}へ1点置換。`;
    const rescuedRow = {
      ticket: RESCUE_TICKET,
      category: RESCUE_CATEGORY,
      displayCategory: RESCUE_CATEGORY,
      selectionTier: RESCUE_TIER,
      comment: reason,
      scenarioTitle: `${TARGET_LABEL}のイン逃げ救済`,
      scenarioSummary: reason,
      branchIds: [],
      requirementIds: [],
      validBranchIds: [],
      validPurchaseBranchIds: [],
      validIndependentBranchIds: [],
      validScenarioIds: [],
      validRequirementIds: [],
      coverage: [],
      coveredEvaluationIds: [],
      coveredBoatNos: [],
      evidenceReasons: ["discovery/holdout A/Bで1-3-4救済を検証済み"],
      evidenceQualified: true,
      purchaseEligible: true,
      expansionEligible: false,
      priorityScore: 0,
      threeCourseEscapeRescueFixed5: rescueMetadata(replacedTicket,index)
    };
    const tickets = result.tickets.slice();
    tickets[index] = rescuedRow;

    return {
      ...result,
      tickets,
      reason,
      verificationEvidence: replaceVerificationTicket(result.verificationEvidence,index,replacedTicket),
      expansionSummary: {
        ...(result.expansionSummary || {}),
        finalCount: tickets.length,
        threeCourseEscapeRescueFixed5: {
          ...rescueMetadata(replacedTicket,index),
          reason
        }
      }
    };
  }

  function install(api){
    if(!api || typeof api.select !== "function") return api;
    if(api.__threeCourseEscapeRescueFixed5Installed) return api;
    const originalSelect = api.select.bind(api);
    const wrapped = {
      ...api,
      __threeCourseEscapeRescueFixed5Installed: true,
      select(prediction){
        return apply(prediction,originalSelect(prediction));
      }
    };
    wrapped.createPracticalSelection = function(prediction){
      return wrapped.select(prediction).tickets;
    };
    if(root?.ChappyPracticalSelection === api) root.ChappyPracticalSelection = wrapped;
    return wrapped;
  }

  const helper = Object.freeze({
    VERSION,
    TARGET_LABEL,
    RESCUE_TICKET,
    RESCUE_CATEGORY,
    RESCUE_TIER,
    scenarioLabel,
    apply,
    install
  });

  if(root?.ChappyPracticalSelection){
    root.ChappyPracticalSelection = install(root.ChappyPracticalSelection);
  }
  root.ChappyThreeCourseEscapeRescueFixed5 = helper;

  if(typeof module !== "undefined" && module.exports){
    module.exports = helper;
  }
})(typeof window !== "undefined" ? window : globalThis);
