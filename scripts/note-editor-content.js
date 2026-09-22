'use strict';

// note renders empty paragraphs as extra newlines in innerText. Ignore only
// empty display lines, CRLF and HTML's non-breaking space representation.
// Keep every non-empty line, its order, indentation, numbers and punctuation.
function contentLines(value) {
  return String(value || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
    .split('\n').filter(line => line.trim().length > 0);
}

function compareEditorContent(actual, expected) {
  const actualLines = contentLines(actual), expectedLines = contentLines(expected);
  const equal = expectedLines.length > 0 && JSON.stringify(actualLines) === JSON.stringify(expectedLines);
  return { equal, actualLines: actualLines.length, expectedLines: expectedLines.length };
}

async function readEditorContent(locator) {
  return locator.evaluate(el => {
    // textarea.innerText is empty even when its value contains the full draft.
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value;
    if (el.isContentEditable) return el.innerText;
    throw new Error('note_body_element_not_editable');
  });
}

async function verifyEditorContent(locator, expected) {
  const actual = await readEditorContent(locator);
  const result = compareEditorContent(actual, expected);
  if (!result.equal) {
    // Diagnose without publishing article text, cookies or browser state in logs.
    console.error(`NOTE_BODY_VERIFICATION=${JSON.stringify(result)}`);
    throw new Error('note_body_verification_failed');
  }
  return result;
}

module.exports = { contentLines, compareEditorContent, readEditorContent, verifyEditorContent };
