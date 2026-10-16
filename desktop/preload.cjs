const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('DesktopHost', Object.freeze({
  getWorkspace: () => ipcRenderer.invoke('comic:workspace-info'),
  workspaceAction: (action, root) => ipcRenderer.invoke('comic:workspace-action', action, root),
  authorizeAI: (pathname, body) => ipcRenderer.invoke('comic:authorize-ai', pathname, body),
  getSecret: key => ipcRenderer.sendSync('comic:secret', 'get', key),
  setSecret: (key, value) => ipcRenderer.sendSync('comic:secret', 'set', key, value),
  onCommand(callback) {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('comic:command', listener);
    return () => ipcRenderer.removeListener('comic:command', listener);
  },
  onPrepareToLeave(callback) {
    const listener = async (_event, id) => {
      try { ipcRenderer.send('comic:prepared', id, await callback()); }
      catch { ipcRenderer.send('comic:prepared', id, { ok: false, localSaved: false }); }
    };
    ipcRenderer.on('comic:prepare', listener);
    return () => ipcRenderer.removeListener('comic:prepare', listener);
  },
  reportState: state => ipcRenderer.send('comic:state', state),
}));
