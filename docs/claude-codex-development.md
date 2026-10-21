# Claude CodeとCodexの開発連携

Claude Codeが実装し、Codexが独立して差分をレビューする。両者はこのリポジトリの `AGENTS.md` を共有する。実装・レビュー・テスト・main反映を別々に記録する。

Claude Code v2.1.277以降は、対象フォルダに `CLAUDE.md` / `CLAUDE.local.md` がなければ `AGENTS.md` を自動で読む。既存の `CLAUDE.md` がある別環境では、内容を保持し、`@AGENTS.md` のimportで共有する。このリポジトリでは共通ルールを複製しない。

## フローチャートから本人の最終確認へ

依頼範囲の調査・実装・検査・レビュー・CI・PR作成までは進める。この会話・Claude Code・管理画面のいずれの入口でも、main反映前に対象変更・影響・フローチャートを共通資料として示し、同じ対象PRへ「このPRをGitHubで確認」で案内する。本人がGitHubで最終確定操作を行うか、会話のマージ承認ボタンで「マージする」を押すまで、AIはマージせず停止する。ボタン承認の条件は [開発変更の最終確認](development-approval.md) に従う。計画ごとの承認待ちや、ChatGPT/Claudeのネイティブ画面への独自承認ボタンは追加しない。

表示内容・固定headとの照合・本人操作・既存の自動処理との境界は [開発変更の最終確認](development-approval.md) を参照する。本手順を導入する最初のPRから適用する。Claude Codeには次回の作業から使う共有手順として渡し、すべての環境で新しいモデル実行や表示確認を行う必須工程にはしない。各環境での実行・本人操作を確認できたかは別に報告する。

## 同じ実行環境で使う

前提は、Claude CodeとCodex CLIの双方を既存アカウントで認証できること。`claude auth status` と `codex login status` で確認する。CLIがインストールされているだけでは認証済みではない。Codex側のスクリプトはChatGPT認証を確認し、API課金認証へ切り替えない。

Codexはリポジトリ外の一時フォルダから起動し、ユーザー・プロジェクトの設定や追加ルールを読み込ませず、対象リポジトリの絶対パスと `AGENTS.md` をレビュー指示へ渡す。認証確認と実行の両方で組み込みの `model_provider="openai"` と `forced_login_method="chatgpt"` を指定する。既存の認証保存先やモデル名は書き換えず、API認証へフォールバックしない。CLIの管理者設定が優先される環境や、認証方法が一致せず停止した場合は、成功扱いせず設定を確認する。公式仕様上、認証方法の不一致でCLIがログアウトする場合がある。

1. mainから作業ブランチまたは独立worktreeを作り、開始時のbase SHAを記録する。両者が同じ変更を同時編集する運用にしない。
2. Claude Codeは依頼範囲の実装・必要な検査を行い、作業ブランチへコミットする。
3. Claude Codeから次のコマンドを呼ぶ。`<base SHA>`には開始時の値を使う。mainが自動データ更新で進んだ場合も、開始時のSHAを保持する。

   ```sh
   node scripts/claude-codex-review.cjs --base <base SHA>
   ```

4. Codexは `codex exec` の読み取り専用モードでレビューし、本文と対象SHAのreceiptをGit管理領域に返す。スクリプトの出力に示されるファイルをClaude Codeが読む。認証情報は引き渡さない。
5. 指摘があれば修正・コミット・必要な検査を行い、新headで再レビューする。レビュー中にheadや作業ツリーが変われば結果はstaleとなる。completedは実行完了であり、指摘なしや採用承認を表さない。
6. 既存のPR・CIと対象headを確認し、変更内容・影響・フローチャートを提示して「このPRをGitHubで確認」へ案内する。main反映は本人のGitHub操作、または会話のマージ承認ボタンを待つ。ボタン承認時だけ、AIは固定headを再照合してマージする。本人の承認なしにマージ・自動マージを行わない。マージ後にmain反映を別途確認する。予想方式の採用などに必要な別の承認を、レビュー成功で代替しない。

レビューはコミット済みのbase〜head差分が対象である。未コミットのファイルがある場合、スクリプトはモデルを呼ばず停止する。レビュー用ファイルはGit管理領域へ保存し、原稿・予想・公式結果・本番コードへ自動適用しない。

## iPhoneのClaude Codeから使う

Claude CodeのWeb/iOSはAnthropic側の別実行環境で動く。この会話のClaude CLIやCodex認証は共有されない。次のGitHub経由で受け渡す。公式サービスの設定後は、[自動受け渡し](claude-codex-auto-handoff.md)のCodex Automatic reviewと、対象PRのClaude Auto-fixを使い、通常のPR URL転送・レビュー本文の手動コピーを省く。リポジトリ側の手順追加だけで両サービスを有効化したとは扱わない。

