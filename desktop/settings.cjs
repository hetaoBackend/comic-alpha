const fs = require('node:fs');
const path = require('node:path');

class Settings {
  constructor(filename) {
    this.filename = filename;
    try {
      this.value = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (!this.value || typeof this.value !== 'object' || Array.isArray(this.value)) throw new Error('Invalid settings');
    } catch (error) {
      if (error.code !== 'ENOENT' && fs.existsSync(filename))
        fs.copyFileSync(filename, `${filename}.backup-${Date.now()}`);
      this.value = {};
    }
  }
  update(patch) {
    this.value = { ...this.value, ...patch };
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temporary = this.filename + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(this.value, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.filename);
  }
}

function canonicalPath(value) {
  const resolved = path.resolve(value);
  let ancestor = resolved;
  while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  return path.join(fs.realpathSync(ancestor), path.relative(ancestor, resolved));
}

function resolveWorkspace({ settings, env, packaged, repo, data }) {
  const selected = env.COMICBRAIN_ROOT || settings.root;
  if (!selected) throw new Error('请先选择或新建一个创作空间文件夹。');
  const root = canonicalPath(selected);
  if (!fs.existsSync(root)) throw new Error('创作空间文件夹已移动或不可用，请重新选择。');
  let manifest = {};
  const manifestFile = path.join(root, 'comicperfect.workspace.json');
  if (fs.existsSync(manifestFile)) manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const localImages = path.join(root, 'images');
  const adjacentImages = [path.join(path.dirname(root), 'backend/static/images'), path.join(path.dirname(root), 'images')]
    .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
  const imageDir = canonicalPath(env.COMIC_IMAGE_DIR || settings.profiles?.[root]?.imageDir ||
    (settings.root === root ? settings.imageDir : null) || (manifest.images ? path.resolve(root, manifest.images) : null) ||
    (fs.existsSync(localImages) ? localImages : null) || adjacentImages || localImages);
  return { root, imageDir };
}

module.exports = { Settings, resolveWorkspace, canonicalPath };
