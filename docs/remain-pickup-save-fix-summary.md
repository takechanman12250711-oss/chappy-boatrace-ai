原因: 復元済み日次予想が未ステージ変更として残り `git pull --rebase` が失敗。
修正: レポート保存前に `prepare-daily-prediction-git-save.js --all` を実行し、通常のGit保存形態へ戻す。
