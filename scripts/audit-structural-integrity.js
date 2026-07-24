"use strict";

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

const html = read("index.html");
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

const localRefs = [];
for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)) {
  const raw = match[1];
  if (!raw || /^(?:https?:|#|data:|mailto:|javascript:)/.test(raw)) continue;
  const clean = raw.replace(/^\.\//, "").split(/[?#]/)[0];
  if (clean) localRefs.push(clean);
}
const missingAssets = [...new Set(localRefs.filter(file => !exists(file)))];

const jsFiles = fs.readdirSync(path.join(root, "js"))
  .filter(name => name.endsWith(".js"))
  .map(name => `js/${name}`);
const jsText = jsFiles.map(file => `${file}\n${read(file)}`).join("\n");
const generatedIds = [...jsText.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
const allKnownIds = new Set([...ids, ...generatedIds]);
const domRefs = [...jsText.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]);
const optionalLegacyIds = new Set(["raceInfoArea", "reviewResultArea"]);
const missingDomRefs = [...new Set(domRefs.filter(id =>
  !allKnownIds.has(id) && !optionalLegacyIds.has(id)
))].sort();

const deletedFeatureTokens = [
  "purchaseScreenshotInput",
  "purchaseScreenshotStatus",
  "purchaseScreenshotPreview",
  "saveScreenshotPurchasesBtn",
  "readPurchaseScreenshotsBtn",
  "ChappyPurchaseOcrCore",
  "purchase-ocr"
];
const deletedFeatureResidue = deletedFeatureTokens.filter(token =>
  html.includes(token) || jsText.includes(token) || read("style.css").includes(token)
);

const hashLinks = [...html.matchAll(/<a\b[^>]*href=["']#([^"']*)["']/g)].map(m => m[1]);
const brokenHashLinks = [...new Set(hashLinks.filter(id => id && !ids.includes(id)))];
const emptyHashLinks = hashLinks.filter(id => !id).length;

const report = {
  duplicateIds,
  missingAssets,
  missingDomRefs,
  deletedFeatureResidue,
  brokenHashLinks,
  emptyHashLinks,
  counts: {
    htmlIds: ids.length,
    generatedIds: generatedIds.length,
    localAssets: localRefs.length,
    jsFiles: jsFiles.length,
    domRefs: domRefs.length
  }
};

fs.writeFileSync(
  path.join(root, "structural-integrity-report.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));

if (
  duplicateIds.length ||
  missingAssets.length ||
  missingDomRefs.length ||
  deletedFeatureResidue.length ||
  brokenHashLinks.length
) {
  process.exitCode = 1;
}
