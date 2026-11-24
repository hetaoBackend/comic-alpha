class WorkspaceUI {
  constructor(app) {
    this.app = app;
    this.info = window.COMIC_RUNTIME?.workspace || null;
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
    const actions = native ? `<div class="inline-actions"><button class="button" data-workspace-action="choose" ${disabled}>打开已有空间</button><button class="button primary" data-workspace-action="create" ${disabled}>新建空间</button></div>` : "";
    const recent = (w?.recent || []).filter(item => !item.current);
    return `<div class="workspace-manager">${heading("创作空间", "一个文件夹，保存一套完整的漫画创作。", actions)}
      ${this.error ? `<p class="connection-status error" role="alert">${E(this.error)}</p>` : ""}
      <section class="workspace-summary"><div class="workspace-summary-heading"><div><p class="hint">当前空间${w?.locked ? " · 启动配置指定" : ""}</p><h2>${E(w?.name || "本机创作空间")}</h2></div>${badge("正在使用")}</div><p class="workspace-path">${E(w?.path || "由本机服务指定")}</p><div class="workspace-summary-footer"><span>${this.app.seriesList.length} 个系列 · ${this.app.workspace.principles.length} 份创作原则</span>${native ? '<button class="button" data-workspace-action="open">在 Finder 中打开</button>' : ""}</div></section>
      ${recent.length ? `<section class="studio-section"><div class="section-header"><h2>最近打开</h2></div><div class="workspace-recent">${recent.map(item=>`<div class="workspace-row"><div><h3>${E(item.name)}</h3><p class="workspace-path">${E(item.path)}</p></div><button class="button" data-workspace-action="switch" data-workspace-root="${E(item.path)}" ${disabled || (!item.available ? "disabled" : "")}>${item.available ? "打开空间" : "文件夹不可用"}</button></div>`).join("")}</div></section>` : ""}
      <div class="workspace-explanation"><h3>文件由你保管</h3><p>系列、创作原则、草稿和图片都在这个文件夹里。可以直接备份整个文件夹；移动后，通过“打开已有空间”重新关联。</p><p>${!native ? "浏览器使用本机服务指定的空间。选择或新建空间，请在桌面 App 中操作。" : w?.locked ? "当前空间由启动配置指定，更改配置并重新打开应用后生效。" : "切换前自动保存草稿，下次启动回到上次使用的空间。"}</p></div></div>`;

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
