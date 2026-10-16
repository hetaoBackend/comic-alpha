const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runtime(workspaceId, values = new Map()) {
  const listeners = new Map();
  const window = { COMIC_RUNTIME: { workspaceId },
    addEventListener: (name, callback) => listeners.set(name, callback),
    dispatchEvent: () => {}, history: { back() {}, forward() {} },
  };
  const context = vm.createContext({ window, console, URL, Blob, setTimeout, clearTimeout,
    location: { hash: '#draft/test' }, crypto: require('node:crypto').webcrypto,
    CustomEvent: class { constructor(name, data) { this.type = name; this.detail = data.detail; } },
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
  });
  for (const name of ['commandContract.js', 'appCommands.js', 'consoleStore.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name), 'utf8'), context);
  return { window, context, values, listeners };
}

test('switching a workspace cannot migrate another workspace legacy drafts', () => {
  const values = new Map([['comicperfect_console_v1', JSON.stringify({ old: { id: 'old', workflowVersion: 2 } })]]);
  const a = runtime('workspace-a', values);
  assert.ok(new a.window.ConsoleStore().drafts.old);
  const b = runtime('workspace-b', values);
  assert.equal(new b.window.ConsoleStore().drafts.old, undefined);
  assert.ok(new a.window.ConsoleStore().drafts.old);
});

test('failed workspace saves stay recoverable after reload and do not overwrite newer remote drafts', async () => {
  const r = runtime('workspace-a');
  const store = new r.window.ConsoleStore();
  const draft = store.create('single', null, 'test');
  draft.title = '未同步的本机修改';
  store.save(draft);
  r.window.ConsoleAPI.request = async () => { throw new Error('offline'); };
  await assert.rejects(store.flushAll(), /offline/);
  const recovered = new r.window.ConsoleStore();
  assert.equal(recovered.dirty.has('test'), true);
  recovered.merge([{ ...draft, title: '远端内容', updatedAt: '2099-01-01' }]);
  assert.equal(recovered.drafts.test.title, '未同步的本机修改');
  r.window.ConsoleAPI.request = async (_url, _method, body) => ({ draft: { ...body.draft, revision: 'server-revision' } });
  await recovered.flushAll();
  assert.equal(recovered.dirty.size, 0);
});

test('Web and native menu commands call identical creation, save, and export workflows', async () => {
  for (const native of [false, true]) {
    const r = runtime('workspace-a');
    const events = [];
    const c = { busy: false, route: () => ['draft', 'test'],
      store: { drafts: { test: { title: '作品', images: { 0: { versions: [{}] } } } }, dirty: new Set(), queues: new Map(), local: () => true, flushAll: async () => events.push('saved') },
      create: mode => events.push(mode), notify() {}, exportWork: async d => events.push('export:' + d.title),
      navigate: route => events.push(route),
    };
    const commands = new r.window.AppCommands(c, native ? { reportState() {} } : undefined);
    for (const command of ['new-single', 'new-series', 'save', 'export', 'settings']) await commands.execute(command);
    assert.deepEqual(events, ['single', 'series', 'saved', 'export:作品', '#settings']);
    c.busy = true;
    const blocked = await commands.prepareToLeave();
    assert.equal(blocked.ok, false);
    assert.equal(blocked.busy, true);
    assert.equal(blocked.localSaved, true);
  }
});

test('closing waits for outstanding saves and reports local recovery when syncing fails', async () => {
  const r = runtime('workspace-a');
  let finish;
  const c = { busy: false, store: { local: () => true, flushAll: () => new Promise(resolve => { finish = resolve; }) } };
  const commands = new r.window.AppCommands(c);
  commands.reportState = () => {};
  let complete = false;
  const waiting = commands.prepareToLeave().then(result => { complete = true; return result; });
  await Promise.resolve();
  assert.equal(complete, false);
  finish();
  assert.equal((await waiting).ok, true);
  c.store.flushAll = async () => { throw new Error('offline'); };
  const result = await commands.prepareToLeave();
  assert.equal(result.ok, false);
  assert.equal(result.localSaved, true);
});
