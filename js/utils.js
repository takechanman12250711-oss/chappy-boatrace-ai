// ==============================
// チャッピーAI
// 共通関数
// ==============================

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

function fmtST(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "-";
  const n = Number(v);
  if (n < 0) return `F${Math.abs(n).toFixed(2).slice(1)}`;
  return n.toFixed(2);
}

function normalizeKey(v) {
  return String(v || "").replaceAll("-", "").replaceAll("－", "").replaceAll(" ", "").trim();
}

function showKey(v) {
  const s = normalizeKey(v);
  return s.length === 3 ? `${s[0]}-${s[1]}-${s[2]}` : String(v || "-");
}

function normalizeDate(v) {
  return String(v || "").replaceAll("-", "").replaceAll("/", "").trim();
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function boatByNo(boats, no) {
  return (boats || []).find(b => Number(b.boat) === Number(no)) || null;
}

function $(id) {
  return document.querySelector(id);
}

function val(id) {
  return $(id)?.value?.trim() || "";
}

function setHTML(id, html) {
  const el = document.querySelector(id);
  if (el) el.innerHTML = html;
}

function setStatus(text) {
  const el = $("#statusText");
  if (el) el.textContent = text;
}

function showError(msg) {
  setHTML("#raceListArea", `<div class="error">⚠️ ${msg}</div>`);
}

function clearAreas() {
  [
    "#raceFlowArea",
    "#raceListArea",
    "#engineArea",
    "#mainSheetArea",
    "#formationArea",
    "#manshuSheetArea",
    "#alertArea",
    "#finalCommentArea",
    "#oddsArea"
  ].forEach(id => setHTML(id, ""));
}

function termHelp(term) {
  const dict = {
    "モーター2連率": "そのモーターが1着または2着に入った割合です。",
    "モーター3連率": "そのモーターが3着以内に入った割合です。",
    "ボート2連率": "そのボートが1着または2着に入った割合です。",
    "ボート3連率": "そのボートが3着以内に入った割合です。",
    "回収期待値": "オッズとAI指数から見た買う価値の目安です。高いほど狙う価値があります。",
    "舟券太郎理論": "スリットアラート・ダブルタイム理論・新サム理論などをまとめた評価です。"
  };

  alert(`${term}\n\n${dict[term] || "説明がまだ登録されていません。"}`);
}

function helpBtn(term) {
  return `<button class="help-btn" onclick="termHelp('${term}')">?</button>`;
}