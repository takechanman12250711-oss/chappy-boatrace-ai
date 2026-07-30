# 実購入データ完全自動同期

## 目的

実際に購入した舟券を自動取得し、事前予想・公式結果と結び付けて、購入額、払戻、収支、回収率、推奨内外を自動分析する。

## 安全方針

- テレボートの加入者番号、暗証番号、認証用パスワード、投票用パスワードをチャッピーボートレースAIのサーバーへ保存しない。
- 自動購入機能は追加しない。
- 取得対象は購入済み明細のみとする。
- 端末のログイン済みセッションを使うコネクタと、本体の同期APIを分離する。
- 同期データは契約IDまたは安定した購入キーで重複登録を防ぐ。

## 全体構成

1. 端末側コネクタ
   - テレボートのログイン済み購入履歴・契約明細を読み取る。
   - 認証情報そのものは送信しない。
   - 日付、場コード、レース番号、買い目、金額、契約ID、購入時刻だけを送信する。
2. 購入同期API
   - 受信データを検証・正規化する。
   - 重複を除外し、既存明細を安全に更新する。
3. 予想連携
   - `raceKey`で購入前の予想と結び付ける。
   - 推奨内購入、推奨外購入、推奨買い逃しを分類する。
4. 結果連携
   - 公式結果取得後に的中、払戻、収支を自動計算する。
5. 分析
   - レース、場、展開、買い目分類ごとの実購入成績を集計する。

## 実装済み

### 本体基盤

`js/purchase-sync-core.js` が以下を担当する。

- 購入明細の正規化
- `purchaseKey`による重複防止
- `raceKey`による事前予想との紐付け
- 実戦厳選買い目に含まれるかの判定

### 購入同期API

`api/purchases.js` が以下を担当する。

- `Bearer`トークン認証
- `POST`による購入明細同期
- 1回500件までの入力検証
- 重複除外と再同期更新
- `GET`による日付・`raceKey`別取得
- `Cache-Control: no-store`

### 保存層

`api/_purchase-store.js` はUpstash Redis RESTまたはVercel KV互換環境変数を使用する。

必要なVercel環境変数：

- `CHAPPY_PURCHASE_SYNC_TOKEN`
- `UPSTASH_REDIS_REST_URL` または `KV_REST_API_URL`
- `UPSTASH_REDIS_REST_TOKEN` または `KV_REST_API_TOKEN`
- `CHAPPY_PURCHASE_STORE_KEY`（任意）

`CHAPPY_PURCHASE_SYNC_TOKEN`は端末側コネクタとAPIの間だけで使用し、テレボートの認証情報とは分離する。

## API利用条件

- `GET /api/purchases`
- `GET /api/purchases?date=YYYYMMDD`
- `GET /api/purchases?raceKey=YYYYMMDD-JCD-RNO`
- `POST /api/purchases`

すべてのリクエストで次のヘッダーが必要。

```text
Authorization: Bearer <CHAPPY_PURCHASE_SYNC_TOKEN>
```

`POST`本文：

```json
{
  "purchases": [
    {
      "date": "20260731",
      "jcd": "07",
      "raceNo": 5,
      "ticket": "1-2-4",
      "amount": 500,
      "contractId": "契約明細ID",
      "purchasedAt": "2026-07-31T06:00:00+09:00"
    }
  ]
}
```

## 次工程

1. 公式結果との自動照合を追加する。
2. 端末側コネクタを実装する。
3. 結果分析UIへ実購入成績を追加する。

端末側コネクタの方式は、公式の公開APIが提供されない限り、ログイン済みセッションから購入明細を読み取る方式を採用する。
