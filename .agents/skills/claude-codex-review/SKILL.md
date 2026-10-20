---
name: claude-codex-review
description: Claude Codeが実装したチャッピーのコミット済み差分を、Codexの読み取り専用レビューへ引き渡す。別環境のClaude Code Web/iOSではGitHub PRで受け渡す。実装後のレビューや両エージェントの協業に使う。
---

最初にリポジトリの `AGENTS.md`、`docs/claude-codex-development.md`、`docs/development-approval.md` を読む。

1. 依頼範囲、作業開始時のbase SHA、実装後のhead SHAを固定する。自動更新されるmainの現在値を、開始時のbaseへ読み替えない。
2. 同じ実行環境にChatGPT認証済みのCodex CLIがある場合、変更を作業ブランチへコミットした後に `node scripts/claude-codex-review.cjs --base <base SHA>` を実行する。レビュー対象はコミット済みの差分で、未コミット変更がある場合は開始しない。
3. 出力されたレビュー本文とreceiptを読み、対象SHAと完了状態を確認する。completedはレビュー実行完了であり、指摘なし・検証合格・マージ許可ではない。失敗やstaleを成功へ読み替えない。
4. 指摘を依頼範囲で修正したら、新しいheadで必要な検査・レビュー・既存CIを行う。headが変わったら提示内容も更新し、以前の確認を転用しない。
5. Web/iOSなど別環境でCodex CLIやその認証が利用できない場合は、実装差分を同じGitHubリポジトリのDraft PRへ保存し、そのPR番号・base/head SHA・実行済み検査・未解決点をCodex側へ渡す。認証を複製したり、有料APIで代用しない。
6. この会話・Claude Code・管理画面のいずれの入口でも、main反映前に対象変更・影響・フローチャート・同じPRの番号とbase/head・検査状況を共通資料として示す。共通導線は「このPRをGitHubで確認」とする。管理画面は「成績」→「設定・開発確認」の折り畳みに置く。共有URLを開くだけではGitHubへ通信せず、本人が「対象PRを照合」を押し、読み取り結果が固定headと一致した場合だけ共通導線を有効にする。入力不足・不一致・取得失敗時は無効にする。
7. 本人がGitHubの `Merge pull request` / `Confirm merge` など表示に応じた最終確定操作を行うまで、AIはマージせず停止する。`gh pr merge`・API経由のマージ・自動マージは使わない。自分のPRの `Approve` を前提にせず、権限・required reviews・required checksを緩めない。`completed`・CI成功・`Ready for review`・リンクのクリック・端末内の記録を最終承認と扱わない。本人のマージ後にmain反映を別途確認する。

依頼範囲の調査・実装・fixture検査・レビュー・CI・PR作成に計画ごとの承認待ちを増やさない。本手順を導入する最初のPRも本人のマージを待つ。全環境でのモデル起動や表示確認を新たな必須工程にせず、Claude Codeにも次回から適用する共有手順として渡す。ChatGPT/Claudeのネイティブ画面へ独自承認ボタンを設置したと説明しない。既に承認されたデータ更新・収集・note/X投稿などの自動処理や、予想方式採用の別承認は変更しない。

このスキルは本人ログインや常時実行機能ではない。起動できるCLI、実モデル応答、レビュー結果の返却、CI合格、本番反映を区別する。通常の会話へ認証コードやトークンを要求しない。
