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
    return `<g filter="url(#hand)" transform="rotate(${row ? -1 : 1} ${x} ${y})"><text ${attrs} transform="translate(7 8)" fill="#ffdc48" stroke="#ffdc48" stroke-width="24">${escapeXml(line)}</text><text ${attrs} fill="${row ? '#f33b26' : '#f64a27'}" stroke="#193b7c" stroke-width="18">${escapeXml(line)}</text><text ${attrs} fill="${row ? '#f33b26' : '#fa5529'}" stroke="${row ? '#f33b26' : '#fa5529'}" stroke-width="10">${escapeXml(line)}</text></g>`;
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
    await page.route('**/*', route => route.abort());
    await page.setContent(template.html, { waitUntil: 'load', timeout: 15000 });
    await page.evaluate(async () => {
      await document.fonts.load('164px ChappyHand');
      await document.fonts.ready;
      if (!document.fonts.check('164px ChappyHand')) throw new Error('note_cover_font_not_loaded');
      await Promise.all([...document.images].map(image => image.decode()));
      for (const text of document.querySelectorAll('svg text')) {
        const box = text.getBoundingClientRect();
        if (box.width <= 0 || box.left < 10 || box.right > 1390 || box.top < 10 || box.bottom > 570) {
          throw new Error('note_cover_text_overflow');
        }
      }
    });
    const buffer = await page.screenshot({ type: 'jpeg', quality: 90, timeout: 15000 });
    if (buffer.length < 1000 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('note_cover_render_invalid');
    return { name: 'chappy-cover.jpg', mimeType: 'image/jpeg', buffer };
  } finally {
    await context.close();
  }
}

module.exports = { coverLines, coverHtml, renderCover };
