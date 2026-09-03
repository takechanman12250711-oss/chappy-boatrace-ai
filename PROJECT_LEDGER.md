# チャッピーボートレースAI 恒久開発台帳

更新日: 2026-09-03 JST

このファイルはチャットを跨いでも失ってはいけない恒久情報を保存する正本。
新しいチャット・新しい作業を始める時は、必ず `GitHub main → API main → 本番環境 → 最新PR → この台帳 → 申し継ぎ` の順で確認する。
資料・記憶・過去チャットより現在のmainを優先する。

## 1. システム構成

- AI本体: `takechanman12250711-oss/chappy-boatrace-ai`
  - 役割: フロント、予想AI、買い目、実戦厳選、理論評価、結果分析、Phase7〜10、学習・検証基盤
  - 本番フロント: GitHub Pages
- データ取得API: `takechanman12250711-oss/chappy-boatrace-api`
  - 役割: 公式出走表、展示、オッズ、結果などの取得API
  - 本番API: Vercel `chappy-boatrace-api`
- AIとAPIは別リポジトリ・別デプロイ。常時同じコードを同期する構成ではない。
- AI側は必要な時にVercel上のAPIを呼んで連携する。
- APIの修正はAPIリポジトリ→Vercel Production反映まで確認する。AI本体の修正と混同しない。
- VercelのPreview DeploymentとProduction Deploymentを混同しない。

## 2. 開発確認順序

1. `chappy-boatrace-ai` の最新main
2. `chappy-boatrace-api` の最新main
3. GitHub Pages本番状態
4. Vercel API Production状態
5. AI→APIの現在の接続先と実レスポンス
6. 最新PR
7. この恒久台帳
8. 最新申し継ぎ
9. 過去資料・記憶

## 3. 予想の絶対優先順位

変更禁止。変更する場合は必ず事前説明とユーザー了承が必要。

1. 展開
2. コース
3. ST・スリット
4. 展示・足
5. 残し・拾い
6. 当地・水面
7. 技量
8. モーター

- 数字・オッズだけで買い目を作らない。
- 数字・オッズだけで買い目を削除しない。
- オッズは買い目作成後の表示・分類・資金配分にのみ使用する。

## 4. 変更時の絶対ルール

予想ロジック・買い目・UI・理論重みを変更する場合は、実装前に必ず以下を説明して了承を得る。

- 何を変えるか
- 根拠
- 現在値
- 変更後
- メリット
- デメリット
- 予想への影響

自動で本番ロジックへ学習結果を反映しない。

## 5. GitHub作業ルール

基本サイクル:

`実装 → PR → CI・確認 → squashマージ → main確認 → 本番反映確認`

- mainが正本。
- 一時Workflow・一時ブランチ・診断コードは役目終了後に整理する。
- Pages/Vercel/結果収集など現在利用中のものを、用途確認なしで削除しない。

## 6. 12理論

正式証拠化対象:

- 展開理論
- コース理論
- ST・スリット理論
- 展示・足理論
- 残し・拾い理論
- 当地・水面理論
- 技量理論
- モーター理論
- 壁艇理論
- 枠別浮沈率
- ダブルタイム
- 新エンジン理論

正式証拠が存在する場合だけ「使用した理論」として保存する。
証拠の水増し・過去データへの後付け捏造は禁止。

## 7. Phase7〜10

- Phase7: 12理論の正式証拠・的中・回収率等を集計。新規生成時の証拠不足理由も監視。
- Phase8: 正式証拠30R以上の理論だけを1回1理論で利益レビュー候補化。
- Phase9: 弱点・変更候補・根拠・期待効果・次工程を1提案だけ生成。自動変更禁止。
- Phase10: 承認済みPhase9案だけをshadow A/B。Bは本番予想・本番買い目に使わない。最低50R。自動採用禁止。

## 8. 評価優先順位

1. 回収率
2. 実戦厳選的中率
3. 見送り判断精度
4. 的中率

目標は「当たるAI」だけではなく「利益が残るAI」。

## 9. 現在の重要な確定仕様

- UI開発は基本終了。不要な新UI・新聞UIは追加しない。
- 通常予想: 本線最大3点、押さえ最大2点、同一1着・2着軸のフォーメーション由来3連単2点（通常穴と排他）、合計最大7点。
- 万舟欄: 通常枠で購入対象にできる穴候補は従来どおり最大1券。ただしこれは画面表示の1点上限ではない。スタート波乱・攻め連動・道中変化から成立する複数参考筋は、独立欄を作らず同じ万舟アコーディオン内へ表示する。
- 別会計予想: 万舟欄の複数参考筋は、波乱予想・道中変化予想・万舟予想としてレース前に固定保存し、note有料文へ参考枠で掲載し、公式結果と照合して通常予想・実戦厳選とは別会計で的中率・回収率を集計する。通常枠・実戦厳選・購入保存へは自動追加しない。
- 実戦厳選は通常予想とは別枠。
- 終了レースは結果＋予想＋的中/不的中/未購入を表示する設計。
- 24場固定。
- 理論評価は裏側で行い、必要な評価は説明文等へ反映する。理論ごとの余計な表を増やさない。

## 10. 自動収集・結果処理の基本構造

- AI側で自動予想を収集・保存。
- 結果収集後に12理論評価・外れ原因・Phase7以降の集計を生成。
- 結果収集は重要データを先にmainへ保存し、重い後段テストで結果保存自体が消えない構造にする。
- 不成立レースは的中率・回収率の通常母数へ混ぜない。

## 11. 本番確認で必ず区別するもの

- `chappy-boatrace-ai` main と `chappy-boatrace-api` main
- GitHub Pages と Vercel
- Vercel Preview と Production
- GitHub上の修正完了 と Production反映完了
- 自動予想収集 と 公式結果収集

