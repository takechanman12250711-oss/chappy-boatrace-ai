'use strict';

const crypto = require('crypto');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function validateDraftPayload(payload, sourceRaw, existingTitles = []) {
  if (!payload || payload.schema !== 'note-draft-adapter-v1' || payload.mode !== 'draft_only') {
    return { ok: false, reason: 'invalid_adapter_payload' };
  }
  if (!payload.safeguards || payload.safeguards.publishAllowed !== false ||
      payload.safeguards.priceChangeAllowed !== false ||
      payload.safeguards.reservationAllowed !== false ||
      payload.safeguards.credentialStorageAllowed !== false) {
    return { ok: false, reason: 'unsafe_permissions' };
  }
  if (typeof sourceRaw !== 'string' || sha256(sourceRaw) !== payload.sourceSha256) {
    return { ok: false, reason: 'source_sha_mismatch' };
  }
  if (existingTitles.includes(payload.title)) {
    return { ok: false, reason: 'duplicate_title' };
  }
  if (![payload.title, payload.freeText, payload.paidText].every((v) => typeof v === 'string' && v.length > 0)) {
    return { ok: false, reason: 'article_text_missing' };
  }
  return {
    ok: true,
    action: 'create_draft_only',
    title: payload.title,
    freeText: payload.freeText,
    paidText: payload.paidText,
    forbiddenActions: ['publish', 'set_price', 'schedule', 'store_credentials']
  };
}

module.exports = { validateDraftPayload, sha256 };
