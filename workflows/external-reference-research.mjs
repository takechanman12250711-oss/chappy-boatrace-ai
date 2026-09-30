import { sleep } from "workflow";

async function collectSource(source) {
  "use step";
  const endpoint = process.env.EXTERNAL_REFERENCE_COLLECTOR_URL;
  if (!endpoint) return { source, status: "collector_not_configured" };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, mode: "forward-public-only" })
  });
  if (!response.ok) throw new Error(`${source}_collector_http_${response.status}`);
  return await response.json();
}

async function settleAndReport() {
  "use step";
  const endpoint = process.env.EXTERNAL_REFERENCE_SETTLEMENT_URL;
  if (!endpoint) return { status: "settlement_not_configured" };
  const response = await fetch(endpoint, { method: "POST" });
  if (!response.ok) throw new Error(`settlement_http_${response.status}`);
  return await response.json();
}

export async function externalReferenceResearchWorkflow() {
  "use workflow";
  const hiyori = await collectSource("hiyori");
  const macour = await collectSource("macour");
  const br = await collectSource("br");
  await sleep("30m");
  const settlement = await settleAndReport();
  return { version: "external-reference-durable-v1", hiyori, macour, br, settlement };
}
