// Shared Web API code remains unchanged; the store host authorizes AI requests.
(() => {
  if (!window.DesktopHost?.authorizeAI) return;
  const originalFetch = window.fetch.bind(window);
  const api = new URL(window.COMIC_RUNTIME.apiBaseUrl);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    if (url.protocol !== api.protocol || url.host !== api.host || (options.method || 'GET').toUpperCase() !== 'POST')
      return originalFetch(input, options);
    const authorization = await window.DesktopHost.authorizeAI(url.pathname, options.body);
    if (!authorization.ok) return new Response(JSON.stringify({ error: authorization.error || '已取消 AI 共享' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } });
    const headers = new Headers(options.headers);
    for (const [key, value] of Object.entries(authorization.headers || {})) headers.set(key, value);
    return originalFetch(input, { ...options, headers });
  };
})();
