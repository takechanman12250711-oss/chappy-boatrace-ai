---
name: claude-codex-review
description: Claude Codeが実装したチャッピーのコミット済み差分を、Codexの読み取り専用レビューへ引き渡す。別環境のClaude Code Web/iOSではGitHub PRで受け渡す。実装後のレビューや両エージェントの協業に使う。
---

最初にリポジトリの `AGENTS.md` と `docs/claude-codex-development.md` を読む。

1. 依頼範囲、作業開始時のbase SHA、実装後のhead SHAを固定する。自動更新されるmainの現在値を、開始時のbaseへ読み替えない。
2. 同じ実行環境にChatGPT認証済みのCodex CLIがある場合、変更を作業ブランチへコミットした後に `node scripts/claude-codex-review.cjs --base <base SHA>` を実行する。レビュー対象はコミット済みの差分で、未コミット変更がある場合は開始しない。
3. 出力されたレビュー本文とreceiptを読み、対象SHAと完了状態を確認する。completedはレビュー実行完了であり、指摘なし・検証合格・マージ許可ではない。失敗やstaleを成功へ読み替えない。
4. 指摘を依頼範囲で修正したら、新しいheadで必要な検査とレビューを行う。CIとmain反映は既存の手順に沿って別途確認する。
5. Web/iOSなど別環境でCodex CLIやその認証が利用できない場合は、実装差分を同じGitHubリポジトリのDraft PRへ保存し、そのPR番号・base/head SHA・実行済み検査・未解決点をCodex側へ渡す。認証を複製したり、有料APIで代用しない。

このスキルは本人ログインや常時実行機能ではない。起動できるCLI、実モデル応答、レビュー結果の返却、CI合格、本番反映を区別する。通常の会話へ認証コードやトークンを要求しない。
