# note自動化：現在地と公開前監査

## 2026-09-23 初回の実レース公開と公開後照合

- 三国2Rを2026-09-23 08:55:54 JSTに300円で公開。URL: https://note.com/great_robin3243/n/nc97383960b4b 。締切08:58より前。未ログインの実ページでタイトル、time datetime、有料境界、300円、無料部分に買い目が出ないことを確認した。
- 収集run 35799428047 → 実行時handoff → transport run 35799675611。投稿クリックは23:55:51 UTC、noteの公開日時は23:55:54 UTC。記事一覧では公開中だが、transportは完了画面からURLを取得できず `publication_result_unknown_review_required`。このrunの `note-published` receiptは未保存であり、自動記録成功とは扱わない。
- 完了画面でURLが見つからない場合は、同じ認証の別タブで既存 `/notes` 一覧を読み、編集時の記事IDと一致する公開URLだけを取得する。その後の未ログイン確認（タイトル・価格・有料境界・新しい公開日時）は省略しない。リストにあるだけでは公開成功としない。
- 投稿クリック再試行、予約削除、期限切れ再投稿はしない。URLが見つからない、別記事、下書きpreview、ログイン要求、公開検証失敗は従来どおり停止する。

更新基準: 2026-09-14 / latest main

## 展示後投稿・最大24点候補の成績（ユーザー承認）

- 全レース対象を維持し、公式展示タイムと艇番に対応したスタート展示が6艇分揃ってから最新入力で予想を作る。展示待ちは次の収集で再確認し、点数やV2充足率の厳選条件は戻さない。
- 展示入力と取得時刻をimmutable bundleに保存する。公開直前も展示の証拠と締切を検査し、展示前の旧bundleを投稿しない。実戦厳選の買い目・順序・点数は維持する。
- 通常の最大24点は既存 `createDisplayCandidates` の表示候補を別に保存し、公式結果と照合する。候補が24点未満なら実点数、1点100円均等購入で計算する。同じ対象レースの実戦厳選は別行とし、既存の実購入成績を上書きしない。
- 的中率は的中レース/照合済みレース、回収率は公式払戻合計/購入想定額。レース単位の単純平均は使わない。重複収集は締切前の最新1件、未確定・払戻欠測は分母に入れず、返還・不成立も別扱いとする。
- 既存保存予想は保存された候補プールから同じ最大24点表示規則で再集計する。結果を使って過去の買い目を作り直さない。新規note原稿は保存したcandidate24Ticketsを使う。画面の「最大24点候補の成績」で別表示し、公式結果収集完了後に専用workflowで更新する。

## 2026-09-14 全レース予想・自動投稿への変更

ユーザーが全レースの予想とnote自動投稿を明示承認。この節は過去の厳選対象条件に優先する。

- note専用collectorは全開催場の公式1〜12R予定を読み、当日の締切前レースを対象にする。最高1R・60点以上・V2完全データという対象の絞り込みを行わない。既存の展開優先エンジンと買い目順は維持する。
- `all-races-v1` 原稿は本命艇72点未満・データ品質「低」を一律の販売停止理由にしない。取得済み情報による参考予想であることを無料部分へ明記する。オッズ不明は同じ買い目に「オッズ未取得」と表示し、値を捏造しない。旧厳選原稿の監査はそのまま残す。
- 注目開催は取得済みのSG/PG1/G1/G2情報、場の逃げ・万舟傾向は利用可能な公式履歴と標本数を根拠に短く表示する。履歴数字から買い目を変更しない。
- 実際に取得できない出走表、艇番不整合、生成できない買い目、本文との矛盾、締切不明・締切余裕120秒以下は具体的な理由を記録する。「条件をなくす」をデータや買い目の捏造、締切後販売の許可と解釈しない。
- 全レースの原稿をimmutable bundleへ保存し、独立writerは全ての新しい原稿だけを最新mainへ保存する。過去予想・結果・V2研究台帳は変更しない。
- publisherは締切順に複数記事を処理する。1実行6分/最大8記事で区切り、未予約の有効原稿が残れば同じworkflowを続行する。各記事で原子的予約、300円、元原稿監査、公開URL・日時の確認を行う。対象なしのskipを公開成功と扱わない。

## 2026-09-14 結果処理から独立した原稿収集

