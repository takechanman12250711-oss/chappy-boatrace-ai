"use strict";
const fs = require("fs");
const path = "js/stats.js";
let text = fs.readFileSync(path, "utf8");
const replacements = [
  [
`        検証回収率は実購入額ではなく、
        保存された実戦厳選を各点100円で
        均等購入した場合の比較値です。
`,
``
  ],
  [
`      <div class="v3-final-block">
        <h3>検証回収率</h3>

        <p>
          \${verificationSummary.simulatedRecoveryRate}%
        </p>

        <small>
          各買い目100円均等・投資\${verificationSummary.totalStake.toLocaleString("ja-JP")}円／払戻\${verificationSummary.totalReturn.toLocaleString("ja-JP")}円
        </small>
      </div>

`,
``
  ],
  [
`        70点未満は実購入・noteへ出さず、同じ買い目生成結果を各点100円で仮定して検証します。
`,
`        70点未満は実購入・noteへ出さず、予想精度だけを比較します。
`
  ],
  [
`              <th>仮想的中率</th>
              <th>仮想回収率</th>
`,
`              <th>厳選的中率</th>
`
  ],
  [
`                <td>\${row.practicalHits}/\${row.practicalCount}（\${rate(row.practicalHits, row.practicalCount)}%）</td>
                <td>\${row.recoveryRate}%</td>
`,
`                <td>\${row.practicalHits}/\${row.practicalCount}（\${rate(row.practicalHits, row.practicalCount)}%）</td>
`
  ],
  [
`      recoveryRate: summary?.simulatedRecoveryRate || 0
`,
`      practicalCount: summary?.practicalCount || 0
`
  ]
];
let changed = false;
for (const [before, after] of replacements) {
  if (text.includes(before)) {
    text = text.replace(before, after);
    changed = true;
  }
}
// Avoid duplicating practicalCount if the last replacement matched an already-present field.
text = text.replace(
`      practicalHits: summary?.practicalHits || 0,
      practicalCount: summary?.practicalCount || 0,
      practicalCount: summary?.practicalCount || 0
`,
`      practicalHits: summary?.practicalHits || 0,
      practicalCount: summary?.practicalCount || 0
`
);
if (!changed) {
  console.log("result UI already simplified");
  process.exit(0);
}
fs.writeFileSync(path, text);
console.log("result UI simplified");
