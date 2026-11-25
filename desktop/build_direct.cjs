// Website download channel: Developer ID signing and Apple notarization, so a
// downloaded installer opens on other Macs. The pack and store channels keep
// their own signing.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(os.homedir(), 'Library/Caches/ComicPerfect/direct');
const env = { ...process.env };
const modes = ['--prepare', '--build', '--sign-only', '--publish'].filter(flag => process.argv.includes(flag));
if (process.platform !== 'darwin') throw new Error('Website releases must be built on macOS, once per target architecture.');
if (modes.length > 1) throw new Error('Choose at most one of --prepare, --build and --publish.');
const [mode = '--check'] = modes;
const releaseFile = path.join(output, 'release.json');
const builderFile = path.join(output, 'builder.json');

function run(command, args, capture = false, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: capture ? 'pipe' : 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || '').trim().slice(-2000)}`);
  return result.stdout;
}
async function digest(file, algorithm) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function retry(action, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try { return await action(); }
    catch (error) {
      if (attempt >= attempts) throw error;
      console.warn(`${error.message.split('\n')[0]}; retrying (${attempt} of ${attempts - 1})`);
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }
}
function assertPublicAssets(assets) {
  const references = path.join(assets, 'refer_image');
  const unlicensed = fs.readdirSync(assets).some(name => !['brand', 'refer_image'].includes(name)) ||
    fs.existsSync(references) && fs.readdirSync(references).length > 0;
  if (unlicensed) throw new Error('Staged assets are not cleared for public distribution.');
}
function compareVersions(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let index = 0; index < 3; index++) if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) - (right[index] || 0);
  return 0;
}
function lowestSystemVersion(directory) {
  // The installer must not promise a macOS release its native code cannot load.
  const machO = [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca];
  let lowest = '0';
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(file); continue; }
      const handle = fs.openSync(file, 'r'), magic = Buffer.alloc(4);
      fs.readSync(handle, magic, 0, 4, 0);
      fs.closeSync(handle);
      if (!machO.includes(magic.readUInt32BE(0))) continue;
      let command = '';
      for (const line of spawnSync('/usr/bin/otool', ['-l', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.split('\n')) {
        const head = line.match(/^\s*cmd (\S+)/);
        if (head) command = head[1];
        const version = command === 'LC_BUILD_VERSION' ? line.match(/^\s*minos (\d+(?:\.\d+){0,2})\s*$/) :
          command === 'LC_VERSION_MIN_MACOSX' ? line.match(/^\s*version (\d+(?:\.\d+){0,2})\s*$/) : null;
        if (version && compareVersions(version[1], lowest) > 0) lowest = version[1];
      }
    }
  };
  walk(directory);
  if (lowest === '0') throw new Error(`No native build version found under ${directory}.`);
  return lowest;
}
function builderConfig(identity) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build;
  config.forceCodeSigning = true;
  config.directories = { ...config.directories, output };
  config.publish = null;
  // electron-builder selects the Developer ID certificate type itself.
  config.mac.identity = identity;
  config.mac.icon = path.join(root, 'desktop/icons/comicperfect.icns');
  config.mac.hardenedRuntime = true;
  // Notarization is driven below, so it is never skipped or lost silently.
  config.mac.notarize = false;
  // Data files are sealed by their bundle; signing each only adds a timestamp round trip.
  config.mac.signIgnore = ['\\.(?:png|jpe?g|gif|webp|ico|icns|pak|ttf|otf|woff2?)$'];
  config.mac.artifactName = 'ComicPerfect-${version}-${arch}.${ext}';
  // The DMG is notarized and stapled as well, so opening it needs no warning.
  config.dmg = { ...config.dmg, sign: true };
  return config;
}
function preflight(notarize) {
  const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], true);
  const candidates = identities.split('\n').filter(line => line.includes('"Developer ID Application:') &&
    (!env.COMIC_DEVELOPER_ID || line.includes(env.COMIC_DEVELOPER_ID)));
  if (candidates.length !== 1)
    throw new Error('Exactly one Developer ID Application identity with its private key is required; select it with COMIC_DEVELOPER_ID. Store certificates cannot sign website releases.');
  for (const key of ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_KEYCHAIN'])
    delete env[key];
  const profile = env.APPLE_KEYCHAIN_PROFILE?.trim();
  if (notarize) {
    if (!profile) throw new Error('Set APPLE_KEYCHAIN_PROFILE to a notarytool keychain profile. Apple passwords never belong in the project.');
    run('xcrun', ['notarytool', 'history', '--keychain-profile', profile, '--output-format', 'json'], true);
  }
  return { identity: candidates[0].match(/"Developer ID Application: ([^"]+)"/)[1], profile };
}
function audit(app) {
  const boundary = fs.realpathSync(app) + path.sep;
  const privateFile = /(^|\/)(\.env(\..*)?|auth\.json|credentials\.encrypted|id_(rsa|ed25519)(\.pub)?|.*\.(p8|p12|pfx))$/i;
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (privateFile.test(file)) throw new Error(`Private file inside the app: ${path.relative(app, file)}`);
      if (entry.isSymbolicLink()) {
        if (!fs.realpathSync(file).startsWith(boundary)) throw new Error(`Link leaves the app bundle: ${path.relative(app, file)}`);
      } else if (entry.isDirectory()) walk(file);
    }
  };
  walk(app);
  assertPublicAssets(path.join(app, 'Contents/Resources/server/_internal/app-content/assets'));
}
async function notarize(file, profile, record) {
  const submission = JSON.parse(run('xcrun', ['notarytool', 'submit', file, '--keychain-profile', profile, '--wait', '--output-format', 'json'], true, { env }));
  fs.writeFileSync(path.join(output, record), JSON.stringify(submission, null, 2));
  if (submission.status !== 'Accepted') {
    if (submission.id)
      fs.writeFileSync(path.join(output, record.replace(/\.json$/, '-log.json')),
        run('xcrun', ['notarytool', 'log', submission.id, '--keychain-profile', profile], true, { env }));
    throw new Error(`Apple did not accept ${path.basename(file)} (${submission.status}); it must not be published.`);
  }
  return submission.id;
}

async function build(profile, identity) {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(releaseFile, JSON.stringify({ ready: false }, null, 2));
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const filename = `ComicPerfect-${version}-${process.arch}.dmg`;
  const app = path.join(output, `mac-${process.arch}`, 'ComicPerfect.app');
  const dmg = path.join(output, filename);
  run('uv', ['run', '--project', 'backend', '--group', 'desktop', 'python', 'desktop/build_backend.py', '--public']);
  assertPublicAssets(path.join(root, 'build/desktop-content/assets'));
  const config = builderConfig(identity);
  const runtime = lowestSystemVersion(path.join(root, 'build/comicperfect-server'));
  const electron = run('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion',
    path.join(path.dirname(require.resolve('electron/package.json')), 'dist/Electron.app/Contents/Info.plist')], true).trim();
  config.mac.minimumSystemVersion = compareVersions(runtime, electron) > 0 ? runtime : electron;
  config.mac.target = [{ target: 'dir', arch: [process.arch] }];
  fs.writeFileSync(builderFile, JSON.stringify(config, null, 2));
  run(process.execPath, [require.resolve('electron-builder/cli.js'), '--config', builderFile, '--mac', 'dir', '--publish', 'never'], false, { env });
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  const signer = spawnSync('/usr/bin/codesign', ['-dvv', app], { encoding: 'utf8' }).stderr;
  if (!signer.includes('Authority=Developer ID Application:')) throw new Error('The app is not signed by a Developer ID Application identity.');
  audit(app);
  if (mode === '--sign-only') {
    // Hardened Runtime is what can stop the bundled Python service, so
    // rehearse startup before waiting on Apple.
    run(process.execPath, ['desktop/verify_installed.cjs', app, '--preflight']);
    fs.writeFileSync(releaseFile, JSON.stringify({ ready: false, version, arch: process.arch, reason: 'signed, not notarized' }, null, 2));
    console.log(`Signed and startup-verified, but not notarized: ${app}. It must not be distributed.`);
    return;
  }
  // electron-builder only packs and signs. Notarizing inside it would let one
  // dropped connection while stapling discard a build Apple already accepted.
  const archive = path.join(output, 'ComicPerfect.zip');
  let appNotarizationId;
  try {
    run('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, archive]);
    appNotarizationId = await notarize(archive, profile, 'app-notarization.json');
  } finally { fs.rmSync(archive, { force: true }); }
  await retry(() => run('xcrun', ['stapler', 'staple', app]));
  run('xcrun', ['stapler', 'validate', app]);
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
  // Build the installer from the stapled app instead of signing it again.
  config.mac.target = [{ target: 'dmg', arch: [process.arch] }];
  fs.writeFileSync(builderFile, JSON.stringify(config, null, 2));
  for (const stale of [dmg, `${dmg}.blockmap`]) fs.rmSync(stale, { force: true });
  run(process.execPath, [require.resolve('electron-builder/cli.js'), '--config', builderFile, '--prepackaged', app, '--mac', 'dmg', '--publish', 'never'], false, { env });
  if (!fs.existsSync(dmg)) throw new Error(`Missing ${filename}`);
  const notarizationId = await notarize(dmg, profile, 'dmg-notarization.json');
  await retry(() => run('xcrun', ['stapler', 'staple', dmg]));
  run('xcrun', ['stapler', 'validate', dmg]);
  run('/usr/sbin/spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg]);
  // A valid signature does not prove the app can start: install the DMG copy.
  run(process.execPath, ['desktop/verify_installed.cjs', dmg, path.join(output, 'startup-verification.json')]);
  const minimumSystemVersion = run('/usr/bin/plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', path.join(app, 'Contents/Info.plist')], true).trim();
  const sha256 = await digest(dmg, 'sha256');
  const git = args => run('git', args, true).trim();
  const source = { commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']).length > 0 };
  fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${sha256}  ${filename}\n`);
  fs.writeFileSync(releaseFile, JSON.stringify({ ready: true, startupVerified: true, version, arch: process.arch, filename,
    size: fs.statSync(dmg).size, sha256, minimumSystemVersion, appNotarizationId, notarizationId, source }, null, 2));
  console.log(`Signed, notarized and startup-verified installer: ${dmg}`);
}

