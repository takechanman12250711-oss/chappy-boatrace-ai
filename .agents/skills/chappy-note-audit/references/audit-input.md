# 監査入力

リポジトリの `scripts/note-publication-audit.js` はネットワークアクセスや書き込みをせず、JSON入力を検査する。入力ファイルの作成は依頼範囲内の新規作業用ファイルに限る。既存レコードを上書きしない。

```sh
node scripts/note-publication-audit.js --input audit-payload.json
```

入力フィールド:

- `article`: 既存generateArticleが返すok、publishable、title、freeText、paidText、fullText、paywallMarker、tags、meta、practicalTickets。独自に予想を再計算しない。
- `record`: raceKey、date（YYYYMMDD）、jcd（01〜24）、place、raceNo、deadlineAt（タイムゾーン必須）、prediction.practicalTickets。
- 候補の出典にはrecord.prediction.mainSheetのtickets/coverTickets/flowTickets、manshuSheet.ticketsも保持する。参考はrecord.prediction.manshuSheet.forecastLedger.forecasts内のformation.notation/expandedTicketsが出典。記事内の候補・参考をこれらの保存データと照合し、出典がなければ停止する。
- `baselinePracticalTickets`: 原稿生成前に別途保存された、同じ収集時点の厳選。ticketとoddsを含む。articleをコピーして作らない。
- `minLeadSeconds`: 120以上。既存憲章の値を使い、短縮しない。
- `maxPracticalTickets`: 既存憲章の最大10。券を増減する機能ではない。

通常のCLIは実時計を使い、入力JSON内のnowを無視する。`--now 2026-09-10T03:45:00.000Z` は過去データの再現検査専用で、公開許可には使えない。

終了コード0は機械検査合格（レビュー待ち）、1は不備、2は入出力や引数エラー。いずれも自動公開は無効。出力のarticleSha256は保存形式 `# タイトル\n\n全文\n` のSHA-256。ハッシュは対象特定用で、署名や認証ではない。

既存の日次JSONは新しい収集から `selected.note.audit` 相当の選定レコード内に監査結果を持つ。実際のトップレベル構造を読んで対象を選ぶ。過去原稿には生成記事の構造化データが残っていない場合がある。その場合は日次JSONとMarkdownでできる部分照合だけを行い、完全監査PASSを作らない。

この検査は予想の的中、最新オッズ、note上の有料境界設定、重複投稿、価格・返金設定、アカウント権限を保証しない。本文内の区切り文字はnoteの実際の有料設定ではない。
