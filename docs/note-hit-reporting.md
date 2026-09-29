# 的中報告から購入までの導線

2026-09-29のユーザー依頼: noteの的中報告をLINE・Xにも配信し、note収益につなげる。

## 媒体ごとの役割

| 媒体 | 内容 | 次の行動 |
| --- | --- | --- |
| X | 当日の的中速報。種類、場・R、実戦厳選点数、確定組番、公式払戻（100円あたり）、事前公開記事 | 無料の全成績・今日の予想一覧へ |
| note | 種類別の全公開記事と的中・不的中・結果待ち・不成立・照合確認中。各記事と公式結果へのリンク | 締切を確認して当日の予想へ |
| LINE公式 | 1日1回の結果まとめを推奨。全体成績と直近3件の的中詳細、一覧へのリンク | 次の予想を確認して継続購読へ |

的中だけで全体成績を良く見せない。通常予想・イン逃げ・万舟を混ぜない。実購入額を持たないため、払戻は公式の100円あたりの金額として表示し、利益や実購入の回収率とは呼ばない。新規集客・一覧への流入・記事購入・再購入を順に測り、表示回数や的中報告数だけで成功と判断しない。売上の自動取得や媒体別購入計測はこの変更には含めていない。

## 実装と証拠

- `Update note marketing` の既存更新経路を使う。新しい収集cronや予想方式は追加しない。
- `note-published` receiptで公開を確認した記事だけを対象にし、receiptが示すSHA256の保存原本を毎回照合する。
- 保存原本の `baselinePracticalTickets` と `record.prediction.practicalTickets` が一致する1〜7点だけで判定する。最大24点候補や後から生成した予想の的中は含めない。独立監視は監視・記事の元買い目とも一致させる。
- 既存の `data/results/YYYYMMDD.json` を使い、不足時は `data/stats/race-review-results.json` を参照する。日付・場・R・公式URL・取得時刻・確定着順・払戻を照合する。
- 返還や同着など、既存パーサーの単一3連単だけでは断定できないケースは照合確認中にする。未来の結果、未確定や照合不一致を的中にしない。
- 無料記事は既存の日次一覧 `https://note.com/great_robin3243/n/na76b6c6c18ff` を更新する。新規の有料記事を事後投稿する処理ではない。
- `note-marketing-state` branchの `state.json` に `rows[].settlement` と `distribution` を保存する。配信原稿のIDは根拠と本文から決まり、同じ結果で毎回増殖しない。

## X・LINE接続の残作業

この変更は原稿生成まで。`distribution.deliveryEnabled=false`、各媒体は `awaiting_connection`。実送信処理は未実装であり、送信済み・自動配信完了とは扱わない。

1. あっくんの配信用XプロフィールURLとLINE公式アカウントの友だち追加URLを確認する。個人LINEへの配信に置き換えない。
2. iPhoneだけで本人認証を完了でき、認証が実際の送信処理に引き継がれる方法を確認する。PC操作・Cookie抽出・過去に不採用となったfresh X OAuth方式を要求しない。
3. XのAPIは従量料金、LINEはプランごとの無料送信枠があるため、既存契約と予算を確認する。無断の課金・クレジット購入はしない。
4. 実送信は配信先を固定し、LINEは1日1回、Xは同じ根拠の再投稿を防止する。API成功と表示確認を区別し、不明な送信結果を無条件に再送しない。LINEの再送は公式のリトライキーを使う。
5. 本人が指定した配信先で、実際の投稿URL・送信結果を確認してから自動配信開始と報告する。

公式仕様の確認元（2026-09-29）:
- https://docs.x.com/x-api/getting-started/pricing
- https://docs.x.com/x-api/posts/create-post
- https://developers.line.biz/en/docs/messaging-api/getting-started/
- https://developers.line.biz/en/reference/messaging-api/

検証: `node --test scripts/note-marketing.test.js scripts/note-marketing-reports.test.js`。公開UIの回帰と共有スキルの整合性も既存CIで確認する。