- `live-note.yml` がJST 07:00〜22:55の5分間隔で既存collectorの `--note-only` を実行する。GitHubの起動遅延はあり得るが、結果収集・校正の共有キューには入らない。
- 同じ予想エンジン・V2選定・公式オッズ補完・原稿監査を使う。日次予想、結果、校正、可変のMarkdownは保存せず、immutableな `data/note-drafts` だけを保存する。通常collectorと結果・校正の共有writerは維持する。
- 独立writerは変更パスを検査し、原稿だけのコミットを最新mainへrebaseしてfast-forward pushする。競合は停止し、push競争は最大3回。締切を再検査して既存publisherへ渡す。force pushしない。
- 投稿は監査合格・当日・締切余裕120秒超・未予約の対象がある時だけ。原子的な予約により通常collectorとの二重投稿を防ぐ。5分間隔は収集予定であり、投稿時刻の保証ではない。対象なしのskipと実際の公開成功を区別する。

## 2026-09-14 自動投稿の有効化

ユーザーの「自動投稿にしたい」という明示依頼により、従来の最終公開無効方針を更新する。この節を以下の過去記録より優先する。

- mainのhandoff生成成功後、保存済みBrowser Use profileで `publish` を自動実行する。関連実装のmain反映でも開始する。手動auth/draftは残す。
- `latest.json` の候補を順に調べ、保存bundleのパス・SHA256・レース識別を照合する。簡潔版の表示だけを適用し、保存予想・買い目・オッズ・元bundleは書き換えない。
- 実時計で公開前監査を再実行し、JST当日・締切余裕120秒超・監査合格・未予約の候補だけを使う。古い先頭候補で後続を妨げず、失格理由を記録する。監査の `canPublish` をtrueへ変えず、検証済みの実行時handoffを別途作る。
- 原子的なレース予約を取得後、本文・価格300円・有料境界を設定し、最終クリック直前に元原稿との一致と締切を再確認する。公開クリックは1回。結果不明時も予約を消さず再投稿を止める。
- 公開記事IDが編集記事IDと一致するURLを取得し、ログインなしの画面でタイトル・有料境界・300円・公開日時を確認する。成功は `note-published/<race hash>` タグの `receipt.json` とActionsログにURL・日時・元原稿SHAを記録する。
- 対象なしのskipは投稿成功ではない。初回の実レース無人公開は実行ログと公開URLで別途確認する。テスト下書き「動作確認用・公開しない」は公開しない。



## 2026-09-14 原稿の簡潔化

新規原稿は `concise-v1` 形式。買い目・区分・順序・オッズを保持し、展開説明は1〜2文にする。6艇評価の長文と買い目ごとの重複説明は本文へ出さず、6艇の識別情報は原稿メタデータで検査する。締切、無料漏れ、買い目・オッズ照合、公開停止の検査は維持する。旧形式の保存原稿と監査は保持し、アプリでは別の簡潔版を表示・コピーする。生成時監査は元原稿の結果であり、整形後の公開許可ではない。

## 2026-09-13 Browser Use接続の確認済み現在地

同日、本人が販売者情報を登録後、Workの非公開テスト下書き「動作確認用・公開しない」（n9bed34c034d9）で本文保存、価格300円、無料文と有料文の間の選択済み境界を実画面確認した。価格欄は input#price、有料切替は完全一致で指定する。境界は有料先頭段落の全文一致が一意であること、直前のwidget、選択後のaria-pressedを検証する。共通祖先内の最初のボタンや40文字の部分一致を使わない。これはWorkでの実サイト確認であり、Actionsのdraft無人成功や公開の証明ではない。投稿ボタンは未操作。再ログイン・本人情報再登録を新たな失敗の証拠なしに要求しない。

この節を以下の旧storageState接続記録より優先する。PR #945で認証経路をBrowser Use保存profileへ変更済み。GitHub Secretsは `BROWSER_USE_API_KEY` と `BROWSER_USE_PROFILE_ID`。旧 `NOTE_STATE_JSON_BASE64` の登録、Cookie抽出、本人ログインのやり直しを要求しない。

ユーザーがiPhoneで両Secretを登録し、mainのauth実行34760871901（2026-09-13 13:50 UTC）で `NOTE_UI_PROFILE_LOADED=true`、`NOTE_UI_EDITOR_READY=true` を確認した。GitHub Actionsから保存profileを再利用してnote編集画面へ到達した証拠である。本文入力・300円・有料境界・公開は未確認/未実行。

次は実時計で有効な既存handoffだけを使ってdraftを検証する。期限切れなら停止し、日時やcanPublishを書き換えて検証を通さない。最終公開は未実行方針を維持する。新しい認証失敗の証拠がない限り本人操作を再要求しない。

