import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { webkit } from "playwright";

// 2026-11-10: Vercel の公開APIは無料枠の上限で止まっており 402 を返す。
// アプリ（js/api-origin-fallback.js）と同じく、同じ公開ルートの Cloudflare を先に使い、
// 使えないときだけ Vercel を試す。Vercel 以外の RACE_URL はそのURLだけを使う。
const VERCEL_ORIGIN = "https://chappy-boatrace-api.vercel.app";
const CLOUDFLARE_ORIGIN = "https://chappy-boatrace-read-api.takechanman12250711.workers.dev";
async function fetchRaceWithFallback(url) {
  const candidates = !url.startsWith(VERCEL_ORIGIN + "/")
    ? [url]
    : [CLOUDFLARE_ORIGIN + url.slice(VERCEL_ORIGIN.length), url];
  let last = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { signal: AbortSignal.timeout(30_000) });
      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch { data = null; }
      last = { response, data, url: candidate, text };
      if (data && response.ok && data.ok !== false) return last;
    } catch (error) {
      last = last || { response: null, data: null, url: candidate, error };
    }
  }
  return last;
}

const stage = process.argv[2] || "select";
const appUrl = process.env.APP_URL || "http://127.0.0.1:4173/";
const outputDir = process.env.DIAG_OUTPUT || `artifacts-post/${stage}`;
const expectedRuntime = process.env.EXPECTED_RUNTIME || "20260828-ui-audit-display1";
const requireManshuFallback = process.env.REQUIRE_MANSHU_FALLBACK !== "false";
const raceUrl = process.env.RACE_URL ||
  "https://chappy-boatrace-api.vercel.app/api/race?jcd=01&rno=10&date=20260825";

fs.mkdirSync(outputDir, { recursive: true });
const progressPath = path.join(outputDir, `${stage}-progress.json`);
const report = {
  stage,
  appUrl,
  expectedRuntime,
  requireManshuFallback,
  raceUrl,
  marks: [],
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  result: null,
  error: null
};

