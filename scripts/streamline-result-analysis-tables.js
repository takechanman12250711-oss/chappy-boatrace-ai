"use strict";

const fs = require("fs");
const path = "js/stats.js";
let text = fs.readFileSync(path, "utf8");

function removeBlockByHeading(source, heading) {
  const headingIndex = source.indexOf(`<h3>${heading}</h3>`);
  if (headingIndex < 0) return source;

  const start = source.lastIndexOf('<div class="v3-final-block">', headingIndex);
  if (start < 0) throw new Error(`開始位置を特定できません: ${heading}`);

  const token = /<div\b[^>]*>|<\/div>/g;
  token.lastIndex = start;
  let depth = 0;
  let match;

  while ((match = token.exec(source))) {
    if (match[0].startsWith("</div")) depth -= 1;
    else depth += 1;

    if (depth === 0) {
      let end = token.lastIndex;
      while (end < source.length && /[\r\n ]/.test(source[end])) end += 1;
      return source.slice(0, start) + source.slice(end);
    }
  }

  throw new Error(`終了位置を特定できません: ${heading}`);
}

for (const heading of [
  "外れ原因の8段階分析",
  "場＋R番号別傾向",
  "決まり手別傾向",
  "本命コース別傾向"
]) {
  text = removeBlockByHeading(text, heading);
}

text = text
  .replace("実戦厳選の判定内訳", "外れ方分析")
  .replace("場別傾向", "場別成績")
  .replace("予想した中心展開別傾向", "展開別成績")
  .replace(
    `<th>判定</th>\n              <th>8段階の主確認点</th>\n              <th>件数</th>\n              <th>割合</th>`,
    `<th>判定</th>\n              <th>件数</th>\n              <th>割合</th>`
  );

const rendererPattern = /  const renderGroupRows =\n[\s\S]*?  const recentRows =/;
if (!rendererPattern.test(text)) {
  throw new Error("集計行レンダラーを特定できません");
}

const rendererReplacement = [
  "  const renderVenueRows = groups =>",
  "    groups.length",
  "      ? groups.map(group => `",
  "          <tr>",
  "            <td>${U.safeText(group.label)}</td>",
  "            <td>${group.count}R</td>",
  "            <td>${group.honmeiHits}/${group.count}（${rate(group.honmeiHits, group.count)}%）</td>",
  "            <td>${group.practicalHits}/${group.practicalCount}（${rate(group.practicalHits, group.practicalCount)}%）</td>",
  "          </tr>",
  "        `).join(\"\")",
  "      : `<tr><td colspan=\"4\">検証データがありません</td></tr>`;",
  "",
  "  const renderScenarioRows = groups =>",
  "    groups.length",
  "      ? groups.map(group => `",
  "          <tr>",
  "            <td>${U.safeText(group.label)}</td>",
  "            <td>${group.count}R</td>",
  "            <td>${group.scenarioHits}/${group.scenarioComparable}（${rate(group.scenarioHits, group.scenarioComparable)}%）</td>",
  "            <td>${group.practicalHits}/${group.practicalCount}（${rate(group.practicalHits, group.practicalCount)}%）</td>",
  "          </tr>",
  "        `).join(\"\")",
  "      : `<tr><td colspan=\"4\">検証データがありません</td></tr>`;",
  "",
  "  const recentRows ="
].join("\n");

text = text.replace(rendererPattern, rendererReplacement);

text = text
  .replace(
    `<th>場</th>\n               <th>対象</th>\n               <th>◎1着率</th>\n               <th>厳選的中率</th>\n               <th>展開一致率</th>`,
    `<th>場</th>\n               <th>対象</th>\n               <th>◎1着率</th>\n               <th>厳選的中率</th>`
  )
  .replace(
    "${renderGroupRows(\n               venueGroups\n             )}",
    "${renderVenueRows(\n               venueGroups\n             )}"
  )
  .replace(
    `<th>中心展開</th>\n               <th>対象</th>\n               <th>◎1着率</th>\n               <th>厳選的中率</th>\n               <th>展開一致率</th>`,
    `<th>中心展開</th>\n               <th>対象</th>\n               <th>展開一致率</th>\n               <th>厳選的中率</th>`
  )
  .replace(
    "${renderGroupRows(\n               predictedScenarioGroups\n             )}",
    "${renderScenarioRows(\n               predictedScenarioGroups\n             )}"
  );

for (const removed of [
  "外れ原因の8段階分析",
  "場＋R番号別傾向",
  "決まり手別傾向",
  "本命コース別傾向"
]) {
  if (text.includes(`<h3>${removed}</h3>`)) {
    throw new Error(`不要表が残っています: ${removed}`);
  }
}

for (const required of ["外れ方分析", "場別成績", "展開別成績", "renderVenueRows", "renderScenarioRows"]) {
  if (!text.includes(required)) throw new Error(`必要な整理結果がありません: ${required}`);
}

fs.writeFileSync(path, text);
console.log("result analysis tables streamlined");
// temporary workflow trigger
