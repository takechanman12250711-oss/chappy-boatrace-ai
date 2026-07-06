// =======================================
// theory.js 完全版①
// 舟券太郎理論・アラート計算
// =======================================

function buildTheoryFlags(boats = []) {
  const list = boats || [];

  const stRank = list
    .filter(b => num(b.exhibitionST, 0) > 0)
    .map(b => ({
      boat: Number(b.boat),
      name: b.name || "",
      st: num(b.exhibitionST)
    }))
    .sort((a, b) => a.st - b.st);

  const exRank = list
    .filter(b => num(b.exhibitionTime, 0) > 0)
    .map(b => ({
      boat: Number(b.boat),
      name: b.name || "",
      time: num(b.exhibitionTime)
    }))
    .sort((a, b) => a.time - b.time);

  const lapRank = list
    .filter(b => num(b.lapTime, 0) > 0)
    .map(b => ({
      boat: Number(b.boat),
      name: b.name || "",
      time: num(b.lapTime)
    }))
    .sort((a, b) => a.time - b.time);

  const slitAlert = buildSlitAlert(stRank);
  const doubleTimeAlert = buildDoubleTimeAlert(exRank, lapRank);
  const newSumAlert = buildNewSumAlert(list);

  const localPower = list.some(b => num(b.localWinRate, 0) >= 6.5);
  const motorGap = list.some(b => num(b.motor2Rate, 0) >= 45);

  const taroScore = clamp(
    50 +
    (slitAlert.length ? 15 : 0) +
    (doubleTimeAlert.length ? 12 : 0) +
    (newSumAlert.length ? 10 : 0) +
    (localPower ? 8 : 0) +
    (motorGap ? 6 : 0)
  );

  return {
    slitAlert,
    doubleTimeAlert,
    newSumAlert,
    localPower,
    motorGap,
    taroScore
  };
}

function buildSlitAlert(stRank = []) {
  if (stRank.length < 2) return [];

  const top = stRank[0];
  const second = stRank[1];

  const diff = Math.abs(top.st - second.st);

  if (diff < 0.10) return [];

  return [{
    boat: top.boat,
    name: top.name,
    type: "スリットアラート",
    value: top.st,
    diff: diff.toFixed(2),
    reason: `${top.boat}号艇が展示STで抜けている。スリット差${diff.toFixed(2)}。`
  }];
}

function buildDoubleTimeAlert(exRank = [], lapRank = []) {
  if (!exRank.length || !lapRank.length) return [];

  const exTop = exRank[0];
  const lapTop = lapRank[0];

  if (Number(exTop.boat) !== Number(lapTop.boat)) return [];

  return [{
    boat: exTop.boat,
    name: exTop.name,
    type: "ダブルタイム理論",
    exhibitionTime: exTop.time,
    lapTime: lapTop.time,
    reason: `${exTop.boat}号艇が展示タイム・一周タイムの両方で上位。`
  }];
}