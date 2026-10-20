# Claude CodeからCodexへの初回受け渡し確認

これは開発ツールの接続確認である。`AGENTS.md` と `docs/claude-codex-development.md` を読み、専用の作業ブランチで行う。採点・買い目・予想原本・公式結果・note公開・本番設定は変更しない。新しいAPIや契約、cronを追加しない。

## Claude Codeで行うこと

1. 対象が `takechanman12250711-oss/chappy-boatrace-ai` であり、作業ツリーに未コミット変更がないことを確認する。作業開始時の `git rev-parse HEAD` を `sourceHeadSha` として記録する。別の作業の変更があれば混ぜずに停止する。
2. 次を実行し、実際の終了コードを記録する。モデルの推測をテスト結果へ代入しない。

   ```sh
   node --check scripts/claude-codex-review.cjs
   node --test tests/claude-codex-review.test.cjs
   cmp .agents/skills/claude-codex-review/SKILL.md .claude/skills/claude-codex-review/SKILL.md
   ```

3. この環境でCodex CLIが存在するか確認する。存在する場合だけ通常の `codex login status` を確認する。stdout/stderrはプロセス内で判定し、端末ログ・会話・ファイルへ生出力を出さず、ChatGPT認証を確認できたかの真偽値だけを記録する。存在しない・ChatGPT認証を確認できない場合は、インストールや新規API接続をせず、GitHub経由の受け渡しを選ぶ。
4. 新しい `docs/agent-handoffs/claude-code-<UTC日時>.json` だけを作る。次の項目を、実際に確認した値で記録する。

   - `version`: `claude-codex-first-check-v1`
   - `sourceHeadSha`: 手順1のSHA
   - `implementationAgent`: `claude-code`
   - `checks`: コマンドごとの `command` と整数の `exitCode`
   - `codexCliAvailable`: 真偽値
   - `codexChatgptAuthenticationConfirmed`: 真偽値（未確認はfalse）
   - `handoff`: 同一環境なら `local-cli`、それ以外は `github-pr`
   - `automaticMerge`: false

   メールアドレス、環境変数、キー、OAuthコード、Cookie、認証コマンドの生出力を含めない。ローカルCLIを利用できることと、実際にCodexレビューが完了したことを分ける。
5. この確認ファイルだけを作業ブランチへコミットする。同一環境でChatGPT認証済みのCodexを使える場合は、次を実行し、返されたreceiptとレビュー本文を読む。レビュー失敗を完了へ読み替えない。

   ```sh
   node scripts/claude-codex-review.cjs --base <sourceHeadSha>
   ```

6. Create PRからDraft PRを作り、タイトルを `[連携確認・マージ不要] Claude Code → Codex` とする。本文には、確認元SHA・確認ファイルのhead SHA・検査結果・受け渡し方式・Codexレビューの実行有無だけを示す。失敗があれば、その状態を残して報告する。本番へ自動マージしない。

## Codex側で行うこと

1. 作成されたPR、確認ファイル、base/head SHAを照合する。Claude Webでの実行記録と、この環境のCLI状態を混同しない。
2. PRブランチを独立した作業場所で確認し、読み取り専用のレビューと小さな接続テストを実行する。対象SHA・実行結果・不足事項を記録する。実データの全期間分析をこの接続確認へ重ねない。
3. Claude側の確認、Codex側の実レビューと返却結果がそろった場合に、初回の協業動作確認済みと報告する。この確認用PRは開発接続の証拠であり、予想精度や自動採用の証明ではない。
