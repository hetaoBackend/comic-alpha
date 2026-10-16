const fs = require('node:fs');
const path = require('node:path');
const { canonicalPath } = require('./settings.cjs');

function selectWorkspace(directory) {
  const root = canonicalPath(directory);
  for (const candidate of [root, path.join(root, 'ComicBrain')]) {
    if (['wiki/index.md', '.agents/skills/comic-wiki/SKILL.md'].every(file => fs.existsSync(path.join(candidate, file))))
      return canonicalPath(candidate);
  }
  throw new Error('这个文件夹里没有完整的创作空间。请选择已有空间，或用“新建创作空间”创建一个空白空间。');
}

function rememberWorkspace(settings, root) {
  const recentRoots = [root, ...(Array.isArray(settings.value.recentRoots) ? settings.value.recentRoots : [])]
    .filter((value, index, all) => typeof value === 'string' && all.indexOf(value) === index).slice(0, 8);
  settings.update({ recentRoots });
}

function createWorkspace(directory, source) {
  const root = canonicalPath(directory);
  if (fs.readdirSync(root).some(name => !['.DS_Store', '.localized'].includes(name)))
    throw new Error('请选择空文件夹。已有文件不会被覆盖；已有创作空间请使用“打开已有空间”。');
  if (!fs.existsSync(path.join(source, '.agents/skills/comic-wiki/SKILL.md')))
    throw new Error('创作空间模板不可用，请重新安装应用。');
  // Copy reusable behavior only. Never copy an author's Wiki, assets or projects.
  fs.cpSync(path.join(source, '.agents/skills'), path.join(root, '.agents/skills'), { recursive: true,
    filter: file => !fs.lstatSync(file).isSymbolicLink() && !['__pycache__', '.DS_Store'].includes(path.basename(file)) });
  fs.copyFileSync(path.join(source, 'AGENTS.md'), path.join(root, 'AGENTS.md'), fs.constants.COPYFILE_EXCL);
  const pages = {
    'index.md': ['workspace-index', '创作空间', '[[wiki/index|打开创作资料]]'],
    'wiki/index.md': ['wiki-index', '创作资料', '[[wiki/系列/index|系列]]\n\n[[wiki/创作原则/index|创作原则]]\n\n[[wiki/创作偏好/index|创作偏好]]\n\n[[wiki/证据/index|证据]]'],
    'wiki/系列/index.md': ['series-index', '系列', '尚未创建系列。'],
    'wiki/创作原则/index.md': ['principles-index', '创作原则', '尚未添加创作原则。'],
    'wiki/创作偏好/index.md': ['preferences-index', '创作偏好', '尚未记录创作偏好。'],
    'wiki/证据/index.md': ['evidence-index', '证据', '[[wiki/证据/剧情决策日志|剧情决策日志]]\n\n[[wiki/证据/用户反馈日志|用户反馈日志]]'],
    'wiki/证据/剧情决策日志.md': ['decision-log', '剧情决策日志', ''],
    'wiki/证据/用户反馈日志.md': ['feedback-log', '用户反馈日志', ''],
  };
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  for (const [relative, [id, title, body]] of Object.entries(pages)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `---\nid: ${id}\ntype: index\nstatus: draft\nupdated: "${date}"\n---\n\n# ${title}\n\n${body}\n`, { flag: 'wx' });
  }
  fs.mkdirSync(path.join(root, 'production'), { recursive: true });
  return root;
}

function workspaceInfo({ root, imageDir, settings, locked, defaultRoot }) {
  const describe = directory => ({ path: directory, name: directory === defaultRoot ? '默认创作空间' :
    path.basename(directory) === 'ComicBrain' ? path.basename(path.dirname(directory)) : path.basename(directory),
    available: fs.existsSync(directory), current: directory === root });
  return { ...describe(root), imageDir, locked: !!locked,
    recent: (settings.value.recentRoots || []).filter(value => typeof value === 'string').map(describe) };
}

function installWorkspaceIPC(ipcMain, trusted, info, action) {
  ipcMain.handle('comic:workspace-info', event => trusted(event) ? { ok: true, workspace: info() } : { ok: false, error: '无法读取创作空间' });
  ipcMain.handle('comic:workspace-action', async (event, name, root) => {
    if (!trusted(event) || !['choose', 'create', 'open', 'switch'].includes(name)) return { ok: false, error: '无法执行空间操作' };
    try { return await action(name, root) || { ok: true }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}
module.exports = { selectWorkspace, rememberWorkspace, createWorkspace, workspaceInfo, installWorkspaceIPC };
