"use strict";
/** Research candidate. Not imported by the browser or production collector.
 * Reuse the selected scenario's already-computed per-boat finish scores.
 * Do not add ST/exhibition/skill again, use odds, change the head, or add tickets.
 */
const VERSION = "partner-role-upstream-reuse-v1";
const copy = value => JSON.parse(JSON.stringify(value));
const validBoat = value => Number.isInteger(value) && value >= 1 && value <= 6;
const scoreOK = value => typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 100;
const positiveRoute = /残し|残り|追走|拾い|まくり差し|最内差し|連動/;

function revise(legacy, scenario) {
  const result = copy(legacy);
  const diagnostic = result.partnerRevision = { version: VERSION, applied: false, reason: "", scoreSource: "scenario.outcome.boats", addedScore: 0 };
  const rows = scenario?.outcome?.boats;
  const roles = legacy?.roles;
  const complete = list => Array.isArray(list) && list.length === 6 && list.every(r => validBoat(r.boatNo)) && new Set(list.map(r => r.boatNo)).size === 6;
  if (legacy?.isFormal !== true || !complete(rows) || !complete(roles) ||
      !rows.every(r => scoreOK(r.secondScore) && scoreOK(r.thirdScore))) {
    diagnostic.reason = "incomplete-upstream-keep-current";
    return result;
  }
  const minimum = legacy.thresholds?.adopted;
  const secondLimit = legacy.thresholds?.secondLimit;
  const thirdLimit = legacy.thresholds?.thirdLimit;
  if (!Number.isFinite(minimum) || minimum < 1 || minimum > 100 ||
      !Number.isInteger(secondLimit) || secondLimit < 1 || secondLimit > 5 ||
      !Number.isInteger(thirdLimit) || thirdLimit < 1 || thirdLimit > 5) {
    diagnostic.reason = "invalid-existing-thresholds-keep-current";
    return result;
  }
  const byBoat = new Map(rows.map(row => [row.boatNo, row]));
  const grade = n => n >= 85 ? "S" : n >= 75 ? "A" : n >= 65 ? "B" : n >= 55 ? "C" : "D";
  result.roles = roles.map(old => {
    const row = byBoat.get(old.boatNo);
    const reasons = Array.isArray(row.reasons) ? row.reasons.filter(v => typeof v === "string") : [];
    // The old role supplies geometric route evidence, NOT an allowed-course filter.
    // Either surviving route or upstream positive scenario text can support evaluation.
    const routes = reasons.filter(reason => positiveRoute.test(reason));
    if (old.hold?.isAdopted) routes.push(String(old.hold.reason || ""));
    if (old.pickup?.isAdopted) routes.push(String(old.pickup.reason || ""));
    const routeReasons = [...new Set(routes.filter(v => v.trim()))];
    const revised = copy(old);
    for (const [role, field] of [["hold", "secondScore"], ["pickup", "thirdScore"]]) {
      const blocked = old.isAttackSource || old.isBlocked;
      const value = blocked || !routeReasons.length ? 1 : row[field];
      const adopted = !blocked && routeReasons.length > 0 && value >= minimum;
      const referenceMinimum = legacy.thresholds.reference ?? 55;
      const reference = !blocked && routeReasons.length > 0 && value >= referenceMinimum && value < minimum;
      const reason = blocked
        ? (old.isAttackSource ? "1着中心艇のため同一券の相手から除外" : "既存主展開の除外判定を維持")
        : !routeReasons.length ? "上流と既存役割のいずれにも残存経路の根拠がない"
        : `${routeReasons.join(" / ")} / 上流${role === "hold" ? "2着" : "3着"}評価${value}点を再加点せず使用`;
      revised[role] = {
        score: value, grade: grade(value), status: adopted ? "正式採用" : reference ? "参考" : "不成立",
        isFormal: true, isAdopted: adopted, isReference: reference,
        components: { upstreamScore: blocked || !routeReasons.length ? 0 : row[field], addedScore: 0 },
        reason, source: `scenario.outcome.boats.${field}`, sourceScore: row[field],
        routeReasons, previousScore: old[role]?.score ?? null
      };
    }
    revised.hasIndependentDualEvidence = old.hasIndependentDualEvidence === true && revised.hold.isAdopted && revised.pickup.isAdopted;
    return revised;
  });
  function rank(role, limit) {
    const ranked = result.roles.filter(r => r[role].isAdopted)
      .sort((a, b) => b[role].score - a[role].score ||
        (b[role].previousScore ?? 0) - (a[role].previousScore ?? 0) || a.course - b.course)
      .slice(0, limit)
      .map((r, i) => ({ boatNo: r.boatNo, playerName: r.playerName, course: r.course,
        score: r[role].score, grade: r[role].grade, status: r[role].status,
        reason: r[role].reason, components: r[role].components, rank: i + 1 }));
    ranked.forEach((r, i) => { r.isEquivalentToPrevious = i > 0 && Math.abs(r.score - ranked[i - 1].score) <= (legacy.thresholds.equivalentDifference ?? 2); });
    return ranked;
  }
  result.secondCandidates = rank("hold", secondLimit);
  result.thirdCandidates = rank("pickup", thirdLimit);
  result.referenceHold = result.roles.filter(r => r.hold.isReference).map(r => r.boatNo);
  result.referencePickup = result.roles.filter(r => r.pickup.isReference).map(r => r.boatNo);
  diagnostic.applied = true;
  diagnostic.reason = "upstream-individual-scores-with-route-evidence";
  result.source = VERSION;
  return result;
}

/** Replace exactly one internal function in a research VM; source files stay intact. */
function instrument(source) {
  const needle = "function buildHoldPickupTheory(";
  if (source.split(needle).length !== 2) throw Error("Expected exactly one role function");
  return source.replace(needle,
    `function buildHoldPickupTheory(...args) {\n  return window.__partnerRoleRevise(buildLegacyHoldPickupTheory(...args), args[2]);\n}\nfunction buildLegacyHoldPickupTheory(`);
}
module.exports = { VERSION, revise, instrument };
