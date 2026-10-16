// Composition root only: native shell -> typed bridge -> shared Web application.
const { app, BrowserWindow, Menu, dialog, shell, session, screen, ipcMain, safeStorage, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { isExternalURL, isAppURL } = require('./runtime.cjs');
const { Settings, resolveWorkspace, canonicalPath } = require('./settings.cjs');
const { LocalService } = require('./service.cjs');
const { createWindow } = require('./window.cjs');
const { createBridge } = require('./bridge.cjs');
const { buildMenu, updateMenu } = require('./menu.cjs');
const { ScopedAccess } = require('./scoped-access.cjs');
const { SecretStore, installSecretIPC } = require('./secrets.cjs');
const { AI_PATHS, recipientFor, signConsent } = require('./ai-consent.cjs');
const { randomBytes } = require('node:crypto');
const { selectWorkspace, rememberWorkspace, createWorkspace, workspaceInfo, installWorkspaceIPC } = require('./workspace.cjs');
app.setName('ComicPerfect');
protocol.registerSchemesAsPrivileged([{ scheme: 'comicperfect', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
} }]);

let service, appURL, mainWindow, settings, workspace, imageDir, menu, bridge;
let scopedAccess;
let quitting = false, allowQuit = false, allowClose = false, transition;
let state = { busy: false, pending: false, canExport: false };

function openWindow() {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); return; }
  const window = createWindow({ BrowserWindow, screen, saved: settings.value.window,
    onPersist: geometry => settings.update({ window: geometry }),
    onClose: event => {
      if (allowClose) return;
      event.preventDefault();
      leave(async () => { allowClose = true; window.close(); allowClose = false; });
    },
  });
  mainWindow = window;
  window.on('closed', () => { mainWindow = null; });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalURL(url, appURL)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppURL(url, appURL)) { event.preventDefault(); if (isExternalURL(url, appURL)) shell.openExternal(url); }
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  if (appURL) loadProduct(window); else window.loadFile(path.join(__dirname, 'loading.html'));
}

function loadProduct(window) {
  const route = settings.value.routes?.[workspace] || '#home';
  const hash = typeof route === 'string' && route.startsWith('#') ? route : '#home';
  window.loadURL(appURL + '/' + hash).catch(() => {
    dialog.showErrorBox('页面加载失败', '本地创作服务暂不可用。请使用“视图 → 重新载入”，或退出后重新打开。');
  });
}

async function leave(action) {
  if (transition) return transition;
  transition = (async () => {
    const result = await bridge.prepare();
    if (!result.ok) {
      const canLeave = result.localSaved;
      const answer = await dialog.showMessageBox(mainWindow || undefined, {
        type: 'warning', title: result.busy ? '创作仍在进行' : '保存尚未完成',
        message: result.busy ? '离开将中断当前生成任务。' : (result.message || '暂时无法确认草稿已安全保存。'),
        detail: canLeave ? '当前修改已保存在本机。重新打开后会继续尝试同步创作空间，已完成内容会保留。' : '请保持窗口打开，稍后重试保存或导出草稿备份。',
        buttons: canLeave ? ['继续创作', '仍然离开'] : ['继续创作'], defaultId: 0, cancelId: 0,
      });
      if (!canLeave || answer.response !== 1) return;
    }
    await action();
  })().catch(error => dialog.showErrorBox('操作未完成', error.message)).finally(() => { transition = null; });
  return transition;
}

async function finishQuit(relaunch = false) {
  quitting = true;
  if (service) await service.stop();
  scopedAccess?.close();
  if (relaunch) app.relaunch();
  allowQuit = allowClose = true;
  app.quit();
}

