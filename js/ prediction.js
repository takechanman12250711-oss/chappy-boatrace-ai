// ================================
// チャッピーAI
// 展開予想
// ================================

function buildDynamicRaceEngine(boats, analysis) {
  const list = boats || [];
  const theory = latestRaceData?.prediction?.theory || latestRaceData?.theory || {};

  const exhibitionRank = [...list]
    .filter(b => num(b.exhibitionTime, 0) > 0)
    .sort((a, b) => num(a.exhibitionTime) - num(b.exhibitionTime));

  const lapRank = [...list]
    .filter(b => num(b.lapTime, 0) > 0)
    .sort((a, b) => num(a.lapTime) - num(b.lapTime));

  const rankPoint = (rank, boatNo, points) => {
    const idx = rank.findIndex(x => Number(x.boat) === Number(boatNo));
    return idx >= 0 && idx < points.length ? points[idx] : 0;
  };

  return list.map(b => {
    const no = Number(b.boat);
    let attack = 40;
    let sashi = 40;
    let nokoshi = 40;
    let tenkai = 40;
    let manshu = 35;
    const isAttack = no === Number(analysis.attackBoat);
    const isSashi = no === Number(analysis.sashiBoat);
    const isNokoshi = no === Number(analysis.nokoshiBoat);
    const isOutside = no >= 5;

    if (no === 1) nokoshi += analysis.inTrust >= 70 ? 22 : 10;
    if (no === 2) sashi += 14;
    if (no === 3) attack += 12;
    if (no === 4) attack += 10;
    if (no === 5) sashi += 10;
    if (no === 6) tenkai += 12;

    if (isAttack) attack += 15;
    if (isSashi) sashi += 15;
    if (isNokoshi) nokoshi += 12;
    if (isAttack) {
  tenkai += 15;
  manshu += 10;
}

if (isSashi) {
  tenkai += 12;
}

if (isNokoshi) {
  manshu += 8;
}

if (isOutside && isAttack) {
  manshu += 12;
}

    if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.15) {
      attack += 10;
      tenkai += 6;
    }

    if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) {
      attack += 8;
      tenkai += 5;
    }

    const exPoint = rankPoint(exhibitionRank, no, [12, 9, 6]);
    attack += exPoint;
    sashi += Math.round(exPoint / 2);

    const lapPoint = rankPoint(lapRank, no, [15, 10, 7]);
    nokoshi += lapPoint;
    tenkai += Math.round(lapPoint / 2);
    if (exPoint >= 12) {
  attack += 8;
  tenkai += 8;
  manshu += 5;
}

if (exPoint >= 9 && isSashi) {
  sashi += 8;
  tenkai += 5;
}

if (exPoint >= 9 && isAttack) {
  attack += 10;
}

    if (lapPoint >= 15) {
  nokoshi += 12;
  tenkai += 10;

  if (isAttack) attack += 8;
  if (isSashi) sashi += 8;
}

if (exPoint === 12 && lapPoint === 15) {
  attack += 12;
  sashi += 10;
  manshu += 10;
}

    if (num(b.localWinRate, 0) >= 6) {
      tenkai += 10;
      nokoshi += 6;
    }

    if (num(b.motor2Rate, 0) >= 40) {
      attack += 6;
      sashi += 6;
    }

    if (analysis.inTrust < 60 && no >= 4) {
  manshu += 18;
  tenkai += 10;
}

if (analysis.inTrust < 50 && isOutside) {
  manshu += 15;
  attack += 5;
}

if (analysis.attackScore >= 75 && isAttack) {
  attack += 12;
  tenkai += 8;
}

if (analysis.attackScore >= 75 && isOutside) {
  manshu += 10;
}

    if (no >= 5) manshu += 10;

    return {
      theory,
      boat: no,
      name: b.name || "",
      attack: clamp(attack),
      sashi: clamp(sashi),
      nokoshi: clamp(nokoshi),
      tenkai: clamp(tenkai),
      manshu: clamp(manshu)
    };
  });
}
function judgeAttackComment(type, attack, sashi, nokoshi) {
  if (type === "まくり") {
    return `${attack}号艇が全速で攻める展開。${nokoshi}号艇の残しと、${sashi}号艇の差し場を重視。`;
  }

  if (type === "まくり差し") {
    return `${attack}号艇がまくり差しで差し場を狙う展開。内残りと外の連動を両方見る。`;
  }

  if (type === "差し") {
    return `${attack}号艇の差し展開。イン残りを見ながら、2着・3着の残しを重視。`;
  }

  if (type === "展開待ち") {
    return `${attack}号艇は展開待ち。内が競った時の差し場・道中拾いを重視。`;
  }

  return `${attack}号艇が展開を作る想定。${sashi}号艇が差し場、${nokoshi}号艇が残し候補。`;
  }
  function buildHoleComment(key, odds) {
  if (!key) return "";

  const a = key.split("-").map(Number);

  if (a[0] === 2) return "◎2差し";
  if (a[0] === 3) return "◎3攻め";
  if (a[0] === 4) return "◎4カド";
  if (a[0] === 5) return "◎5一撃";
  if (a[0] === 6) return "◎6展開";

  if (Number(odds) >= 200) return "○高配当";
  return "";
}
// ================================
// 展開理由
// ================================

