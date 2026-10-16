class ScopedAccess {
  constructor(app, settings) { this.app = app; this.settings = settings; this.stops = new Map(); }
  restore() {
    const unavailable = [];
    for (const [directory, bookmark] of Object.entries(this.settings.value.bookmarks || {})) {
      try { this.stops.set(directory, this.app.startAccessingSecurityScopedResource(bookmark)); }
      catch { unavailable.push(directory); }
    }
    return unavailable;
  }
  remember(directory, bookmark) {
    if (!bookmark) throw new Error('系统未返回文件夹访问授权，请重新选择。');
    const stop = this.app.startAccessingSecurityScopedResource(bookmark);
    try { this.settings.update({ bookmarks: { ...this.settings.value.bookmarks, [directory]: bookmark } }); }
    catch (error) { stop(); throw error; }
    this.stops.get(directory)?.();
    this.stops.set(directory, stop);
  }
  close() { for (const stop of this.stops.values()) stop(); this.stops.clear(); }
}
module.exports = { ScopedAccess };
