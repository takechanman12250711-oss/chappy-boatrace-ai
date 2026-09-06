"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

// Preserve the historical suite outside the obsolete exact-purchase DISPLAY
// block. Full formations have their own explanation; selected-ticket reasons
// must not be misrepresented as the explanation of every displayed combination.
const legacyPath = path.resolve(__dirname, "test-prediction-transparency-ui-legacy.js");
const source = fs.readFileSync(legacyPath, "utf8");
const startMarker = "const exactFlowRows =";
const endMarker = "const missingSection =";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
assert.notEqual(start, -1, "legacy transparency formation block start is missing");
assert.notEqual(end, -1, "legacy transparency formation block end is missing");
assert.ok(end > start, "legacy transparency formation block boundaries are invalid");
assert.equal(source.split(startMarker).length - 1, 1, "formation block must be unique");
assert.equal(source.split(endMarker).length - 1, 1, "following regression block must be unique");

const legacyBlock = source.slice(start, end);
[
  "通常欄のフォーメーションはformal selectionのexact 2券だけを表示する",
  "同じ1-3軸のフォーメーション2券を選定順で表示する",
  "formationの物理4点でなくformal selectionの2点をsummaryへ表示する",
  "通常欄へ候補formationの全流しを戻さない",
  "同一軸2券の共通根拠はフォーメーションaccordionの狙いに1回だけ表示する",
  "4号艇を3着に採用した券別根拠を表示する",
  "5号艇を3着に採用した券別根拠を表示する",
  "候補プール由来の合成オッズをexact 2券へ表示しない"
].forEach(fingerprint => assert.ok(legacyBlock.includes(fingerprint), `legacy formation contract changed: ${fingerprint}`));

const approvedBlock = String.raw`
const exactFlowRows = html.match(/data-flow-notation="[^"]+"/g) || [];
assert.deepEqual(exactFlowRows, ['data-flow-notation="1-3-全"'],
  "通常欄は実購入の2券ではなく承認済み4点フォーメーションを1組で表示する");
assert.match(html, /v3-ticket-accordion-flow[\s\S]{0,400}4点/,
  "1-3-全の物理4点をsummaryへ表示する");
assert.match(html, /data-flow-notation="1-3-全"|1\s*→\s*3\s*→\s*全/,
  "フォーメーション表記を実購入券へ縮めない");
const fullFormationReason = "1逃げから3号艇を2着にして3着全艇";
assert.equal(html.split(fullFormationReason).length - 1, 1,
  "全点フォーメーション自身の根拠を重複なく表示する");
assert.equal(html.split(flowCommonReason).length - 1, 0,
  "購入2券専用の共通根拠を全点フォーメーションの根拠に流用しない");
assert.match(practicalSection, /31\.6倍（最終取得）/,
  "実購入1-3-4の最終取得オッズを保持する");
assert.match(practicalSection, /44\.2倍（最終取得）/,
  "実購入1-3-5の異なる最終取得オッズを保持する");
assert.doesNotMatch(html, /合成 9\.9倍|取得 6\/6/,
  "4点表示にも購入2券にも別の6点候補プールの合成オッズを流用しない");
`;

const transformed = source.slice(0, start) + approvedBlock + source.slice(end);
assert.ok(transformed.startsWith(source.slice(0, start)), "preceding regressions must remain unchanged");
assert.ok(transformed.endsWith(source.slice(end)), "following regressions must remain unchanged");
const testModule = new Module(legacyPath, module);
testModule.filename = legacyPath;
testModule.paths = Module._nodeModulePaths(path.dirname(legacyPath));
testModule._compile(transformed, legacyPath);

// Also lock 12-345-全=24 and 4-23-全=8 independently from exact purchases.
require("./test-final-display-semantics.js");
console.log("prediction transparency approved formation bridge: ok");
