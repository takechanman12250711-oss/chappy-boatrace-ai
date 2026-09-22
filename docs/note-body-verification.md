# note本文照合の修正（2026-09-22）

失敗run 35702659457は認証・editor到達後に `note_body_verification_failed` で停止した。
同じ住之江5Rの保存済み下書きを実サイトで読み取り、元原稿（freeText + paidText）1104文字に対してinnerTextは1171文字だった。
空段落のため元の2改行が5改行になり、従来の先頭80文字includesはfalse。しかし非空行の内容と順序は全文一致した。過去下書きは変更・公開していない。

`note-editor-content.js` はCRLF、HTML NBSP、空行の表示差のみを正規化して全行一致を要求する。文字、数字、艇番、オッズ、行順、行内の空白は保持する。末尾欠落・余計な本文・買い目変更は失敗する。
textarea/inputはvalue、contenteditableはinnerTextを読む。本文が見つからない／空／読取不能の場合も停止する。

既存のBrowser Use認証経路、実時計の公開監査、300円、有料境界、原子的予約、最終クリック前の原稿照合、公開URL確認は変更しない。期限切れの原稿を検証用に公開しない。旧Browserbase CLIは再開せず、共有fillDraftのimportから旧経路の依存だけを遅延ロードにした。

検証:

- `node scripts/note-editor-content.test.js`
- `node scripts/note-browserbase-draft-save.test.js`
- `node scripts/note-github-ui-transport.test.js`
- note regression CIと本番transport起動時にも本文照合テストを実行する。

非公開の動作確認原稿での保存確認と、実レース自動公開の成功は別。公開完了は既存のreceiptと公開URLで確認する。
