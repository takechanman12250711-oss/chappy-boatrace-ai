# 未使用holdout取得元のfail-closed復旧 v2

## 目的

ST優位＋攻め役割優位＋展示優位の一回限りholdout検証で、既存の確定レポートを再開封せず、取得元解決だけを安全に復旧する。

## 最優先ルール

既存レポートが次を全て満たす場合、結果をそのまま保持して再計算しない。

- `holdoutConsumed=true`
- `thresholdSearchPerformed=false`
- `productionChanged=false`
- `automaticApplication=false`
- `nextStep`がblockedではない

これにより、結果を見た後に別のholdoutへ入れ替えたり、同じholdoutで閾値を変更したりできない。

## 取得元の探索

既存レポートがblockedの場合だけ、次の順序で探索する。

1. effective-score関連モジュールの`load/read/get`系holdout・validationローダー
2. effective-score関連JSON内の`holdout`・`sealed`・`validation`配列
3. ネストされた複数配列を個別に分離
4. DiscoveryとのraceKey重複が0Rの配列だけを許可
5. `holdout / sealed / validation / untouched`の明示ラベルを持つ候補だけを許可

ファイル名が似ているだけのテストfixture、Discovery、結果レポートは減点または除外する。

## fail-closed条件

- Discovery重複が1R以上
- 明示ラベル付きの未使用データが見つからない
- `analyses`または公式1着艇が保存されていない
- weightConfigが取得できない

以上のいずれかではblockedのまま停止し、予想へ反映しない。

## 変更しないもの

- 本番予想ロジック
- 買い目
- 最大点数
- UI
- オッズ処理
- 2コース差し
- 4号艇残し
- 既存のholdout判定条件

```text
既存holdout結果
      │
      ├─ 消費済み・非blocked ──→ そのまま固定（再計算禁止）
      │
      └─ blocked
            │
            ▼
  明示holdout/validation配列を探索
            │
      Discovery重複0R？
       ┌────┴────┐
       │         │
      NO        YES
       │         │
    停止      一度だけ検証
       │         │
       └────┬────┘
            ▼
      本番予想変更なし
```
