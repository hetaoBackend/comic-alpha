const fs = require('node:fs');
class SecretStore {
  constructor(filename, safeStorage) { this.filename = filename; this.storage = safeStorage; }
  read() {
    if (!this.storage.isEncryptionAvailable()) throw new Error('钥匙串不可用，无法访问模型凭据。');
    try { return JSON.parse(this.storage.decryptString(fs.readFileSync(this.filename))); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  get(key) { return this.read()[key] || ''; }
  set(key, value) {
    const data = this.read();
    if (value) data[key] = value; else delete data[key];
    const encrypted = this.storage.encryptString(JSON.stringify(data));
    fs.writeFileSync(this.filename + '.tmp', encrypted, { mode: 0o600 });
    fs.renameSync(this.filename + '.tmp', this.filename);
  }
}
function installSecretIPC(ipcMain, store, trusted) {
  const keys = new Set(['comic_api_key', 'comic_google_api_key']);
  ipcMain.on('comic:secret', (event, action, key, value) => {
    let result = { ok: false };
    try {
      if (trusted(event) && keys.has(key)) {
        if (action === 'get') result = { ok: true, value: store.get(key) };
        else if (action === 'set' && typeof value === 'string' && value.length < 16384) {
          store.set(key, value); result = { ok: true };
        }
      }
    } catch { result = { ok: false, error: '钥匙串不可用，凭据未保存。' }; }
    // Electron sends the synchronous IPC reply when this property is assigned.
    // Send once, after the operation, so success never races a default failure.
    event.returnValue = result;
  });
}
module.exports = { SecretStore, installSecretIPC };
