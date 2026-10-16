/* Shared command identities and shortcuts. The desktop shell never implements them. */
(function (root) {
  const commands = Object.freeze({
    'new-single': { label: '新建单篇漫画', accelerator: 'CommandOrControl+N' },
    'new-series': { label: '新建系列', accelerator: 'CommandOrControl+Shift+N' },
    save: { label: '立即保存草稿', accelerator: 'CommandOrControl+S' },
    export: { label: '导出当前作品…', accelerator: 'CommandOrControl+Shift+E' },
    settings: { label: '创作设置…', accelerator: 'CommandOrControl+,' },
    assistant: { label: '创作助手', accelerator: 'CommandOrControl+J' },
    home: { label: '创作工作台', accelerator: 'CommandOrControl+1' },
    series: { label: '我的系列', accelerator: 'CommandOrControl+2' },
    library: { label: '漫画作品', accelerator: 'CommandOrControl+3' },
    back: { label: '后退', accelerator: 'CommandOrControl+[' },
    forward: { label: '前进', accelerator: 'CommandOrControl+]' },
    help: { label: '使用说明' },
  });
  if (typeof module !== 'undefined') module.exports = commands;
  else root.ComicCommands = commands;
})(typeof window === 'undefined' ? globalThis : window);
