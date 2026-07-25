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
    return num(item?.boatNo ?? item?.course ?? item?.frame, 0);
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

  function build(prediction) {
    const mainSheet = prediction?.mainSheet || {};
    const honmei = mainSheet.honmei || prediction?.honmei || null;
    const attackBoat =
      prediction?.raceFlow?.attackBoat ||
      prediction?.raceFlow?.attacker ||
      prediction?.attackBoat ||
      honmei ||
      null;

    const attackNo = boatNo(attackBoat) || boatNo(honmei) || 1;
    const attackCourse = num(attackBoat?.course, attackNo);
    const boat1 = getBoat(prediction, 1);
    const boat2 = getBoat(prediction, 2);
    const boat3 = getBoat(prediction, 3);
    const boat4 = getBoat(prediction, 4);

    let type = "inside";
    let title = "イン先マイ中心";
    let mainComment = "1号艇の先マイを軸に、内側の残しを重視する。";
    const remains = [];
    const pickups = [];
    const notes = [];

    if (attackCourse === 2) {
      type = "course2-sashi";
      title = "2コース差し中心";
      mainComment = "2号艇の差しを中心に、1号艇の残しを相手本線として評価する。";
      remains.push("1号艇の逃げ残り");
      pickups.push("3号艇の内残り");
    } else if (attackCourse === 3) {
      type = "course3-attack";
      title = "3コース攻め中心";
      mainComment = "3号艇の攻めを中心に、1・2号艇の残しと外の展開拾いを評価する。";
      remains.push("1号艇のイン残り", "2号艇の差し残り");
      pickups.push("4号艇の連動", "5号艇の展開突き");
      notes.push("3号艇が攻め切れない場合は内残り優先");
    } else if (attackCourse === 4) {
      type = "course4-kado";
      title = "4カド攻め中心";
      mainComment = "4号艇のカド攻めを中心に、内側の残しと5・6号艇の展開拾いを評価する。";
      remains.push("1号艇のイン残り", "2号艇の差し残り");
      pickups.push("5号艇の連動", "6号艇の最内差し");
      notes.push("4号艇が届かない場合は内側決着へ戻す");
    } else if (attackCourse === 5) {
      type = "course5-makurisashi";
      title = "5コースまくり差し中心";
      mainComment = "5号艇のまくり差しを中心に、内側艇の残りと6号艇の最内差しを評価する。";
      remains.push("1号艇のイン残り", "2号艇の差し残り");
      pickups.push("6号艇の最内差し");
    } else if (attackCourse === 6) {
      type = "course6-pickup";
      title = "6コース展開拾い";
      mainComment = "6号艇の最内差し・道中拾いを補助線にし、基本は内側艇の残りを重視する。";
      remains.push("1号艇のイン残り", "2号艇の差し残り");
      pickups.push("6号艇の最内差し");
    } else {
      if (num(boat2?.score ?? boat2?.total, 0) >= num(boat1?.score ?? boat1?.total, 0) + 8) {
        notes.push("2号艇の差し圧力に注意");
      }
      if (num(boat3?.score ?? boat3?.total, 0) >= num(boat1?.score ?? boat1?.total, 0) + 8) {
        notes.push("3号艇の攻めに注意");
      }
      if (num(boat4?.score ?? boat4?.total, 0) >= num(boat1?.score ?? boat1?.total, 0) + 8) {
        notes.push("4号艇のカド攻めに注意");
      }
      remains.push("2号艇の差し残り", "3号艇の内残り");
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

  function enhance(prediction) {
    if (!prediction || typeof prediction !== "object") return prediction;
    const flowPriority = build(prediction);
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
      return enhance(base(data));
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