async function publish() {
  const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const filename = `ComicPerfect-${release.version}-${release.arch}.dmg`;
  if (release.ready !== true || release.startupVerified !== true || path.basename(release.filename || '') !== filename)
    throw new Error('Build, notarize and verify the current version first.');
  if (release.version !== version) throw new Error('package.json changed version after this build; rebuild before publishing.');
  const artifact = path.join(output, release.filename);
  if (await digest(artifact, 'sha256') !== release.sha256) throw new Error('The installer changed after notarization.');
  run('xcrun', ['stapler', 'validate', artifact]);
  run('/usr/sbin/spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', artifact]);
  const remote = run('git', ['remote', 'get-url', 'origin'], true).trim();
  const repo = env.COMIC_RELEASE_REPO || remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/i)?.[1];
  if (!repo) throw new Error('Set COMIC_RELEASE_REPO to the GitHub owner/name that hosts downloads.');
  // The tag lands on the remote default branch, so it must still be the built commit.
  if (run('gh', ['api', `repos/${repo}/commits/HEAD`, '--jq', '.sha'], true).trim() !== release.source.commit)
    throw new Error('The remote default branch moved since this build; rebuild before publishing.');
  const tag = `mac-v${release.version}`;
  const chip = release.arch === 'arm64' ? 'Apple Silicon' : release.arch;
  const notes = path.join(output, 'release-notes.md');
  const previous = JSON.parse(run('gh', ['release', 'list', '--repo', repo, '--json', 'tagName,isDraft', '--limit', '100'], true));
  const outdated = item => !item.isDraft && /^mac-v/.test(item.tagName) && compareVersions(item.tagName.slice(5), release.version) >= 0;
  if (previous.some(outdated)) throw new Error('The version is not newer than the current public website release.');
  fs.writeFileSync(notes, [
    `ComicPerfect ${release.version} · macOS ${release.minimumSystemVersion} 或更新版本 · ${chip} · ${Math.ceil(release.size / 1e6)} MB`,
    '## 安装',
    '打开 DMG，把 ComicPerfect 拖进「应用程序」。安装包已签名并通过 Apple 公证，可以直接打开。',
    '## 开始使用',
    '首次打开时选择一个文件夹作为创作空间。AI 功能需要在本机登录 Codex，或在「创作设置」里配置模型服务。',
    `SHA-256：\`${release.sha256}\``,
    `构建自提交 ${release.source.commit.slice(0, 7)}` + (release.source.dirty ? ' 及其后尚未提交的工作区改动；标签只指向该提交。' : '。'),
  ].join('\n\n') + '\n');
  const assets = [artifact, path.join(output, 'SHA256SUMS.txt'), releaseFile];
  const existing = spawnSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'isDraft'], { cwd: root, encoding: 'utf8' });
  if (existing.status === 0) {
    if (!JSON.parse(existing.stdout).isDraft) throw new Error(`${tag} is already public; increment the version before publishing again.`);
    run('gh', ['release', 'upload', tag, ...assets, '--clobber', '--repo', repo]);
  } else {
    run('gh', ['release', 'create', tag, ...assets, '--repo', repo, '--title', `ComicPerfect ${release.version}`, '--notes-file', notes, '--draft']);
  }
  // Stay a draft until GitHub confirms it holds the exact verified bytes.
  const hosted = JSON.parse(run('gh', ['release', 'view', tag, '--repo', repo, '--json', 'assets,isDraft'], true));
  const installer = hosted.assets.find(asset => asset.name === release.filename);
  if (!hosted.isDraft || installer?.size !== release.size || installer?.digest !== `sha256:${release.sha256}`)
    throw new Error('The hosted installer differs from the verified build; the draft stays unpublished.');
  run('gh', ['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest']);
  const url = `https://github.com/${repo}/releases/download/${tag}/${release.filename}`;
  const download = path.join(os.tmpdir(), `comicperfect-public-${release.version}-${release.arch}.dmg`);
  try {
    run('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '3', '--connect-timeout', '30', '--max-time', '3600', '--output', download, url]);
    if (await digest(download, 'sha256') !== release.sha256) throw new Error('The public download does not match the notarized installer.');
  } finally { fs.rmSync(download, { force: true }); }
  fs.writeFileSync(path.join(output, 'public-verification.json'), JSON.stringify({ url, sha256: release.sha256, verifiedAt: new Date().toISOString() }, null, 2));
  console.log(`Published ${tag}: https://github.com/${repo}/releases/tag/${tag}\nDownload: ${url}`);
}

async function main() {
  if (mode === '--publish') return publish();
  if (mode === '--prepare') {
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(builderFile, JSON.stringify(builderConfig('Developer ID Application'), null, 2));
    console.log(`Signing and notarization settings written to ${builderFile}; nothing was built, signed or uploaded.`);
    return;
  }
  const { identity, profile } = preflight(mode === '--build');
  if (mode === '--check') {
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(builderFile, JSON.stringify(builderConfig(identity), null, 2));
    console.log('Developer ID identity and notarization credentials verified. Nothing was built or uploaded.');
    return;
  }
  await build(profile, identity);
}
module.exports = { compareVersions, lowestSystemVersion };
if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
