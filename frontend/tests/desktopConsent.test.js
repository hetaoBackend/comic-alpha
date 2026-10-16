const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('denying desktop consent preserves the reason and never calls the backend', async () => {
  let requested = false;
  const window = { location: { href: 'http://127.0.0.1:18765/' }, COMIC_RUNTIME: { apiBaseUrl: 'http://127.0.0.1:32145/api' },
    DesktopHost: { authorizeAI: async () => ({ ok: false, error: '尚未同意 AI 共享，内容未发送。' }) },
    fetch: async () => { requested = true; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/desktopConsent.js'), 'utf8'), { window, URL, Headers, Response });
  const response = await window.fetch('http://127.0.0.1:32145/api/generate', { method: 'POST', body: '{}' });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /尚未同意/);
  assert.equal(requested, false);
});
test('private desktop protocol authorizes only its own host and preserves signed request bytes', async () => {
  const calls = [], approvals = [];
  const window = { location: { href: 'comicperfect://app/' }, COMIC_RUNTIME: { apiBaseUrl: 'comicperfect://app/api' },
    DesktopHost: { authorizeAI: async (path, body) => {
      approvals.push([path, body]); return { ok: true, headers: { 'X-Comic-Consent': 'signed-body' } };
    } }, fetch: async (url, options) => { calls.push([url, options]); return new Response('{}'); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/desktopConsent.js'), 'utf8'), { window, URL, Headers, Response });
  const body = '{"prompt":"anonymous"}';
  await window.fetch('comicperfect://app/api/generate-image', { method: 'POST', body });
  await window.fetch('other://app/api/generate-image', { method: 'POST', body });
  await window.fetch('comicperfect://foreign/api/generate-image', { method: 'POST', body });
  assert.deepEqual(approvals, [['/api/generate-image', body]]);
  assert.equal(calls[0][1].body, body);
  assert.equal(calls[0][1].headers.get('X-Comic-Consent'), 'signed-body');
});
