'use strict';

const API_BASE = 'https://agent.tinyfish.ai/v1/profiles';

function safeShape(value, depth = 0) {
  if (depth > 2 || value === null || typeof value !== 'object') return typeof value;
  if (Array.isArray(value)) return { type: 'array', length: value.length, item: value.length ? safeShape(value[0], depth + 1) : null };
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const lower = key.toLowerCase();
    if (/(?:key|token|secret|password|credential|cookie)/i.test(lower)) {
      out[key] = '[redacted-field]';
      continue;
    }
    const child = value[key];
    if (typeof child === 'string') {
      let kind = 'string';
      try { kind = `url:${new URL(child).protocol.replace(':', '')}`; } catch (_) {}
      out[key] = kind;
    } else {
      out[key] = safeShape(child, depth + 1);
    }
  }
  return out;
}

async function main() {
  const apiKey = String(process.env.TINYFISH_API_KEY || '').trim();
  const profileId = String(process.env.TINYFISH_PROFILE_ID || '').trim();
  if (!apiKey) throw new Error('TINYFISH_API_KEY is not configured');
  if (!profileId) throw new Error('TINYFISH_PROFILE_ID is not configured');

  const response = await fetch(`${API_BASE}/${encodeURIComponent(profileId)}/setup-session`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!response.ok) throw new Error(`setup_request_failed_${response.status}`);
  const data = await response.json();

  console.log(JSON.stringify({ ok: true, setupResponseShape: safeShape(data) }));
}

main().catch((error) => {
  console.error(error.message || 'tinyfish setup response probe failed');
  process.exit(1);
});