async function chooseDirectory(images = false, create = false) {
  if (state.busy) throw new Error('请等待当前生成完成，再切换创作空间。');
  if (!images && process.env.COMICBRAIN_ROOT) throw new Error('当前空间由启动配置指定，请调整启动配置后重新打开应用。');
  const result = await dialog.showOpenDialog(mainWindow, { title: images ? '选择图片文件夹' : create ? '选择一个空文件夹，新建创作空间' : '打开已有创作空间',
    message: create ? '请新建或选择一个空文件夹。新空间从空白开始。' : '选择创作空间文件夹，也可以选择包含它的项目文件夹。',
    properties: ['openDirectory', 'createDirectory'], securityScopedBookmarks: !!process.mas });
  if (result.canceled) return;
  let selected = canonicalPath(result.filePaths[0]);
  if (process.mas) scopedAccess.remember(selected, result.bookmarks?.[0]);
  if (!images && !create) selected = selectWorkspace(selected);
  await leave(async () => {
    if (create) {
      const source = app.isPackaged ? path.join(process.resourcesPath, 'server/_internal/app-content/ComicBrain') : path.resolve(__dirname, '../ComicBrain');
      createWorkspace(selected, source);
      fs.mkdirSync(path.join(selected, 'images'), { recursive: true });
      settings.update({ profiles: { ...settings.value.profiles, [selected]: { imageDir: path.join(selected, 'images') } } });
    }
    if (images) settings.update({ profiles: { ...settings.value.profiles, [workspace]: { imageDir: selected } } });
    else { settings.update({ root: selected }); rememberWorkspace(settings, selected); }
    await finishQuit(true);
  });
}

