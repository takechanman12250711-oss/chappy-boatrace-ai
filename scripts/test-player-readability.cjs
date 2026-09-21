const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('css/final-readability-fix.css', 'utf8');
const fix = css.split('/* 20260921:')[1];
assert(fix, 'readability overrides required');
function block(selector) {
  const start = fix.indexOf(selector + ' {');
  assert(start >= 0, selector);
  return fix.slice(start, fix.indexOf('}', start));
}
const scope = 'body.chappy-final-mobile-ui #predictionSection #resultArea ';
const names = block(scope + ':is(.v3-paper-player-line strong,.v3-paper-name,.v3-entry-player strong,.v3-entry-name strong)');
for (const rule of ['color:#f7fbff!important', 'white-space:normal!important', 'overflow-wrap:anywhere!important', 'overflow:visible!important']) assert(names.includes(rule), rule);
const panel = block(scope + '.v3-boat-tab-panel');
assert(panel.includes('max-height:none!important'));
assert(panel.includes('overflow:visible!important'));
assert(block(scope + '.v3-boat-tab-buttons').includes('position:static!important'));
assert(block(scope + '.v3-paper-head').includes('flex-wrap:wrap!important'));
assert(!/display\s*:/.test(fix), 'must not override tab/disclosure visibility');
function luminance(hex) {
  const rgb = hex.match(/\w\w/g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
for (const [fg, bg] of [['f7fbff','20394d'], ['d5e3ed','20394d'], ['a9dcff','20394d'], ['f7fbff','2b4b62']]) {
  const ratio = (luminance(fg) + .05) / (luminance(bg) + .05);
  assert(ratio >= 4.5, `${fg}/${bg} contrast ${ratio}`);
}
const loader = fs.readFileSync('js/result-void-compat.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
assert(/final-readability-fix\.css[^`]*readability=20260921-1/.test(loader));
assert(/result-void-compat\.js[^" ]*readability=20260921-1/.test(index));
console.log('PASS: name wrapping, unclipped panels, text contrast, visibility preservation and cache chain');
