/* =========================================================
  チャッピーボートレースAI
  note-generator.js v1.0.0

  役割：
  - prediction.js の予想結果を note 投稿用テキストへ変換
  - タイトル・無料部分・有料部分・タグを生成
  - 予想ロジックと既存画面は変更しない

  公開：
  - window.ChappyNoteGenerator.generateArticle(prediction, options)
========================================================= */

(function (root) {
  "use strict";

  const VERSION = "note-generator-v1.0.0";
  const PAYWALL_MARKER = "──────── ここから先は有料部分です ────────";

  function arrayify(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === "") return [];
    return [value];
  }

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value).trim() || fallback;
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function userFacingFormationText(value) {
    return safeText(value, "")
      .replace(/流し候補/g, "フォーメーション候補")
      .replace(/流し展開/g, "フォーメーション")
      .replace(/流し/g, "フォーメーション");
  }

  function practicalDisplayCategory(
    row,
    fallback = "買い目"
  ) {
    if (row?.selectionTier === "順位ゲート置換") {
      return "順位ゲート補完";
    }
    if (row?.selectionTier === "候補補完") {
      return "候補補完";
    }
    if (row?.selectionTier === "展開追加") {
      return "独立展開";
    }
    if (
      [
        "順位ゲート補完",
        "候補補完",
        "独立展開"
      ].includes(row?.category)
    ) {
      return row.category;
    }
    if (row?.category === "流し") {
      return "フォーメーション";
    }

    return userFacingFormationText(
      row?.displayCategory ||
      row?.category ||
      arrayify(row?.categories)[0] ||
      row?.type ||
      fallback
    );
  }

  function firstValue(values, fallback = "") {
    for (const value of values) {
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return fallback;
  }

  function uniqueText(values) {
    return [...new Set(arrayify(values).map(value => safeText(value, "")).filter(Boolean))];
  }

  function formatDeadlineLabel(value) {
    const deadline = safeText(value, "締切時刻未取得");
    return /^締切/.test(deadline)
      ? deadline
      : `締切 ${deadline}`;
  }

  function compactTicketComment(value) {
    const text =
      userFacingFormationText(value);
    if (!text) return "";

    const sentences =
      text.match(/[^。！？]+[。！？]?/g) ||
      [text];
    const seen = new Set();

    return sentences
      .map(sentence => sentence.trim())
      .filter(Boolean)
      .filter(sentence => {
        const semanticKey = sentence
          .replace(/\s+/g, "")
          .replace(/([1-6])号艇が2着へ追走・残し/g, "$1号艇が2着に残り")
          .replace(/([1-6])号艇が3着で展開を拾う筋/g, "$1号艇が3着に残る筋")
          .replace(/([1-6])号艇が3着で拾う筋/g, "$1号艇が3着に残る筋")
          .replace(/([1-6])号艇が3着で残る筋/g, "$1号艇が3着に残る筋");

        if (seen.has(semanticKey)) {
          return false;
        }
        seen.add(semanticKey);
        return true;
      })
      .join(" ");
  }

  function formatDate(value) {
    const text = safeText(value, "").replace(/[^0-9]/g, "");
    if (text.length !== 8) return safeText(value, "日付未取得");
    return `${Number(text.slice(4, 6))}月${Number(text.slice(6, 8))}日`;
  }

  function getRaceMeta(prediction) {
    const race = prediction?.race || {};
    const raceInfo = race.raceInfo || {};
    const venue = prediction?.venue || {};

    return {
      date: firstValue([race.date, prediction?.date], ""),
      place: safeText(
        firstValue([
          race.stadiumName,
          race.place,
          venue.name,
          prediction?.venueName
        ]),
        "開催場未取得"
      ),
      raceNo: safeNumber(firstValue([race.raceNo, race.rno, prediction?.raceNo]), 0),
      deadline: safeText(
        firstValue([
          raceInfo.deadline,
          raceInfo.deadlineTime,
          raceInfo.closeTime,
          race.deadline,
          prediction?.deadline
        ]),
        "締切時刻未取得"
      )
    };
  }

  function getScore(value) {
    if (value && typeof value === "object") {
      return Math.round(safeNumber(firstValue([value.score, value.value]), 0));
    }
    return Math.round(safeNumber(value, 0));
  }

  function normalizeTicket(item, fallbackCategory = "買い目") {
    const row = typeof item === "string" ? { ticket: item } : item || {};
    const ticket = safeText(firstValue([row.ticket, row.line, row.formation]), "");
    const odds = safeNumber(row.odds, 0);
    const amount = safeNumber(row.recommendedAmount, 0);

    return {
      ticket,
      category: practicalDisplayCategory(
        row,
        fallbackCategory
      ),
      scenarioType: safeText(
        userFacingFormationText(
          firstValue([
            row.scenarioType,
            arrayify(row.scenarioTypes)[0]
          ])
        ),
        ""
      ),
      odds,
      amount,
      comment: userFacingFormationText(
        firstValue([row.scenarioSummary, row.comment, row.reason])
      ),
      selectionTier: safeText(row.selectionTier, ""),
      expansionReason: safeText(row.expansionReason, ""),
      roleLabels:
        arrayify(row.roleLabels)
          .map(role => ({
            boatNo:
              safeNumber(
                role?.boatNo,
                0
              ),
            position:
              safeNumber(
                role?.position,
                0
              ),
            label:
              safeText(
                role?.label,
                ""
              )
          }))
          .filter(
            role =>
              role.boatNo &&
              role.label
          )
    };
  }

  function ticketLists(prediction) {
    return {
      main: arrayify(prediction?.mainSheet?.tickets || prediction?.ticketSheets?.main),
      cover: arrayify(prediction?.mainSheet?.coverTickets || prediction?.ticketSheets?.cover),
      flow: arrayify(prediction?.mainSheet?.flowTickets || prediction?.ticketSheets?.flow),
      hole: arrayify(prediction?.manshuSheet?.tickets || prediction?.ticketSheets?.hole)
    };
  }

  function createPracticalSelection(prediction) {
    const selector = root.ChappyPracticalSelection;

    if (!selector || typeof selector.createPracticalSelection !== "function") {
      return [];
    }

    return selector.createPracticalSelection(prediction);
  }

  function createDisplayCandidates(
    prediction,
    practical = []
  ) {
    const lists =
      ticketLists(prediction);

    const mainScore =
      getScore(
        prediction?.confidence ||
        prediction?.finalAi?.confidence
      );

    const waveScore =
      getScore(
        prediction?.manshuPower ||
        prediction?.finalAi?.manshuPower
      );

    const isWave =
      waveScore > mainScore;

    const practicalDisplayByTicket =
      new Map(
        arrayify(practical)
          .map(item => {
            const row =
              normalizeTicket(
                item,
                ""
              );
            const displayCategory =
              practicalDisplayCategory(
                item,
                ""
              );

            return [
              row.ticket,
              displayCategory
            ];
          })
          .filter(
            ([ticket, category]) =>
              ticket && category
          )
      );

    const sources =
      isWave
        ? [{ list: lists.hole }]
        : [
            { list: lists.main },
            { list: lists.cover },
            {
              list: lists.flow,
              displayCategory:
                "フォーメーション候補"
            }
          ];

    const candidates = [];
    const used = new Set();

    sources.forEach(source => {
      arrayify(source.list).forEach(
        item => {
          const row =
            normalizeTicket(
              item,
              "AI候補"
            );

          if (
            !row.ticket ||
            used.has(row.ticket)
          ) {
            return;
          }

          const practicalCategory =
            practicalDisplayByTicket
              .get(row.ticket);
          row.category =
            userFacingFormationText(
              practicalCategory
            ) ||
            source.displayCategory ||
            row.category;

          used.add(row.ticket);
          candidates.push(row);
        }
      );
    });

    return candidates.slice(
      0,
      24
    );
  }

  function boatRole(boatNo, position) {
    const no = safeNumber(boatNo, 0);
    const roles = {
      1: position === "first" ? "イン逃げ" : "イン残し",
      2: "2コース差し・残し",
      3: "3コース攻め",
      4: "カド攻め・展開突き",
      5: "まくり差し・展開拾い",
      6: "最内差し・道中拾い"
    };
    return roles[no] || "展開対応";
  }

  function ticketComment(ticket, category) {
    const boats = safeText(ticket, "").split("-").map(Number).filter(Boolean);

    if (boats.length !== 3) {
      return `${category}として展開から選んだ買い目。`;
    }

    return `${boats[0]}号艇の${boatRole(boats[0], "first")}を頭に、` +
      `${boats[1]}号艇の${boatRole(boats[1], "second")}と` +
      `${boats[2]}号艇の${boatRole(boats[2], "third")}を組み合わせる${category}。`;
  }

        function formatTicketLine(
    item
  ) {
    const oddsText =
      item.odds > 0
        ? `${item.odds}倍`
        : "オッズ未取得";

    const tier =
      item.selectionTier === "展開追加"
        ? "［展開追加］"
        : "";
    const displayCategory =
      practicalDisplayCategory(
        item,
        ""
      );
    const category =
      displayCategory
        ? `［${displayCategory}］`
        : "";
    const roles =
      arrayify(item.roleLabels)
        .map(role =>
          `${role.boatNo}号艇${role.label}`
        )
        .filter(Boolean)
        .join("・");
    const comment =
      compactTicketComment(
        item.comment ||
        ticketComment(
          item.ticket,
          displayCategory || "買い目"
        )
      );

    return (
      `・${item.ticket}　` +
      `${category}${tier}　${oddsText}` +
      (
        roles
          ? `\n　役割：${roles}`
          : ""
      ) +
      (
        comment
          ? `\n　${comment}`
          : ""
      )
    );
  }

  function boatLabel(item) {
    if (!item) return "該当艇なし";

    const no = safeNumber(item.boatNo, 0);
    const name = safeText(
      firstValue([item.name, item.racerName]),
      "選手名未取得"
    );

    return `${no || "-"}号艇 ${name}`;
  }

  function classifyRace(prediction, options) {
    if (options?.selectionType) {
      return safeText(options.selectionType);
    }

    const mainScore = getScore(
      prediction?.confidence ||
      prediction?.finalAi?.confidence
    );

    const manshuScore = getScore(
      prediction?.manshuPower ||
      prediction?.finalAi?.manshuPower
    );

    return manshuScore > mainScore
      ? "🌸 万舟狙い"
      : "🔵 本命狙い";
  }

  function buildTitle(prediction, options = {}) {
    const meta = getRaceMeta(prediction);
    const flowTitle = safeText(
      prediction?.raceFlow?.title,
      "展開注目"
    );

    const prefix = options.titlePrefix
      ? `${safeText(options.titlePrefix, "")} `
      : "";

    return `${prefix}【${formatDate(meta.date)} ${meta.place}${meta.raceNo || "-"}R】${flowTitle}｜チャッピーボートレースAI厳選予想`;
  }
  function buildOfficialHistorySection(
    prediction
  ) {
    const history =
      prediction?.officialHistory || null;

    if (!history?.ready) {
      return "";
    }

    const venue =
      history.venue || null;

    if (!venue) {
      return "";
    }

    const methods =
      arrayify(
        venue.winningMethods
      );

    const getMethodRate = key => {
      const item =
        methods.find(
          row =>
            safeText(
              row?.key,
              ""
            ) === key
        );

      const rate =
        Number(item?.rate);

      return Number.isFinite(rate)
        ? `${rate.toFixed(1)}%`
        : "-";
    };

    const samples =
      safeNumber(
        venue.samples,
        0
      );

    const manshuRate =
      Number(
        venue?.payoutBands
          ?.over10000?.rate
      );

    const averageWinningSt =
      Number(
        venue.averageWinningSt
      );

    const statusText =
      venue.usable
        ? "十分なサンプルあり・参考補正対象"
        : "サンプル不足・参考表示のみ";

    return [
      "【公式履歴分析】",

      `${safeText(
        venue.place,
        "開催場"
      )}公式結果 ${samples}レース集計`,

      `逃げ ${getMethodRate(
        "逃げ"
      )}｜差し ${getMethodRate(
        "差し"
      )}｜まくり ${getMethodRate(
        "まくり"
      )}｜まくり差し ${getMethodRate(
        "まくり差し"
      )}`,

      `万舟率 ${
        Number.isFinite(manshuRate)
          ? `${manshuRate.toFixed(1)}%`
          : "-"
      }｜勝ち艇平均ST ${
        Number.isFinite(
          averageWinningSt
        )
          ? averageWinningSt.toFixed(3)
          : "-"
      }`,

      `※${statusText}。展開・コースを優先し、履歴数字だけで買い目を変更しません。`
    ].join("\n");
  }
      function buildFreeSection(
    prediction,
    options = {}
  ) {
    const meta =
      getRaceMeta(prediction);

    const weather =
      prediction?.weather || {};

    const venue =
      prediction?.venue || {};

    const flow =
      prediction?.raceFlow || {};

    const main =
      prediction?.mainSheet || {};

    const manshuSheet =
      prediction?.manshuSheet || {};

    const mainScore =
      getScore(
        prediction?.confidence ||
        prediction?.finalAi?.confidence
      );

    const waveScore =
      getScore(
        prediction?.manshuPower ||
        prediction?.finalAi?.manshuPower
      );

    const rawSelectionType =
      classifyRace(
        prediction,
        options
      );

    const isWave =
      /万舟|波乱/.test(
        rawSelectionType
      );

    const selectionType =
      isWave
        ? "🌸 波乱狙い"
        : "🔵 本命狙い";

    const scoreLabel =
      isWave
        ? "波乱度"
        : "本線信頼度";

    const displayedScore =
      isWave
        ? waveScore
        : mainScore;

    const focusBoat =
      isWave
        ? arrayify(
            manshuSheet.candidates
          )[0]
        : main.honmei;

    const focusEvaluation =
      arrayify(
        main.evaluations
      ).find(
        item =>
          Number(item?.boatNo) ===
          Number(focusBoat?.boatNo)
      ) || focusBoat;

    const className =
      safeText(
        focusEvaluation?.className,
        ""
      );

    const skillSignals =
      uniqueText([
        ...arrayify(
          focusEvaluation?.buffs
        ),
        ...arrayify(
          focusBoat?.buffs
        )
      ])
        .filter(text =>
          /全国実績|当地実績|地元|級別|選手技量|平均ST/.test(
            text
          )
        )
        .slice(0, 3);

    const abilitySignals =
      uniqueText([
        /^[AB][12]$/.test(
          className
        )
          ? `${className}級`
          : "",
        ...skillSignals
      ]);

    const abilityReason =
      focusBoat
        ? abilitySignals.length
          ? `${boatLabel(
              focusEvaluation
            )}は${abilitySignals.join(
              "・"
            )}を評価。`
          : `${boatLabel(
              focusEvaluation
            )}は選手技量の明確な加点材料が未取得。`
        : "選手技量データ未取得。";

    const empathy =
      isWave
        ? "人気どおりでは決まりにくい一戦を狙いたい方へ。"
        : "買い目を広げすぎず、軸を決めて勝負したい方へ。";

    const conclusion =
      safeText(
        flow.summary,
        isWave
          ? safeText(
              manshuSheet.reason,
              "波乱展開を評価。"
            )
          : safeText(
              main.reason,
              "中心展開を評価。"
            )
      );

    return [
      `🚤 ${formatDate(
        meta.date
      )} ${meta.place}${meta.raceNo || "-"}R｜${formatDeadlineLabel(
        meta.deadline
      )}`,
      empathy,
      "",
      `${selectionType}｜${scoreLabel} ${displayedScore}点`,
      "※点数はAI評価であり、的中確率ではありません。",
      "",
      "【結論】",
          isWave
        ? conclusion
        : `${boatLabel(
            main.honmei
          )}を軸に、${conclusion}`,
      "",
      "【根拠】",
      abilityReason,
            "評価順　展開→コース→ST・スリット→展示・足→残し・拾い→当地・水面→選手技量→モーター",
      "",
      "【水面】",
      `${safeText(
        venue.water,
        "未取得"
      )}｜風${safeText(
        weather.windDirection,
        "-"
      )}${weather.windSpeed ?? "-"}m｜波${weather.waveHeight ?? "-"}cm`,
      "",

      buildOfficialHistorySection(
        prediction
      ),

      "",
      "ここから先で、6艇評価・AI優先候補・実戦厳選（基本5〜7点、成立展開時最大10点）を公開します。"
    ].join("\n");
  }

    function buildBoatAnalysis(
    prediction
  ) {
    const rows =
      arrayify(
        prediction
          ?.mainSheet
          ?.evaluations
      );

    if (!rows.length) {
      return "艇別評価データはありません。";
    }

    return rows
      .map(item => {
        const buffs =
          uniqueText(
            item.buffs
          )
            .slice(0, 2)
            .join("・") ||
          "補正なし";

        const debuffs =
          uniqueText(
            item.debuffs
          )
            .slice(0, 1)
            .join("・");

        const comment =
          safeText(
            firstValue([
              item.shortComment,
              item.comment,
              item.role
            ]),
            "総合評価"
          );

        const caution =
          debuffs
            ? `｜注意：${debuffs}`
            : "";

        return (
          `${boatLabel(item)}　` +
          `${Math.round(
            safeNumber(
              item.score,
              0
            )
          )}点｜` +
          `${buffs}` +
          `${caution}｜` +
          `${comment}`
        );
      })
      .join("\n");
  }

  function buildTicketGroup(
    title,
    list,
    category
  ) {
    const rows = arrayify(list)
      .map(item =>
        normalizeTicket(
          item,
          category
        )
      )
      .filter(item => item.ticket);

    if (!rows.length) {
      return `${title}\n該当買い目なし`;
    }

    return `${title}\n${rows
      .map(item =>
        formatTicketLine({
          ...item,
          category
        })
      )
      .join("\n")}`;
  }

    function buildPaidSection(
    prediction
  ) {
    const main =
      prediction?.mainSheet || {};

    const manshu =
      prediction?.manshuSheet || {};

    const practical =
      createPracticalSelection(
        prediction
      );

    const candidates =
      createDisplayCandidates(
        prediction,
        practical
      );

    const mainScore =
      getScore(
        prediction?.confidence ||
        prediction?.finalAi?.confidence
      );

    const waveScore =
      getScore(
        prediction?.manshuPower ||
        prediction?.finalAi?.manshuPower
      );

    const isWave =
      waveScore > mainScore;

    const waveAxis =
      arrayify(
        manshu.candidates
      )[0];

    const waveHold =
      arrayify(
        manshu.holdBoats
      )[0];

    const wavePickup =
      arrayify(
        manshu.pickupBoats
      )[0];

    const marks =
      isWave
        ? (
            `波乱軸 ${boatLabel(
              waveAxis
            )}｜` +
            `残し ${boatLabel(
              waveHold
            )}｜` +
            `拾い ${boatLabel(
              wavePickup
            )}`
          )
        : (
            `◎ ${boatLabel(
              main.honmei
            )}｜` +
            `○ ${boatLabel(
              main.taikou
            )}｜` +
            `▲ ${boatLabel(
              main.ana
            )}｜` +
            `△ ${boatLabel(
              main.osae
            )}`
          );

    return [
      isWave
        ? "🌸 波乱予想"
        : "🔵 本命予想",
      "",
      marks,
      isWave
        ? safeText(
            manshu.reason,
            "波乱展開を評価。"
          )
        : "",
      isWave ? "" : null,
      "【6艇評価】",
      buildBoatAnalysis(
        prediction
      ),
      "",
      "【AI買い目候補・優先順／最大24点】",
      candidates.length
        ? candidates
            .map(
              formatTicketLine
            )
            .join("\n")
        : "候補買い目なし",
      "",
      "🔥 実戦厳選買い目",
      practical.length
        ? practical
            .map(
              formatTicketLine
            )
            .join("\n")
        : "主軸となる展開が定まらないため見送り。",
      "",
      `厳選買い目　${practical.length}点／最大10点`
    ]
      .filter(
        value =>
          value !== null
      )
      .join("\n");
  }

  function buildTags(
    prediction,
    options = {}
  ) {
    const meta =
      getRaceMeta(prediction);

    const baseTags = [
      "ボートレース",
      "競艇予想",
      "ボートレース予想",
      "AI予想",
      meta.place,
      "チャッピーボートレースAI"
    ];

    return uniqueText([
      ...baseTags,
      ...arrayify(options.tags)
    ]).map(tag =>
      `#${tag.replace(/^#/, "")}`
    );
  }

    function generateArticle(prediction, options = {}) {
    if (
      !prediction ||
      typeof prediction !== "object"
    ) {
      return {
        ok: false,
        version: VERSION,
        error: "予想データがありません。"
      };
    }

    const rejectionReasons = [];
    const main =
      prediction?.mainSheet || {};
    const flow =
      prediction?.raceFlow || {};
    const lists =
      ticketLists(prediction);

    const practicalTickets =
      createPracticalSelection(
        prediction
      );

    const honmeiNo =
      safeNumber(
        main?.honmei?.boatNo,
        0
      );

    const honmeiEvaluation =
      arrayify(
        main?.evaluations
      ).find(
        item =>
          safeNumber(
            item?.boatNo,
            0
          ) === honmeiNo
      ) ||
      main?.honmei ||
      null;

    const honmeiCourse =
      safeNumber(
        firstValue([
          honmeiEvaluation?.course,
          main?.honmei?.course,
          honmeiNo
        ]),
        0
      );

    const honmeiScore =
      safeNumber(
        honmeiEvaluation?.score,
        0
      );

    const flowTitle =
      safeText(
        flow?.title,
        ""
      );

    const flowSummary =
      safeText(
        flow?.summary,
        ""
      );

    let requiredMainCourse = 0;

    if (
      /イン逃げ本線/.test(
        flowTitle
      )
    ) {
      requiredMainCourse = 1;
    } else {
      const courseMatch =
        flowTitle.match(
          /([1-6])コース[^。]*本線/
        );

      requiredMainCourse =
        courseMatch
          ? Number(courseMatch[1])
          : 0;
    }

    if (!honmeiNo) {
      rejectionReasons.push(
        "◎本命艇を取得できません"
      );
    }

    if (
      requiredMainCourse &&
      honmeiCourse !==
        requiredMainCourse
    ) {
      rejectionReasons.push(
        `中心展開は${requiredMainCourse}コース本線ですが、◎は${honmeiNo || "-"}号艇です`
      );
    }

    if (
      honmeiNo &&
      honmeiScore < 72
    ) {
      rejectionReasons.push(
        `◎${honmeiNo}号艇の艇評価が${Math.round(
          honmeiScore
        )}点で、頭候補の基準を満たしていません`
      );
    }

    const honmeiComment =
      safeText(
        firstValue([
          honmeiEvaluation
            ?.shortComment,
          honmeiEvaluation
            ?.comment
        ]),
        ""
      );

    if (
      honmeiNo &&
      /相手・3着|押さえ候補|展開待ち|厚くは買わない|厳しい条件/.test(
        honmeiComment
      )
    ) {
      rejectionReasons.push(
        `◎${honmeiNo}号艇の艇評価が「頭候補」ではありません`
      );
    }

    const mainTickets =
      arrayify(
        lists.main
      )
        .map(item =>
          normalizeTicket(
            item,
            "本線"
          )
        )
        .filter(
          item => item.ticket
        );

    if (!mainTickets.length) {
      rejectionReasons.push(
        "本線買い目を生成できません"
      );
    } else if (
      honmeiNo &&
      mainTickets.some(
        item =>
          Number(
            item.ticket
              .split("-")[0]
          ) !== honmeiNo
      )
    ) {
      rejectionReasons.push(
        "本線買い目の1着軸が◎本命艇と一致していません"
      );
    }
    
    function boatsBeforeRole(
      text,
      role
    ) {
      const boats = [];
      let searchFrom = 0;

      while (
        searchFrom <
        text.length
      ) {
        const roleIndex =
          text.indexOf(
            role,
            searchFrom
          );

        if (roleIndex < 0) {
          break;
        }

        const prefix =
          text.slice(
            0,
            roleIndex
          );

        const matches = [
          ...prefix.matchAll(
            /([1-6])号艇/g
          )
        ];

        const nearest =
          matches[
            matches.length - 1
          ];

        if (nearest) {
          boats.push(
            Number(nearest[1])
          );
        }

        searchFrom =
          roleIndex +
          role.length;
      }

      return uniqueText(
        boats
      ).map(Number);
    }

    function contradictoryRoleBoats(
      text
    ) {
      const sentences =
        safeText(text, "")
          .split(/[。！？\n]+/)
          .map(sentence =>
            sentence.trim()
          )
          .filter(Boolean);

      return uniqueText(
        sentences.flatMap(sentence => {
          const holdBoats =
            boatsBeforeRole(
              sentence,
              "残し"
            );
          const pickupBoats =
            boatsBeforeRole(
              sentence,
              "拾い"
            );

          return holdBoats.filter(
            boatNo =>
              pickupBoats.includes(
                boatNo
              )
          );
        })
      ).map(Number);
    }

    const contradictoryRoles =
      contradictoryRoleBoats(
        flowSummary
      );

    if (
      contradictoryRoles.length
    ) {
      rejectionReasons.push(
        `${contradictoryRoles.join(
          "・"
        )}号艇が同一展開内で「残し」と「拾い」に重複しています`
      );
    }

    if (
      prediction
        ?.dataQuality
        ?.boatIdentity
        ?.valid === false
    ) {
      const identityReason =
        root.ChappyBoatIdentity
          ?.reasonText(
            prediction
              .dataQuality
              .boatIdentity
          ) ||
        "1〜6号艇を一意に確認できません";
      rejectionReasons.push(
        `艇番不整合：${identityReason}`
      );
    }

    if (
      String(
        prediction
          ?.dataQuality
          ?.level || ""
      ) === "低"
    ) {
      rejectionReasons.push(
        "予想データの品質判定が低です"
      );
    }

    if (
      !practicalTickets.length
    ) {
      rejectionReasons.push(
        "実戦厳選買い目を生成できません"
      );
    }

    if (
      rejectionReasons.length
    ) {
      return {
        ok: false,
        publishable: false,
        version: VERSION,
        error:
          `販売見送り：` +
          uniqueText(
            rejectionReasons
          ).join("／"),
        rejectionReasons:
          uniqueText(
            rejectionReasons
          )
      };
    }

    const title =
      buildTitle(
        prediction,
        options
      );

    const freeText =
      buildFreeSection(
        prediction,
        options
      );

    const paidText =
      buildPaidSection(
        prediction
      );

    const tags =
      buildTags(
        prediction,
        options
      );

    const notice =
      options.notice === false
        ? ""
        : "※舟券の購入は自己責任で、無理のない範囲でお楽しみください。";

    const fullText = [
      freeText,
      PAYWALL_MARKER,
      paidText,
      notice,
      tags.join(" ")
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      ok: true,
      publishable: true,
      version: VERSION,
      title,
      freeText,
      paidText,
      paywallMarker:
        PAYWALL_MARKER,
      fullText,
      tags,
      practicalTickets,
      meta:
        getRaceMeta(
          prediction
        )
    };
  }

  const api = {
    VERSION,
    PAYWALL_MARKER,
    generateArticle,
    buildTitle,
    buildFreeSection,
    buildPaidSection,
    buildTags,
    createPracticalSelection,
    formatDeadlineLabel,
    compactTicketComment
  };

  root.ChappyNoteGenerator =
    api;

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = api;
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis
);
