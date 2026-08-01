"use strict";

const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(process.cwd(), "js", "note-generator.js");
let source = fs.readFileSync(filePath, "utf8");

const oldBlock = `    function boatsBeforeRole(\n      text,\n      role\n    ) {\n      const boats = [];\n      let searchFrom = 0;\n\n      while (\n        searchFrom <\n        text.length\n      ) {\n        const roleIndex =\n          text.indexOf(\n            role,\n            searchFrom\n          );\n\n        if (roleIndex < 0) {\n          break;\n        }\n\n        const prefix =\n          text.slice(\n            0,\n            roleIndex\n          );\n\n        const matches = [\n          ...prefix.matchAll(\n            /([1-6])号艇/g\n          )\n        ];\n\n        const nearest =\n          matches[\n            matches.length - 1\n          ];\n\n        if (nearest) {\n          boats.push(\n            Number(nearest[1])\n          );\n        }\n\n        searchFrom =\n          roleIndex +\n          role.length;\n      }\n\n      return uniqueText(\n        boats\n      ).map(Number);\n    }\n\n    const holdBoats =\n      boatsBeforeRole(\n        flowSummary,\n        \"残し\"\n      );\n\n    const pickupBoats =\n      boatsBeforeRole(\n        flowSummary,\n        \"拾い\"\n      );\n\n    const duplicatedRoles =\n      holdBoats.filter(\n        boatNo =>\n          pickupBoats.includes(\n            boatNo\n          )\n      );\n\n    if (\n      duplicatedRoles.length\n    ) {\n      rejectionReasons.push(\n        \`\${duplicatedRoles.join(\n          \"・\"\n        )}号艇が「残し」と「拾い」に重複しています\`\n      );\n    }\n`;

const newBlock = `    function boatsBeforeRole(\n      text,\n      role\n    ) {\n      const boats = [];\n      let searchFrom = 0;\n\n      while (\n        searchFrom <\n        text.length\n      ) {\n        const roleIndex =\n          text.indexOf(\n            role,\n            searchFrom\n          );\n\n        if (roleIndex < 0) {\n          break;\n        }\n\n        const prefix =\n          text.slice(\n            0,\n            roleIndex\n          );\n\n        const matches = [\n          ...prefix.matchAll(\n            /([1-6])号艇/g\n          )\n        ];\n\n        const nearest =\n          matches[\n            matches.length - 1\n          ];\n\n        if (nearest) {\n          boats.push(\n            Number(nearest[1])\n          );\n        }\n\n        searchFrom =\n          roleIndex +\n          role.length;\n      }\n\n      return uniqueText(\n        boats\n      ).map(Number);\n    }\n\n    function contradictoryRoleBoats(\n      text\n    ) {\n      const sentences =\n        safeText(text, \"\")\n          .split(/[。！？\\n]+/)\n          .map(sentence =>\n            sentence.trim()\n          )\n          .filter(Boolean);\n\n      return uniqueText(\n        sentences.flatMap(sentence => {\n          const holdBoats =\n            boatsBeforeRole(\n              sentence,\n              \"残し\"\n            );\n          const pickupBoats =\n            boatsBeforeRole(\n              sentence,\n              \"拾い\"\n            );\n\n          return holdBoats.filter(\n            boatNo =>\n              pickupBoats.includes(\n                boatNo\n              )\n          );\n        })\n      ).map(Number);\n    }\n\n    const contradictoryRoles =\n      contradictoryRoleBoats(\n        flowSummary\n      );\n\n    if (\n      contradictoryRoles.length\n    ) {\n      rejectionReasons.push(\n        \`\${contradictoryRoles.join(\n          \"・\"\n        )}号艇が同一展開内で「残し」と「拾い」に重複しています\`\n      );\n    }\n`;

if (!source.includes(oldBlock)) {
  throw new Error("対象の役割重複判定ブロックが見つかりません");
}

source = source.replace(oldBlock, newBlock);

const apiOld = `    compactTicketComment\n  };`;
const apiNew = `    compactTicketComment,\n    contradictoryRoleBoats\n  };`;

if (!source.includes(apiOld)) {
  throw new Error("公開API追記位置が見つかりません");
}
source = source.replace(apiOld, apiNew);

fs.writeFileSync(filePath, source);
console.log("note role conflict scope patch applied");
