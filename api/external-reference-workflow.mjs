import { start } from "workflow/api";
import { externalReferenceResearchWorkflow } from "../workflows/external-reference-research.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const run = await start(externalReferenceResearchWorkflow);
  return res.status(202).json({ runId: run.runId, status: "started" });
}
