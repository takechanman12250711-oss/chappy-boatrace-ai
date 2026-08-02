(function (root) {
  "use strict";

  if (root.ChappyResultUiPhase5) return;

  const state = {
    observer: null,
    sectionObserver: null,
    enhanced: new WeakSet()
  };

  const NAV_ITEMS = [
    { key: "summary", label: "概要", words: ["成績", "回収率", "的中率", "購入", "払戻", "収支"] },
    { key: "recent", label: "最近", words: ["最近", "直近", "30", "履歴"] },
    { key: "venue", label: "場別", words: ["場別", "会場", "開催場", "強い場", "弱い場"] },
    { key: "detail", label: "詳細", words: ["検証", "分析", "明細", "レース別", "記録"] }
  ];

  function ensureStyle() {
    if (document.getElementById("resultUiPhase5Style")) return;
    const style = document.createElement("style");
    style.id = "resultUiPhase5Style";
    style.textContent = `
      .result-phase5-nav{position:sticky;top:8px;z-index:18;display:flex;gap:8px;overflow-x:auto;margin:0 0 14px;padding:8px;background:rgba(255,255,255,.94);border:1px solid #dbe6f4;border-radius:15px;box-shadow:0 8px 24px rgba(24,55,91,.10);backdrop-filter:blur(12px);-webkit-overflow-scrolling:touch}
      .result-phase5-nav button{flex:0 0 auto;border:1px solid #d6e2ef;background:#fff;color:#486078;border-radius:999px;padding:9px 14px;font-weight:800;font-size:.82rem}
      .result-phase5-nav button.is-active{background:#0878f9;border-color:#0878f9;color:#fff;box-shadow:0 5px 13px rgba(8,120,249,.22)}
      #statsArea.result-phase5-ready{display:grid;gap:14px}
      #statsArea .result-phase5-anchor{scroll-margin-top:88px}
      #statsArea .result-phase5-card{border-radius:17px!important;border:1px solid #dfe8f2!important;background:#fff!important;box-shadow:0 6px 18px rgba(31,62,96,.07)!important;overflow:hidden}
      #statsArea .result-phase5-card>h2,#statsArea .result-phase5-card>h3,#statsArea .result-phase5-card>h4{margin-top:0}
      #statsArea .result-phase5-collapsible>.result-phase5-toggle{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;border:0;background:#f7fbff;color:#17324d;padding:13px 14px;font-weight:900;text-align:left}
      #statsArea .result-phase5-collapsible>.result-phase5-toggle::after{content:"⌄";color:#0878f9;font-size:1rem;transition:transform .2s ease}
      #statsArea .result-phase5-collapsible.is-collapsed>.result-phase5-toggle::after{transform:rotate(-90deg)}
      #statsArea .result-phase5-collapsible.is-collapsed>.result-phase5-body{display:none}
      #statsArea .result-phase5-body{padding:12px}
      #statsArea table{width:100%;border-collapse:separate;border-spacing:0;font-size:.82rem}
      #statsArea th{position:sticky;top:58px;background:#f1f7fd;z-index:2;white-space:nowrap}
      #statsArea th,#statsArea td{padding:10px 8px;border-bottom:1px solid #e8eef5;text-align:left}
      #statsArea .stats-grid,#statsArea .result-summary-grid,#statsArea .result-dashboard-grid{gap:10px!important}
      #statsArea .stats-card,#statsArea .summary-card,#statsArea .metric-card{border-radius:14px!important;padding:13px!important;min-width:0}
      #statsArea .stats-card strong,#statsArea .summary-card strong,#statsArea .metric-card strong{font-size:1.2rem}
      @media(max-width:640px){
        .result-phase5-nav{top:4px;margin-left:-4px;margin-right:-4px;padding:7px}
        .result-phase5-nav button{padding:8px 12px;font-size:.78rem}
        #statsArea table{display:block;overflow-x:auto;white-space:nowrap}
        #statsArea th{top:54px}
        #statsArea .stats-grid,#statsArea .result-summary-grid,#statsArea .result-dashboard-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        #statsArea .result-phase5-body{padding:10px}
      }
      @media(max-width:390px){#statsArea .stats-grid,#statsArea .result-summary-grid,#statsArea .result-dashboard-grid{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function textOf(element) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function sectionCandidates(area) {
    const direct = [...area.children].filter(node => node.nodeType === 1);
    if (direct.length >= 2) return direct;
    return [...area.querySelectorAll(":scope > div, :scope > section, :scope > article")];
  }

  function keyFor(element, index) {
    const text = textOf(element).slice(0, 240);
    const found = NAV_ITEMS.find(item => item.words.some(word => text.includes(word)));
    return found?.key || (index === 0 ? "summary" : index === 1 ? "recent" : index === 2 ? "venue" : "detail");
  }

  function labelFor(key) {
    return NAV_ITEMS.find(item => item.key === key)?.label || "詳細";
  }

  function wrapCollapsible(element, key, index) {
    if (state.enhanced.has(element)) return;
    state.enhanced.add(element);
    element.classList.add("result-phase5-card", "result-phase5-anchor");
    element.dataset.resultPhase5Key = key;
    element.id = element.id || `resultPhase5-${key}-${index}`;

    const heading = element.querySelector(":scope > h2, :scope > h3, :scope > h4");
    if (heading || index === 0) return;

    const body = document.createElement("div");
    body.className = "result-phase5-body";
    while (element.firstChild) body.appendChild(element.firstChild);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-phase5-toggle";
    button.textContent = labelFor(key);
    button.setAttribute("aria-expanded", "true");
    button.addEventListener("click", () => {
      const collapsed = element.classList.toggle("is-collapsed");
      button.setAttribute("aria-expanded", String(!collapsed));
    });

    element.classList.add("result-phase5-collapsible");
    element.append(button, body);
  }

  function installNav(area, sections) {
    let nav = document.getElementById("resultPhase5Nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "resultPhase5Nav";
      nav.className = "result-phase5-nav";
      nav.setAttribute("aria-label", "結果分析内ナビ");
      area.parentElement?.insertBefore(nav, area);
    }

    const groups = [];
    sections.forEach((section, index) => {
      const key = keyFor(section, index);
      wrapCollapsible(section, key, index);
      if (!groups.some(group => group.key === key)) groups.push({ key, section });
    });

    nav.innerHTML = groups.map((group, index) => `<button type="button" data-result-target="${group.section.id}" class="${index === 0 ? "is-active" : ""}">${labelFor(group.key)}</button>`).join("");
    nav.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => {
        document.getElementById(button.dataset.resultTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    state.sectionObserver?.disconnect();
    state.sectionObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      nav.querySelectorAll("button").forEach(button => button.classList.toggle("is-active", button.dataset.resultTarget === visible.target.id));
    }, { rootMargin: "-90px 0px -55% 0px", threshold: [0.05, 0.25, 0.6] });
    groups.forEach(group => state.sectionObserver.observe(group.section));
  }

  function enhance() {
    ensureStyle();
    const area = document.getElementById("statsArea");
    if (!area || !area.children.length) return;
    const sections = sectionCandidates(area);
    if (!sections.length) return;
    area.classList.add("result-phase5-ready");
    installNav(area, sections);
  }

  function install() {
    ensureStyle();
    const area = document.getElementById("statsArea");
    if (!area) return;
    state.observer?.disconnect();
    state.observer = new MutationObserver(() => root.requestAnimationFrame(enhance));
    state.observer.observe(area, { childList: true, subtree: true });
    enhance();
  }

  root.addEventListener("chappy:stats-runtime-ready", install);
  root.addEventListener("chappy:stats-requested", install);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();

  root.ChappyResultUiPhase5 = Object.freeze({ install, enhance });
})(window);
