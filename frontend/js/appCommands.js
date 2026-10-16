/* Platform-independent application actions, keyboard routing and safe persistence. */
class AppCommands {
  constructor(controller, host = window.DesktopHost) {
    this.controller = controller;
    this.host = host;
  }
  install() {
    const run = command => this.execute(command).catch(error => this.controller.notify(error.message));
    this.host?.onCommand(run);
    this.host?.onPrepareToLeave(async () => this.prepareToLeave());
    window.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      // Native menu accelerators own desktop key events; Web uses the same contract.
      if (this.host && event.metaKey) return;
      const command = Object.entries(window.ComicCommands).find(([, spec]) => {
        const parts = spec.accelerator?.split('+') || [];
        return parts.at(-1)?.toLowerCase() === event.key.toLowerCase() && parts.includes('Shift') === event.shiftKey;
      })?.[0];
      if (command) { event.preventDefault(); run(command); }
    });
    window.addEventListener('beforeunload', event => {
      if (this.host) return; // The shell waits for this same prepareToLeave operation.
      if (this.controller.busy || !this.controller.store.local()) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    for (const name of ['console-saved', 'console-save-error', 'hashchange'])
      window.addEventListener(name, () => this.reportState());
    this.reportState();
  }
  reportState() {
    const c = this.controller;
    const [route, id] = c.route();
    const active = ['draft', 'work'].includes(route) ? c.store.drafts[id] : null;
    this.host?.reportState({
      busy: !!c.busy, pending: !!c.store.dirty.size,
      canExport: !!active, route: location.hash,
      title: active?.title || '创作工作台',
    });
  }
  async savePending() {
    const c = this.controller;
    if (!c.store.local()) throw new Error('本机保存失败，请保持窗口打开并导出草稿备份');
    await c.store.flushAll();
    const reviews = new Set([...(c.pendingReviews || []), ...(c.reviewTimers?.keys() || [])]);
    await Promise.all([...reviews].map(id => c.store.drafts[id]).filter(Boolean).map(d => c.persistReview(d)));
    this.reportState();
  }
  async prepareToLeave() {
    const c = this.controller;
    const localSaved = c.store.local();
    if (c.busy) return { ok: false, busy: true, localSaved };
    try { await this.savePending(); return { ok: true, localSaved: true }; }
    catch (error) { return { ok: false, localSaved, message: error.message }; }
  }
  async execute(command) {
    const c = this.controller;
    if (!Object.hasOwn(window.ComicCommands, command)) return;
    if (c.busy && ['new-single', 'new-series', 'export'].includes(command)) {
      c.notify('请等待当前生成完成后再操作');
      return;
    }
    if (command === 'save') { await this.savePending(); c.notify('草稿已保存到本机与创作空间'); }
    else if (command === 'export') {
      const [route, id] = c.route();
      const d = ['draft', 'work'].includes(route) ? c.store.drafts[id] : null;
      if (!d) throw new Error('请先打开要导出的作品');
      if (Object.values(d.images || {}).some(entry => entry.versions?.length)) await c.exportWork(d);
      else c.downloadBlob(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), (d.title || '漫画草稿') + '.json');
    }
    else if (command === 'new-single' || command === 'new-series') c.create(command === 'new-single' ? 'single' : 'series');
    else if (command === 'settings') { if (location.hash !== '#settings') c.returnHash = location.hash || '#home'; c.navigate('#settings'); }
    else if (command === 'assistant') c.assistant?.open();
    else if (['home', 'series', 'library'].includes(command)) c.navigate('#' + command);
    else if (command === 'back') window.history.back();
    else if (command === 'forward') window.history.forward();
    else if (command === 'help') { const dialog = document.getElementById('notes-dialog'); if (!dialog.open) dialog.showModal(); }
    this.reportState();
  }
}
window.AppCommands = AppCommands;
