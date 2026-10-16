const path = require('node:path');

function restoreBounds(saved, workAreas) {
  const valid = saved && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved[key]));
  const area = (valid && workAreas.find(a => saved.x < a.x + a.width && saved.x + saved.width > a.x && saved.y < a.y + a.height && saved.y + saved.height > a.y)) || workAreas[0];
  const width = Math.max(Math.min(760, area.width), Math.min(valid ? saved.width : 1280, area.width - 32));
  const height = Math.max(Math.min(540, area.height), Math.min(valid ? saved.height : 840, area.height - 32));
  return { width, height,
    x: valid ? Math.min(Math.max(saved.x, area.x), area.x + area.width - width) : area.x + Math.round((area.width - width) / 2),
    y: valid ? Math.min(Math.max(saved.y, area.y), area.y + area.height - height) : area.y + Math.round((area.height - height) / 2) };
}

function createWindow({ BrowserWindow, screen, saved = {}, onClose, onPersist }) {
  const areas = screen.getAllDisplays().map(display => display.workArea);
  const bounds = restoreBounds(saved.bounds, areas);
  const window = new BrowserWindow({ ...bounds, title: 'ComicPerfect',
    minWidth: Math.min(760, bounds.width), minHeight: Math.min(540, bounds.height),
    backgroundColor: '#f7f8fa', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  if (saved.maximized) window.maximize();
  window.once('ready-to-show', () => window.show());
  window.webContents.on('page-title-updated', event => event.preventDefault());
  const persist = () => onPersist({ bounds: window.getNormalBounds(), maximized: window.isMaximized(), zoom: window.webContents.getZoomFactor() });
  let timer;
  for (const event of ['resize', 'move']) window.on(event, () => { clearTimeout(timer); timer = setTimeout(persist, 250); });
  window.on('close', event => { clearTimeout(timer); persist(); onClose(event); });
  window.webContents.on('did-finish-load', () => {
    if (Number.isFinite(saved.zoom)) window.webContents.setZoomFactor(Math.min(2, Math.max(0.5, saved.zoom)));
  });
  return window;
}
module.exports = { restoreBounds, createWindow };