### 原稿生成後の自動下書き

原稿生成workflow `Build note publish handoff` がmainで成功すると、note transportが自動でdraftを開始する。実行時は最新mainのhandoffを読み、期限切れ・停止理由付き・既存のレース予約ありの場合はブラウザ起動前に見送る。読み取り失敗は停止する。事前確認後も原子的な予約と実時計ゲートを再検査する。完了済みの収集・原稿生成は作り直さず、手動のauthを毎回要求しない。自動開始の設定と実際の下書き成功を区別し、Actions Summaryのskipを成功投稿と扱わない。最終公開は無効のまま。

- 起動元は同じリポジトリのmainで成功したhandoff workflowに限定する。checkoutはmainに固定し、外部artifactや起動元ブランチのコードを読み込まない。
- Browser UseのSecretは接続検査と実際のtransportステップだけに渡す。対象がなければPlaywrightのインストールも行わない。
- 既存予約はGETで照合して見送り理由をSummaryへ記録する。予約の解除・削除はしない。確認後の競合は従来の原子的予約で停止する。
- 手動のauth/draftはmainのみ利用可能。予約に記録するSHAは実際にcheckoutしたmainのものを使う。
- workflow_runで原稿生成の完了を受ける仕組みは[GitHub公式仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)に従う。原稿生成側のコード・トリガーは変更しない。

### 下書きの二重作成防止

- workflowは同時実行を直列化し、実行中の処理を取り消さない。
- draft開始前に正規化したraceKeyのSHA-256をキーとして、GitHubの `refs/tags/note-draft-claim/<hash>` を原子的に作成する。本文変更や再実行でも同じレースは再取得できない。authは予約しない。
- 予約にはActionsの短命な `github.token` とcontents:writeを使う。新しい本人Secretは不要。送信先は対象リポジトリに固定し、記録はキーと実行コードのSHAだけで認証情報や本文を含まない。
- 予約の取得失敗・結果不明・途中失敗は停止する。予約は削除せず、再実行も止める。これは成功記録ではなく、二重作成を防ぐ試行記録。
- 復旧時は該当runとnote上の下書きを照合し、既存下書きの再利用方針を決めてから別途対応する。自動解除・自動削除・強制再実行は提供しない。
- 予約導入前の手動下書きや他の投稿経路には適用されない。最終公開の重複防止と公開URL確認は引き続き未完成。

## 現在の運用状態

この文書は過去の実験経路ではなく、現在のmainから作業を再開するための基準を示す。

完成済み:

- 自動予想収集
- 公式結果収集
- GitHub Actionsによる予想収集・結果収集の異常監視とIssue通知/復旧Close
- 保存予想からのnote原稿生成と公開前監査
- `data/note-publish/latest.json` の自動生成
- `data/note-publish/latest.md` の互換handoff生成
- `data/note-publish/iphone.json` v3の生成
- `iphone.json.canPublish` によるJST当日レース・締切前のfail-closed判定
- `iphone.json` への `freeText` / `paidText` / 初期価格300円の構造化
- note UI transportのタイトル/本文入力、有料切替、300円設定、有料境界設定（最終公開ボタンは未接続）
- PR #939で最終transportの認証をPlaywright保存済み`storageState`方式へ一本化

現在の認証未接続点（iPhoneだけの初回設定を含め未完成）:

- 有効なPlaywright `storageState`を安全に作成・更新し、GitHub Actions Secret `NOTE_STATE_JSON_BASE64`へ登録する接続が未完成。Secretを受け取るコードがあるだけで、iPhoneから初回設定できるとは扱わない。
- 2026-09-13の実行確認ではこのSecretは未設定で、`note_state_missing`としてfail-closedした
- Secret/state本体をリポジトリ、handoff、artifact、Actionsログへ保存しない

その後の未完了:

- 保存済みstateで実サイトeditor到達確認
- 公開しない下書きで300円・有料境界の実サイト確認
- 本番`canPublish === true`レースで公開直前まで確認
- 重複投稿防止と最終公開接続
- 最終transport成立後の旧実験経路・smoke/debug整理

廃止/不採用:

