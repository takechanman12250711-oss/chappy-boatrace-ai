import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { webkit } from "playwright";

const stage = process.argv[2] || "select";
const appUrl = process.env.APP_URL || "http://127.0.0.1:4173/";
const outputDir = process.env.DIAG_OUTPUT || `artifacts-post/${stage}`;
const expectedRuntime = process.env.EXPECTED_RUNTIME || "20260825-mobile-startup-terminal3";
const raceUrl =
  "https://chappy-boatrace-api.vercel.app/api/race" +
  "?jcd=07&rno=12&date=20260824";

fs.mkdirSync(outputDir, { recursive: true });
const progressPath = path.join(outputDir, `${stage}-progress.json`);
const report = {
  stage,
  appUrl,
  expectedRuntime,
  raceUrl,
  marks: [],
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  result: null,
  error: null
};

function save() {
  fs.writeFileSync(
    progressPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
}

function mark(name, detail = {}) {
  const row = { name, at: new Date().toISOString(), ...detail };
  report.marks.push(row);
  save();
  console.log(`[MARK] ${name}`, JSON.stringify(detail));
}

process.on("SIGTERM", () => {
  mark("process-sigterm");
  process.exit(124);
});
process.on("SIGINT", () => {
  mark("process-sigint");
  process.exit(130);
});

let browser = null;

try {
  mark("fetch-race-start");
  const raceResponse = await fetch(raceUrl, {
    signal: AbortSignal.timeout(30_000)
  });
  const raceData = await raceResponse.json();
  mark("fetch-race-finished", {
    status: raceResponse.status,
    ok: raceData?.ok,
    entries: raceData?.entries?.length || 0,
    source: raceData?.source || ""
  });

  if (!raceResponse.ok || raceData?.ok === false) {
    throw new Error(
      raceData?.error || `race API ${raceResponse.status}`
    );
  }

  browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 " +
      "Mobile/15E148 Safari/604.1"
  });
  const page = await context.newPage();

  page.on("pageerror", error => {
    report.pageErrors.push({
      message: String(error?.message || error),
      stack: String(error?.stack || "")
    });
    save();
  });
  page.on("console", message => {
    if (message.type() === "error") {
      report.consoleErrors.push(message.text());
      save();
    }
  });
  page.on("requestfailed", request => {
    report.failedRequests.push({
      url: request.url(),
      errorText: request.failure()?.errorText || ""
    });
    save();
  });

  const joiner = appUrl.includes("?") ? "&" : "?";
  const targetUrl = `${appUrl}${joiner}postStage=${stage}-${Date.now()}`;
  mark("page-open-start", { targetUrl });
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  mark("page-open-finished");

  await page.waitForFunction(
    () => Boolean(window.ChappyPredictionRuntime),
    null,
    { timeout: 30_000 }
  );
  const runtimeVersion = await page.evaluate(
    () => String(window.ChappyPredictionRuntime?.version || "")
  );
  mark("runtime-visible", { runtimeVersion });
  if (runtimeVersion !== expectedRuntime) {
    throw new Error(
      `runtime mismatch expected=${expectedRuntime} actual=${runtimeVersion}`
    );
  }

  mark("runtime-ensure-start");
  await page.evaluate(async () => {
    await window.ChappyPredictionRuntime.ensureReady();
  });
  mark("runtime-ensure-finished");

  mark("prepare-create-start");
  const predictionSummary = await page.evaluate(data => {
    const prepared = window.ChappyTheoryInput?.prepare(
      data,
      window.ChappyAICore
    ) || data;
    const prediction = window.createPrediction(prepared);
    window.__chappyDiagnosticPrediction = prediction;
    return {
      entries: prepared?.entries?.length || 0,
      evaluations:
        prediction?.boatEvaluation?.evaluations?.length ||
        prediction?.mainSheet?.evaluations?.length ||
        0,
      mainTickets:
        prediction?.mainSheet?.tickets?.length ||
        prediction?.ticketSheets?.main?.length ||
        0
    };
  }, raceData);
  mark("prepare-create-finished", predictionSummary);

  if (stage === "select" || stage === "render") {
    mark("practical-select-start");
    const selectionSummary = await page.evaluate(() => {
      const prediction = window.__chappyDiagnosticPrediction;
      const selection = window.ChappyPracticalSelection?.select(
        prediction
      );
      prediction.practicalSelection = selection;
      return {
        exists: Boolean(selection),
        status: selection?.status || "",
        tickets: selection?.tickets?.length || 0,
        candidateDecisions:
          selection?.candidateDecisions?.length || 0,
        reason: selection?.reason || ""
      };
    });
    mark("practical-select-finished", selectionSummary);

    if (stage === "select") {
      report.result = selectionSummary;
    }
  }

  if (stage === "render") {
    mark("render-all-start");
    const renderSummary = await page.evaluate(() => {
      const prediction = window.__chappyDiagnosticPrediction;
      window.renderAll(prediction);
      const root = document.getElementById("resultArea");
      return {
        htmlLength: root?.innerHTML?.length || 0,
        textLength: root?.textContent?.length || 0,
        textStart: String(root?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500),
        sections:
          root?.querySelectorAll(".v3-section")?.length || 0
      };
    });
    mark("render-all-finished", renderSummary);
    report.result = renderSummary;

    await page.screenshot({
      path: path.join(outputDir, "render-result.png"),
      fullPage: true
    });
  }
} catch (error) {
  report.error = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  mark("diagnostic-error", report.error);
  process.exitCode = 1;
} finally {
  save();
  if (browser) {
    await browser.close().catch(() => {});
  }
}
