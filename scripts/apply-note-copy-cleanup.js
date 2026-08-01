"use strict";

const fs = require("node:fs");
const path = require("node:path");

const targetPath = path.join(__dirname, "..", "js", "note-generator.js");
let source = fs.readFileSync(targetPath, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`${label}: replacement target not found`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: replacement target is not unique`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

const uniqueTextBlock = `  function uniqueText(values) {\n    return [...new Set(arrayify(values).map(value => safeText(value, "")).filter(Boolean))];\n  }`;

replaceOnce(
  uniqueTextBlock,
  `${uniqueTextBlock}\n\n  function formatDeadlineLabel(value) {\n    const deadline = safeText(value, "締切時刻未取得");\n    return /^締切/.test(deadline)\n      ? deadline\n      : \`締切 \${deadline}\`;\n  }\n\n  function compactTicketComment(value) {\n    const text = safeText(value, "");\n    if (!text) return "";\n\n    const sentences =\n      text.match(/[^。！？]+[。！？]?/g) ||\n      [text];\n    const seen = new Set();\n\n    return sentences\n      .map(sentence => sentence.trim())\n      .filter(Boolean)\n      .filter(sentence => {\n        const semanticKey = sentence\n          .replace(/\\s+/g, "")\n          .replace(/([1-6])号艇が2着へ追走・残し/g, "$1号艇が2着に残り")\n          .replace(/([1-6])号艇が3着で展開を拾う筋/g, "$1号艇が3着に残る筋")\n          .replace(/([1-6])号艇が3着で拾う筋/g, "$1号艇が3着に残る筋")\n          .replace(/([1-6])号艇が3着で残る筋/g, "$1号艇が3着に残る筋");\n\n        if (seen.has(semanticKey)) {\n          return false;\n        }\n        seen.add(semanticKey);\n        return true;\n      })\n      .join(" ");\n  }`,
  "insert copy helpers"
);

replaceOnce(
  `    const comment =\n      safeText(\n        item.comment ||\n        ticketComment(\n          item.ticket,\n          item.category || "買い目"\n        ),\n        ""\n      );`,
  `    const comment =\n      compactTicketComment(\n        item.comment ||\n        ticketComment(\n          item.ticket,\n          item.category || "買い目"\n        )\n      );`,
  "compact ticket comment"
);

replaceOnce(
  `      \`🚤 \${formatDate(\n        meta.date\n      )} \${meta.place}\${meta.raceNo || "-"}R｜締切\${meta.deadline}\`,`,
  `      \`🚤 \${formatDate(\n        meta.date\n      )} \${meta.place}\${meta.raceNo || "-"}R｜\${formatDeadlineLabel(\n        meta.deadline\n      )}\`,`,
  "deadline label"
);

replaceOnce(
  `    buildTags,\n    createPracticalSelection`,
  `    buildTags,\n    createPracticalSelection,\n    formatDeadlineLabel,\n    compactTicketComment`,
  "export copy helpers"
);

fs.writeFileSync(targetPath, source);
console.log("note copy cleanup applied");
