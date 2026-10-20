(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) {
    root.ChappyDevelopmentApproval = api;
    const install = () => api.install(root);
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", install, { once: true });
    else install();
  }
})(typeof window === "undefined" ? null : window, function () {
  "use strict";
  const REPOSITORY = "takechanman12250711-oss/chappy-boatrace-ai";
  const PANEL_ID = "developmentApprovalPanel";
  const HEAD_PATTERN = /^[a-f0-9]{40}$/i;
  const QUERY_PR = "developmentPr", QUERY_HEAD = "developmentHead";

  function target(pr, head) {
    const number = String(pr ?? "").trim(), sha = String(head ?? "").trim();
    if (!/^[1-9]\d{0,8}$/.test(number) || !HEAD_PATTERN.test(sha)) return null;
    return Object.freeze({ pr: Number(number), head: sha.toLowerCase() });
  }

  function queryTarget(href) {
    try {
      const params = new URL(href).searchParams;
      const requested = params.has(QUERY_PR) || params.has(QUERY_HEAD);
      const pr = params.get(QUERY_PR) || "", head = params.get(QUERY_HEAD) || "";
      return { requested, target: params.getAll(QUERY_PR).length === 1 && params.getAll(QUERY_HEAD).length === 1 ? target(pr, head) : null };
    } catch { return { requested: false, target: null }; }
  }

  function shareUrl(href, selected) {
    if (!selected || !target(selected.pr, selected.head)) return null;
    try {
      const url = new URL(href);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      url.search = "";
      url.searchParams.set(QUERY_PR, selected.pr);
      url.searchParams.set(QUERY_HEAD, selected.head);
      url.hash = "resultSection";
      return url.toString();
    } catch { return null; }
  }

  function pullUrl(selected) { return `https://github.com/${REPOSITORY}/pull/${selected.pr}`; }
  function apiUrl(selected) { return `https://api.github.com/repos/${REPOSITORY}/pulls/${selected.pr}`; }

  function validatePullRequest(data, selected) {
    if (!selected || !target(selected.pr, selected.head)) throw Error("PR番号と40桁の固定head SHAを指定してください。");
    if (data?.number !== selected.pr || data?.html_url !== pullUrl(selected) || data?.url !== apiUrl(selected) ||
        data?.base?.repo?.full_name !== REPOSITORY || data?.head?.repo?.full_name !== REPOSITORY) {
      throw Error("対象リポジトリ・PR番号を確認できません。");
    }
    if (data.base.ref !== "main" || !HEAD_PATTERN.test(data.base.sha || "")) throw Error("baseがmainのPRとして確認できません。");
    if (data?.head?.sha !== selected.head) throw Error("headが固定値と一致しません。新しい対象を確認してください。");
    if (data.state !== "open" || data.merged === true) throw Error("このPRはopenの確認対象ではありません。GitHubで状態を確認してください。");
    return {
      pr: selected.pr, head: selected.head, main: data.base.sha, url: pullUrl(selected),
      title: typeof data.title === "string" ? data.title.slice(0, 300) : "タイトル未取得",
      body: typeof data.body === "string" ? data.body.slice(0, 12000) + (data.body.length > 12000 ? "\n…続きはGitHubで確認してください。" : "") : "PRの説明はありません。",
      state: `open / ${data.draft === true ? "Draft" : data.draft === false ? "通常PR" : "Draft状態未取得"}（CI・レビューはGitHubで確認）`
    };
  }

  // The only request is an explicit user's check. No stored approval or merge action.
  function createController(view, environment) {
    let generation = 0, verified = null, cancelRequest = null;
    const schedule = environment.setTimeout || setTimeout, unschedule = environment.clearTimeout || clearTimeout;
    const current = () => target(...view.values());
    const same = selected => selected && current()?.pr === selected.pr && current()?.head === selected.head;
    function invalidate(message = "対象未確認。PR番号と固定headを指定し、照合してください。") {
      generation += 1;
      cancelRequest?.(); cancelRequest = null; verified = null;
      view.clear(message);
    }
    async function check() {
      invalidate();
      const selected = current();
      if (!selected) { view.clear("PR番号と40桁の固定head SHAを指定してください。"); return false; }
      const token = generation;
      const aborter = environment.AbortController ? new environment.AbortController() : null;
      let timer;
      view.pending();
      try {
        const deadline = new Promise((_, reject) => {
          cancelRequest = () => { aborter?.abort(); reject(Error("照合を中断しました。")); };
          timer = schedule(() => {
            aborter?.abort(); reject(Error("照合が12秒以内に完了しませんでした。再度照合してください。"));
          }, 12000);
        });
        const request = async () => {
          const response = await environment.fetch(apiUrl(selected), {
            method: "GET", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
            headers: { Accept: "application/vnd.github+json" }, ...(aborter ? { signal: aborter.signal } : {})
          });
          if (!response.ok) throw Error("GitHubから取得できません。時間をおいて再度照合してください。");
          return response.json();
        };
        const data = await Promise.race([request(), deadline]);
        if (token !== generation || !same(selected) || !view.isOpen()) return false;
        const result = validatePullRequest(data, selected);
        verified = selected;
        view.show(result, shareUrl(environment.href(), selected), new Date().toISOString());
        return true;
      } catch (error) {
        if (token === generation && same(selected) && view.isOpen()) {
          verified = null;
          view.clear(error?.message || "照合に失敗しました。GitHubで確認してください。");
        }
        return false;
      } finally {
        unschedule(timer);
        if (token === generation) cancelRequest = null;
      }
    }
    function canOpen() {
      if (verified && same(verified) && view.isOpen()) return true;
      invalidate("入力または表示状態が変わりました。対象PRを再照合してください。");
      return false;
    }
    return Object.freeze({ check, invalidate, canOpen });
  }

  function initialize(panel, win, initial) {
    const doc = win.document;
    const el = (tag, text, className) => {
      const node = doc.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    if (!doc.getElementById("developmentApprovalStyle")) {
      const css = el("link"); css.id = "developmentApprovalStyle"; css.rel = "stylesheet";
      css.href = "css/development-approval.css?v=20261020-1"; doc.head.appendChild(css);
    }
    const body = panel.querySelector("[data-development-approval-body]");
    body.appendChild(el("h3", "開発変更の確認"));
    body.appendChild(el("p", "図で手順を確認し、対象PRの説明・差分・検査結果をGitHubで確認してください。", "development-approval-note"));
    const flow = el("ol", "", "development-approval-flow");
    for (const [title, detail] of [
      ["変更内容を確認", "対象PRと固定headを照合"],
      ["検査・独立レビューを確認", "具体的な結果は対象PRで確認"],
      ["本人がGitHubで判断", "Merge / ConfirmはGitHubの本人操作"],
      ["main反映を確認", "承認・merge・反映は別の状態"]
    ]) { const step = el("li"); step.append(el("strong", title), el("span", detail)); flow.appendChild(step); }
    flow.setAttribute("aria-label", "開発変更の確認手順"); body.appendChild(flow);
    const form = el("form", "", "development-approval-form");
    function input(label, id, placeholder) {
      const holder = el("label", label); holder.htmlFor = id;
      const field = el("input"); field.id = id; field.type = "text"; field.placeholder = placeholder;
      field.autocomplete = "off"; field.spellcheck = false; holder.appendChild(field); form.appendChild(holder); return field;
    }
    const pr = input("PR番号", "developmentApprovalPr", "例: 1234"); pr.inputMode = "numeric"; pr.maxLength = 9;
    const head = input("固定head SHA（40桁）", "developmentApprovalHead", "40桁のcommit SHA"); head.maxLength = 40;
    if (initial) { pr.value = String(initial.pr); head.value = initial.head; }
    const check = el("button", "対象PRを照合"); check.type = "submit"; form.appendChild(check); body.appendChild(form);
    const status = el("p", "", "development-approval-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); body.appendChild(status);
    const info = el("dl", "", "development-approval-info"), fields = {};
    for (const [key, label] of [["repository", "対象リポジトリ"], ["pr", "対象PR"], ["title", "変更名"], ["base", "baseブランチ"], ["main", "base SHA（PR情報）"], ["head", "固定head SHA"], ["state", "状態"]]) {
      fields[key] = el("dd"); fields[key].dataset.field = key; info.append(el("dt", label), fields[key]);
    }
    body.appendChild(info);
    const description = el("details", "", "development-approval-description");
    description.appendChild(el("summary", "変更内容・検査結果（PRの説明）"));
    const explanation = el("pre"); description.appendChild(explanation); body.appendChild(description);
    const link = el("a", "このPRをGitHubで確認", "development-approval-action");
    link.target = "_blank"; link.rel = "noopener noreferrer"; body.appendChild(link);
    const share = el("a", "この対象の共有リンク", "development-approval-share"); body.appendChild(share);
    body.appendChild(el("p", "これは照合時点の表示です。Draft・CI・レビュー状態と最新headをGitHubで確認してください。実際の承認・Merge / ConfirmはGitHubの本人操作です。ここでのクリックを承認済みとして保存しません。", "development-approval-note"));
    function disable(anchor) { anchor.removeAttribute("href"); anchor.setAttribute("aria-disabled", "true"); anchor.tabIndex = -1; }
    function enable(anchor, href) { anchor.href = href; anchor.setAttribute("aria-disabled", "false"); anchor.tabIndex = 0; }
    const view = {
      values: () => [pr.value, head.value], isOpen: () => panel.open,
      clear(message) {
        disable(link); disable(share); check.disabled = false; status.textContent = message;
        for (const value of Object.values(fields)) value.textContent = "未確認";
        fields.repository.textContent = REPOSITORY; fields.base.textContent = "main（未照合）";
        explanation.textContent = "照合後に表示します。";
      },
      pending() { check.disabled = true; status.textContent = "対象PRをGitHubへ照合中…"; },
      show(result, shared, at) {
        check.disabled = false;
        for (const key of ["title", "main", "head", "state"]) fields[key].textContent = result[key];
        fields.pr.textContent = `#${result.pr}`; fields.base.textContent = "main";
        explanation.textContent = result.body;
        status.textContent = `対象一致（照合時刻 ${at}）。承認・CI合格・レビュー済みを示すものではありません。`;
        enable(link, result.url); if (shared) enable(share, shared);
      }
    };
    const controller = createController(view, { fetch: (...args) => win.fetch(...args), AbortController: win.AbortController, href: () => win.location.href });
    controller.invalidate(initial === null ? "共有リンクの対象が不正です。PR番号と固定headを確認してください。" : undefined);
    form.addEventListener("submit", event => { event.preventDefault(); void controller.check(); });
    for (const field of [pr, head]) field.addEventListener("input", () => controller.invalidate("入力が変わりました。対象PRを再照合してください。"));
    for (const anchor of [link, share]) anchor.addEventListener("click", event => { if (!controller.canOpen()) event.preventDefault(); });
    return controller;
  }

  function install(win) {
    const panel = win.document.getElementById(PANEL_ID);
    if (!panel || panel.dataset.developmentBound) return;
    panel.dataset.developmentBound = "true";
    const supplied = queryTarget(win.location.href);
    let controller = null;
    function toggle() {
      if (panel.open && !controller) controller = initialize(panel, win, supplied.requested ? supplied.target : undefined);
      else if (!panel.open) controller?.invalidate("対象未確認。開き直した後に再照合してください。");
    }
    panel.addEventListener("toggle", toggle);
    if (supplied.requested) {
      // The nav's capture listener waits for stats downloads. Its existing view API
      // makes this card reachable even when those unrelated downloads fail.
      if (typeof win.ChappyHomeDashboardV2?.setView === "function") win.ChappyHomeDashboardV2.setView("result");
      else win.document.querySelector('.bottom-nav-item[data-view="result"]')?.click();
      panel.open = true; toggle();
      panel.scrollIntoView?.({ block: "start" });
    } else if (panel.open) toggle();
  }

  return Object.freeze({ REPOSITORY, target, queryTarget, shareUrl, validatePullRequest, createController, install });
});
