// ================================
// prediction.js v1
// フォーメーション・買い目生成
// ================================

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

  manshu.push(...buildManshuAITickets(analysis));

  main = rankTicketsByRace(main, analysis, "main").slice(0, 5);
  safe = rankTicketsByRace(removeDuplicateForms(safe, main), analysis, "safe").slice(0, 6);
  hole = rankTicketsByRace(removeDuplicateForms(hole, [...main, ...safe]), analysis, "hole").slice(0, 6);
  manshu = rankTicketsByRace(
    removeDuplicateForms(manshu, [...main, ...safe, ...hole]),
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

function rankTicketsByRace(list, analysis, mode) {
  const attack = Number(analysis?.attackBoat || 3);
  const sashi = Number(analysis?.sashiBoat || 2);
  const nokoshi = Number(analysis?.nokoshiBoat || 1);
  const trust = Number(analysis?.inTrust || 60);
  const tenkai = analysis?.tenkaiRate || {};
  const upset = Number(tenkai.upset || 0);

  return [...new Set(list || [])]
    .map(ticket => {
      const nums = String(ticket).split("-").map(Number);
      const [first, second, third] = nums;
      let score = 50;

      if (first === 1 && trust >= 70) score += 20;
      if (first === attack) score += Number(tenkai.attack || 0) / 3;
      if (second === sashi || third === sashi) score += Number(tenkai.sashi || 0) / 4;
      if (second === nokoshi || third === nokoshi) score += Number(tenkai.nokoshi || 0) / 4;

      if (mode === "manshu") {
        if (first >= 4) score += 20;
        if (second >= 4 || third >= 5) score += 12;
        score += upset / 2;
      }

      if (mode === "hole") {
        if (first === attack || first === sashi) score += 12;
        if (third >= 5) score += 8;
      }

      const odds = Number(compositeOddsForForm(ticket) || 0);
      if (odds >= 30) score += 8;
      if (odds >= 80) score += 12;
      if (odds >= 150) score += mode === "manshu" ? 20 : 5;

      return { ticket, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.ticket);
}

function makeTickets(firstList, secondList, thirdList) {
  const out = [];

  uniqueNums(firstList).forEach(first => {
    uniqueNums(secondList).forEach(second => {
      uniqueNums(thirdList).forEach(third => {
        if (first === second) return;
        if (first === third) return;
        if (second === third) return;
        out.push(`${first}-${second}-${third}`);
      });
    });
  });

  return [...new Set(out)];
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

function buildFormationReason(type, trust, prob, analysis) {
  const txt = [];

  txt.push(`展開予測：${type}`);

  if (analysis?.attackBoat) txt.push(`🔥 展開の主役：${analysis.attackBoat}号艇`);
  if (analysis?.sashiBoat) txt.push(`🎯 差し本線：${analysis.sashiBoat}号艇`);
  if (analysis?.nokoshiBoat) txt.push(`⚡ 残し本線：${analysis.nokoshiBoat}号艇`);

  if (Number(prob?.makuri || 0) >= 25) txt.push("まくり率高め。");
  if (Number(prob?.sashi || 0) >= 25) txt.push("差しが決まりやすい。");
  if (Number(prob?.upset || 0) >= 20) txt.push("万舟警戒レース。");

  return "🧠 " + txt.join(" ");
}

function uniqueNums(list) {
  return [...new Set(
    (list || [])
      .map(x => Number(x))
      .filter(x => Number.isFinite(x) && x >= 1 && x <= 6)
  )];
}

function compactTicketList(list, limit = 6) {
  return [...new Set(list || [])].slice(0, limit);
}

function removeDuplicateForms(list, baseList) {
  const baseExpanded = new Set(
    compactForms(baseList)
      .flatMap(expandForm)
      .map(normalizeKey)
  );

  return compactForms(list).filter(form => {
    const expanded = expandForm(form).map(normalizeKey);
    return !expanded.every(x => baseExpanded.has(x));
  });
}

function ticketsWithOdds(list) {
  const arr = compactForms(list);

  if (!arr.length) {
    return `<div class="summary-box">候補なし</div>`;
  }

  return `
    <div class="ticket-list">
      ${arr.map(form => {
        const odds = compositeOddsForForm(form);
        return `
          <span class="ticket">
            ${form}${odds ? `　合成${odds}倍` : ""}
          </span>
        `;
      }).join("")}
    </div>
  `;
}

function compositeOddsForForm(form) {
  const keys = expandForm(form).map(normalizeKey);

  const sourceOdds =
    Array.isArray(window.latestOddsList) ? window.latestOddsList :
    Array.isArray(latestOddsList) ? latestOddsList :
    [];

  const oddsMap = new Map(
    sourceOdds.map(o => [
      normalizeKey(o.key || o.result || o.number),
      Number(o.odds)
    ])
  );

  const values = keys
    .map(k => oddsMap.get(k))
    .filter(v => Number.isFinite(v) && v > 0);

  if (!values.length) return "";

  const inverseSum = values.reduce((sum, o) => sum + 1 / o, 0);
  if (!inverseSum) return "";

  return (1 / inverseSum).toFixed(1);
}

function buildManshuAITickets(analysis) {
  const attack = Number(analysis?.attackBoat || 3);
  const sashi = Number(analysis?.sashiBoat || 5);
  const nokoshi = Number(analysis?.nokoshiBoat || 1);

  const outside = [5, 6].filter(x => x !== attack && x !== sashi && x !== nokoshi);
  const tickets = [];

  tickets.push(`${attack}-${sashi}-${nokoshi}`);
  tickets.push(`${attack}-${nokoshi}-${sashi}`);
  tickets.push(`${sashi}-${attack}-${nokoshi}`);
  tickets.push(`${sashi}-${nokoshi}-${attack}`);

  if (nokoshi === 1) {
    tickets.push(`${attack}-1-${sashi}`);
    tickets.push(`${sashi}-1-${attack}`);
  }

  outside.forEach(o => {
    tickets.push(`${attack}-${o}-${nokoshi}`);
    tickets.push(`${o}-${attack}-${nokoshi}`);
    tickets.push(`${o}-${sashi}-${attack}`);
  });

  return [...new Set(tickets)]
    .filter(t => {
      const a = t.split("-");
      return a.length === 3 && new Set(a).size === 3;
    })
    .slice(0, 10);
}

window.renderFormations = renderFormations;
window.rankTicketsByRace = rankTicketsByRace;
window.makeTickets = makeTickets;
window.buildBuyReason = buildBuyReason;
window.buildFormationReason = buildFormationReason;
window.buildManshuAITickets = buildManshuAITickets;