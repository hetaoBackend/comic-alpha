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
  const root = canonicalPath(env.COMICBRAIN_ROOT || settings.root ||
    (packaged ? path.join(data, 'ComicBrain') : path.join(repo, 'ComicBrain')));
  const adjacentImages = [path.join(path.dirname(root), 'backend/static/images'), path.join(path.dirname(root), 'images')]
    .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
  const imageDir = canonicalPath(env.COMIC_IMAGE_DIR || settings.profiles?.[root]?.imageDir ||
    (settings.root === root ? settings.imageDir : null) || adjacentImages ||
    (root !== canonicalPath(packaged ? path.join(data, 'ComicBrain') : path.join(repo, 'ComicBrain'))
      ? path.join(root, 'images') : packaged ? path.join(data, 'images') : path.join(repo, 'backend/static/images')));
  return { root, imageDir };
}

module.exports = { Settings, resolveWorkspace, canonicalPath };
