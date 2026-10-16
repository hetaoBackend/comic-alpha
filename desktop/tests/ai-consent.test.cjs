const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { AI_PATHS, recipientFor, signConsent } = require('../ai-consent.cjs');
test('consent names the selected provider and rejects credential-bearing URLs', () => {
  assert.equal(recipientFor('/api/generate', {}), 'OpenAI（ChatGPT / Codex）');
  assert.equal(recipientFor('/api/generate-cover', {}), 'Google Gemini');
  assert.equal(recipientFor('/api/generate', { text_provider: 'openai', base_url: 'https://api.example.net/v1' }), '兼容 API 服务：https://api.example.net');
  assert.throws(() => recipientFor('/api/generate', { text_provider: 'openai', base_url: 'https://secret@example.net' }));
  assert.throws(() => recipientFor('/api/generate', { text_provider: 'other' }));
});
test('request signatures bind unicode body and endpoint, with a fresh nonce', () => {
  const body = JSON.stringify({ prompt: '虚构故事' });
  const headers = signConsent('test-only', '/api/generate', body, 123);
  const nonce = headers['X-Comic-Consent-Nonce'];
  assert.equal(headers['X-Comic-Consent'], createHmac('sha256', 'test-only').update(`/api/generate\n123\n${nonce}\n${body}`).digest('hex'));
  assert.notEqual(signConsent('test-only', '/api/generate', body, 123)['X-Comic-Consent-Nonce'], nonce);
  assert.equal(AI_PATHS.has('/api/console/canon/commit'), false);
  assert.equal(AI_PATHS.has('/api/console/assistant'), true);
  assert.equal(AI_PATHS.has('/api/console/assistant/apply'), false);
});
