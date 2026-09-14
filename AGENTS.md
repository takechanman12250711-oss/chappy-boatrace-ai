# 作業の引き継ぎ

- 現在の依頼を最新main → 関連する最新PR → 申し継ぎの順に照合する。「続き」は合意済みの未完了作業を指す。追加要望を元の目的に組み込み、完了済みの別作業へ移らない。
- note自動化では最初に `docs/note-automation.md` と `.agents/skills/chappy-note-publish/SKILL.md` を読む。完了済みの収集・監視・原稿生成・handoffを作り直さず、認証と最終投稿の未接続部分を進める。
- ユーザー操作はiPhoneだけで完結することが要件。PC、開発者ツール、Cookie抽出、storageState作成を本人へ丸投げしない。操作可能な本人認証と、その認証が投稿処理へ引き継がれる根拠を確認してから本人操作を依頼する。
- TinyFish、Browserbase、GitHub-hosted fresh X OAuthは不採用。同じ失敗方式を名前や実行形態を変えて再試行しない。既存アカウントの認証方式変更を前提にしない。
- 個人スキルと共有スキルの内容が違う場合は最新実装とユーザーの既決事項で解決し、関連する版だけを更新する。共有版だけ更新して個人版も更新済みと報告しない。
- 実装済み、実サイト確認済み、iPhone本人操作確認済み、無人実行確認済み、公開済みを区別する。ログインhelperの成功、編集hostへの到達、原稿の存在だけで全体完成としない。
- 予想・保存データの不変条件は `config/chappy-charter.json` と `docs/CHAPPY_CHARTER.md` を守る。noteの本番ゲートを検証のために緩めず、最終公開は2026-09-14のユーザー明示依頼で有効化する。実時計の原稿監査、元原稿照合、300円、有料境界、原子的予約、公開URL確認を必須とする。

関連変更の確認: `node scripts/note-github-ui-transport.test.js` と `node scripts/check-note-skills.js`。反映前に対象PRのCI結果とheadを確認する。

全レース方針（2026-09-14ユーザー承認）: note対象を最高1R・60点以上・V2完全データへ限定しない。all-races-v1では取得済み情報の説明とオッズ未取得表示を認める。艇番・元買い目・締切・公開確認は維持する。詳細は docs/note-automation.md の最新節。