async function start() {
  const repo = path.resolve(__dirname, '..');
  if (!app.isPackaged) app.dock?.setIcon(path.join(repo, 'assets/brand/comicperfect-logo.png'));
  const userData = app.getPath('userData');
  const data = path.join(userData, 'workspace');
  fs.mkdirSync(data, { recursive: true });
  // The local origin is stable across app updates; cached scripts must not
  // keep an older application running against a newly signed backend.
  await session.defaultSession.clearCache();
  settings = new Settings(path.join(userData, 'workspace.json'));
  const secrets = new SecretStore(path.join(userData, 'credentials.encrypted'), safeStorage);
  const consentSecret = randomBytes(32).toString('hex');
  const approvedRecipients = new Set();
  let consentQueue = Promise.resolve();
  ipcMain.handle('comic:authorize-ai', (event, pathname, body) => {
    const authorize = async () => {
      if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame ||
          !isAppURL(event.senderFrame.url, appURL)) return { ok: false };
      if (!process.mas || !AI_PATHS.has(pathname)) return { ok: true };
      try {
        if (typeof body !== 'string' || Buffer.byteLength(body) > 40 * 1024 * 1024) throw new Error('AI 请求内容无效');
        const recipient = recipientFor(pathname, JSON.parse(body));
        if (!approvedRecipients.has(recipient)) {
          const choice = await dialog.showMessageBox(mainWindow, { type: 'question', title: '允许向 AI 服务共享创作内容？',
            message: `接收方：${recipient}`, detail: '生成任务会发送你的提示词、相关故事与分镜；出图任务还可能发送草图、角色图片和之前生成的页面。该服务依其隐私政策处理数据。许可仅在本次应用运行期间有效。你可以在“创作空间 → 停止 AI 共享”撤回许可并停止当前任务。',
            buttons: ['取消', '允许本次运行期间共享'], defaultId: 0, cancelId: 0 });
          if (choice.response !== 1) return { ok: false, error: '尚未同意 AI 共享，内容未发送。' };
          approvedRecipients.add(recipient);
        }
        return { ok: true, headers: signConsent(consentSecret, pathname, body) };
      } catch { return { ok: false, error: '无法确认 AI 接收方或授权。' }; }
    };
    const pending = consentQueue.then(authorize);
    consentQueue = pending.catch(() => {});
    return pending;
  });
  installSecretIPC(ipcMain, secrets, event => event.sender === mainWindow?.webContents &&
    event.senderFrame === event.sender.mainFrame && isAppURL(event.senderFrame.url, appURL));
  if (process.mas) {
    scopedAccess = new ScopedAccess(app, settings);
    const unavailable = scopedAccess.restore();
    if (unavailable.length) {
      const bookmarks = { ...settings.value.bookmarks };
      const profiles = { ...settings.value.profiles };
      for (const directory of unavailable) {
        delete bookmarks[directory];
        for (const [key, profile] of Object.entries(profiles))
          if (profile.imageDir === directory) delete profiles[key];
      }
      settings.update({ bookmarks, profiles, root: unavailable.includes(settings.value.root) ? null : settings.value.root });
      dialog.showErrorBox('文件夹需要重新授权', '已回到应用内的创作空间，原文件未删除。请从“创作空间”菜单重新选择这些文件夹：\n' + unavailable.join('\n'));
    }
  }
  ({ root: workspace, imageDir } = resolveWorkspace({ settings: settings.value, env: process.env, packaged: app.isPackaged, repo, data }));
  rememberWorkspace(settings, workspace);
  installWorkspaceIPC(ipcMain, event => event.sender === mainWindow?.webContents && event.senderFrame === event.sender.mainFrame && isAppURL(event.senderFrame.url, appURL),
    () => workspaceInfo({ root: workspace, imageDir, settings, locked: !!process.env.COMICBRAIN_ROOT, defaultRoot: path.join(data, 'ComicBrain') }),
    async (action, root) => {
      if (action === 'open') { const error = await shell.openPath(workspace); if (error) throw new Error(error); return; }
      if (action === 'choose' || action === 'create') return chooseDirectory(false, action === 'create');
      if (state.busy) throw new Error('请等待当前生成完成，再切换创作空间。');
      if (process.env.COMICBRAIN_ROOT) throw new Error('当前空间由启动配置指定，不能在应用内切换。');
      if (typeof root !== 'string' || !settings.value.recentRoots?.includes(root)) throw new Error('请选择最近使用列表中的空间。');
      const selected = selectWorkspace(root);
      if (selected === workspace) return;
      await leave(async () => { settings.update({ root: selected }); rememberWorkspace(settings, selected); await finishQuit(true); });
    });
  bridge = createBridge({ ipcMain, getWindow: () => mainWindow, getURL: () => appURL,
    onState: next => {
      state = next;
      mainWindow?.setDocumentEdited(state.pending || state.busy);
      mainWindow?.setTitle(`${state.title} · ComicPerfect`);
      if (menu) updateMenu(menu, state);
      if (settings.value.routes?.[workspace] !== state.route)
        settings.update({ routes: { ...settings.value.routes, [workspace]: state.route } });
    },
  });
  openWindow();
  service = new LocalService({
    executable: app.isPackaged ? path.join(process.resourcesPath, 'server/comicperfect-server') : process.env.COMIC_PYTHON || path.join(repo, 'backend/.venv/bin/python'),
    args: app.isPackaged ? [] : [path.join(repo, 'desktop/server.py')], cwd: app.isPackaged ? data : repo,
    env: { ...process.env, COMICBRAIN_ROOT: workspace, COMIC_IMAGE_DIR: imageDir, PYTHONUNBUFFERED: '1',
      ...(process.mas ? { COMIC_STORE: '1', COMIC_CONSENT_SECRET: consentSecret, CODEX_ACCESS_TOKEN: secrets.get('codex_auth'),
        OPENAI_CODEX_ACCESS_TOKEN: '', CODEX_AUTH_FILE: path.join(userData, 'not-connected.json') } : {}) },
    logPath: path.join(userData, 'desktop-service.log'),
  });
  appURL = await service.start();
  protocol.handle('comicperfect', async request => {
    if (!isAppURL(request.url, appURL)) return new Response('Not found', { status: 404 });
    try { return await service.request(request); }
    catch { return new Response(JSON.stringify({ error: '本机创作进程暂不可用，请重新打开应用。' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }); }
  });
  if (quitting) return;
  service.child.once('exit', () => {
    if (quitting) return;
    dialog.showErrorBox('创作服务已停止', '本机草稿已保留，请重新打开应用。可在应用数据目录的 desktop-service.log 查看诊断信息。');
    allowQuit = allowClose = true;
    app.quit();
  });
  const clipboard = (contents, permission, origin) => contents === mainWindow?.webContents && permission === 'clipboard-sanitized-write' && isAppURL(origin, appURL);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(clipboard(contents, permission, details.requestingUrl || contents?.getURL())));
  session.defaultSession.setPermissionCheckHandler(clipboard);
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: '导出作品', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
  });
  menu = buildMenu(Menu, {
    command: id => {
      const existing = !!mainWindow;
      openWindow();
      if (existing) bridge.command(id);
      else mainWindow.webContents.once('did-finish-load', () => bridge.command(id));
    }, close: () => mainWindow?.close(),
    reload: () => leave(async () => mainWindow?.webContents.reload()),
    openWorkspace: () => shell.openPath(workspace), openImages: () => shell.openPath(imageDir), openData: () => shell.openPath(userData),
    chooseWorkspace: () => chooseDirectory(false).catch(error => dialog.showErrorBox('无法打开创作空间', error.message)),
    createWorkspace: () => chooseDirectory(false, true).catch(error => dialog.showErrorBox('无法新建创作空间', error.message)),
    chooseImages: () => chooseDirectory(true).catch(error => dialog.showErrorBox('无法选择图片文件夹', error.message)),
    revokeAI: process.mas ? async () => {
      approvedRecipients.clear();
      // Terminating the service closes in-flight provider connections as well.
      await finishQuit(true);
    } : null,
    connectCodex: process.mas ? async () => {
      try {
        const result = await dialog.showOpenDialog(mainWindow, { title: '连接 Codex 登录',
          message: '选择已登录 Codex 的 auth.json（通常在个人目录的 .codex 文件夹）。仅将访问凭据加密保存到 ComicPerfect，不读取历史对话。连接后重启应用。',
          properties: ['openFile', 'showHiddenFiles'], filters: [{ name: 'Codex 登录', extensions: ['json'] }], securityScopedBookmarks: true });
        if (result.canceled) return;
        if (!result.bookmarks?.[0]) throw new Error('未获得登录文件访问授权。');
        const stop = app.startAccessingSecurityScopedResource(result.bookmarks[0]);
        let token;
        try { token = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')).tokens?.access_token; }
        finally { stop(); }
        if (typeof token !== 'string' || !token.trim()) throw new Error('所选文件中没有有效的 Codex 登录凭据。');
        await leave(async () => { secrets.set('codex_auth', token); await finishQuit(true); });
      } catch (error) { dialog.showErrorBox('无法连接 Codex', error.message); }
    } : null,
    workspaceFromEnv: !!process.env.COMICBRAIN_ROOT, imagesFromEnv: !!process.env.COMIC_IMAGE_DIR,
    openPrivacy: () => shell.openExternal('https://the-way-here-support.finedeer64.chatgpt.site/comicperfect/privacy.html'),
    openSupport: () => shell.openExternal('https://the-way-here-support.finedeer64.chatgpt.site/comicperfect/support.html'),
  });
  Menu.setApplicationMenu(menu);
  updateMenu(menu, state);
  if (mainWindow) loadProduct(mainWindow);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (settings) openWindow(); });
  app.whenReady().then(start).catch(async error => {
    if (quitting) return;
    dialog.showErrorBox('ComicPerfect 启动失败', error.message + '\n诊断日志：' + path.join(app.getPath('userData'), 'desktop-service.log'));
    await finishQuit();
  });
  app.on('activate', () => { if (settings && !quitting) openWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => {
    if (allowQuit) return;
    event.preventDefault();
    if (bridge) leave(() => finishQuit()); else finishQuit();
  });
}
