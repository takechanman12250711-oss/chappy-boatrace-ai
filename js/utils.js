// ================================
// チャッピーAI
// 共通ユーティリティ
// ================================

function $(selector) {
  return document.querySelector(selector);
}

function val(selector) {
  return $(selector)?.value || "";
}

function setHTML(selector, html) {
  const el = $(selector);
  if (!el) return;
  el.innerHTML = html || "";
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(n)));
}

function fmtNum(v, digits = 2) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function fmtPct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "-";
}

function fmtST(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  if (n < 0) return `F${Math.abs(n).toFixed(2)}`;
  return n.toFixed(2);
}

function normalizeKey(v) {
  return String(v || "")
    .replaceAll("-", "")
    .replaceAll(" ", "")
    .replaceAll("　", "")
    .trim();
}

function showKey(v) {
  const s = normalizeKey(v);
  if (s.length !== 3) return String(v || "-");
  return `${s[0]}-${s[1]}-${s[2]}`;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function boatByNo(boats = [], no) {
  return (boats || []).find(b => Number(b.boat) === Number(no)) || null;
}

// グローバル登録
window.$ = $;
window.val = val;
window.setHTML = setHTML;
window.num = num;
window.clamp = clamp;
window.fmtNum = fmtNum;
window.fmtPct = fmtPct;
window.fmtST = fmtST;
window.normalizeKey = normalizeKey;
window.showKey = showKey;
window.todayYmd = todayYmd;
window.boatByNo = boatByNo;