function save() {
  fs.writeFileSync(progressPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
  const fetched = await fetchRaceWithFallback(raceUrl);
  if (!fetched?.response) throw fetched?.error || new Error("race API unreachable");
  const raceResponse = fetched.response;
  const raceData = fetched.data;
  report.raceUrlUsed = fetched.url;
  if (!raceData) throw new Error(`race API ${raceResponse.status}: ${String(fetched.text || "").slice(0, 80)}`);
  mark("fetch-race-finished", {
    status: raceResponse.status,
    ok: raceData?.ok,
    entries: raceData?.entries?.length || 0,
    source: raceData?.source || ""
  });

  if (!raceResponse.ok || raceData?.ok === false) {
    throw new Error(raceData?.error || `race API ${raceResponse.status}`);
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

  await page.waitForFunction(() => Boolean(window.ChappyPredictionRuntime), null, {
    timeout: 30_000
  });
  const runtimeVersion = await page.evaluate(
    () => String(window.ChappyPredictionRuntime?.version || "")
  );
  mark("runtime-visible", { runtimeVersion });
  if (runtimeVersion !== expectedRuntime) {
    throw new Error(`runtime mismatch expected=${expectedRuntime} actual=${runtimeVersion}`);
  }

  mark("runtime-ensure-start");
  await page.evaluate(async () => {
    await window.ChappyPredictionRuntime.ensureReady();
  });
  mark("runtime-ensure-finished");

  mark("prepare-create-start");
  const predictionSummary = await page.evaluate(data => {
    const prepared = window.ChappyTheoryInput?.prepare(data, window.ChappyAICore) || data;
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
      const selection = window.ChappyPracticalSelection?.select(prediction);
      prediction.practicalSelection = selection;
      return {
        exists: Boolean(selection),
        status: selection?.status || "",
        tickets: selection?.tickets?.length || 0,
        candidateDecisions: selection?.candidateDecisions?.length || 0,
        reason: selection?.reason || ""
      };
    });
    mark("practical-select-finished", selectionSummary);
    if (stage === "select") report.result = selectionSummary;
  }

  if (stage === "render") {
    mark("render-all-start");
    const renderSummary = await page.evaluate(() => {
      const prediction = window.__chappyDiagnosticPrediction;
      const reader = window.ChappyForecastReaderContract;
      const adapted = window.ChappyRenderAdapter?.applyAiCoreAdapter
        ? window.ChappyRenderAdapter.applyAiCoreAdapter(prediction) : prediction;
      const prepared = window.ChappyMainCoverDisplayBoundary?.prepare
        ? window.ChappyMainCoverDisplayBoundary.prepare(adapted, window.ChappyPracticalSelection, reader) : adapted;
      // Freeze the same full source the final UI consumes before rendering.
      // A later DOM rewrite must not redefine the expected ticket set.
      const expectedReader = reader?.fromPrediction ? reader.fromPrediction(prepared) : null;
      window.__chappyDiagnosticReaderExpected = expectedReader
        ? JSON.parse(JSON.stringify(expectedReader)) : null;
      window.renderAll(prediction);
      const root = document.getElementById("resultArea");
      return {
        htmlLength: root?.innerHTML?.length || 0,
        textLength: root?.textContent?.length || 0,
        textStart: String(root?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500),
        sections: root?.querySelectorAll(".v3-section")?.length || 0
      };
    });
    mark("render-all-finished", renderSummary);

    mark("post-render-responsive-start");
    const responsiveSummary = await page.evaluate(async () => {
      const startedAt = performance.now();
      await new Promise(resolve => setTimeout(resolve, 600));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const predictionSection = document.getElementById("predictionSection");
      if (predictionSection) predictionSection.hidden = false;
      const root = document.getElementById("resultArea");
      const fallback = root?.querySelector(
        ".v3-formation-row[data-manshu-display-fallback='true']"
      );
      const manshuSection = root?.querySelector(".v3-manshu-newspaper");
      const integratedBoard = manshuSection?.querySelector(".v3-light-manshu-ticket-board");
      const trueManshuEmpty = manshuSection?.querySelector(".chappy-true-manshu-empty");
      const details = fallback?.closest("details") || manshuSection?.closest("details");
      if (details) {
        details.removeAttribute("name");
        details.open = true;
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const fallbackList = fallback?.closest(".v3-formation-list");
      const fallbackRect = fallback?.getBoundingClientRect();
      const fallbackListRect = fallbackList?.getBoundingClientRect();
      const integratedBoardRect = integratedBoard?.getBoundingClientRect();
      const integratedPanel = integratedBoard?.closest(".v3-ticket-accordion-panel");
      const integratedPanelRect = integratedPanel?.getBoundingClientRect();
      const integratedLines = [
        ...(integratedBoard?.querySelectorAll(".v3-light-manshu-ticket-line") || [])
      ];
      const compactLines = [...(integratedBoard?.querySelectorAll(".chappy-final-buy-line") || [])];
      const expand = notation => window.ChappyTicketOddsVisibility.expandNotation(notation);
      const displayed = compactLines.flatMap(line => expand(line.querySelector(".chappy-final-buy-formation")?.textContent || ""));
      const normal = new Set(window.ChappyFinalMobileUi?.buildPhotoStyleLines(window.__chappyDiagnosticPrediction).flatMap(row=>row.expandedTickets) || []);
      const expected = [...new Set((window.ChappyTicketOddsVisibility?.manshuSources(window.__chappyDiagnosticPrediction) || []).flatMap(row=>expand(row.notation)))].filter(ticket=>!normal.has(ticket));
      const compactSetMatches = displayed.length > 0 && displayed.length === new Set(displayed).size && JSON.stringify([...displayed].sort()) === JSON.stringify([...expected].sort());
      const lineRects = (compactLines.length ? compactLines : integratedLines).map(line => line.getBoundingClientRect());
      const maxLineWidth = Math.max(0, ...lineRects.map(rect => rect.width || 0));
      const detailsRect = details?.getBoundingClientRect();
      const sectionRect = manshuSection?.getBoundingClientRect();
      const effectiveBoardWidth = Math.max(
        integratedBoardRect?.width || 0,
        maxLineWidth
      );
      const effectiveContainerWidth = Math.max(
        integratedPanelRect?.width || 0,
        detailsRect?.width || 0,
        sectionRect?.width || 0
      );
      const maxLineRight = Math.max(0, ...lineRects.map(rect => rect.right || 0));
      const minLineLeft = lineRects.length
        ? Math.min(...lineRects.map(rect => rect.left || 0))
        : 0;
      const containerLeft =
        integratedPanelRect?.left ?? detailsRect?.left ?? sectionRect?.left ?? 0;
      const containerRight =
        integratedPanelRect?.right ?? detailsRect?.right ?? sectionRect?.right ?? 0;
      const viewportLeftOverflow = sectionRect ? Math.max(0, -sectionRect.left) : 0;
      const viewportRightOverflow = sectionRect
        ? Math.max(0, sectionRect.right - window.innerWidth)
        : 0;
      const trueManshuEmptyRect = trueManshuEmpty?.getBoundingClientRect();
      const readerCards = [...(root?.querySelectorAll("[data-reader-contract]") || [])];
      const readerCard = readerCards[0], reader = window.ChappyForecastReaderContract;
      const savedReader = window.__chappyDiagnosticReaderExpected;
      let sharedReader = { active: Boolean(readerCard), cardCount: readerCards.length };
      if (readerCard) {
        const clean = value => String(value || "").replace(/\s+/g, " ").trim();
        const exact = value => /^[1-6]-[1-6]-[1-6]$/.test(value) && new Set(value.split("-")).size === 3;
        const expandReader = notation => {
          const axes = String(notation || "").replace(/\s+/g, "").replace(/全/g, "123456").split("-");
          if (axes.length !== 3 || axes.some(axis => !/^[1-6]+$/.test(axis))) return [];
          return [...axes[0]].flatMap(a => [...axes[1]].flatMap(b => [...axes[2]]
            .map(c => a + "-" + b + "-" + c).filter(exact)));
        };
        const groupNodes = [...readerCard.querySelectorAll("[data-reader-group]")];
        const groups = groupNodes.map(node => ({
          label: clean(node.querySelector(".chappy-final-buy-label")?.textContent),
          tickets: [...node.querySelectorAll(".chappy-final-buy-line")].flatMap(line =>
            expandReader(line.querySelector(".chappy-final-buy-formation")?.textContent)),
          countText: clean(node.querySelector(".chappy-final-buy-meta")?.textContent)
        }));
        const canonical = rows => rows.map(g => ({ label: g.label, tickets: [...g.tickets].sort() }));
        const expectedGroups = savedReader?.groups || [];
        const all = groups.flatMap(g => g.tickets);
        const primary = groups.filter(g => g.label !== reader?.REFERENCE).flatMap(g => g.tickets);
        const notes = [...readerCard.querySelectorAll(".chappy-category-note")].map(node => clean(node.textContent));
        const actualReference = notes.filter(line => line.startsWith("参考予想"));
        const expectedReference = savedReader?.referenceOriginalCount
          ? [clean(reader?.referenceSummary?.(savedReader))] : [];
        const selected = savedReader?.status === "selected";
        const defaultOpen = groupNodes.map(node => node.open);
        const defaultDisclosureMatches = selected
          ? groupNodes.length > 0 && groupNodes.every((node, i) => node.open === (i === 0)) &&
            [...readerCard.querySelectorAll("details.chappy-ticket-disclosure")].every(node => !node.open)
          : groupNodes.length === 0;
        // Measure every source family, including initially collapsed holes,
        // then restore the app's real default disclosure state.
        groupNodes.forEach(node => { node.open = true; });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const cardRect = readerCard.getBoundingClientRect();
        const lineRects = [...readerCard.querySelectorAll(".chappy-final-buy-line")].map(node => node.getBoundingClientRect());
        const left = Math.min(cardRect.left, ...lineRects.map(rect => rect.left));
        const right = Math.max(cardRect.right, ...lineRects.map(rect => rect.right));
        const visible = node => {
          const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        };
        const legacyVisibleCount = [...(root?.querySelectorAll(
          ".v3-main-newspaper,.v3-manshu-newspaper,.chappy-practical-visible-panel,.is-practical-fallback") || [])].filter(visible).length;
        sharedReader = {
          ...sharedReader,
          expectedAvailable: Boolean(savedReader && reader?.fromPrediction),
          expectedStatus: savedReader?.status || "",
          actualStatus: readerCard.dataset.readerStatus || "",
          versionMatches: Boolean(savedReader?.version && savedReader.version === reader?.VERSION &&
            readerCard.dataset.readerContract === savedReader.version),
          groupsMatch: JSON.stringify(canonical(groups)) === JSON.stringify(canonical(expectedGroups)),
          foreignGroupCount: readerCard.querySelectorAll(".chappy-final-buy-group:not([data-reader-group])").length,
          countsMatch: groups.every(g => g.countText === g.tickets.length + "点") &&
            all.length === savedReader?.allCount && primary.length === savedReader?.primaryCount,
          noDuplicateTickets: all.length === new Set(all).size,
          referenceAccountingMatches: JSON.stringify(actualReference) === JSON.stringify(expectedReference),
          mainCountMatches: !selected || clean(readerCard.querySelector(".chappy-final-buy-total")?.textContent) ===
            "本命" + savedReader.centralTickets.length + "点",
          primaryCountMatches: !selected || notes.includes("本命" + savedReader.centralTickets.length +
            "点／追加候補を含む公開予想" + savedReader.primaryCount + "点。すべて購入する前提ではありません。"),
          stateMessageMatches: selected || (all.length === 0 &&
            clean(readerCard.textContent).includes("購入推奨0点・0円") &&
            Boolean(savedReader?.reason) && clean(readerCard.textContent).includes(clean(savedReader.reason))),
          defaultDisclosureMatches,
          expectedGroups: expectedGroups.map(g => ({ label: g.label, count: g.tickets.length })),
          actualGroups: groups.map(g => ({ label: g.label, count: g.tickets.length })),
          referenceOriginalCount: savedReader?.referenceOriginalCount,
          referenceOverlapCount: savedReader?.referenceOverlapCount,
          primaryCount: savedReader?.primaryCount,
          allCount: savedReader?.allCount,
          legacyVisibleCount,
          cardWidth: cardRect.width,
          leftOverflow: Math.max(0, -left),
          rightOverflow: Math.max(0, right - window.innerWidth),
          contentOverflow: Math.max(0, readerCard.scrollWidth - readerCard.clientWidth)
        };
        groupNodes.forEach((node, i) => { node.open = defaultOpen[i]; });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }

      const boatName = root?.querySelector(".v3-paper-player-line .v3-boat-title strong");
      const boatCard = boatName?.closest(".v3-paper-card");
      const boatPanel = boatName?.closest(".v3-boat-tab-panel");
      const factorLine = [...(root?.querySelectorAll(".v3-factor-line") || [])]
        .find(line => line.querySelector(".v3-tag"));
      const factorLabel = factorLine?.querySelector(":scope > span");
      const factorTag = factorLine?.querySelector(".v3-tag");
      const factorLabelRect = factorLabel?.getBoundingClientRect();
      const factorTagRect = factorTag?.getBoundingClientRect();

      const fallbackWidth = fallbackRect?.width || 0;
      const fallbackListWidth = fallbackListRect?.width || 0;

      return {
        elapsedMs: Math.round(performance.now() - startedAt),
        sharedReader,
        raceLoading: root?.dataset?.raceLoading || "",
        fallbackVisible: Boolean(fallback),
        fallbackSignature: manshuSection?.dataset?.manshuDisplaySignature || "",
        manshuSectionCount: root?.querySelectorAll(".v3-manshu-newspaper")?.length || 0,
        manshuAccordionCount:
          root?.querySelectorAll("details.v3-ticket-accordion-manshu")?.length || 0,
        integratedBoardVisible: Boolean(integratedBoard),
        integratedBoardLineCount: integratedLines.length,
        compactSetMatches,
        compactLineCount: compactLines.length,
        integratedBoardPointCount:
          Number.parseInt(String(details?.querySelector(".v3-ticket-accordion-count")?.textContent || ""), 10) || 0,
        trueManshuEmptyVisible: Boolean(
          trueManshuEmpty &&
          trueManshuEmptyRect &&
          trueManshuEmptyRect.width > 0 &&
          trueManshuEmptyRect.height > 0
        ),
        trueManshuEmptyText: String(trueManshuEmpty?.textContent || "").trim(),
        standaloneBoardSectionCount:
          root?.querySelectorAll("section.v3-light-manshu-ticket-board")?.length || 0,
        viewportWidth: window.innerWidth,
        fallbackRowCount: fallbackList
          ? [...fallbackList.children].filter(child => child.matches?.(".v3-formation-row")).length
          : 0,
        fallbackWidth,
        fallbackListWidth,
        fallbackWidthRatio: fallbackListWidth > 0 ? fallbackWidth / fallbackListWidth : 0,
        fallbackLeftGap:
          fallbackRect && fallbackListRect
            ? Math.abs(fallbackRect.left - fallbackListRect.left)
            : null,
        fallbackRightGap:
          fallbackRect && fallbackListRect
            ? Math.abs(fallbackListRect.right - fallbackRect.right)
            : null,
        fallbackGridColumnStart: fallback ? getComputedStyle(fallback).gridColumnStart : "",
        fallbackGridColumnEnd: fallback ? getComputedStyle(fallback).gridColumnEnd : "",
        integratedBoardWidth: integratedBoardRect?.width || 0,
        integratedPanelWidth: integratedPanelRect?.width || 0,
        integratedMaxLineWidth: maxLineWidth,
        integratedEffectiveBoardWidth: effectiveBoardWidth,
        integratedEffectiveContainerWidth: effectiveContainerWidth,
        integratedLeftOverflow:
          lineRects.length ? Math.max(0, containerLeft - minLineLeft) : 0,
        integratedRightOverflow:
          lineRects.length ? Math.max(0, maxLineRight - containerRight) : 0,
        integratedViewportLeftOverflow: viewportLeftOverflow,
        integratedViewportRightOverflow: viewportRightOverflow,
        boatNameText: String(boatName?.textContent || "").trim(),
        boatNameColor: boatName ? getComputedStyle(boatName).color : "",
        boatNameBackground: boatCard ? getComputedStyle(boatCard).backgroundColor : "",
        boatNameWhiteSpace: boatName ? getComputedStyle(boatName).whiteSpace : "",
        boatPanelMaxHeight: boatPanel ? getComputedStyle(boatPanel).maxHeight : "",
        boatPanelClipped: !boatPanel || boatPanel.scrollHeight > boatPanel.clientHeight + 1,
        factorLineVisible: Boolean(factorLine),
        factorTopDelta:
          factorLabelRect && factorTagRect
            ? Math.abs(factorLabelRect.top - factorTagRect.top)
            : null,
        internalFormationLabelVisible: String(root?.textContent || "")
          .includes("canonical-formation")
      };
    });
    mark("post-render-responsive-finished", responsiveSummary);

    const sharedReaderActive = responsiveSummary.sharedReader?.active === true;
    const sharedReader = responsiveSummary.sharedReader;
    if (sharedReaderActive && !(
      sharedReader.cardCount === 1 &&
      sharedReader.expectedAvailable &&
      sharedReader.expectedStatus === sharedReader.actualStatus &&
      sharedReader.versionMatches &&
      sharedReader.groupsMatch &&
      sharedReader.foreignGroupCount === 0 &&
      sharedReader.countsMatch &&
      sharedReader.noDuplicateTickets &&
      sharedReader.referenceAccountingMatches &&
      sharedReader.mainCountMatches &&
      sharedReader.primaryCountMatches &&
      sharedReader.stateMessageMatches &&
      sharedReader.defaultDisclosureMatches &&
      sharedReader.legacyVisibleCount === 0 &&
      responsiveSummary.viewportWidth === 390 &&
      sharedReader.cardWidth > 0 &&
      sharedReader.leftOverflow <= 1 &&
      sharedReader.rightOverflow <= 1 &&
      sharedReader.contentOverflow <= 1
    )) {
      throw new Error("Shared reader source/display regression: " + JSON.stringify(sharedReader));
    }

    const legacyManshuFallbackVisible =
      responsiveSummary.fallbackVisible === true &&
      Boolean(responsiveSummary.fallbackSignature);
    const integratedManshuBoardVisible =
      responsiveSummary.integratedBoardVisible === true &&
      responsiveSummary.manshuSectionCount === 1 &&
      responsiveSummary.manshuAccordionCount === 1 &&
      responsiveSummary.integratedBoardLineCount >= 2 &&
      responsiveSummary.integratedBoardLineCount >= responsiveSummary.integratedBoardPointCount &&
      responsiveSummary.integratedBoardPointCount > 1 &&
      responsiveSummary.standaloneBoardSectionCount === 0;
    const compactManshuBoardVisible = responsiveSummary.integratedBoardVisible &&
      responsiveSummary.manshuSectionCount === 1 && responsiveSummary.compactLineCount > 0 &&
      responsiveSummary.compactSetMatches;
    const validManshuEmptyState =
      responsiveSummary.trueManshuEmptyVisible === true &&
      responsiveSummary.manshuSectionCount === 1 &&
      responsiveSummary.manshuAccordionCount === 1 &&
      responsiveSummary.trueManshuEmptyText.includes("ありません");

    if (
      requireManshuFallback &&
      !sharedReaderActive &&
      !legacyManshuFallbackVisible &&
      !integratedManshuBoardVisible &&
      !compactManshuBoardVisible &&
      !validManshuEmptyState
    ) {
      throw new Error("Kiryu 10R manshu display regression path was not exercised");
    }

    const relativeLuminance = color => {
      const rgb = String(color).match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!rgb || rgb.length !== 3) return NaN;
      const linear = rgb.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
      return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    };
    const nameLuminance = relativeLuminance(responsiveSummary.boatNameColor);
    const cardLuminance = relativeLuminance(responsiveSummary.boatNameBackground);
    const nameContrast = (Math.max(nameLuminance, cardLuminance) + .05) /
      (Math.min(nameLuminance, cardLuminance) + .05);

    if (
      !responsiveSummary.boatNameText ||
      !(nameContrast >= 4.5) ||
      responsiveSummary.boatNameWhiteSpace !== "normal" ||
      responsiveSummary.boatPanelMaxHeight !== "none" ||
      responsiveSummary.boatPanelClipped ||
      responsiveSummary.factorLineVisible !== true ||
      responsiveSummary.factorTopDelta === null ||
      responsiveSummary.factorTopDelta > 2 ||
      responsiveSummary.internalFormationLabelVisible !== false
    ) {
      throw new Error(`PDF display regressions remain: ${JSON.stringify(responsiveSummary)}`);
    }

    if (
      requireManshuFallback &&
      !sharedReaderActive &&
      legacyManshuFallbackVisible &&
      (
        responsiveSummary.viewportWidth !== 390 ||
        responsiveSummary.fallbackRowCount !== 1 ||
        responsiveSummary.fallbackWidth <= 0 ||
        responsiveSummary.fallbackListWidth <= 0 ||
        responsiveSummary.fallbackWidthRatio < 0.99 ||
        responsiveSummary.fallbackLeftGap > 1 ||
        responsiveSummary.fallbackRightGap > 1
      )
    ) {
      throw new Error(
        `Kiryu 10R manshu fallback must span the mobile list: ${JSON.stringify(responsiveSummary)}`
      );
    }

    if (
      requireManshuFallback &&
      !sharedReaderActive &&
      (integratedManshuBoardVisible || compactManshuBoardVisible) &&
      (
        responsiveSummary.viewportWidth !== 390 ||
        responsiveSummary.integratedEffectiveContainerWidth <= 0 ||
        responsiveSummary.integratedViewportLeftOverflow > 1 ||
        responsiveSummary.integratedViewportRightOverflow > 1
      )
    ) {
      throw new Error(
        `Kiryu 10R integrated manshu board must fit the mobile viewport: ${JSON.stringify(responsiveSummary)}`
      );
    }

    if (!sharedReaderActive && compactManshuBoardVisible) {
      const disclosure = page.locator(".v3-manshu-newspaper details.chappy-ticket-disclosure").first();
      if (await disclosure.count()) {
        const children = disclosure.locator(".chappy-ticket-children");
        if (await children.isVisible()) throw new Error("Formation children must start collapsed");
        await disclosure.locator("summary").click();
        if (!(await children.isVisible())) throw new Error("Formation tap did not reveal exact odds");
        await disclosure.locator("summary").click();
        if (await children.isVisible()) throw new Error("Second tap did not collapse exact odds");
      }
    }
    report.result = { ...renderSummary, responsive: responsiveSummary };
    await page.screenshot({
      path: path.join(outputDir, "render-result.png"),
      fullPage: true
    });
    mark("render-screenshot-finished");
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
  if (browser) await browser.close().catch(() => {});
}