　function buildFlowReason(type, attack, sashi, nokoshi) {
  const r = [];

  r.push(`① ${attack}号艇が攻めの中心。ST・展示・場補正から展開を作る役。`);
  r.push(`② ${sashi}号艇は差し場候補。攻めが入った時に空いた内を拾う。`);
  r.push(`③ ${nokoshi}号艇は残し候補。攻められても2・3着に残す想定。`);

  if (type === "まくり") {
    r.push("④ まくり展開なので、攻め艇の頭まで見る。");
  } else if (type === "まくり差し") {
    r.push("④ まくり差し展開なので、1残り＋攻め艇2着の形を本線にする。");
  } else if (type === "差し") {
    r.push("④ 差し展開なので、1-2系と2-1系を両方押さえる。");
  } else {
    r.push("④ 展開待ちなので、内が競った時の外差し・道中拾いを見る。");
  }

  r.push("⑤ フォーメーションは本線・押さえ・穴・万舟を分けて買う。");

  return r.join("<br>");
}
function buildSimulation(analysis, mode) {
  const attack = analysis.attackBoat;
  const sashi = analysis.sashiBoat;
  const nokoshi = analysis.nokoshiBoat;

  if (mode === "main") {
    return `
① ${attack}号艇が攻める
<br>↓
<br>② ${sashi}号艇に差し場
<br>↓
<br>③ ${nokoshi}号艇が残す
<br>↓
<br><b>本線決着</b>`;
  }

  if (mode === "sub") {
    return `
① イン先マイ
<br>↓
<br>② ${attack}号艇追走
<br>↓
<br>③ ${sashi}号艇差し
<br>↓
<br><b>押さえ展開</b>`;
  }

  return `
① センター攻め
<br>↓
<br>② 外差し
<br>↓
<br>③ 展開突き
<br>↓
<br><b>万舟展開</b>`;
}
function buildSimulation(analysis, mode) {
  const attack = analysis.attackBoat;
  const sashi = analysis.sashiBoat;
  const nokoshi = analysis.nokoshiBoat;

  if (mode === "main") {
    return `
① ${attack}号艇が攻める
<br>↓
<br>② ${sashi}号艇に差し場
<br>↓
<br>③ ${nokoshi}号艇が残す
<br><br><b>本命展開</b>`;
  }

  if (mode === "sub") {
    return `
① ${attack}号艇が攻める
<br>↓
<br>② 外差し
<br>↓
<br>③ 展開突き
<br><br><b>対抗展開</b>`;
  }

  return `
① ${attack}号艇が攻める
<br>↓
<br>② 内が競る
<br>↓
<br>③ 外が拾う
<br><br><b>万舟展開</b>`;
}
window.buildSimulation = buildSimulation;

if (typeof buildDynamicRaceEngine !== "undefined") window.buildDynamicRaceEngine = buildDynamicRaceEngine;
if (typeof judgeAttackComment !== "undefined") window.judgeAttackComment = judgeAttackComment;
if (typeof buildHoleComment !== "undefined") window.buildHoleComment = buildHoleComment;
if (typeof buildFlowReason !== "undefined") window.buildFlowReason = buildFlowReason;
window.buildSimulation = buildSimulation;

