// Sign outside iCloud/Obsidian: Finder metadata can invalidate macOS bundles.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.platform !== 'darwin') throw new Error('macOS builds require macOS.');
const root = path.resolve(__dirname, '..');
const output = path.join(os.homedir(), 'Library/Caches/ComicPerfect/build');
const mode = process.argv[2] || 'pack';
const targets = mode === 'dist' ? ['dmg', 'zip'] : ['--dir'];
const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'),
  '--mac', ...targets, `--config.directories.output=${output}`, ...process.argv.slice(3)], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
if (mode === 'dist') {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  for (const name of fs.readdirSync(output)) {
    if (/\.(dmg|zip|blockmap)$/.test(name)) fs.copyFileSync(path.join(output, name), path.join(root, 'dist', name));
  }
}
console.log(`macOS application output: ${output}`);
