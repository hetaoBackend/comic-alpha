const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspace, selectWorkspace, rememberWorkspace, workspaceInfo, installWorkspaceIPC } = require('../workspace.cjs');
const { Settings, resolveWorkspace } = require('../settings.cjs');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-workspace-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = path.resolve(__dirname, '../../ComicBrain');
  const root = path.join(temp, 'New Space'); fs.mkdirSync(root);
  return { temp, source, root };
}
test('new spaces contain reusable scaffolding and an empty Wiki, never creator canon', t => {
  const { root, source } = fixture(t);
  createWorkspace(root, source);
  assert.equal(selectWorkspace(root), fs.realpathSync(root));
  assert.match(fs.readFileSync(path.join(root, 'wiki/系列/index.md'), 'utf8'), /尚未创建系列/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'wiki/系列')), ['index.md']);
  assert.equal(fs.existsSync(path.join(root, 'assets')), false);
  assert.deepEqual(fs.readdirSync(path.join(root, 'production')), []);
});
test('opening the enclosing project locates its embedded workspace', t => {
  const { temp, source } = fixture(t);
  const embedded = path.join(temp, 'Project/ComicBrain'); fs.mkdirSync(embedded, { recursive: true });
  createWorkspace(embedded, source);
  assert.equal(selectWorkspace(path.dirname(embedded)), fs.realpathSync(embedded));
});
test('new workspace creation refuses nonempty directories without overwriting files', t => {
  const { root, source } = fixture(t);
  fs.writeFileSync(path.join(root, 'important.txt'), 'keep');
  assert.throws(() => createWorkspace(root, source), /空文件夹/);
  assert.equal(fs.readFileSync(path.join(root, 'important.txt'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(root, 'wiki')), false);
});
test('recent spaces are bounded, deduplicated and expose current/locked state', t => {
  const { temp, root } = fixture(t);
  const settings = new Settings(path.join(temp, 'settings.json'));
  for (let i=0;i<12;i++) rememberWorkspace(settings, path.join(temp, String(i)));
  rememberWorkspace(settings, root); rememberWorkspace(settings, root);
  const info = workspaceInfo({root, imageDir: '/images', settings, locked: true, defaultRoot: root});
  assert.equal(info.name, '默认创作空间');
  assert.equal(info.recent.length, 8);
  assert.equal(info.recent[0].current, true);
  assert.equal(info.recent[0].available, true);
  assert.equal(info.locked, true);
});
test('isolated external spaces default to their own image directory', t => {
  const { temp, root } = fixture(t);
  const resolved = resolveWorkspace({settings:{root},env:{},packaged:true,repo:temp,data:path.join(temp,'application')});
  assert.equal(resolved.imageDir, path.join(fs.realpathSync(root), 'images'));
});
test('workspace IPC checks the caller and accepts only known actions', async () => {
  const handlers = new Map(), calls=[];
  installWorkspaceIPC({handle:(name, fn)=>handlers.set(name,fn)}, e=>e.trusted===true,
    ()=>({name:'Test'}), async (...args)=>{calls.push(args);});
  assert.equal((await handlers.get('comic:workspace-info')({trusted:false})).ok, false);
  assert.equal((await handlers.get('comic:workspace-action')({trusted:false},'choose')).ok, false);
  assert.equal((await handlers.get('comic:workspace-action')({trusted:true},'exec')).ok, false);
  assert.equal(calls.length, 0);
  assert.equal((await handlers.get('comic:workspace-action')({trusted:true},'choose')).ok, true);
  assert.equal(calls[0][0], 'choose');
});
