# 日和学習データ 変更提案承認管理

## 目的

採用候補から作られた変更提案について、承認・保留・却下を記録する。

## 二重ロック

承認状態になっても、以下は自動変更しない。

- 予想ロジック
- 印
- 配点
- 買い目
- 予想優先順位

承認記録の `applied` は常に `false`、`applicationLock` は常に `true` とする。

## 状態

- `pending`: 未判断
- `approved`: 承認記録済み。ただし未適用
- `held`: 保留
- `rejected`: 却下

## 承認失効

承認から30日が経過した場合は自動的に保留へ戻し、再確認を必要とする。

## 保存キー

- `chappy_hiyori_proposal_approvals_v1`
- `chappy_hiyori_proposal_approval_history_v1`

履歴は最大500件保持する。

## 公開API

```js
window.ChappyHiyoriProposalApproval.setDecision(id, status, reason);
window.ChappyHiyoriProposalApproval.getApprovals();
window.ChappyHiyoriProposalApproval.getHistory();
```

この機能は承認管理専用であり、予想反映機能を持たない。
