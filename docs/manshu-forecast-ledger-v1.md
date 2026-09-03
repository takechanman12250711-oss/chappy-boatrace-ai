# 波乱・道中変化・万舟の別会計予想台帳 v1

更新日: 2026-09-03 JST

## 目的

既存の `lightManshuTicketBoard` がレース前に作る複数の参考筋を、通常予想へ混ぜず、次の用途へ通す。

1. note販売文の参考予想
2. レース前の固定保存
3. 公式結果との照合
4. 通常予想・実戦厳選とは別会計の成績集計

## 分類

| `kind` | 別会計分類 | 意味 |
|---|---|---|
| `START_UPSET` | 波乱予想 | 攻め艇がスタートから攻め切る筋 |
| `ROAD_PICKUP` | 道中変化予想 | 1マーク後の展開拾い・道中浮上で着順が変わる筋 |
| `OUTER_FOLLOW` ほか | 万舟予想 | 外の攻め連動、内残し、拾いを組み合わせる筋 |

## 保存契約

台帳は `prediction.manshuForecastLedger` を正本とし、配信用のコンパクト予想にも残るよう `prediction.manshuSheet.forecastLedger` へ同値を保持する。

各予想筋は最低限、次を持つ。

```js
{
  forecastId,
  raceKey,
  forecastType,
  forecastLabel,
  formation: {
    notation,
    expandedTickets,
    pointCount
  },
  scenario,
  roles: {
    attackBoat,
    remainBoats,
    pickupBoats
  },
  evidence,
  allocation,
  generatedAt,
  noteEligible: true,
  saveEligible: true,
  resultCheckEligible: true,
  purchaseEligible: false,
  affectsNormalTickets: false,
  affectsPracticalSelection: false,
  usesOdds: false,
  usesOfficialResult: false
}
```

`forecastId` は `raceKey`、分類、展開種別、フォーメーション、展開後のexact券から決定し、同じレース前入力では固定する。

## note契約

有料部分の通常予想・実戦厳選の後へ、存在する分類だけを次の見出しで追加する。

- `【参考・波乱予想】`
- `【参考・道中変化予想】`
- `【参考・万舟予想】`

各筋には、フォーメーション、展開後点数、1点あたりの参考配分、展開理由、攻め・残し・拾い、exact券内訳を載せる。

必ず「通常予想・実戦厳選・購入保存には自動追加しない」「レース前に固定し、公式結果とは別会計で検証する」と明示する。

## 結果照合契約

公式3連単と `expandedTickets` を照合し、次を保存する。

- 的中した予想筋
- 参考購入額
- 払戻額
- 収支
- 回収率
- 波乱／道中変化／万舟ごとの成績

払戻額は、公式100円払戻 × その筋の1点あたり枚数で計算する。同一exact券は台帳内で重複計上しない。

不成立レースは通常どおり母数へ含めず、結果未確定は結果待ちとして分ける。

## 境界

この変更で次を変えない。

- 通常予想最大7点
- 成立展開を含む全体最大10点
- 実戦厳選
- 通常の購入保存
- オッズ分類・資金配分
- 予想の優先順位
- A/Bの本番判定

別会計予想はレース前に固定する正式な検証対象だが、通常の購入候補へは自動追加しない。

## 回帰条件

- `lightManshuTicketBoard` が2筋未満なら台帳を作らない
- 通常本線・押さえ・流し・通常万舟を変更しない
- 同じレース前入力から同じ `forecastId` を作る
- オッズや公式結果を与えても予想筋・順位・配分を変えない
- noteへ3分類を正しい見出しで追加する
- コンパクト予想保存へ台帳が残る
- 公式結果保存時に別会計評価が付く
- 通常成績と別の的中率・回収率を集計する
