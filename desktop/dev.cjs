// Give local macOS runs their own product bundle; never modify the shared runtime.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}

function prepareMacRuntime(electron, root) {
  const source = path.resolve(electron, '../../..');
  const icon = path.join(root, 'desktop/icons/comicperfect.icns');
  const revision = createHash('sha256').update(root)
    .update(fs.readFileSync(__filename))
    .update(fs.readFileSync(path.join(source, 'Contents/Info.plist')))
    .update(fs.readFileSync(icon)).digest('hex').slice(0, 16);
  const cache = path.join(os.tmpdir(), `comicperfect-dev-${revision}`);
  const bundle = path.join(cache, 'ComicPerfect.app');
  const marker = path.join(cache, 'ready');
  if (!fs.existsSync(marker)) {
    fs.mkdirSync(cache, { recursive: true });
    fs.rmSync(bundle, { recursive: true, force: true });
    fs.cpSync(source, bundle, { recursive: true, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE });
    const plist = path.join(bundle, 'Contents/Info.plist');
    for (const [key, value] of Object.entries({ CFBundleName: 'ComicPerfect', CFBundleDisplayName: 'ComicPerfect', CFBundleIdentifier: 'com.comicperfect.desktop.dev' })) {
      run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
    }
    fs.copyFileSync(icon, path.join(bundle, 'Contents/Resources/electron.icns'));
    // Also allow opening the development bundle from Finder without arguments.
    const entry = path.join(bundle, 'Contents/Resources/app');
    fs.mkdirSync(entry, { recursive: true });
    fs.writeFileSync(path.join(entry, 'package.json'), JSON.stringify({
      name: 'ComicPerfect', version: require('../package.json').version,
      main: 'index.cjs',
    }));
    fs.writeFileSync(path.join(entry, 'index.cjs'), `require(${JSON.stringify(path.join(root, 'desktop/main.cjs'))});\n`);
    // iCloud resource-fork metadata invalidates signatures on copied bundles.
    run('/usr/bin/xattr', ['-cr', bundle]);
    run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle]);
    fs.writeFileSync(marker, revision);
  }
  return path.join(bundle, 'Contents/MacOS/Electron');
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const electron = require('electron');
  const executable = process.platform === 'darwin' ? prepareMacRuntime(electron, root) : electron;
  if (process.argv.includes('--prepare-only')) console.log(executable);
  else {
    const child = spawn(executable, [root, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
    child.once('error', error => { console.error(error.message); process.exitCode = 1; });
    child.once('exit', code => { process.exitCode = code ?? 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  }
}
module.exports = { prepareMacRuntime };
