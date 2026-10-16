const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Settings, resolveWorkspace } = require('../settings.cjs');
const { restoreBounds } = require('../window.cjs');

test('switching workspaces resolves their paired images and honors explicit overrides', t => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'comic-shell-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'selected/ComicBrain');
  const images = path.join(temp, 'selected/backend/static/images');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(images, { recursive: true });
  const options = { settings: { root }, env: {}, packaged: true, repo: '/repo', data: path.join(temp, 'default') };
  assert.equal(resolveWorkspace(options).imageDir, images);
  options.settings.profiles = { [root]: { imageDir: path.join(temp, 'custom-images') } };
  assert.equal(resolveWorkspace(options).imageDir, path.join(temp, 'custom-images'));
  options.env.COMIC_IMAGE_DIR = path.join(temp, 'env-images');
  assert.equal(resolveWorkspace(options).imageDir, path.join(temp, 'env-images'));
});

test('invalid local settings are recoverable and writes retain unrelated state', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-settings-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const filename = path.join(temp, 'workspace.json');
  fs.writeFileSync(filename, '{broken');
  const store = new Settings(filename);
  assert.ok(fs.readdirSync(temp).some(name => name.includes('.backup-')));
  store.update({ root: '/selected' });
  store.update({ window: { bounds: { width: 1000 } } });
  assert.equal(new Settings(filename).value.root, '/selected');
});

test('window restoration fits small displays and recovers after disconnecting a monitor', () => {
  const area = { x: 0, y: 25, width: 1280, height: 720 };
  const recovered = restoreBounds({ x: 3000, y: -100, width: 2000, height: 1000 }, [area]);
  assert.ok(recovered.x >= area.x && recovered.y >= area.y);
  assert.ok(recovered.x + recovered.width <= area.width);
  assert.ok(recovered.y + recovered.height <= area.y + area.height);
  const small = restoreBounds(null, [{ x: 0, y: 0, width: 800, height: 600 }]);
  assert.ok(small.width <= 800 && small.height <= 600);
});
