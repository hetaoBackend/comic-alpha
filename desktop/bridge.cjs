const { randomUUID } = require('node:crypto');
const { isAppURL } = require('./runtime.cjs');
const COMMANDS = require('../frontend/js/commandContract.js');

function createBridge({ ipcMain, getWindow, getURL, onState }) {
  const pending = new Map();
  const trusted = event => {
    const contents = getWindow()?.webContents;
    return contents && event.sender === contents && event.senderFrame === contents.mainFrame && isAppURL(event.senderFrame.url, getURL());
  };
  ipcMain.on('comic:prepared', (event, id, result) => {
    if (!trusted(event) || !pending.has(id) || !result || typeof result !== 'object') return;
    pending.get(id)({ ok: result.ok === true, busy: result.busy === true, localSaved: result.localSaved === true,
      message: typeof result.message === 'string' ? result.message.slice(0, 500) : '' });
  });
  ipcMain.on('comic:state', (event, state) => {
    if (!trusted(event) || !state || typeof state !== 'object') return;
    onState({ busy: state.busy === true, pending: state.pending === true, canExport: state.canExport === true,
      route: typeof state.route === 'string' && state.route.startsWith('#') ? state.route.slice(0, 500) : '#home',
      title: typeof state.title === 'string' ? state.title.slice(0, 120) : '创作工作台' });
  });
  return {
    command(command) { if (Object.hasOwn(COMMANDS, command)) getWindow()?.webContents.send('comic:command', command); },
    prepare() {
      const window = getWindow();
      if (!window || !isAppURL(window.webContents.getURL(), getURL())) return Promise.resolve({ ok: true });
      return new Promise(resolve => {
        const id = randomUUID();
        const timer = setTimeout(() => finish({ ok: false, localSaved: false, message: '保存检查暂未响应，请稍后重试。' }), 12000);
        function finish(result) { clearTimeout(timer); pending.delete(id); resolve(result); }
        pending.set(id, finish);
        window.webContents.send('comic:prepare', id);
      });
    },
  };
}
module.exports = { createBridge };
