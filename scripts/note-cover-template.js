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
  const rows = [[series.brand, 170, 156, 45, 1000],
    [series.label, 198, 282, 68, 780], [race, 170, 410, 108, 940],
    [`締切 ${info.deadline}`, 174, 528, 74, 750]];
  const text = rows.map(([line,x,y,size,width]) => `<g data-series-line data-x="${x}" data-y="${y-size}" data-width="${width}" data-height="${size*1.32}"><text x="${x}" y="${y}" font-size="${size}" fill="${line === series.label ? '#ffffff' : '#123a60'}">${escapeXml(line)}</text></g>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:ChappyRound;src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');font-weight:700}
    *{box-sizing:border-box}html,body{margin:0;width:1734px;height:907px;overflow:hidden;background:#fbf7ed}
    img,svg{position:absolute;inset:0;width:1734px;height:907px}text{font-family:ChappyRound;font-weight:700}
  </style></head><body><img alt="" src="data:image/jpeg;base64,${background.toString('base64')}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1734 907">
    <defs><linearGradient id="light"><stop stop-color="#fffaf0" stop-opacity=".8"/><stop offset="1" stop-color="#fffaf0" stop-opacity="0"/></linearGradient></defs>
    <rect x="95" y="85" width="1040" height="500" rx="38" fill="url(#light)"/>
    <rect x="168" y="204" width="${info.articleSeries === 'normal' ? 400 : 365}" height="103" rx="30" fill="${series.color}"/>
    ${text}${info.sample ? '<text x="170" y="598" font-size="38" fill="#526774">デザイン見本</text>' : ''}
  </svg></body></html>`;
}

function coverHtml(lines, background, font) {
  if (!Array.isArray(lines) || lines.length !== 2 || lines.some(line => typeof line !== 'string' || line.length > 30)) {
    throw new Error('note_cover_copy_invalid');
  }
  const text = lines.map((line, row) => {
    const size = row ? 190 : 220;
    const length = Math.min(row ? 1170 : 1270, [...line].length * 140);
    const x = 45, y = row ? 510 : 265;
    const rotate = [...line].map((_, i) => [0, -2, 1, -1, 2][i % 5]).join(' ');
    const attrs = `x="${x}" y="${y}" font-size="${size}" textLength="${length}" lengthAdjust="spacingAndGlyphs" rotate="${rotate}" paint-order="stroke fill" stroke-linejoin="round"`;
    return `<g data-cover-line="${row}" filter="url(#hand)" transform="rotate(${row ? -1 : 1} ${x} ${y})"><text ${attrs} transform="translate(7 8)" fill="#ffdc48" stroke="#ffdc48" stroke-width="24">${escapeXml(line)}</text><text ${attrs} fill="${row ? '#f33b26' : '#f64a27'}" stroke="#193b7c" stroke-width="18">${escapeXml(line)}</text><text ${attrs} fill="${row ? '#f33b26' : '#fa5529'}" stroke="${row ? '#f33b26' : '#fa5529'}" stroke-width="10">${escapeXml(line)}</text></g>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:ChappyHand;src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');font-weight:400}
    *{box-sizing:border-box}html,body{margin:0;width:1734px;height:907px;overflow:hidden;background:#faf6ed}
    img,svg{position:absolute;inset:0;width:1734px;height:907px}text{font-family:ChappyHand;font-weight:400}
  </style></head><body><img alt="" src="data:image/jpeg;base64,${background.toString('base64')}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1734 907"><defs><filter id="hand" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="9" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter></defs>${text}
    <g fill="none" stroke="#f98a33" stroke-width="6" stroke-linecap="round"><path d="M50 78l-10-24m75 6l4-26m183 38l-8-22M1180 62l17-19M1204 95l27-5"/></g>
    <path d="M780 54l8-23 10 23 23 2-18 15 5 24-20-13-20 13 6-24-18-15z" fill="#ffe053" stroke="#193b7c" stroke-width="4"/>
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
      // Font ascent/descent differs by renderer. Fit actual browser bounds to
      // the two artwork-safe slots, instead of assuming font-size is height.
      for (const group of document.querySelectorAll(series ? '[data-series-line]' : '[data-cover-line]')) {
        const row = Number(group.getAttribute('data-cover-line'));
        const slot = series ? { x: Number(group.dataset.x), y: Number(group.dataset.y), width: Number(group.dataset.width), height: Number(group.dataset.height) }
          : row ? { x: 45, y: 340, width: 1160, height: 205 }
          : { x: 45, y: 65, width: 1270, height: 255 };
        const box = group.getBBox();
        if (box.width <= 0 || box.height <= 0) throw new Error('note_cover_text_empty');
        const scale = Math.min(1, slot.width / box.width, slot.height / box.height);
        group.setAttribute('transform', `translate(${slot.x} ${slot.y}) scale(${scale}) translate(${-box.x} ${-box.y})`);
      }
      for (const text of document.querySelectorAll('svg text')) {
        const box = text.getBoundingClientRect();
        if (box.width <= 0 || box.left < (series ? 160 : 10) || box.right > (series ? 1120 : 1390) || box.top < 10 || box.bottom > (series ? 640 : 570)) {
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
