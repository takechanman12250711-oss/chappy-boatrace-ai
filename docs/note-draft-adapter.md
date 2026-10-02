# note下書き投入アダプター

`scripts/note-draft-adapter.js` は、既存の `note-draft-bundle-v1` を下書き作成用の境界データへ変換する。

既存の予想、原稿生成、監査、保存内容は変更しない。入力した保存JSONの `article.title`、`article.freeText`、`article.paidText` をそのまま渡し、入力ファイル全体のSHA-256も付与する。

このアダプター自身はnoteへ接続しない。公開、価格変更、予約、認証情報保存の権限は持たず、出力は常に `draft_only` とする。実際のブラウザ投入側では、入力SHAの一致確認と重複下書き確認を必須にする。

実行例:

```sh
node scripts/note-draft-adapter.js data/note-drafts/YYYYMMDD/<bundle>.json
node scripts/test-note-draft-adapter.js
```

TinyFishや将来の正規ブラウザ操作を接続する場合も、この境界は公開処理から分離する。既存の `canPublish: false` と `automaticPublicationEnabled: false` は変更しない。
