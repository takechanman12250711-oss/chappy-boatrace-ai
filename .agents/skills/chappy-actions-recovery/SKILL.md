---
name: chappy-actions-recovery
description: chappy-boatrace-ai / chappy-boatrace-api のGitHub Actions失敗、収集停止、watchdog異常、CI失敗を確認・復旧するときに使う。
---

# GitHub Actions復旧

## 確認順
1. 最新main
2. 失敗したworkflow run
3. 失敗jobとログ
4. 直前の成功runまたは変更差分
5. 関連する保存先・artifact・Issue

## 復旧原則
- workflowが失敗した事実と、予想/結果データが壊れた事実を分ける。
- 同じ原因・同じ方式で2〜3回失敗したら、同じ修正を繰り返さず原因経路を切り替える。
- watchdog失敗時にテストがskipされた場合は、成功扱いにしない。
- 原本保存、診断保存、校正保存を区別する。
- 競合停止やartifact不一致を正常終了扱いしない。
- 復旧後は最新run成功だけでなく、必要データが実際に保存・公開されたかまで確認する。

## 報告
原因、修正、検証結果、main反映、本番実行確認を分けて短く報告する。