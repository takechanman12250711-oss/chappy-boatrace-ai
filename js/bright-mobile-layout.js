/* Approved 2026-10-07 presentation. No prediction, ticket or odds decisions. */
(function(root) {
  'use strict';
  const BUILD = '20261007-bright-mobile1';
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const esc = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const short = value => text(value).split(/(?<=。)/).slice(0, 2).join('').slice(0, 180);
  function time(value) {
    const source = text(value);
    if (!source) return '確認中';
    if (/^\d{1,2}:\d{2}$/.test(source)) return source;
    const date = new Date(source);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo', month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date) : '確認中';
  }
  function summaryData(pred) {
    const race = pred.race || pred.raceInfo || {};
    const conditions = pred.preRaceConditions || pred.conditions || pred.predictionConditions || {};
    const flow = pred.raceFlow || {};
    return {
      title: [text(race.place || race.stadiumName || pred.venueName || pred.venue?.name), text(race.raceNo || race.rno || pred.raceNo).replace(/R$/,'')].filter(Boolean).join(' ') + (race.raceNo || race.rno || pred.raceNo ? 'R' : ''),
      date: text(race.date || pred.date).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1/$2/$3'),
      deadline: time(race.deadlineAt || race.deadline || race.raceInfo?.deadline || pred.deadlineAt),
      fetched: time(conditions.sourceFetchedAt || pred.sourceFetchedAt || pred.fetchedAt || race.raw?.fetchedAt),
      flow: short(flow.comment || flow.summary || flow.text || pred.finalAi?.flow || flow.title),
      warning: short(pred.finalAi?.risk || pred.finalAi?.warning || pred.finalAi?.caution),
      availability: conditions.dataAvailability || null
    };
  }
  function introHtml(pred) {
    const data = summaryData(pred);
    const a = data.availability;
    const exhibition = a ? `展示 ${Number(a.exhibitionTime)||0}/6艇・公式進入 ${Number(a.officialCourses)||0}/6艇` : '展示・進入の取得状況は詳細で確認';
    return `<header class="chappy-bright-race-intro"><a href="#raceSection" data-view="race" class="chappy-back-races">‹ レースへ</a><h2>${esc(data.title || '選択したレース')}</h2><div class="chappy-bright-race-meta"><strong>締切 ${esc(data.deadline)}</strong><span>${esc(data.date)}</span></div><p class="chappy-data-freshness">参照データ取得 ${esc(data.fetched)}<br>${esc(exhibition)}</p></header><section class="chappy-flow-preview"><h3>展開の要点</h3><p>${esc(data.flow || '展開説明は未取得です。詳しい根拠で取得状況を確認できます。')}</p>${data.warning ? `<p class="chappy-flow-warning">注意：${esc(data.warning)}</p>` : ''}<a href="#chappy-readable-evidence" class="chappy-open-evidence">詳しい根拠を見る ›</a></section>`;
  }
  let latest = null, pending = false, currentAreaRoot = null, presentationRoot = null, introPrediction = null;
  function organize(pred) {
    const area = root.document?.getElementById('resultArea');
    const layout = area?.querySelector('.v3-root');
    if (!layout || !pred) return;
    if (currentAreaRoot !== layout) {
      currentAreaRoot = layout;
      const intro = root.document.createElement('div');
      intro.className = 'chappy-bright-intro';
      intro.innerHTML = introHtml(pred);
      layout.prepend(intro);
      introPrediction = pred;
    } else if (introPrediction !== pred) {
      layout.querySelector('.chappy-bright-intro').innerHTML = introHtml(pred);
      introPrediction = pred;
    }
    let evidence = layout.querySelector(':scope > .chappy-readable-evidence');
    if (!evidence) {
      evidence = root.document.createElement('details');
      evidence.id = 'chappy-readable-evidence';
      evidence.className = 'chappy-readable-evidence';
      evidence.innerHTML = '<summary>出走表・艇別評価・詳しい根拠</summary><div class="chappy-readable-evidence-body"></div>';
      layout.appendChild(evidence);
    }
    const detailBody = evidence.querySelector('.chappy-readable-evidence-body');
    let summary = area.querySelector('.chappy-final-buy-summary');
    if (!summary) {
      summary = root.document.createElement('section');
      summary.className = 'chappy-final-buy-summary';
      summary.dataset.compactTickets = '1';
      summary.innerHTML = '<div class="chappy-final-buy-head"><h3>買い目</h3></div>';
      layout.insertBefore(summary, evidence);
    }
    if (summary && summary.parentNode !== layout) layout.insertBefore(summary, evidence);
    const manshu = area.querySelector('.v3-manshu-newspaper');
    if (summary) {
      for (const [key, label] of [['main','本命'],['cover','押さえ'],['flow','流し（フォーメーション）']]) {
        if (!summary.querySelector(`.is-${key}`)) {
          const empty = root.document.createElement('details');
          empty.className = `chappy-final-buy-group is-${key}`;
          empty.innerHTML = `<summary><span class="chappy-final-buy-label">${label}</span><span class="chappy-final-buy-meta">0点</span></summary><p class="chappy-category-note">この区分の買い目はありません。</p>`;
          const following = key === 'main' ? summary.querySelector('.is-cover,.is-flow,.is-manshu') : key === 'cover' ? summary.querySelector('.is-flow,.is-manshu') : summary.querySelector('.is-manshu');
          summary.insertBefore(empty, following || null);
        }
      }
    }
    if (summary && manshu) {
      let group = summary.querySelector('.chappy-bright-manshu');
      if (!group) {
        group = root.document.createElement('details');
        group.className = 'chappy-final-buy-group is-manshu chappy-bright-manshu';
        group.innerHTML = '<summary><span class="chappy-final-buy-label">万舟</span><span class="chappy-final-buy-meta">0点</span></summary><div class="chappy-manshu-content"></div>';
        summary.appendChild(group);
      }
      const body = group.querySelector('.chappy-manshu-content');
      if (manshu.parentNode !== body) body.appendChild(manshu);
    }
    if (summary && root.ChappyTicketOddsVisibility?.expandNotation) {
      const exacts = group => new Set([...group.querySelectorAll('.chappy-final-buy-formation,.chappy-true-manshu-line strong')].flatMap(node => root.ChappyTicketOddsVisibility.expandNotation(node.textContent)));
      const allTickets = new Set();
      summary.querySelectorAll(':scope > .chappy-final-buy-group:not(.is-practical-fallback)').forEach(group => {
        const tickets = exacts(group);
        tickets.forEach(ticket => allTickets.add(ticket));
        if (group.classList.contains('is-manshu')) {
          const badge = group.querySelector('.chappy-final-buy-meta');
          if (badge && badge.textContent !== `${tickets.size}点`) badge.textContent = `${tickets.size}点`;
        }
      });
      let total = summary.querySelector('.chappy-final-buy-total');
      if (!total) { total = root.document.createElement('span');total.className = 'chappy-final-buy-total';summary.querySelector('.chappy-final-buy-head')?.appendChild(total); }
      if (total.textContent !== `${allTickets.size}点`) total.textContent = `${allTickets.size}点`;
    }
    const practical = area.querySelector('.chappy-practical-visible-panel');
    const resultStatus = area.querySelector('#raceResultStatus');
    const practicalAnchor = resultStatus?.parentNode === layout ? resultStatus : evidence;
    if (practical && practical.nextElementSibling !== practicalAnchor) layout.insertBefore(practical, practicalAnchor);
    if (resultStatus && resultStatus.nextElementSibling !== evidence) layout.insertBefore(resultStatus, evidence);
    const retained = new Set([layout.querySelector('.chappy-bright-intro'), summary, practical, resultStatus, evidence]);
    for (const child of [...layout.children]) if (!retained.has(child)) detailBody.appendChild(child);
    // Existing display-only diagnostics are siblings added by optional renderers.
    // Keep them as available evidence rather than ahead of the selected race.
    for (const child of [...area.children]) if (child !== layout && !child.contains(layout)) detailBody.appendChild(child);
    // Display name only. The internal practical category and stored tickets stay intact.
    area.querySelectorAll('.chappy-practical-visible-head strong,.chappy-practical-tag,.is-practical-fallback .chappy-final-buy-label').forEach(node => {
      if (node.textContent.includes('実戦厳選')) node.textContent = node.textContent.replaceAll('実戦厳選', '厳選');
    });
    const intro = layout.querySelector('.chappy-bright-intro');
    const link = intro?.querySelector('.chappy-open-evidence');
    if (link && !link.dataset.bound) { link.dataset.bound = '1'; link.addEventListener('click', openEvidence); }
  }
  function openEvidence(event) {
    event.preventDefault();
    const evidence = root.document.getElementById('chappy-readable-evidence');
    if (evidence) { evidence.open = true; evidence.scrollIntoView({block:'start', behavior:'smooth'}); }
  }
  function schedule() {
    if (pending || !latest) return;
    pending = true;
    root.requestAnimationFrame(() => {
      pending = false;
      if (presentationRoot && presentationRoot === root.document.getElementById('resultArea')?.querySelector('.v3-root')) organize(latest);
    });
  }
  let sessionFilter = 'all';
  function filterVenues() {
    root.document.querySelectorAll('#officialVenueGrid .official-venue-button').forEach(button => {
      button.hidden = sessionFilter !== 'all' && button.dataset.session !== sessionFilter;
    });
  }
  function installFilters() {
    const grid = root.document.getElementById('officialVenueGrid');
    if (!grid || root.document.getElementById('chappy-session-filters')) return;
    const filters = root.document.createElement('div');
    filters.id = 'chappy-session-filters';
    filters.className = 'chappy-session-filters';
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', '開催時間帯で絞り込み');
    filters.innerHTML = [['all','全24場'],['morning','モーニング'],['day','デイ・サマー'],['night','ナイター・深夜']].map(([key,label]) => `<button type="button" data-session-filter="${key}" aria-pressed="${key === 'all'}">${label}</button>`).join('');
    filters.addEventListener('click', event => {
      const button = event.target.closest('[data-session-filter]');
      if (!button) return;
      sessionFilter = button.dataset.sessionFilter;
      filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      filterVenues();
    });
    grid.before(filters);
    const help = root.document.createElement('p');
    help.className = 'chappy-session-help';
    help.textContent = '時間帯／グレードを表示。「通常」は当日の公式時間帯が未確認の場です。';
    grid.after(help);
    new root.MutationObserver(filterVenues).observe(grid, {childList:true});
    filterVenues();
  }
  function install() {
    if (!root.document) return;
    root.document.body?.classList.add('chappy-bright-ui');
    installFilters();
    root.addEventListener('chappy:view-changed', event => {
      const area = root.document.getElementById('resultArea');
      if (event.detail?.view === 'prediction' && area && !area.textContent.trim() && !area.dataset.raceLoading) {
        area.innerHTML = '<div class="prediction-empty-state">レースを選び、「AI予想を見る」を押してください。</div>';
      }
    });
    root.document.addEventListener('click', event => {
      if (!event.target.closest?.('.chappy-back-races')) return;
      event.preventDefault();
      const nav = root.document.querySelector('.bottom-nav-item[data-view="race"]');
      if (nav) nav.click();
      else root.ChappyHomeDashboardV2?.setView?.('race');
    });
    root.addEventListener('chappy:presentation-rendered', event => {
      latest = event.detail;
      presentationRoot = root.document.getElementById('resultArea')?.querySelector('.v3-root');
      schedule();
    });
    const observer = new root.MutationObserver(records => {
      if (records.some(record => record.target === root.document.getElementById('resultArea') || record.target.closest?.('.v3-manshu-newspaper') || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('.chappy-final-buy-summary,.chappy-practical-visible-panel') || node.querySelector?.('.chappy-final-buy-summary'))))) schedule();
    });
    observer.observe(root.document.getElementById('resultArea'), {childList:true,subtree:true});
  }
  root.ChappyBrightMobileLayout = Object.freeze({build:BUILD, summaryData, introHtml, organize});
  install();
})(typeof window !== 'undefined' ? window : globalThis);
