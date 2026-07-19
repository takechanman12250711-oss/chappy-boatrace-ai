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

  function firstValue(values, fallback = "") {
    for (const value of values) {
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return fallback;
  }

  function uniqueText(values) {
    return [...new Set(arrayify(values).map(value => safeText(value, "")).filter(Boolean))];
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
      category: safeText(
        firstValue([row.category, arrayify(row.categories)[0], row.type]),
        fallbackCategory
      ),
      scenarioType: safeText(
        firstValue([row.scenarioType, arrayify(row.scenarioTypes)[0]]),
        ""
      ),
      odds,
      amount,
      comment: safeText(
        firstValue([row.scenarioSummary, row.comment, row.reason]),
        ""
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
    const lists =
      ticketLists(prediction);

    const selected = [];
    const used = new Set();

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

    function add(
      list,
      limit,
      category
    ) {
      let added = 0;

      arrayify(list).forEach(
        item => {
          if (
            added >= limit ||
            selected.length >= 7
          ) {
            return;
          }

          const row =
            normalizeTicket(
              item,
              category
            );

          if (
            !row.ticket ||
            used.has(row.ticket)
          ) {
            return;
          }

          used.add(row.ticket);

          selected.push({
            ...row,
            category
          });

          added += 1;
        }
      );
    }

    if (isWave) {
      add(
        lists.hole,
        7,
        "波乱候補"
      );
    } else {
      add(
        lists.main,
        3,
        "中心候補"
      );

      add(
        lists.cover,
        2,
        "展開対応"
      );

      add(
        lists.flow,
        2,
        "相手拡張"
      );

      if (
        selected.length < 7
      ) {
        add(
          lists.main,
          7,
          "中心候補"
        );

        add(
          lists.cover,
          7,
          "展開対応"
        );

        add(
          lists.flow,
          7,
          "相手拡張"
        );
      }
    }

    return selected
      .slice(0, 7)
      .map(item => ({
        ...item,
        amount: 0
      }));
  }

  function createDisplayCandidates(
    prediction
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

    const sources =
      isWave
        ? [lists.hole]
        : [
            lists.main,
            lists.cover,
            lists.flow
          ];

    const candidates = [];
    const used = new Set();

    sources.forEach(list => {
      arrayify(list).forEach(
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

    return (
      `・${item.ticket}　` +
      oddsText
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
      )} ${meta.place}${meta.raceNo || "-"}R｜締切${meta.deadline}`,
      empathy,
      "",
      `${selectionType}｜${scoreLabel} ${displayedScore}点`,
      "※点数はAI評価であり、的中確率ではありません。",
      "",
      "【結論】",
      `${safeText(
        flow.title,
        "展開注目"
      )}。${conclusion}`,
      "",
      "【根拠】",
      abilityReason,
      "評価順　展開→コース→ST→展示→残し・拾い→水面→選手技量→モーター",
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
      "ここから先で、6艇評価・AI優先候補・厳選7点を公開します。"
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

  function buildPaidSection(prediction) {
    const main =
      prediction?.mainSheet || {};

    const manshu =
      prediction?.manshuSheet || {};

    const lists =
      ticketLists(prediction);

    const practical =
      createPracticalSelection(prediction);

    const budget =
      practical.reduce(
        (sum, item) =>
          sum +
          safeNumber(
            item.amount,
            0
          ),
        0
      );

    const finalComment = safeText(
      firstValue([
        prediction?.finalComment?.comment,
        prediction?.finalComment?.title,
        prediction?.finalComment?.memo,
        typeof prediction?.finalComment === "string"
          ? prediction.finalComment
          : "",
        prediction?.finalAi?.summary
      ]),
      "展開とコースを中心に、買い目ごとの役割を確認してください。"
    );

    return [
      "🔵 本命予想",
      "",
      `◎ ${boatLabel(main.honmei)}`,
      `○ ${boatLabel(main.taikou)}`,
      `▲ ${boatLabel(main.ana)}`,
      `△ ${boatLabel(main.osae)}`,
      "",
      "【6艇評価】",
      buildBoatAnalysis(prediction),
      "",
      buildTicketGroup(
        "【本線】",
        lists.main,
        "本線"
      ),
      "",
      buildTicketGroup(
        "【押さえ】",
        lists.cover,
        "押さえ"
      ),
      "",
      buildTicketGroup(
        "【流し】",
        lists.flow,
        "流し"
      ),
      "",
      "🌸 万舟・高配当予想",
      "",
      safeText(
        manshu.reason,
        "穴展開・高配当候補を展開から評価。"
      ),
      "",
      buildTicketGroup(
        "【万舟・高配当候補】",
        lists.hole,
        "万舟・穴"
      ),
      "",
      "🔥 実戦厳選買い目",
      "",
      practical.length
        ? practical
            .map(item =>
              formatTicketLine(
                item,
                true
              )
            )
            .join("\n")
        : "主軸となる展開が定まらないため見送り。",
      "",
      `実戦購入候補　${practical.length}点／最大7点`,
      budget > 0
        ? `購入予算　${budget.toLocaleString("ja-JP")}円`
        : "購入予算　資金配分後に表示",
      "",
      "【最終コメント】",
      finalComment
    ].join("\n");
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

    const holdBoats =
      boatsBeforeRole(
        flowSummary,
        "残し"
      );

    const pickupBoats =
      boatsBeforeRole(
        flowSummary,
        "拾い"
      );

    const duplicatedRoles =
      holdBoats.filter(
        boatNo =>
          pickupBoats.includes(
            boatNo
          )
      );

    if (
      duplicatedRoles.length
    ) {
      rejectionReasons.push(
        `${duplicatedRoles.join(
          "・"
        )}号艇が「残し」と「拾い」に重複しています`
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
    createPracticalSelection
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