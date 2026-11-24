const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWindow } = require('../window.cjs');

test('image context menu copies the clicked image and ignores empty images and other content', () => {
  let template, popupWindow;
  const copied = [];
  class BrowserWindow extends EventEmitter {
    constructor() {
      super();
      this.webContents = new EventEmitter();
      this.webContents.isDestroyed = () => false;
      this.webContents.copyImageAt = (x, y) => copied.push([x, y]);
    }
  }
  const window = createWindow({
    BrowserWindow,
    screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1280, height: 840 } }] },
    Menu: { buildFromTemplate(items) {
      template = items;
      return { popup: options => { popupWindow = options.window; } };
    } },
  });
  for (const params of [{ mediaType: 'none' }, { mediaType: 'image', hasImageContents: false }]) {
    window.webContents.emit('context-menu', {}, params);
    assert.equal(template, undefined);
  }
  window.webContents.emit('context-menu', {}, { mediaType: 'image', hasImageContents: true, x: 42, y: 73 });
  assert.equal(template[0].label, '复制图片');
  assert.equal(popupWindow, window);
  template[0].click();
  assert.deepEqual(copied, [[42, 73]]);
  window.webContents.isDestroyed = () => true;
  template[0].click();
  assert.equal(copied.length, 1);
});
