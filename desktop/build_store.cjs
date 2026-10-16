// Separate Mac App Store channel; ordinary DMG builds keep their own signing.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const appId = 'com.comicperfect.desktop';
const env = process.env;
const release = process.argv.includes('--release');
const build = process.argv.includes('--build');
function run(command, args, capture = false, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}).`);
  return result.stdout;
}
if (process.platform !== 'darwin') throw new Error('Mac App Store builds require macOS.');
const required = ['COMIC_APPLE_TEAM_ID', 'COMIC_APPLE_PROFILE', 'COMIC_APPLE_IDENTITY', 'COMIC_BUILD_NUMBER'];
const missing = required.filter(key => !env[key]?.trim());
if (missing.length) throw new Error(`Missing store configuration: ${missing.join(', ')}`);
if (!/^[A-Z0-9]{10}$/.test(env.COMIC_APPLE_TEAM_ID)) throw new Error('Invalid Apple team ID.');
if (!/^[1-9]\d{0,8}$/.test(env.COMIC_BUILD_NUMBER)) throw new Error('Build number must be a positive integer.');
const profilePath = path.resolve(env.COMIC_APPLE_PROFILE);
const decoded = run('/usr/bin/security', ['cms', '-D', '-i', profilePath], true);
const profile = JSON.parse(run('python3', ['-c', `import sys,plistlib,json
p=plistlib.loads(sys.stdin.buffer.read()); e=p.get('Entitlements',{})
print(json.dumps({'team':p.get('TeamIdentifier',[]),'expires':p['ExpirationDate'].isoformat(),'devices':p.get('ProvisionedDevices',[]),'app':e.get('com.apple.application-identifier'),'debug':e.get('com.apple.security.get-task-allow',False)}))`], true, { input: decoded }));
if (!profile.team.includes(env.COMIC_APPLE_TEAM_ID) || profile.app !== `${env.COMIC_APPLE_TEAM_ID}.${appId}`)
  throw new Error('Profile must belong to the selected team and ComicPerfect; do not reuse another app profile.');
if (Date.parse(profile.expires) <= Date.now()) throw new Error('Provisioning profile expired.');
if (release ? (profile.debug || profile.devices.length) : !profile.devices.length)
  throw new Error('Profile type does not match development/distribution build.');
const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], true);
const matched = identities.split('\n').find(line => line.includes(env.COMIC_APPLE_IDENTITY) &&
  (release ? /3rd Party Mac Developer Application|Apple Distribution|Mac App Distribution/.test(line) : /Mac Developer:|Apple Development:/.test(line)));
if (!matched) throw new Error('Matching signing identity and private key are unavailable.');
const target = release ? 'mas' : 'mas-dev';
const output = path.join(os.homedir(), 'Library/Caches/ComicPerfect/app-store', target);
fs.mkdirSync(output, { recursive: true });
const plist = body => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${body}</dict></plist>\n`;
const appEntitlements = path.join(output, 'app.plist');
const inheritEntitlements = path.join(output, 'inherit.plist');
const keys = ['com.apple.security.app-sandbox', 'com.apple.security.network.client',
  'com.apple.security.files.user-selected.read-write', 'com.apple.security.files.bookmarks.app-scope', 'com.apple.security.cs.allow-jit'];
fs.writeFileSync(appEntitlements, plist(keys.map(key => `<key>${key}</key><true/>`).join('') +
  `<key>com.apple.security.application-groups</key><array><string>${env.COMIC_APPLE_TEAM_ID}.${appId}</string></array>`));
fs.writeFileSync(inheritEntitlements, plist('<key>com.apple.security.app-sandbox</key><true/><key>com.apple.security.inherit</key><true/><key>com.apple.security.cs.allow-jit</key><true/>'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build;
config.mac.icon = path.join(root, 'desktop/icons/comicperfect.icns');
config.forceCodeSigning = true;
config.directories.output = output;
delete config.mac.identity;
delete config.mac.entitlements;
delete config.mac.entitlementsInherit;
config.mac.target = [{ target, arch: [process.arch] }];
config.mac.bundleVersion = env.COMIC_BUILD_NUMBER;
// Pinned native dependencies in the store runtime require macOS 15.
config.mac.minimumSystemVersion = '15.0.0';
config.mas = { type: release ? 'distribution' : 'development', identity: env.COMIC_APPLE_IDENTITY,
  provisioningProfile: profilePath, entitlements: appEntitlements, entitlementsInherit: inheritEntitlements,
  // App Store signing is separate from Developer ID notarization. Permit an
  // explicit timestamp choice when Apple's timestamp endpoint is unavailable.
  timestamp: env.COMIC_APPLE_TIMESTAMP || undefined,
  hardenedRuntime: false, signIgnore: ['\\.(?:png|jpe?g|gif|webp|ico|icns|pak|ttf|otf|woff2?)$'] };
const configPath = path.join(output, 'builder.json');
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(`Profile and identity checked for ${target}; sandbox functionality still requires testing.`);
if (!build) process.exit(0);
run('uv', ['run', '--project', 'backend', '--python', '3.12', '--group', 'desktop', 'python', 'desktop/build_backend.py', '--app-store'], false,
  { env: { ...env, UV_PROJECT_ENVIRONMENT: path.join(os.homedir(), 'Library/Caches/ComicPerfect/store-venv') } });
const assets = path.join(root, 'build/desktop-content/assets');
if (fs.readdirSync(assets).some(name => name !== 'refer_image') || fs.readdirSync(path.join(assets, 'refer_image')).length)
  throw new Error('Store staging contains unlicensed example/reference assets.');
run(process.execPath, [require.resolve('electron-builder/cli.js'), '--config', configPath, '--mac', target, '--publish', 'never']);
const appPath = path.join(output, target + (process.arch === 'arm64' ? '-arm64' : ''), 'ComicPerfect.app');
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
const signed = run('/usr/bin/codesign', ['-d', '--entitlements', ':-', appPath], true);
if (!signed.includes('<key>com.apple.security.app-sandbox</key>')) throw new Error('Signed app is missing App Sandbox.');
console.log(`Signed ${target} output: ${output}. This does not indicate upload or review submission.`);
