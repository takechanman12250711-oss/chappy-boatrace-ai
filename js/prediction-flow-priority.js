// チャッピーボートレースAI
// 既存予想の展開情報を整理し、中心展開・残し・拾いを明確にする。
// 印・買い目・既存スコアは変更しない。
(function () {
  "use strict";

  if (window.__CHAPPY_FLOW_PRIORITY_INSTALLED__) return;
  window.__CHAPPY_FLOW_PRIORITY_INSTALLED__ = true;

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function boatNo(item) {
    if (typeof item === "number" || typeof item === "string") {
      const direct = num(item, 0);
      return direct >= 1 && direct <= 6 ? direct : 0;
    }
    for (const value of [
      item?.boat,
      item?.waku,
      item?.frame,
      item?.boatNo,
      item?.number,
      item?.course
    ]) {
      const candidate = num(value, 0);
      if (candidate >= 1 && candidate <= 6) return candidate;
    }
    return 0;
  }

  function courseMappingOf(prediction, data) {
    const core = window.ChappyAICore;
    const source =
      data ||
      prediction?.preRaceConditions ||
      prediction?.race?.raw ||
      prediction?.race ||
      prediction;

    if (
      typeof core?.getRaceEntries === "function" &&
      typeof core?.buildOfficialCourseMapping === "function"
    ) {
      const entries = core
        .getRaceEntries(source)
        .map((entry, index) => ({
          ...entry,
          boat: boatNo(entry) || index + 1
        }));
      return core.buildOfficialCourseMapping(entries);
    }

    return {
      formal: false,
      boatAtCourse(course) {
        return num(course, 0) || null;
      },
      courseOfBoat(targetBoatNo) {
        return num(targetBoatNo, 0) || null;
      }
    };
  }

  function getBoat(prediction, no) {
    const pools = [
      prediction?.boats,
      prediction?.entries,
      prediction?.race?.boats,
      prediction?.race?.entries,
      prediction?.ranking
    ];
    for (const pool of pools) {
      if (!Array.isArray(pool)) continue;
      const found = pool.find(item => boatNo(item) === no);
      if (found) return found;
    }
    return null;
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function build(prediction, data) {
    const mainSheet = prediction?.mainSheet || {};
    const honmei = mainSheet.honmei || prediction?.honmei || null;
    const attackBoat =
      prediction?.raceFlow?.attackBoats?.[0] ||
      prediction?.raceFlow?.attackBoat ||
      prediction?.raceFlow?.attacker ||
      prediction?.attackBoat ||
      honmei ||
      null;

    const courseMapping = courseMappingOf(prediction, data);
    const attackNo = boatNo(attackBoat) || boatNo(honmei) || 1;
    const mappedAttackCourse = num(
      courseMapping.courseOfBoat(attackNo),
      0
    );
    const attackCourse =
      courseMapping.formal === true
        ? mappedAttackCourse || attackNo
        : num(attackBoat?.course, 0) || mappedAttackCourse || attackNo;
    const boatAtCourse = course =>
      num(courseMapping.boatAtCourse(course), course);
    const oneNo = boatAtCourse(1);
    const twoNo = boatAtCourse(2);
    const threeNo = boatAtCourse(3);
    const fourNo = boatAtCourse(4);
    const fiveNo = boatAtCourse(5);
    const sixNo = boatAtCourse(6);
    const nonIdentityCourse =
      courseMapping.formal === true &&
      [oneNo, twoNo, threeNo, fourNo, fiveNo, sixNo]
        .some((targetBoatNo, index) => targetBoatNo !== index + 1);
    const boat1 = getBoat(prediction, oneNo);
    const boat2 = getBoat(prediction, twoNo);
    const boat3 = getBoat(prediction, threeNo);
    const boat4 = getBoat(prediction, fourNo);

    let type = "inside";
    let title = "イン先マイ中心";
    let mainComment = nonIdentityCourse
      ? `${oneNo}号艇のイン先マイを軸に、内側の残しを重視する。`
      : "1号艇の先マイを軸に、内側の残しを重視する。";
    const remains = [];
    const pickups = [];
    const notes = [];

    if (attackCourse === 2) {
      type = "course2-sashi";
      title = "2コース差し中心";
      mainComment = nonIdentityCourse
        ? `${attackNo}号艇の2コース差しを中心に、${oneNo}号艇のイン残りを相手本線として評価する。`
        : "2号艇の差しを中心に、1号艇の残しを相手本線として評価する。";
      remains.push(nonIdentityCourse ? `${oneNo}号艇の逃げ残り` : "1号艇の逃げ残り");
      pickups.push(nonIdentityCourse ? `${threeNo}号艇の内残り` : "3号艇の内残り");
    } else if (attackCourse === 3) {
      type = "course3-attack";
      title = "3コース攻め中心";
      mainComment = nonIdentityCourse
        ? `${attackNo}号艇の3コース攻めを中心に、${oneNo}・${twoNo}号艇の残しと外の展開拾いを評価する。`
        : "3号艇の攻めを中心に、1・2号艇の残しと外の展開拾いを評価する。";
      remains.push(
        nonIdentityCourse ? `${oneNo}号艇のイン残り` : "1号艇のイン残り",
        nonIdentityCourse ? `${twoNo}号艇の差し残り` : "2号艇の差し残り"
      );
      pickups.push(
        nonIdentityCourse ? `${fourNo}号艇の連動` : "4号艇の連動",
        nonIdentityCourse ? `${fiveNo}号艇の展開突き` : "5号艇の展開突き"
      );
      notes.push(nonIdentityCourse ? `${attackNo}号艇が攻め切れない場合は内残り優先` : "3号艇が攻め切れない場合は内残り優先");
    } else if (attackCourse === 4) {
      type = "course4-kado";
      title = "4カド攻め中心";
      mainComment = nonIdentityCourse
        ? `${attackNo}号艇の4カド攻めを中心に、内側の残しと${fiveNo}・${sixNo}号艇の展開拾いを評価する。`
        : "4号艇のカド攻めを中心に、内側の残しと5・6号艇の展開拾いを評価する。";
      remains.push(
        nonIdentityCourse ? `${oneNo}号艇のイン残り` : "1号艇のイン残り",
        nonIdentityCourse ? `${twoNo}号艇の差し残り` : "2号艇の差し残り"
      );
      pickups.push(
        nonIdentityCourse ? `${fiveNo}号艇の連動` : "5号艇の連動",
        nonIdentityCourse ? `${sixNo}号艇の最内差し` : "6号艇の最内差し"
      );
      notes.push(nonIdentityCourse ? `${attackNo}号艇が届かない場合は内側決着へ戻す` : "4号艇が届かない場合は内側決着へ戻す");
    } else if (attackCourse === 5) {
      type = "course5-makurisashi";
      title = "5コースまくり差し中心";
      mainComment = nonIdentityCourse
        ? `${attackNo}号艇の5コースまくり差しを中心に、内側艇の残りと${sixNo}号艇の最内差しを評価する。`
        : "5号艇のまくり差しを中心に、内側艇の残りと6号艇の最内差しを評価する。";
      remains.push(
        nonIdentityCourse ? `${oneNo}号艇のイン残り` : "1号艇のイン残り",
        nonIdentityCourse ? `${twoNo}号艇の差し残り` : "2号艇の差し残り"
      );
      pickups.push(nonIdentityCourse ? `${sixNo}号艇の最内差し` : "6号艇の最内差し");
    } else if (attackCourse === 6) {
      type = "course6-pickup";
      title = "6コース展開拾い";
      mainComment = nonIdentityCourse
        ? `${attackNo}号艇の6コース最内差し・道中拾いを補助線にし、基本は内側艇の残りを重視する。`
        : "6号艇の最内差し・道中拾いを補助線にし、基本は内側艇の残りを重視する。";
      remains.push(
        nonIdentityCourse ? `${oneNo}号艇のイン残り` : "1号艇のイン残り",
        nonIdentityCourse ? `${twoNo}号艇の差し残り` : "2号艇の差し残り"
      );
      pickups.push(nonIdentityCourse ? `${attackNo}号艇の最内差し` : "6号艇の最内差し");
    } else {
      if (num(boat2?.score ?? boat2?.total, 0) >= num(boat1?.score ?? boat1?.total, 0) + 8) {
        notes.push(nonIdentityCourse ? `${twoNo}号艇の2コース差し圧力に注意` : "2号艇の差し圧力に注意");
      }
      if (num(boat3?.score ?? boat3?.total, 0) >= num(boat1?.score ?? boat1?.total, 0) + 8) {
        notes.push(nonIdentityCourse ? `${threeNo}号艇の3コース攻めに注意` : "3号艇の攻めに注意");
      }
      if (num(boat4?.score ?? boat4?.total, 0) >= num(boat1?.score ?? boat1?.total, 0) + 8) {
        notes.push(nonIdentityCourse ? `${fourNo}号艇の4カド攻めに注意` : "4号艇のカド攻めに注意");
      }
      remains.push(
        nonIdentityCourse ? `${twoNo}号艇の差し残り` : "2号艇の差し残り",
        nonIdentityCourse ? `${threeNo}号艇の内残り` : "3号艇の内残り"
      );
    }

    const existingComment = text(prediction?.raceFlow?.comment);
    if (existingComment && !mainComment.includes(existingComment)) {
      notes.unshift(existingComment);
    }

    return {
      type,
      title,
      attackBoatNo: attackNo,
      attackCourse,
      mainComment,
      remains: [...new Set(remains)].slice(0, 3),
      pickups: [...new Set(pickups)].slice(0, 3),
      notes: [...new Set(notes.filter(Boolean))].slice(0, 2),
      priorityOrder: [
        "展開",
        "コース",
        "ST・スリット",
        "展示・足",
        "残し・拾い",
        "当地・水面",
        "技量",
        "モーター"
      ],
      readOnly: true
    };
  }

  function enhance(prediction, data) {
    if (!prediction || typeof prediction !== "object") return prediction;
    const flowPriority = build(prediction, data);
    return {
      ...prediction,
      flowPriority,
      raceFlow: {
        ...(prediction.raceFlow || {}),
        priority: flowPriority,
        title: prediction?.raceFlow?.title || flowPriority.title,
        comment: flowPriority.mainComment
      },
      finalAi: {
        ...(prediction.finalAi || {}),
        flowPriority
      }
    };
  }

  function install() {
    const base = window.createPrediction;
    if (typeof base !== "function" || base.__chappyFlowPriorityWrapped) return false;

    function wrappedCreatePrediction(data) {
      return enhance(base(data), data);
    }

    wrappedCreatePrediction.__chappyFlowPriorityWrapped = true;
    wrappedCreatePrediction.__chappyBaseCreatePrediction = base;
    window.createPrediction = wrappedCreatePrediction;
    return true;
  }

  window.ChappyPredictionFlowPriority = { build, enhance, install };

  if (!install()) {
    window.addEventListener("chappy:hiyori-runtime-ready", install, { once: true });
    document.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();