1. iPhoneで [Claude Code](https://claude.ai/code/new) を開き、本人の既存Claudeアカウントへログインする。Code機能が利用できる既存契約であることを確認する。未契約なら自動で追加契約しない。
2. 初回はGitHubの接続で `takechanman12250711-oss/chappy-boatrace-ai` を選択する。対象リポジトリへのアクセスを本人が許可する。
3. Claude Codeへ、依頼範囲・開始base・作業ブランチ・守る検査・完了条件を渡す。実装後はCreate PRでDraft PRを作る。
4. 設定済みなら、同じPRに対するCodexの実レビューと既存CIを、PRごとに開始したClaude Auto-fixへ渡す。Draftでのレビュー開始条件は実際の設定で確認する。進行中の自動レビューへ同じheadの手動依頼を重ねない。未設定・利用不可の場合はその状態を報告し、接続済みGitHubから同じ差分を独立レビューする従来経路と区別する。CLIが同じ環境にあれば前節のスクリプトも使えるが、認証を複製しない。
5. 指摘修正は依頼範囲内で最大3回までという指示を守り、不明・範囲外・認証失敗・同じ原因の再失敗では早く停止する。この回数は手順上の上限であり、サービスが強制する上限ではない。各新headに対応するレビューと必要なCIを確認する。本人へ渡す前にAuto-fixを停止し、進行中修正の終了後にPRのheadを再取得・照合する。Claude Codeの応答にも対象変更・影響・フローチャートと「このPRをGitHubで確認」リンクを含め、本人のGitHub操作またはボタン承認までマージしない。headが変わったら必要なレビュー・CIと提示内容を更新する。Web側のログイン成功を、このクラウド環境のCLI認証成功と説明しない。

両エージェントの初回受け渡しには `docs/claude-codex-first-check.md` の限定された確認タスクを使う。この `[連携確認・マージ不要]` PRは接続確認用でmainへ反映せず、通常の開発変更の本人マージ手順とは区別する。結果のDraft PRをCodex側で確認できてから、両者の受け渡し確認済みとして扱う。

公式の事前入力リンクは `https://claude.ai/code?repositories=owner%2Frepo&prompt=...` を使える。これはフォームへの入力であり、本人の送信操作で初めて開始する。ブランチ指定の未確認パラメータは追加せず、フォームと作業指示で指定する。

GitHubのCodexレビュー機能は [Code review設定](https://chatgpt.com/settings/code-review) の対象リポジトリの `Automatic review` と `Review trigger` を別途確認する。Claude側のAuto-fixは対象PRごとに開始する。両者の設定範囲・停止条件・本人承認前の固定head再照合・実証条件は [自動受け渡し](claude-codex-auto-handoff.md) に従う。通常のGitHubレビューに加え、メモリ・保存時刻・原本・会計など変更に必要な実データ検証を行う。この手順の追加だけで自動レビュー設定済みとは扱わない。

## 認証と実行の境界

- Claudeの既存契約を使うログインは `claude auth login --claudeai`。API課金へ切り替える `--console` は使わない。
- CLIの本人認証が必要な場合は、本人が安全に操作できるCLIの入力欄だけを使う。OAuthコード・トークン・Cookieをチャット、PR、Gitへ貼らない。本人用CLIのないiPhoneでは上記の公式Web経路を使う。
- 新しい有料API、追加契約、定期監視、共有認証サーバー、自動マージを作らない。各サービスの既存利用枠内で依頼された作業だけを実行する。
- 両モデルの実行を確認できるまでは「CLI導入済み」「受け渡し設定済み」「Codexレビュー確認済み」「Claude本人認証待ち」など、確認できた段階で報告する。

## 検証

`node --test tests/claude-codex-review.test.cjs` は小さな一時Gitリポジトリと偽CLIで、SHAの固定、読み取り専用起動、未認証・失敗・空結果・レビュー中の変更を検査する。CIから実モデルや有料APIは呼ばない。実モデルでの動作確認は既存契約の本人認証を使い、別の実行記録として扱う。

現行Codex CLIでは古い `codex mcp-server` は削除されている。`codex app-server` はMCPではなく、`claude mcp serve` はClaudeモデルの委任ではないため、これらをつないだだけで両モデル実行済みとは扱わない。

公式資料:

- [Codex非対話実行](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex CLI](https://developers.openai.com/codex/cli/reference/)
- [Codexの設定と優先順位](https://learn.chatgpt.com/docs/config-file/config-basic)
- [Codexの認証方法の制限](https://developers.openai.com/codex/auth/#enforce-a-login-method-or-workspace)
- [Claude認証](https://code.claude.com/docs/en/authentication)
- [Claudeの共有ルール](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools)
- [Claude Webの事前入力](https://code.claude.com/docs/en/web-quickstart#pre-fill-sessions)
- [Claude iOS](https://code.claude.com/docs/en/mobile)
- [Codex GitHub integration](https://developers.openai.com/codex/third-party/github)
- [Claude WebのPR Auto-fix](https://code.claude.com/docs/en/claude-code-on-the-web#auto-fix-pull-requests)
