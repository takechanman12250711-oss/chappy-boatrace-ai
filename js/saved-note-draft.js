(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappySavedNoteDraft = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  function reviewStatus(bundle, now = Date.now()) {
    const audit = bundle?.generationAudit;
    const stamp = typeof audit?.auditedAt === "string" && Number.isFinite(Date.parse(audit.auditedAt))
      ? new Date(audit.auditedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "時刻不明";
    const issues = Array.isArray(audit?.issues) ? audit.issues : [];
    const passed = stamp !== "時刻不明" && audit?.status === "ready_for_review" && audit.contentReady === true &&
      Array.isArray(audit.issues) && issues.length === 0 && audit.canPublish === false &&
      audit.automaticPublicationEnabled === false;
    const deadline = typeof bundle?.record?.deadlineAt === "string" &&
      /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(bundle.record.deadlineAt)
      ? Date.parse(bundle.record.deadlineAt) : NaN;
    const lead = bundle?.minLeadSeconds;
    const clock = Number(now);
    const nearDeadline = Number.isFinite(deadline) && Number.isFinite(clock) &&
      deadline - clock <= Math.max(120, Number(lead) || 120) * 1000;
    let message = `生成時検査（${stamp}）：${passed ? "合格" : "要確認"}。`;
    if (issues.length) message += `${issues.map(issue => String(issue.message || "検査項目を確認してください")).join("／")}。`;
    if (!Number.isFinite(deadline) || !Number.isFinite(clock)) message += "締切を確認できません。";
    else if (nearDeadline) message += "締切済み、または締切までの余裕が不足しています。";
    message += "保存原稿の確認用です。公開前に最新情報の再確認が必要です。";
    return { message, canPublish: false, automaticPublicationEnabled: false };
  }

  async function loadLatest({ date, fetchImpl = root.fetch.bind(root), cryptoImpl = root.crypto } = {}) {
    if (typeof date !== "string" || !/^\d{8}$/.test(date)) throw new Error("原稿の日付を確認してください");
    async function get(url) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404
          ? "この日の保存原稿はまだありません" : `保存原稿を取得できません（HTTP ${response.status}）`);
        return await response.text();
      } finally { clearTimeout(timer); }
    }
    const summary = JSON.parse(await get(`data/predictions/summaries/${date}.json`));
    if (summary.date !== date) throw new Error("保存原稿の日付が一致しません");
    const record = summary.predictions?.[0];
    const info = record?.note?.draftBundle;
    if (info?.status === "save_error") throw new Error("この原稿の照合データは保存に失敗しています");
    if (info?.status !== "saved") throw new Error("最新の選定分には照合データ付き保存原稿がまだありません");
    const key = `${date}-${record.jcd}-${record.raceNo}`;
    if (record.raceKey !== key || !/^(0[1-9]|1\d|2[0-4])$/.test(String(record.jcd)) ||
        !Number.isInteger(record.raceNo) || record.raceNo < 1 || record.raceNo > 12 ||
        !/^[a-f0-9]{64}$/.test(info.sha256) ||
        info.path !== `data/note-drafts/${date}/${key}-${info.sha256}.json`) {
      throw new Error("保存原稿の参照情報が一致しません");
    }
    const bytes = await get(info.path);
    if (!cryptoImpl?.subtle) throw new Error("保存原稿の整合性を確認できません");
    const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(bytes));
    const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    if (hash !== info.sha256) throw new Error("保存原稿の内容が保存時と一致しません");
    const bundle = JSON.parse(bytes);
    if (bundle.version !== "note-draft-bundle-v1" || bundle.record?.raceKey !== key ||
        bundle.record?.date !== date || bundle.record?.jcd !== record.jcd ||
        bundle.record?.raceNo !== record.raceNo || bundle.article?.publishable !== true ||
        typeof bundle.article.title !== "string" || typeof bundle.article.fullText !== "string" ||
        !bundle.article.fullText.trim()) throw new Error("保存原稿の形式が不正です");
    return { bundle, article: bundle.article, record: bundle.record, review: reviewStatus(bundle) };
  }

  return { loadLatest, reviewStatus };
});
