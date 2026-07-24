// js/frame-rise-sink-report.js
// 枠別浮沈率の集計結果を結果分析画面へ参考表示する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const REPORT_URL = "data/stats/frame-rise-sink-patterns.json";
  const PLACE_TO_JCD = {
    桐生: "01", 戸田: "02", 江戸川: "03", 平和島: "04", 多摩川: "05", 浜名湖: "06",
    蒲郡: "07", 常滑: "08", 津: "09", 三国: "10", びわこ: "11", 住之江: "12",
    尼崎: "13", 鳴門: "14", 丸亀: "15", 児島: "16", 宮島: "17", 徳山: "18",
    下関: "19", 若松: "20", 芦屋: "21", 福岡: "22", 唐津: "23", 大村: "24"
  };

  const RELIABILITY_RULES = {
    venue: { high: 100, medium: 50, low: 20 },
    frame: { high: 100, medium: 50, low: 20 }
  };

  let cachedReport = null;

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pct(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(1)}%` : "-";
  }

  function reliability(samples, type) {
    const count = Number(samples || 0);
    const rules = RELIABILITY_RULES[type] || RELIABILITY_RULES.frame;
    if (count >= rules.high) return { key: "high", label: "高", note: "参考表示可" };
    if (count >= rules.medium) return { key: "medium", label: "中", note: "参考表示" };
    if (count >= rules.low) return { key: "low", label: "低", note: "慎重に確認" };
    return { key: "collecting", label: "蓄積中", note: "判断材料にしない" };
  }

  function selectedPlace() {
    return String(document.getElementById("placeSelect")?.value || "").trim();
  }

  function selectedPattern(report) {
    const place = selectedPlace();
    const jcd = PLACE_TO_JCD[place];
    const venue = jcd ? report?.byVenue?.[jcd] : null;

    if (venue?.raceCount > 0) {
      return {
        scope: "venue",
        title: `${place}の枠別浮沈率`,
        pattern: venue,
        place
      };
    }

    return {
      scope: "overall",
      title: "全場の枠別浮沈率",
      pattern: report?.overall || {},
      place: "全場"
    };
  }

  function frameRows(pattern) {
    const frames = pattern?.frames || {};
    return Object.keys(frames)
      .sort((a, b) => Number(a) - Number(b))
      .map(key => frames[key]);
  }

  function render(report) {
    const selected = selectedPattern(report);
    const rows = frameRows(selected.pattern);
    const raceCount = Number(selected.pattern?.raceCount || 0);
    const venueReliability = reliability(raceCount, "venue");

    if (!rows.length || !raceCount) {
      return `<div class="frame-rise-sink-empty">枠別浮沈率の検証データを蓄積中です。</div>`;
    }

    return `
      <div class="frame-rise-sink-scope">
        <strong>${esc(selected.title)}</strong>
        <small>${selected.scope === "venue" ? "選択中の場に絞った参考値" : "場別データ不足のため全場集計を表示"}</small>
      </div>

      <div class="frame-rise-sink-summary">
        <span>対象 ${esc(raceCount)}レース</span>
        <span>期間 ${esc(report?.firstDate || "-")}〜${esc(report?.lastDate || "-")}</span>
        <span class="reliability-${esc(venueReliability.key)}">場別信頼度 ${esc(venueReliability.label)}</span>
        <span>${esc(venueReliability.note)}</span>
      </div>

      <div class="frame-reliability-guide">
        高：100走以上 ／ 中：50走以上 ／ 低：20走以上 ／ 20走未満：蓄積中
      </div>

      <div class="frame-rise-sink-table-wrap">
        <table class="frame-rise-sink-table">
          <thead>
            <tr>
              <th>枠</th><th>走数</th><th>信頼度</th><th>1着率</th><th>3着内率</th>
              <th>浮上率</th><th>維持率</th><th>沈下率</th><th>進入内寄り</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => {
              const rowReliability = reliability(row.starts, "frame");
              return `
                <tr class="frame-row-${esc(rowReliability.key)}">
                  <td><strong>${esc(row.frameNo)}枠</strong></td>
                  <td>${esc(row.starts || 0)}走</td>
                  <td><span class="frame-reliability-badge reliability-${esc(rowReliability.key)}">${esc(rowReliability.label)}</span></td>
                  <td>${esc(pct(row.winRate))}</td>
                  <td>${esc(pct(row.top3Rate))}</td>
                  <td>${esc(pct(row.riseRate))}</td>
                  <td>${esc(pct(row.stayRate))}</td>
                  <td>${esc(pct(row.sinkRate))}</td>
                  <td>${esc(pct(row.entryMovement?.inside?.rate))}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>

      <p class="frame-rise-sink-note">
        浮上＝着順が枠番より上、維持＝着順と枠番が同じ、沈下＝着順が枠番より下。信頼度が「蓄積中」の数値は判断材料にしません。参考統計として表示し、単独では予想へ反映しません。
      </p>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("frame-rise-sink-report-style")) return;
    const style = document.createElement("style");
    style.id = "frame-rise-sink-report-style";
    style.textContent = `
      .frame-rise-sink-card{margin-top:18px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .frame-rise-sink-card h3{margin:0 0 6px;font-size:17px}
      .frame-rise-sink-card>p{margin:0 0 12px;color:#64748b;font-size:13px}
      .frame-rise-sink-scope{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}
      .frame-rise-sink-scope strong{font-size:14px}.frame-rise-sink-scope small{color:#64748b}
      .frame-rise-sink-summary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
      .frame-rise-sink-summary span,.frame-reliability-badge{padding:5px 8px;border-radius:999px;background:#f1f5f9;font-size:12px}
      .frame-reliability-guide{margin:0 0 12px;padding:9px 10px;border-radius:10px;background:#f8fafc;color:#64748b;font-size:12px}
      .reliability-high{background:#dcfce7!important;color:#166534}.reliability-medium{background:#dbeafe!important;color:#1d4ed8}
      .reliability-low{background:#fef3c7!important;color:#92400e}.reliability-collecting{background:#f1f5f9!important;color:#64748b}
      .frame-row-collecting{opacity:.62}.frame-rise-sink-table-wrap{overflow-x:auto}
      .frame-rise-sink-table{width:100%;border-collapse:collapse;min-width:820px;font-size:12px}
      .frame-rise-sink-table th,.frame-rise-sink-table td{padding:9px 8px;border-bottom:1px solid #e5e7eb;text-align:center;white-space:nowrap}
      .frame-rise-sink-table th{background:#f8fafc;color:#475569}.frame-rise-sink-table td:first-child{text-align:left}
      .frame-rise-sink-note,.frame-rise-sink-empty{margin-top:10px;color:#64748b;font-size:12px;line-height:1.6}
    `;
    document.head.appendChild(style);
  }

  async function load() {
    const response = await fetch(`${REPORT_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`枠別浮沈率を取得できません (${response.status})`);
    return response.json();
  }

  function paint(card) {
    if (!cachedReport || !card) return;
    card.innerHTML = `
      <h3>📊 枠別浮沈率</h3>
      <p>公式結果から、各枠の浮上・維持・沈下と実進入の傾向を集計します。</p>
      ${render(cachedReport)}
    `;
  }

  async function install() {
    ensureStyle();
    const statsArea = document.getElementById("statsArea");
    if (!statsArea || document.getElementById("frameRiseSinkReport")) return;

    const card = document.createElement("section");
    card.id = "frameRiseSinkReport";
    card.className = "frame-rise-sink-card";
    card.innerHTML = `<h3>📊 枠別浮沈率</h3><p>公式結果から、各枠の浮上・維持・沈下と実進入の傾向を集計します。</p><div class="frame-rise-sink-empty">読み込み中…</div>`;
    statsArea.insertAdjacentElement("afterend", card);

    try {
      cachedReport = await load();
      paint(card);
      document.getElementById("placeSelect")?.addEventListener("change", () => paint(card));
    } catch (error) {
      card.innerHTML = `<h3>📊 枠別浮沈率</h3><p>公式結果から、各枠の浮上・維持・沈下と実進入の傾向を集計します。</p><div class="frame-rise-sink-empty">${esc(error?.message || "集計結果を読み込めませんでした")}</div>`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();