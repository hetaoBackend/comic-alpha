const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('desktop API calls and legacy image references follow the active backend', async () => {
  let requested;
  const window = { COMIC_RUNTIME: { apiBaseUrl: 'http://127.0.0.1:32145/api' } };
  const context = vm.createContext({ window, URL, console,
    fetch: async url => { requested = url; return { json: async () => ({ status: 'ok' }) }; },
  });
  for (const file of ['api.js', 'consoleStore.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  }
  await window.ComicAPI.healthCheck();
  assert.equal(requested, 'http://127.0.0.1:32145/api/health');
  assert.equal(window.ConsoleAPI.imageURL('/static/images/page.png'), 'http://127.0.0.1:32145/static/images/page.png');
  assert.equal(window.ConsoleAPI.imageURL('http://localhost:5003/static/images/page.png'), 'http://127.0.0.1:32145/static/images/page.png');
  assert.equal(window.ConsoleAPI.imageURL('http://localhost:5003/backend/static/images/page.png'), 'http://127.0.0.1:32145/static/images/page.png');
});
