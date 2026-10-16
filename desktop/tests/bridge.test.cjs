const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBridge } = require('../bridge.cjs');

test('native actions accept only the app main frame and wait for save acknowledgement', async () => {
  const ipcMain = new EventEmitter();
  const frame = { url: 'http://127.0.0.1:18764/#draft/test' };
  const contents = { mainFrame: frame, getURL: () => frame.url, send(channel, id) {
    if (channel === 'comic:prepare') queueMicrotask(() => ipcMain.emit('comic:prepared', { sender: contents, senderFrame: frame }, id, { ok: true, localSaved: true }));
  } };
  let state;
  const bridge = createBridge({ ipcMain, getWindow: () => ({ webContents: contents }), getURL: () => 'http://127.0.0.1:18764', onState: value => { state = value; } });
  ipcMain.emit('comic:state', { sender: {}, senderFrame: frame }, { title: 'forged' });
  assert.equal(state, undefined);
  ipcMain.emit('comic:state', { sender: contents, senderFrame: { url: frame.url } }, { title: 'subframe' });
  assert.equal(state, undefined);
  ipcMain.emit('comic:state', { sender: contents, senderFrame: frame }, { title: '作品', route: 'https://outside.example', busy: true });
  assert.equal(state.title, '作品');
  assert.equal(state.route, '#home');
  assert.deepEqual(await bridge.prepare(), { ok: true, busy: false, localSaved: true, message: '' });
});
