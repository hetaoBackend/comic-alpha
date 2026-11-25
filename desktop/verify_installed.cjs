// Launch a copy installed from the real DMG, isolated from the creator's own
// profile and workspace. A valid signature alone does not prove the app starts.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${(result.stderr || '').trim().slice(-1500)}`);
  return result.stdout;
}
async function until(probe, message, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await delay(200);
  }
  throw new Error(message);
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  // The isolated app leads its own process group; quit it the way the menu does.
  try { process.kill(child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  await until(() => child.exitCode !== null || child.signalCode !== null, '', 15000).catch(() => {});
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    const left = run('/bin/ps', ['-axo', 'pgid=,pid=']).split('\n').map(line => line.trim().split(/\s+/))
      .filter(([group]) => group === String(child.pid)).map(([, pid]) => Number(pid));
    if (!left.length) return;
    for (const pid of left) { try { process.kill(pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    await delay(1000);
  }
}

async function main() {
  const source = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  const report = process.argv.slice(3).find(arg => !arg.startsWith('--') && arg !== source);
  const preflight = process.argv.includes('--preflight');
  if (!source || !path.isAbsolute(source) || !/\.(dmg|app)$/.test(source)) throw new Error('Pass the absolute path to the final DMG or app bundle.');
  if (preflight && !source.endsWith('.app')) throw new Error('Preflight is only for a signed local app; a DMG is only accepted with its ticket.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comicperfect-startup-'));
  const mount = path.join(root, 'mount');
  const installed = source.endsWith('.app') ? source : path.join(root, 'Applications', 'ComicPerfect.app');
  const profile = path.join(root, 'profile');
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'comicperfect-workspace-')));
  const live = path.join(os.homedir(), 'Library/Application Support/ComicPerfect/workspace.json');
  const liveBefore = fs.existsSync(live) ? fs.readFileSync(live) : null;
  let child, mounted = false, stderr = '';
  try {
    if (installed !== source) {
      fs.mkdirSync(mount);
      fs.mkdirSync(path.dirname(installed));
      run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, source]);
      mounted = true;
      run('/usr/bin/ditto', [path.join(mount, 'ComicPerfect.app'), installed]);
      run('hdiutil', ['detach', mount]);
      mounted = false;
    }
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', installed]);
    if (!preflight) {
      run('/usr/sbin/spctl', ['--assess', '--type', 'execute', installed]);
      run('xcrun', ['stapler', 'validate', installed]);
    }
    // Only system variables and the scratch workspace reach the test instance.
    const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL', 'LANG']
      .filter(key => process.env[key]).map(key => [key, process.env[key]]));
    child = spawn(path.join(installed, 'Contents/MacOS/ComicPerfect'),
      [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'],
      { env: { ...env, COMICBRAIN_ROOT: workspace }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    child.on('error', error => { stderr += error.message; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    const exited = () => {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`The app exited during startup: ${stderr.slice(-1500)}`);
    };
    const portFile = path.join(profile, 'DevToolsActivePort');
    const [port] = await until(async () => {
      exited();
      if (!fs.existsSync(portFile)) return false;
      const lines = fs.readFileSync(portFile, 'utf8').trim().split('\n');
      return /^\d+$/.test(lines[0]) && lines;
    }, `The app opened no window: ${stderr.slice(-1500)}`, 60000);
    let page;
    await until(async () => {
      exited();
      page = (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json()))
        .find(target => target.type === 'page' && target.url.startsWith('comicperfect://app/'));
      return page;
    }, 'The workspace page never loaded from the local service.');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let next = 0;
    const exceptions = [], waiting = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) waiting.get(message.id)?.(message);
      else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    };
    // Uncaught errors while the view renders are part of the verdict.
    socket.send(JSON.stringify({ id: ++next, method: 'Runtime.enable' }));
    const evaluate = expression => new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => reject(new Error('The workspace page did not answer in time.')), 30000);
      waiting.set(id, message => {
        clearTimeout(timer);
        if (message.error || message.result.exceptionDetails) reject(new Error('The workspace page could not be inspected.'));
        else resolve(message.result.result.value);
      });
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    await until(async () => await evaluate(`document.querySelector('#content')?.children.length`) > 0, 'The workspace view did not render.');
    const state = await evaluate(`(async () => {
      const json = async url => { const response = await fetch(url); return { status: response.status, body: (await response.text()).slice(0, 200) }; };
      const logo = await fetch('assets/brand/comicperfect-logo.png');
      return { url: location.href, health: await json('/api/health'), workspaceApi: await json('/api/console/workspace'),
        logo: { status: logo.status, type: logo.headers.get('content-type') },
        host: window.DesktopHost ? await window.DesktopHost.getWorkspace() : null };
    })()`);
    await delay(1500);
    socket.close();
    const checks = [installed === source ? 'signed-app' : 'copied-from-dmg', ...(preflight ? ['signature-preflight'] : ['signature-and-ticket', 'gatekeeper']),
      'isolated-profile-and-workspace', 'window-and-view', 'local-service', 'api-health', 'workspace-api', 'static-assets', 'no-service-errors'];
    if (!state.url.startsWith('comicperfect://app/')) throw new Error('The window is not showing the workspace.');
    if (JSON.parse(state.health.body).status !== 'ok' || state.workspaceApi.status !== 200) throw new Error('The local API did not answer.');
    if (state.logo.status !== 200 || !state.logo.type?.startsWith('image/png')) throw new Error('Packaged static assets are missing.');
    if (state.host?.ok !== true || fs.realpathSync(state.host.workspace.path) !== workspace) throw new Error('The app is not using the isolated workspace.');
    if (!fs.existsSync(path.join(profile, 'workspace.json'))) throw new Error('The app is not using the isolated profile.');
    const services = run('/bin/ps', ['-axo', 'pid=,ppid=,args=']).split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .filter(match => match && match[3].includes('comicperfect-server'));
    if (!services.some(([, , ppid]) => Number(ppid) === child.pid)) throw new Error('The local service is not running under the app.');
    const log = fs.readFileSync(path.join(profile, 'desktop-service.log'), 'utf8');
    if (/Traceback \(most recent call last\)|Desktop request failed/.test(log)) throw new Error(`The local service reported an error: ${log.slice(-1500)}`);
    if (exceptions.length) throw new Error(`The workspace page raised: ${exceptions.join(' | ').slice(0, 1500)}`);
    const version = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(installed, 'Contents/Info.plist')]).trim();
    if (report) fs.writeFileSync(report, JSON.stringify({ version, passed: true, checkedAt: new Date().toISOString(), checks }, null, 2));
    console.log(`Installed ${version} passed: real startup${preflight ? ' of the signed app' : ' from the DMG, signature and ticket, Gatekeeper'}, isolated profile, workspace view, local service and API.`);
  } finally {
    await stop(child);
    try {
      // --user-data-dir must keep the creator's own app settings untouched.
      const liveAfter = fs.existsSync(live) ? fs.readFileSync(live) : null;
      if (liveBefore && liveAfter && !liveBefore.equals(liveAfter) && liveAfter.includes(workspace)) {
        const backup = path.join(os.tmpdir(), 'comicperfect-live-workspace-pointer.backup.json');
        fs.writeFileSync(backup, liveBefore);
        throw new Error(`Isolation failed: the test workspace reached the live app settings. The previous file is saved at ${backup}.`);
      }
    } finally {
      if (mounted) run('hdiutil', ['detach', mount]);
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(workspace, { recursive: true, force: true });
      console.log('Test app, processes, installed copy and scratch workspace cleaned up.');
    }
  }
}
main().catch(error => { console.error(error.message); process.exit(1); });