function renderFormations(p, analysis) {
  const dynamic = analysis?.dynamic || [];

  const topAttack = [...dynamic].sort((a, b) => b.attack - a.attack)[0];
  const topSashi = [...dynamic].sort((a, b) => b.sashi - a.sashi)[0];
  const topNokoshi = [...dynamic].sort((a, b) => b.nokoshi - a.nokoshi)[0];
  const topManshu = [...dynamic].sort((a, b) => b.manshu - a.manshu)[0];

  const a = Number(topAttack?.boat || analysis?.attackBoat || 3);
  const s = Number(topSashi?.boat || analysis?.sashiBoat || 2);
  const n = Number(topNokoshi?.boat || analysis?.nokoshiBoat || 4);
  const m = Number(topManshu?.boat || 6);
  const trust = Number(analysis?.inTrust || 60);
  const type = analysis?.attackType || "まくり差し";
  const prob = analysis?.probability || {};
  const highMakuri = Number(prob.makuri || 0) >= 25;
  const highSashi = Number(prob.sashi || 0) >= 25;
  const highUpset = Number(prob.upset || 0) >= 25;

  let main = [];
  let safe = [];
  let hole = [];
  let manshu = [];
  
  if (type === "差し") {
    main = makeTickets([1, 2], [2, 1, a], [a, n, s, 5, 6]);
    safe = makeTickets([1], [a, n, s], [2, a, n, s, 5, 6]);
    hole = makeTickets([2, a], [1, s, n], [1, a, n, s, 5, 6]);
  } else if (type === "まくり") {
    main = makeTickets([a, 1], [1, s, n], [1, 2, s, n, 5, 6]);
    safe = makeTickets([1], [a, 2, s], [2, a, n, s, 5, 6]);
    hole = makeTickets([a, s, n], [1, 2], [1, 2, s, n, m, 6]);
  } else if (type === "まくり差し") {
    if (trust >= 75) {
  main = makeTickets([1], [a, s], [2, a, s]);
} else if (trust >= 60) {
  main = makeTickets([1], [a, s], [2, a, s, n]);
} else {
  main = makeTickets([1, a], [a, s], [2, a, s, n]);
}
    safe = makeTickets([a, 1], [1, s, n], [1, 2, s, n, 5, 6]);
    hole = makeTickets([s, n, a], [a, 1], [1, 2, s, n, m, 6]);
  } else {
    main = trust >= 70
      ? makeTickets([1], [2, a], [a, n, s, 5, 6])
      : makeTickets([1, a], [a, s, n], [1, 2, a, n, s, m, 6]);

    safe = makeTickets([1, 2], [s, n, a], [1, 2, a, n, s, 5, 6]);
    hole = makeTickets([a, n], [1, s], [1, 2, n, s, m, 6]);
  }
if (highMakuri) {
  main.push(...makeTickets([a, 1], [1, s, n], [1, 2, s, n, 5, 6]));
  hole.push(...makeTickets([a, s], [1, n], [1, 2, n, m, 6]));
}

if (highSashi || s === 2) {
  safe.push(...makeTickets([1, 2, s], [s, 1, a], [1, 2, a, n, 5, 6]));
  hole.push(...makeTickets([2], [1, a, s], [1, a, s, n, 5, 6]));
}

if (highUpset) {
  manshu.push(...makeTickets([m, a, s], [a, 1, n], [1, 2, s, n, m, 6]));
}
  manshu.push(
  ...makeTickets([m, s, n, a], [a, 1, s], [1, 2, 3, 4, 5, 6])
);

main = rankTicketsByRace(main, analysis, "main").slice(0, 5);
safe = rankTicketsByRace(removeDuplicateForms(safe, main), analysis, "safe").slice(0, 6);
hole = rankTicketsByRace(removeDuplicateForms(hole, [...main, ...safe]), analysis, "hole").slice(0, 6);
manshu = rankTicketsByRace(
  buildManshuAITickets(analysis),
  analysis,
  "manshu"
).slice(0, 8);

  return `
    <div class="sheet">
      <h3>🧾 舟券フォーメーション</h3>

      <p class="aiReason">
${buildFormationReason(type, trust, prob, analysis)}
</p>
<div class="summary-box">
  <b>🧠 買い理由</b>
  ${buildBuyReason(analysis)}
</div>

      <h4 class="form-main">本線</h4>
      ${ticketsWithOdds(main)}

      <h4 class="form-safe">押さえ</h4>
      ${ticketsWithOdds(safe)}

      <h4 class="form-hole">穴</h4>
      ${ticketsWithOdds(hole)}
      <h4 class="form-manshu">万舟</h4>
      ${ticketsWithOdds(manshu)}
    </div>
  `;
}

function buildBuyReason(analysis) {
  const tenkai = analysis?.tenkaiRate || {};
  const attack = analysis?.attackBoat || "-";
  const sashi = analysis?.sashiBoat || "-";
  const nokoshi = analysis?.nokoshiBoat || "-";
  const trust = analysis?.inTrust || 0;

  const r = [];

  r.push(`イン信頼度は${trust}点。${trust >= 70 ? "本線はイン残り中心。" : "攻め艇・差し場も必要。"}`);
  r.push(`${attack}号艇が攻め役。攻め成立率${tenkai.attack || 0}%で展開の中心。`);
  r.push(`${sashi}号艇は差し場候補。差し成立率${tenkai.sashi || 0}%を評価。`);
  r.push(`${nokoshi}号艇は残し候補。残し成立率${tenkai.nokoshi || 0}%で2・3着候補。`);
  r.push(`波乱率は${tenkai.upset || 0}%。${tenkai.upset >= 50 ? "万舟も強めに見る。" : "本線と押さえを中心に見る。"}`);

  return r.map(x => `<p>・${x}</p>`).join("");
}