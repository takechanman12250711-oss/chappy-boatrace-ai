"use strict";

const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(process.cwd(), "js", "note-generator.js");
let source = fs.readFileSync(filePath, "utf8");

const startMarker = "    const holdBoats =\n";
const endMarker = "    if (\n      prediction\n        ?.dataQuality";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start < 0 || end < 0 || end <= start) {
  throw new Error("対象の役割重複判定範囲が見つかりません");
}

const replacement = `    function contradictoryRoleBoats(\n      text\n    ) {\n      const sentences =\n        safeText(text, \"\")\n          .split(/[。！？\\n]+/)\n          .map(sentence =>\n            sentence.trim()\n          )\n          .filter(Boolean);\n\n      return uniqueText(\n        sentences.flatMap(sentence => {\n          const holdBoats =\n            boatsBeforeRole(\n              sentence,\n              \"残し\"\n            );\n          const pickupBoats =\n            boatsBeforeRole(\n              sentence,\n              \"拾い\"\n            );\n\n          return holdBoats.filter(\n            boatNo =>\n              pickupBoats.includes(\n                boatNo\n              )\n          );\n        })\n      ).map(Number);\n    }\n\n    const contradictoryRoles =\n      contradictoryRoleBoats(\n        flowSummary\n      );\n\n    if (\n      contradictoryRoles.length\n    ) {\n      rejectionReasons.push(\n        \`\${contradictoryRoles.join(\n          \"・\"\n        )}号艇が同一展開内で「残し」と「拾い」に重複しています\`\n      );\n    }\n\n`;

source = source.slice(0, start) + replacement + source.slice(end);

const apiOld = "    compactTicketComment\n  };";
const apiNew = "    compactTicketComment,\n    contradictoryRoleBoats\n  };";

if (!source.includes(apiOld)) {
  throw new Error("公開API追記位置が見つかりません");
}
source = source.replace(apiOld, apiNew);

fs.writeFileSync(filePath, source);
console.log("note role conflict scope patch applied");
