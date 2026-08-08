"use strict";

const fs = require("node:fs");
const path = require("node:path");

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function unique(values) {
  return [...new Set(values.filter(value => value !== null && value !== undefined && value !== ""))];
}

function mergeEvidenceIntoPracticalTickets(prediction) {
  if (!prediction || typeof prediction !== "object") return prediction;
  const evidence = prediction.verificationEvidence;
  if (!evidence || typeof evidence !== "object" || !Array.isArray(evidence.tickets)) {
    return prediction;
  }

  const evidenceByTicket = new Map(
    evidence.tickets
      .map(row => [normalizeTicket(row?.ticket), row])
      .filter(([ticket]) => ticket)
  );

  if (Array.isArray(prediction.practicalTickets)) {
    prediction.practicalTickets = prediction.practicalTickets.map(item => {
      const row = typeof item === "string" ? { ticket: item } : { ...(item || {}) };
      const ticket = normalizeTicket(row.ticket || row.line || row.formation);
      const evidenceTicket = evidenceByTicket.get(ticket);
      if (!evidenceTicket) return row;

      const evidenceCategories = [
        evidenceTicket.category,
        ...(Array.isArray(evidenceTicket.categories) ? evidenceTicket.categories : [])
      ];
      const baseCategories = Array.isArray(row.categories) ? row.categories : [];
      const categories = unique([...baseCategories, ...evidenceCategories]);
      if (categories.length) row.categories = categories;
      if (!row.category && evidenceTicket.category) row.category = evidenceTicket.category;
      if (!row.role && evidenceTicket.role) row.role = evidenceTicket.role;
      if (!row.selectionTier && evidenceTicket.selectionTier) {
        row.selectionTier = evidenceTicket.selectionTier;
      }

      if (Array.isArray(evidenceTicket.roleClaims)) row.roleClaims = evidenceTicket.roleClaims;
      if (Array.isArray(evidenceTicket.theoryClaims)) row.theoryClaims = evidenceTicket.theoryClaims;
      return row;
    });
  }

  delete evidence.tickets;
  return prediction;
}

function removeDuplicateVerificationFlags(record) {
  if (!record || typeof record !== "object") return record;
  const prediction = record.prediction;
  if (!prediction || typeof prediction !== "object") return record;
  if (
    Object.prototype.hasOwnProperty.call(record, "isRetrospective") &&
    prediction.isRetrospective === record.isRetrospective
  ) {
    delete prediction.isRetrospective;
  }
  return record;
}

function removeUnusedRunTargetDetails(run) {
  if (!run || typeof run !== "object") return run;
  const health = run.collectionHealth;
  if (!health || typeof health !== "object") return run;
  if (Object.prototype.hasOwnProperty.call(health, "targets")) {
    delete health.targets;
  }
  return run;
}

function compactIndex(index) {
  if (!index || typeof index !== "object") return index;
  ["predictions", "verificationPredictions"].forEach(key => {
    if (!Array.isArray(index[key])) return;
    index[key].forEach(record => {
      mergeEvidenceIntoPracticalTickets(record?.prediction);
      if (key === "verificationPredictions") removeDuplicateVerificationFlags(record);
    });
  });
  if (Array.isArray(index.runs)) {
    index.runs.forEach(removeUnusedRunTargetDetails);
  }
  return index;
}

function compactPredictionIndexFile(filePath) {
  const index = JSON.parse(fs.readFileSync(filePath, "utf8"));
  compactIndex(index);
  fs.writeFileSync(filePath, JSON.stringify(index) + "\n", "utf8");
  return index;
}

function main() {
  const filePath = path.join(process.cwd(), "data", "predictions", "index.json");
  if (!fs.existsSync(filePath)) throw new Error("data/predictions/index.json がありません");
  const before = fs.statSync(filePath).size;
  compactPredictionIndexFile(filePath);
  const after = fs.statSync(filePath).size;
  console.log(`自動予想索引を重複排除：${before} -> ${after} bytes (-${before - after})`);
}

if (require.main === module) main();

module.exports = {
  normalizeTicket,
  mergeEvidenceIntoPracticalTickets,
  removeDuplicateVerificationFlags,
  removeUnusedRunTargetDetails,
  compactIndex,
  compactPredictionIndexFile
};
