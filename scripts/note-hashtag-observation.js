'use strict';
// Read-only look at the publish settings page: is there a hashtag field, and
// would pressing Enter in it submit a form? Nothing is typed, clicked or
// focused, and no failure here may stop or delay a publication.
function inspectHashtagField() {
  const text = element => element.getAttribute('placeholder') || element.getAttribute('aria-label') || '';
  const fields = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')]
    .filter(element => /ハッシュタグ/.test(text(element)));
  const labels = [...document.querySelectorAll('label,h2,h3,h4,p,span,div')]
    .filter(element => element.children.length === 0 && /^#?ハッシュタグ/.test((element.textContent || '').trim())).length;
  const first = fields[0];
  const form = first ? first.closest('form') : null;
  return {
    fields: fields.length,
    labels,
    tag: first ? first.tagName : null,
    type: first ? first.getAttribute('type') : null,
    role: first ? first.getAttribute('role') : null,
    inForm: Boolean(form),
    formSubmitButtons: form ? form.querySelectorAll('button[type="submit"],button:not([type]),input[type="submit"]').length : 0,
    existingTags: document.querySelectorAll('a[href*="/hashtag/"]').length
  };
}

function boundedReport(info) {
  const number = value => (Number.isInteger(value) && value >= 0 ? Math.min(value, 999) : null);
  const word = value => (typeof value === 'string' ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) : null);
  return { fields: number(info?.fields), labels: number(info?.labels), tag: word(info?.tag), type: word(info?.type),
    role: word(info?.role), inForm: info?.inForm === true, formSubmitButtons: number(info?.formSubmitButtons),
    existingTags: number(info?.existingTags) };
}

async function observeHashtagField(page, log = console.log, timeoutMs = 3000) {
  let timer;
  try {
    const info = await Promise.race([
      page.evaluate(inspectHashtagField),
      new Promise((unused, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })
    ]);
    log(`NOTE_UI_HASHTAG_FIELD=${JSON.stringify(boundedReport(info))}`);
    return true;
  } catch {
    log('NOTE_UI_HASHTAG_FIELD=unavailable');
    return false;
  } finally { clearTimeout(timer); }
}

module.exports = { inspectHashtagField, boundedReport, observeHashtagField };