- TinyFishをnoteログイン・投稿経路として使わない。Profile/Vaultを含め再試行しない。
- Browserbaseを現在のnote投稿経路として使わない。停止済みsmoke/live-view/Contextを再有効化しない。
- GitHub-hosted Chromiumで毎回X OAuthする方式を使わない。2026-09-13にheadless/headed(Xvfb)の両方で`note_editor_session_not_ready_note.com`を実サイト確認済み。追加修正・再試行しない。
- `latest.md` が存在することだけを理由にnote-post-mcpを正式transportとみなさない。PR #926は保存済み`note-state.json`を残る接続点として定義したが、state生成・Secret登録までは完成していなかった。

新しいチャットや開発環境では、まず最新main、この文書、`chappy-note-publish` Skill、直近の関連マージPR、`data/note-publish/` の現物を照合する。過去の実験経路から推測で再開しない。

## iPhoneだけでの本人認証と再発防止

- iPhoneの通常ブラウザ、Workのブラウザ、GitHub ActionsのChromiumは別の認証環境。通常ブラウザへのログインを他の環境の認証成功と扱わない。
- ユーザーへPC、開発者ツール、Cookie抽出、`storageState`の手作成を要求しない。初回設定もiPhoneだけで完結することが要件。
- 本人操作を依頼する前に、入力画面が操作可能であることと、そこでの認証を実際の投稿処理が再利用できることを確認する。認証ファイルが未設定というだけで同じ操作を繰り返し依頼しない。
- WorkでのiPhone本人操作と、同一ブラウザの新しいタブでのnote編集画面到達は確認済み。詳細は末尾の確認結果を参照。GitHubへの認証移送と無人実行は未完了。
- 2026-09-13の照合で共有版と個人版のnote公開スキルに差異を確認。関連変更は両方へ反映し、個人版の保存完了まで別に確認する。作業開始時の入口はルート `AGENTS.md`。
- 手順の文章化は補助。投稿可否・実時計でのJST当日判定・締切・停止理由は `validateDraftGate` が実行時に検査し、本文入力と有料設定の直前にも再検査する。CIで締切境界・日付境界・停止理由付きのケースを実行する。

## handoffの役割

`data/note-publish/latest.json` は、保存済みnote原稿から最新の投稿候補を集約する単一handoff。

`data/note-publish/latest.md` はMarkdownを受け取るtransportとの互換用出力。特定のMCPを正式採用したことを意味しない。

`data/note-publish/iphone.json` はスマホ側/最終transportの受け渡し用。v3ではtitle/body/tags/deadlineAt/noteCreateUrlに加え、`freeText`、`paidText`、`price: 300`、投稿可否 `canPublish`、停止理由 `blockReason` を持つ。`canPublish === true` のときだけ本番投稿処理へ進み、falseなら停止する。

## 認証境界

本番transportは `NOTE_STATE_JSON_BASE64` をbase64 decodeしてPlaywright `storageState`として読み込む。stateが未設定、不正JSON、cookie空の場合は停止する。XのID/パスワードをtransportへ渡して毎回OAuthする方式には戻さない。

認証成功の条件は、保存stateを使ったbrowser contextから `https://editor.note.com/new` へ実際に到達し、HTTPSの最終hostが `editor.note.com` で、タイトル欄・本文欄の表示と編集可能状態を確認できること。単にログインhelperが成功を返したことを認証成功扱いしない。

## `canPublish` を混同しない

公開前監査とiPhone handoffでは同じ名前のフィールドが別の責務を持つ。

| フィールド | 意味 |
| --- | --- |
| `article.publishable` / `note.publishable` | 既存の下書き生成条件を満たすか |
| `note.audit.contentReady` | 保存原稿と保存予想の機械検査を通過したか |
| `note.audit.status` | `ready_for_review`、`blocked`、`audit_error` |
| `note.audit.canPublish` | 監査レイヤーでは保存時点の検査を最終公開許可へ昇格させないためfalse |
| `note.audit.automaticPublicationEnabled` | 監査レイヤー単独では自動公開を許可しない |
| `data/note-publish/iphone.json.canPublish` | JST当日レースかつ締切前を確認した、最終transport用の運用ゲート |

`note.audit.canPublish` をtrueに変更してiPhone側へ合わせてはいけない。逆に、古い監査文書の「常にfalse」を理由に `iphone.json.canPublish` を無効化してはいけない。

## 公開前監査の不変条件

`scripts/collect-predictions.js` は選定済みレコードの `note.audit` に監査結果を追加する。既存の `note.publishable` は下書き生成条件であり、最終公開許可ではない。監査失敗時も予想と下書きの保存自体は継続し、監査を `audit_error` として最終投稿を止める。

