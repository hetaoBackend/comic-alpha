class WorkspaceUI {
  constructor(app) {
    this.app = app;
    this.info = null;
    this.loading = !!window.DesktopHost?.getWorkspace;
    this.error = "";
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-workspace-action]");
      if (button) this.act(button.dataset.workspaceAction, button.dataset.workspaceRoot);
    });
    this.load();
  }
  async load() {
    try {
      if (window.DesktopHost?.getWorkspace) {
        const result = await window.DesktopHost.getWorkspace();
        if (!result.ok) throw new Error(result.error || "创作空间暂不可用");
        this.info = result.workspace;
      }
    } catch (error) { this.error = error.message; }
    this.loading = false;
    this.updateLabel();
    if (this.app.route()[0] === "workspace") this.app.render();
  }
  updateLabel() {
    const label = document.getElementById("workspace-name");
    if (label) label.textContent = this.info?.name || "本机创作空间";
  }
  view() {
    const w = this.info;
    const native = !!window.DesktopHost?.workspaceAction;
    const disabled = this.loading || this.pending || this.app.busy || !native || w?.locked ? "disabled" : "";
    return `${heading("创作空间", "每个空间独立保存系列、创作原则、草稿与图片。", link("返回工作台", "#home"))}<section class="panel workspace-current"><div><h2>${E(w?.name || "本机创作空间")}</h2><p class="hint">当前正在使用${w?.locked ? " · 由启动配置指定" : ""}</p>${w?.path ? `<p class="workspace-path">${E(w.path)}</p>` : ""}<p class="hint">${this.app.seriesList.length} 个系列 · ${this.app.workspace.principles.length} 份创作原则</p></div>${native ? '<button class="button" data-workspace-action="open">在 Finder 中打开</button>' : ""}</section>${this.error ? `<p class="connection-status error" role="alert">${E(this.error)}</p>` : ""}<section class="panel workspace-actions"><h2>选择创作空间</h2><p>继续之前的创作，打开已有空间；开始一个独立项目，新建空白空间。</p><div class="inline-actions"><button class="button primary" data-workspace-action="choose" ${disabled}>打开已有空间</button><button class="button" data-workspace-action="create" ${disabled}>新建创作空间</button></div><p class="hint">${!native ? "浏览器版使用本机服务启动时指定的空间。请在桌面 App 中选择或切换空间。" : w?.locked ? "当前空间由启动配置指定。更改启动配置并重新打开应用后生效。" : "选择文件夹后，会先保存当前草稿，再重新打开应用载入目标空间。新空间从空白开始；原空间仍可从最近使用列表打开。"}</p></section>${w?.recent?.length ? `<section class="panel"><h2>最近使用</h2><div class="workspace-recent">${w.recent.map(item => `<div class="workspace-row"><div><h3>${E(item.name)}</h3><p class="workspace-path">${E(item.path)}</p></div>${item.current ? '<span class="badge">正在使用</span>' : `<button class="button" data-workspace-action="switch" data-workspace-root="${E(item.path)}" ${disabled || (!item.available ? "disabled" : "")}>${item.available ? "切换到此空间" : "文件夹不可用"}</button>`}</div>`).join("")}</div></section>` : ""}`;
  }
  async act(action, root) {
    if (this.pending) return;
    if (!window.DesktopHost?.workspaceAction) return;
    if (this.app.busy && action !== "open") { this.app.notify("请等待当前生成完成，再切换创作空间。"); return; }
    this.error = "";
    this.pending = true;
    if (this.app.route()[0] === "workspace") this.app.render();
    try {
      const result = await window.DesktopHost.workspaceAction(action, root);
      if (!result.ok) throw new Error(result.error || "空间操作未完成");
    } catch (error) { this.error = error.message; if (this.app.route()[0] !== "workspace") this.app.notify(this.error); }
    finally { this.pending = false; if (this.app.route()[0] === "workspace") this.app.render(); }
  }
}
window.WorkspaceUI = WorkspaceUI;
