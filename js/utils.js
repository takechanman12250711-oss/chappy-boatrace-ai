// 共通関数
// num / clamp / fmtNum / fmtPct / normalizeDate をここへ移す
function num(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function fmtNum(v) {
  return Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "-";
}

function fmtPct(v) {
  return Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}%` : "-";
}