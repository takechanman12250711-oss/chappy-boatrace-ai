# note公開引き継ぎデータ

noteへのログイン方式と、チャッピーボートレースAIが生成する記事データを分離する。

## 目的

`data/note-drafts/...json` に保存済みの `note-draft-bundle-v1` を、ブラウザ・接続手段に依存しない `note-publication-handoff-v1` へ変換する。

この段階では以下を行わない。

- noteへのログイン
- X/Google/Apple等の認証
- Cookie・セッション・パスワード・トークンの取得または保存
- noteへの入力、予約、公開
- 価格や有料境界の変更
- 予想・買い目・原稿の再生成

認証が失敗しても、記事生成と保存済み原稿は影響を受けない。

## 使い方

```sh
node scripts/note-publication-handoff.js --input data/note-drafts/YYYYMMDD/<raceKey>-<sha256>.json
```

標準出力にJSONだけを返す。ネットワークアクセスやファイル書き込みは行わない。

出力は、レース識別子、保存元、タイトル、無料本文、有料本文、全文、タグ、実戦厳選、生成時監査のスナップショット、本文SHA-256を保持する。

`publication` は常に未認証・未公開状態から始まる。

```json
{
  "target": "note",
  "state": "prepared_only",
  "publication": {
    "authentication": "external",
    "authenticated": false,
    "publishMode": null,
    "scheduledAt": null,
    "price": null,
    "publishedAt": null,
    "publishedUrl": null
  }
}
```

生成時の `contentReady` がtrueでも、現在時刻での公開許可ではない。`canPublish` と `automaticPublicationEnabled` は引き継ぎ側でtrueにしない。

## 今後の接続

将来、noteへ接続できる正規のブラウザ/連携手段が決まった場合、その実装はこのhandoff JSONを入力として使う。

これにより、認証方式を変更しても以下を触らずに済む。

- `js/note-generator.js`
- `scripts/collect-predictions.js`
- 保存済みのdraft bundle
- 予想ロジック/UI

接続処理はhandoffの本文SHA-256と元draft SHA-256を記録し、公開後に実URL・日時を別台帳へ保存する。認証情報をhandoffへ混ぜない。

## 検証

```sh
node scripts/test-note-publication-handoff.js
```
