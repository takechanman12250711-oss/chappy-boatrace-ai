'use strict';
// ツムギ：scripts/manshu-forward.cjs の出力(JSON)を Issue 用の表(Markdown)にする。読み取りのみ。
// 使い方: node scripts/manshu-forward-report.cjs <出力JSONのパス>
const fs = require('fs');
const o = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const fmt = (s) => s.hitRate == null ? '要確認' : `${s.hitRate}%`;
const roi = (s) => s.roi == null ? '要確認' : `${s.roi}%`;
const row = (name, s) => `| ${name} | ${s.races} | ${s.tickets} | ${s.hits} | ${fmt(s)} | ${roi(s)} |`;
const d = (k) => k ? `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}` : '要確認';
const issues = Object.entries(o.issues || {}).map(([k, v]) => `${k}: ${v}`).join('、') || 'なし';
const lines = [
  `## ${today} 💥 万舟狙いの前向き記録（自動）`,
  '',
  `期間：${d(o.period.from)} 〜 最新（対象レース ${d((o.period.first || '').slice(0, 8))} 〜 ${d((o.period.last || '').slice(0, 8))}）`,
  `公開記事 ${o.articles} 件／結果確定 ${o.settled} 件／結果待ち ${o.pending} 件／対象外 ${o.excluded} 件／読めなかった記録 ${issues}`,
  '',
  '| 見方 | レース数 | 点数 | 的中 | 的中率 | 回収率 |',
  '|---|---|---|---|---|---|',
  row('公開したまま', o.A_asPublished),
  row('万舟狙いを分けた場合', o.B_withoutManshu),
  row('万舟狙いだけ', o.manshuOnly),
  '',
  '比較の基準（10/07〜10/28、85レース）：公開したまま 的中率75.3%・回収率50.9%／万舟狙いを分けた場合 67.1%・76.8%／万舟狙いだけ 8.2%・20.3%',
  '',
  '- 1点100円は比較のための仮定です。',
  '- 結果が確定したレースだけで計算しています（レースを選んでいません）。',
  '- 件数が少ないうちは、どちらが良いか「まだ判断できない（要確認）」です。高配当が1本当たるだけで回収率は大きく動きます。',
  '- 本番の記事・予想・買い目は変えていません。買い目の出し方を変えるには本人の承認が必要です。',
  '- 予想は参考情報です。舟券の購入は自己責任で、20歳以上の方に限ります。',
];
process.stdout.write(lines.join('\n') + '\n');
