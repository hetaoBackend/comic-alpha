const COMMANDS = require('../frontend/js/commandContract.js');

function buildMenu(Menu, actions) {
  const command = id => ({ id, ...COMMANDS[id], click: () => actions.command(id) });
  return Menu.buildFromTemplate([
    { label: 'ComicPerfect', submenu: [{ role: 'about' }, { type: 'separator' }, command('settings'), { type: 'separator' },
      { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '文件', submenu: [command('new-single'), command('new-series'), { type: 'separator' }, command('save'), command('export'), { type: 'separator' },
      { label: '关闭窗口', accelerator: 'CommandOrControl+W', click: actions.close }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [command('back'), command('forward'), { type: 'separator' }, command('home'), command('series'), command('library'), command('assistant'),
      { type: 'separator' }, { label: '重新载入', accelerator: 'CommandOrControl+R', click: actions.reload },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: '创作空间', submenu: [
      { label: '打开创作空间文件夹', click: actions.openWorkspace },
      { label: '打开图片文件夹', click: actions.openImages },
      { label: '打开诊断日志文件夹', click: actions.openData }, { type: 'separator' },
      { label: '选择已有创作空间…', enabled: !actions.workspaceFromEnv, click: actions.chooseWorkspace },
      { label: '新建创作空间…', enabled: !actions.workspaceFromEnv, click: actions.createWorkspace },
      { label: '选择图片文件夹…', enabled: !actions.imagesFromEnv, click: actions.chooseImages },
      ...(actions.connectCodex ? [{ type: 'separator' }, { label: '连接 Codex 登录…', click: actions.connectCodex }] : []),
      ...(actions.revokeAI ? [{ label: '停止 AI 共享（重启应用）', click: actions.revokeAI }] : []),
    ] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] },
    { label: '帮助', submenu: [command('help'),
      ...(actions.openPrivacy ? [{ label: '隐私政策', click: actions.openPrivacy }, { label: '使用帮助与支持', click: actions.openSupport }] : [])] },
  ]);
}
function updateMenu(menu, state) {
  for (const id of ['new-single', 'new-series']) menu.getMenuItemById(id).enabled = !state.busy;
  menu.getMenuItemById('export').enabled = state.canExport && !state.busy;
}
module.exports = { buildMenu, updateMenu };
