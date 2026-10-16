const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function assistant() {
  const requests = [];
  const ctx = vm.createContext({window: {}, structuredClone,
    ConsoleAPI: { request: async (...args) => { requests.push(args); return { message: '答复', proposal: null }; } },
    console,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/creativeAssistant.js'), 'utf8'), ctx);
  const a = Object.create(ctx.window.CreativeAssistant.prototype);
  a.target = { kind: 'page', draft_id: 'draft-1', chapter_index: 0, page_index: 1 };
  a.sessionKey = JSON.stringify(a.target);
  a.sessions = { [a.sessionKey]: { messages: [], input: '把第2页对白缩短', mode: 'revise' } };
  a.app = {
    busy: false, route: () => ['draft', 'draft-1'],
    store: { drafts: { 'draft-1': { id: 'draft-1', mode: 'series', seriesId: 'test', chapterIndex: 0, pages: [
      { title: '第一页', rows: [{ panels: [{text: '第一格'}] }] },
      { title: '第二页', rows: [{ panels: [{text: '第二格'}] }] },
    ] } }, flush: async () => {} },
    workspace: { principles: [{ documentKey: 'global-rule', title: '故事原则' }], preferences: [] },
    seriesList: [{ id: 'test', documents: [{ documentKey: 'series-pref', title: '系列偏好' }] }],
    series: () => ({ name: '测试系列' }),
    textConfig: () => ({ text_provider: 'codex' }), render() {}, job: async callback => callback(),
  };
  a.render = () => {};
  a.save = () => {};
  return { a, requests, ctx };
}

test('assistant sends scoped page instructions and prior unadopted edits for follow-up', async () => {
  const { a, requests } = assistant();
  a.session.messages.push({ role: 'assistant', content: '上次方案', proposal: { patch: { page: { title: '上次改法' } } } });
  await a.send();
  const body = requests[0][2];
  assert.equal(body.target.page_index, 1);
  assert.equal(body.target.draft_id, 'draft-1');
  assert.equal(body.mode, 'revise');
  assert.match(body.history[0].content, /上次改法/);
  assert.equal(a.session.messages.at(-1).role, 'assistant');
  assert.equal(a.session.input, '');
});

test('failed instructions stay editable and retry does not duplicate the same user message', async () => {
  const { a, ctx } = assistant();
  ctx.ConsoleAPI.request = async () => { throw new Error('暂时不可用'); };
  await a.send();
  assert.equal(a.error, '暂时不可用');
  assert.equal(a.session.input, '把第2页对白缩短');
  assert.equal(a.session.messages.length, 1);
  ctx.ConsoleAPI.request = async () => ({ message: '已提出方案', proposal: null });
  await a.send();
  assert.equal(a.session.messages.filter(m => m.role === 'user').length, 1);
  assert.equal(a.session.messages.length, 2);
});

test('global and series document targets have explicit different impact scopes', () => {
  const { a } = assistant();
  assert.equal(a.document('series-pref').sid, 'test');
  assert.equal(a.document('global-rule').sid, null);
  assert.match(a.describe({ kind: 'document', document_key: 'global-rule' }).scope, /所有系列/);
  assert.match(a.describe({ kind: 'document', document_key: 'series-pref', series_id: 'test' }).scope, /本系列/);
  assert.match(a.describe(a.target).title, /第 2 页/);
});

test('conversation-only mode is retained and newer proposals retire obsolete previews', async () => {
  const { a, ctx, requests } = assistant();
  const old = { role: 'assistant', content: '旧方案', proposal: { token: 'old', patch: {} } };
  a.session.messages.push(old);
  ctx.ConsoleAPI.request = async (...args) => { requests.push(args); return { message: '新方案', proposal: { token: 'new', patch: {} } }; };
  await a.send();
  assert.equal(old.dismissed, true);
  a.session.mode = 'discuss'; a.session.input = '先解释一下';
  ctx.ConsoleAPI.request = async (...args) => { requests.push(args); return { message: '解释', proposal: null }; };
  await a.send();
  assert.equal(requests.at(-1)[2].mode, 'discuss');
  assert.equal(a.session.messages.at(-1).proposal, null);
});
