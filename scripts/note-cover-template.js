'use strict';

// Display copy only: read the audited saved article, never run a prediction.
function coverLines(article) {
  if (/^【購入見送り】/.test(article?.paidText || '')) return ['購入見送り。', '参考予想を掲載。'];
  const summary = String(article?.rangeSummary || '');
  const scenario = summary.match(/^最有力展開は([1-6]コース(?:まくり差し|まくり|差し|逃げ|攻め)|イン逃げ|[1-6]カド攻め)。/);
  const main = article?.allRangeGroups?.find(group => group.key === 'main');
  const head = String(main?.reason || '').match(/^本命は([1-6])号艇。/);
  const first = scenario ? `${scenario[1]}が軸。` : head ? `本命は${head[1]}号艇。` : '展開を読む。';
  const hold = summary.match(/2着残しは([1-6](?:・[1-6]){0,4})号艇/);
  const second = hold ? `残しは${hold[1]}号艇。` : '残し・拾いに注目。';
  return [first, second];
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

function raceCoverHtml(info, background, font) {
  const { SERIES, requireSeries } = require('./note-article-series');
  const series = SERIES[requireSeries(info.articleSeries)];
  if (!/^\d{8}$/.test(info.date || '') || !/^[一-龠ぁ-ゖァ-ヺー]{1,10}$/u.test(info.place || '') ||
      !Number.isInteger(info.raceNo) || info.raceNo < 1 || info.raceNo > 12 || !/^\d{2}:\d{2}$/.test(info.deadline || '')) {
    throw new Error('note_cover_race_identity_invalid');
  }
  const race = `${Number(info.date.slice(4,6))}月${Number(info.date.slice(6,8))}日 ${info.place}${info.raceNo}R`;
  // Keep the approved complete illustration visible. Race identity uses only
  // the lower-left water area; no giant text is painted over the new artwork.
  return artworkHtml([race, `締切 ${info.deadline}`], background, font, 'ChappyRound', series.label);

}

function coverHtml(lines, background, font) {
  if (!Array.isArray(lines) || lines.length !== 2 || lines.some(line => typeof line !== 'string' || line.length > 30)) {
    throw new Error('note_cover_copy_invalid');
  }
  return artworkHtml(lines, background, font, 'ChappyHand', '通常予想');
}

function artworkHtml(lines, background, font, family, label) {
  const text = lines.map((line, i) => `<g data-cover-slot data-x="32" data-y="${i ? 850 : 802}" data-width="630" data-height="40"><text x="32" y="${i ? 888 : 840}" font-size="38">${escapeXml(line)}</text></g>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(label)}</title><style>
    @font-face{font-family:${family};src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');font-weight:${family === 'ChappyRound' ? 700 : 400}}
    *{box-sizing:border-box}html,body{margin:0;width:1734px;height:907px;overflow:hidden;background:#fbf7ed}
    img,svg{position:absolute;inset:0;width:1734px;height:907px}text{font-family:${family};font-weight:${family === 'ChappyRound' ? 700 : 400};fill:#123a60}
  </style></head><body><img alt="${escapeXml(label)}" src="data:image/jpeg;base64,${background.toString('base64')}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1734 907">
    <rect x="16" y="795" width="672" height="104" rx="18" fill="#fffaf0" fill-opacity=".97" stroke="#123a60" stroke-width="3"/>
    ${text}
  </svg></body></html>`;
}

// Use a cookie-free context in the already connected browser. All assets are
// embedded, so rendering performs no external request and needs no paid API.
async function renderCover(browser, template) {
  const context = await browser.newContext({ viewport: { width: 1734, height: 907 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    // Allow only the embedded data: image/font. The remote CDP route handler
    // otherwise treats those resources differently from local Chromium and can
    // prevent the load event from ever completing.
    await page.route(/^https?:\/\//, route => route.abort());
    await page.setContent(template.html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(async ({ family, series }) => {
      const fontSpec = `${series ? '700 ' : ''}164px ${family}`;
      const loadedFonts = await document.fonts.load(fontSpec);
      await document.fonts.ready;
      if (!loadedFonts.length || !document.fonts.check(fontSpec)) throw new Error('note_cover_font_not_loaded');
      await Promise.all([...document.images].map(async image => {
        if (!image.complete) {
          await new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', () => reject(new Error('note_cover_image_not_loaded')), { once: true });
          });
        }
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error('note_cover_image_not_loaded');
      }));
      // Fit the measured text bounds into the small artwork-safe identity slots.
      for (const group of document.querySelectorAll('[data-cover-slot]')) {
        const slot = { x: Number(group.dataset.x), y: Number(group.dataset.y), width: Number(group.dataset.width), height: Number(group.dataset.height) };
        const box = group.getBBox();
        if (box.width <= 0 || box.height <= 0) throw new Error('note_cover_text_empty');
        const scale = Math.min(1, slot.width / box.width, slot.height / box.height);
        group.setAttribute('transform', `translate(${slot.x} ${slot.y}) scale(${scale}) translate(${-box.x} ${-box.y})`);
      }
      for (const text of document.querySelectorAll('svg text')) {
        const box = text.getBoundingClientRect();
        if (box.width <= 0 || box.left < 30 || box.right > 665 || box.top < 800 || box.bottom > 892) {
          throw new Error('note_cover_text_overflow_' + JSON.stringify({left:box.left,right:box.right,top:box.top,bottom:box.bottom}));
        }
      }
      // Let the browser paint the decoded assets and fitted SVG before capture.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { family: template.layout === 'series-v1' ? 'ChappyRound' : 'ChappyHand', series: template.layout === 'series-v1' });
    const buffer = await page.screenshot({ type: 'jpeg', quality: 90, timeout: 15000 });
    if (buffer.length < 1000 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('note_cover_render_invalid');
    return { name: 'chappy-cover.jpg', mimeType: 'image/jpeg', buffer };
  } finally {
    await context.close();
  }
}

module.exports = { coverLines, coverHtml, raceCoverHtml, renderCover };