「GitHubに入った」だけで「本番修正完了」と扱わない。

## 12. 現在地 2026-08-08 20:38 JST

確認時点の機能反映コミット（台帳更新直前。次回開始時は必ず再取得する）:

- AI: `b923378d17b820c81387d20deaa7bfab998f875e`（最新自動予想収集）
- API: `059d070672f530ce4b658170f80fd764c84797d4`（API PR #25）

今回確定した本番状態:

- AI PR #275: 全艇F/Lの振り返りを「不成立（全艇F/L）」として表示。専用回帰を含むCI成功、squashマージ済み。
- AI PR #276: 予想indexの重複理論証拠を安全に圧縮。3MB未満へ復旧し、検証母数・評価結果を維持。
- API PR #20: 全艇F/Lを `status: void` / `voidReason: all-boats-f-or-l` として返す実装。
- API PR #23: Vercel Hobbyで拒否されていた5分Cron設定を削除し、Production deploymentを復旧。
- API PR #24: 本番scheduleの `liveVenues` 形式から最終オッズ収集対象を生成し、既存同期トークン認証へ対応。
- API PR #25: `POST /api/collect-final-odds-race` を追加。1Rごとに公式3連単120通りの完全性を検証し、専用Bearer認証をfail-closed化。公式取得15秒＋保存最大5秒×2回の25秒上限、REST/direct Redis双方のタイムアウト、`capturedAtMs` 比較付きLua原子的保存、古い処理の上書き防止を実装。予想ロジック・優先順位・買い目・理論重み・UIは変更していない。
- AI PR #277: 既存の購入照合workflowから認証付きで最終オッズ収集APIを呼ぶ。予想ロジック・買い目・理論重み・UIは変更していない。
- AI PR #279: 日次JSONを正本のまま、配信用予想indexをcontent-addressed manifest＋byte-bound shardへ恒久分割。旧 `index.json` は端末fallback用に凍結し、予想ロジック・優先順位・買い目・理論重み・UIは変更していない。
- PR #279後の初回自動予想収集 `5039cc0`: current 6 shard＋直前1世代を保持。共有ファイル込みの実保存11件はmanifest参照集合と完全一致し、検証300件・V2シャドー381件・実行100件を再構成確認済み。
- 凍結legacy `data/predictions/index.json` のblobはPR前後・初回自動収集後とも `84f0bd081357d4a325c78cd381a60ccf9c2b4ef6` で不変。
- GitHub Pages本番 `https://takechanman12250711-oss.github.io/chappy-boatrace-ai/`: `20260808-index-shards1` のloader配信、成績分析の遅延読込・表示、サイト由来console errorなしを確認。
- GitHub Pages: PR #277のmain SHAを対象にbuild/deploy成功。
- Vercel Production: deployment `dpl_3hc65qX2NPeKrm6yxdgWjiym2HuC` がAPI PR #24のmain SHAでREADY。
- Vercel Production: deployment `dpl_8KsddcqGCTTXb9o9zg5GbP8hXZ9n` がAPI PR #25のmain SHA `059d070` でREADY。新endpointのGETは405＋`Allow: POST, OPTIONS`、認証secret未設定のPOSTは503 `collector authorization is not configured` と設計どおりfail-closedになることを実確認。
- 2026-08-07 大村1R: API Productionは `resultAvailable: false`, `status: void`, `void: true`。AI本番画面も「不成立（全艇F/L）」を表示。
- 大村2Rの通常確定、通常未確定の非void、ホームからの当日予想、結果・成績画面まで回帰確認済み。
- workflow run #119: 購入照合と最終オッズ収集が成功。収集は `targetCount: 7`, `successCount: 7`, `availableCount: 7`, `failedCount: 0`、各レース120通り取得。

運用上の残件:

- 1R単位APIのコードとProduction反映は完了。`CHAPPY_FINAL_ODDS_COLLECT_TOKEN` はVercel Production/Previewに未設定で、新endpointは安全に503停止中。Cloudflare側と同じsecretを値を表示せず設定し、再デプロイ後にのみ呼出しを有効化する。
- Cloudflareプラグインはインストール/OAuth要求後も、この会話でWorkers・D1・Workflowsを操作できるcallable toolが0件。接続が会話へ反映されるまでCloudflareリソース・secret・deployは未作成。機能名や書込権限を推測して進めない。
- PR #279の `Check theory improvement approval gate` 失敗は、対象3ファイルに差分がない最新main `f5908dd` 単体でも同じassertion failureを再現した既存問題。index shard移行とは分離して修正する。
- 現行の一括収集は初回リクエストがVercelの30秒上限で504となり、既存の `curl --retry 2` により再試行で200へ回復した実績がある。PR #25の1R endpointは最悪25秒に制限済みだが、Cloudflare有効化・並走確認までは旧一括経路を停止しない。
- GitHub Actionsはworkflow上 `*/5 * * * *` だが、過去の実起動間隔はおおむね40〜80分であり、厳密な5分実行保証として扱わない。締切前の全レース収集を保証する必要がある場合は、スケジューラの信頼性改善を別PRで検討する。
- AI側の全艇F/L互換層は、API Productionが正常化した後も安全フォールバックとして維持する。

## 13. 新しいチャット開始時の最初の動作

チャット記憶だけで作業を再開しない。
以下を実データで再確認してから作業する。

1. AI main SHA
2. API main SHA
3. 最新AI PR
4. 最新API PR
5. GitHub Pages公開状態
6. Vercel Productionの対象SHA
7. AIが参照するAPI URLと実レスポンス
8. この台帳との差分
9. その後に最新申し継ぎの作業地点へ復帰

この順序を省略して同じ調査を繰り返さない。