過去JSON/Markdownを移行・再生成して検査を通したことにしない。保存された予想・原稿・比較用買い目を使う。予想の優先順は 展開 → コース → ST/スリット → 展示/足 → 残し/拾い → 当地/水面 → 技量 → モーター。オッズ未取得を理由に買い目を削除・差し替えない。

監査はレース表示、タイムゾーン付き締切、必要な締切余裕、無料/有料境界マーカー、全文合成、具体的な3連単の無料漏れ、6艇評価、厳選の順序・点数・オッズ、保存予想との整合を確認する。通常予想と参考/万舟台帳を混ぜない。

手動の読み取り検査:

```sh
node scripts/note-publication-audit.js --input audit-payload.json
```

保存bundleをそのまま再検査する場合:

```sh
node scripts/note-publication-audit.js --input data/note-drafts/YYYYMMDD/レースキー-SHA256.json
```

通常の再検査は実時計を使う。過去時点の再現テストだけ `--now` を明示する。保存時の合格判定を現在の公開許可として再利用しない。

## 最終投稿transportのルール

1. 完成済みの予想収集、結果収集、監視、原稿生成、handoffを作り直さない。
2. TinyFish、Browserbase、fresh X OAuthへ戻らない。
3. `NOTE_STATE_JSON_BASE64`はSecretとしてのみ扱い、state/Cookieをリポジトリやログへ出さない。
4. `iphone.json.canPublish === true` を必要条件とし、`blockReason` がある場合は停止する。テストでも本番gateをバイパスしない。
5. title/freeText/paidTextは既存handoffを使い、最終投稿側で予想や買い目を再生成・再解釈しない。
6. 初期価格は300円固定。300〜500円の変動価格は販売が軌道に乗った後の別段階とし、今は混ぜない。
7. 実サイトで公開状態・URL・日時を確認するまでは投稿成功と記録しない。
8. 旧TinyFish/Browserbase/X OAuth等のコード整理は、最終transport成立後に行う。

## 共有Skill

同じSkillを `.agents/skills/` と `.claude/skills/` に置き、`scripts/check-note-skills.js` で一致を確認する。

| Skill | 範囲 |
| --- | --- |
| `chappy-boatrace-dev` | 最新mainを基準に既存機能と未接続部分を区別して開発を継続 |
| `chappy-race-select` | 現行V2選定と保存根拠の確認 |
| `chappy-note-generate` | 保存予想を使った既存原稿生成 |
| `chappy-note-audit` | 公開前の読み取り検査 |
| `chappy-note-publish` | 現在地を固定し、既存handoffから最終transportだけを進める |
| `chappy-note-settle` | 公式結果と保存予想の照合 |

## 検証

```sh
node scripts/test-note-publication-audit.js
node scripts/test-note-draft-bundle.js
node scripts/test-saved-note-draft.js
node scripts/check-note-skills.js
node scripts/test-note-copy-cleanup.js
node scripts/test-note-karatsu-regression.js
node scripts/test-theory-integration.js
node scripts/check-charter.js
```

この文書を更新しても予想ロジック、買い目、UI、収集本体、既存watchdog、handoff生成ロジックは変更しない。

## 2026-09-13 Work本人認証の確認結果

- ユーザーが正規の本人認証画面でGoogleを選択し、その後の本人操作でnoteへログインできた。認証要求の `user_took_over` は失敗と扱わず、本人操作後のnote画面で成功を確認した。
- 同じWorkブラウザの新しいタブから `https://note.com/notes/new` を開き、`editor.note.com` の記事編集画面、記事タイトル欄、本文欄、下書き保存・公開に進むボタンを確認した。本文入力・価格設定・有料境界・公開は未実行。
- Work内の同一ブラウザで認証を再利用できた証拠であり、ブラウザ再作成後の永続性やGitHub Actionsでの無人実行を証明しない。
- 現在公開されているWorkブラウザAPI/機能にはstorageState/Cookieの安全な書き出し・GitHub Secretへの移送機能がない。GitHub接続ツールにもSecret登録機能はない。この経路は本人認証の再試行で解消しない。未公開API、ブラウザ内部ファイル、Cookieの画面出力で迂回しない。
- 再開時は既存Workブラウザのログイン済み画面を先に確認し、認証が失われた証拠がない限り再ログインを依頼しない。GitHub向けの初回登録を進めるには、iPhoneから本人操作でき、認証を無人実行側へ安全に渡す正式機能のある実行環境が必要。採用済みと扱わず、既存の不採用経路へ戻らない。


