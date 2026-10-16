const { createHmac, randomUUID } = require('node:crypto');
const AI_PATHS = new Set(['/api/generate', '/api/generate-image', '/api/generate-cover', '/api/generate-xiaohongshu',
  '/api/generate-session-title', '/api/optimize-prompt', '/api/console/plan', '/api/console/storyboard',
  '/api/console/canon/prepare', '/api/console/canon/save', '/api/console/retrospective', '/api/console/assistant']);
function recipientFor(pathname, body) {
  const image = ['/api/generate-image', '/api/generate-cover'].includes(pathname);
  const provider = image ? body.image_provider || 'google' : body.text_provider || 'codex';
  if (provider === 'codex') return 'OpenAI（ChatGPT / Codex）';
  if (provider === 'google') return 'Google Gemini';
  if (provider !== 'openai') throw new Error('不支持的模型服务');
  const url = new URL(body.base_url || 'https://api.openai.com/v1');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('模型服务地址无效');
  return `兼容 API 服务：${url.origin}`;
}
function signConsent(secret, pathname, body, now = Date.now()) {
  const stamp = String(now), nonce = randomUUID();
  const signature = createHmac('sha256', secret).update(`${pathname}\n${stamp}\n${nonce}\n${body}`).digest('hex');
  return { 'X-Comic-Consent-Time': stamp, 'X-Comic-Consent-Nonce': nonce, 'X-Comic-Consent': signature };
}
module.exports = { AI_PATHS, recipientFor, signConsent };
