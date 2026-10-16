/* Draft persistence is separate from provider credentials and generated image versions. */
class ConsoleStore {
  constructor() {
    const legacyKey = "comicperfect_console_v1";
    const workspace = window.COMIC_RUNTIME?.workspaceId;
    this.key = workspace ? `${legacyKey}:${workspace}` : legacyKey;
    this.legacyAllowed = true;
    if (workspace) {
      try {
        const owner = localStorage.getItem(`${legacyKey}:owner`);
        this.legacyAllowed = !owner || owner === workspace;
        if (!owner) localStorage.setItem(`${legacyKey}:owner`, workspace);
        if (this.legacyAllowed && !localStorage.getItem(this.key)) {
          const prior = localStorage.getItem(legacyKey);
          if (prior) localStorage.setItem(this.key, prior);
        }
      } catch {}
    }
    this.drafts = this.read();
    this.queues = new Map();
    this.timers = new Map();
    try {
      this.dirty = new Set(JSON.parse(localStorage.getItem(`${this.key}:pending`) || '[]'));
    } catch { this.dirty = new Set(); }
    this.migrate();
  }
  read() {
    try {
      const value = JSON.parse(localStorage.getItem(this.key) || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
      Object.values(value).forEach((d) => this.normalize(d));
      return value;
    } catch {
      return {};
    }
  }
  normalize(d) {
    if (d.workflowVersion === 2) return d;
    if (d.mode === "series") {
      d.step = d.source
        ? d.step >= 3
          ? 2
          : d.step >= 2
            ? 1
            : 0
        : d.step >= 3
          ? 4
          : d.step;
    }
    d.workflowVersion = 2;
    return d;
  }
  migrate() {
    if (!this.legacyAllowed) return;
    let old;
    try {
      old = JSON.parse(localStorage.getItem("comic_sessions") || "{}");
    } catch {
      return;
    }
    for (const s of Object.values(old || {})) {
      if (!s || typeof s !== "object") continue;
      if (this.drafts[s.id] || (!s.comicData && !s.prompt)) continue;
      const d = this.create(
        s.comicBrainProject ? "series" : "single",
        s.comicBrainProject?.seriesId,
        s.id,
      );
      Object.assign(d, {
        title: s.name,
        idea: s.prompt || "",
        style: s.style || "doraemon",
        language: s.language || "zh",
        pages: s.comicData?.pages || [],
        step: s.comicData
          ? s.comicBrainProject || d.mode === "single"
            ? 1
            : 2
          : 0,
        reference: s.referenceImage,
        coverBrief: s.coverCustomRequirements || "",
        updatedAt: s.updatedAt,
        source: s.comicBrainProject,
      });
      d.images = Object.fromEntries(
        Object.entries(s.generatedImages || {}).map(([index, image]) => [
          index,
          {
            versions: (image.versions || (image.imageUrl ? [image] : [])).map(
              (v) => ({
                ...v,
                fingerprint:
                  v.fingerprint ||
                  v.pageScriptFingerprint ||
                  image.pageScriptFingerprint ||
                  (s.comicData?.pages?.[Number(index)]
                    ? StoryboardImageReconciler.pageFingerprint(
                        s.comicData.pages[Number(index)],
                      )
                    : null),
              }),
            ),
            current: image.currentVersion || 0,
          },
        ]),
      );
    }
    this.local();
  }
  create(mode, seriesId = null, id = "draft-" + crypto.randomUUID()) {
    const d = {
      id,
      mode,
      workflowVersion: 2,
      seriesId,
      seriesName: "",
      title: "",
      idea: "",
      inspirationReference: "",
      step: 0,
      pageCount: 3,
      chapterCount: 1,
      chapterIndex: 0,
      style: "doraemon",
      language: "zh",
      rows: 4,
      chapters: [],
      pages: [],
      images: {},
      ruleApplications: [],
      revisionText: "",
      revision: null,
      updatedAt: new Date().toISOString(),
    };
    this.drafts[id] = d;
    return d;
  }
  local() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.drafts));
      localStorage.setItem(`${this.key}:pending`, JSON.stringify([...this.dirty]));
      return true;
    } catch {
      window.dispatchEvent(
        new CustomEvent("console-save-error", {
          detail: "本机存储空间不足，正在尝试写入工作空间。请勿关闭页面。",
        }),
      );
      return false;
    }
  }
  merge(remote, persist = true) {
    for (const d of remote) {
      this.normalize(d);
      const local = this.drafts[d.id];
      if (
        !local ||
        (!this.dirty.has(d.id) && new Date(d.updatedAt) > new Date(local.updatedAt))
      )
        this.drafts[d.id] = d;
    }
    if (persist) this.local();
  }
  save(d) {
    d.updatedAt = new Date().toISOString();
    this.drafts[d.id] = d;
    this.dirty.add(d.id);
    this.local();
    clearTimeout(this.timers.get(d.id));
    this.timers.set(
      d.id,
      setTimeout(() => this.flush(d.id).catch(() => {}), 600),
    );
  }
  async flush(id) {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    const prior = this.queues.get(id) || Promise.resolve();
    const next = prior
      .catch(() => {})
      .then(async () => {
        const draft = this.drafts[id];
        const stamp = draft.updatedAt;
        try {
          const result = await ConsoleAPI.request(
            `/console/drafts/${encodeURIComponent(id)}`,
            "PUT",
            {
              draft: JSON.parse(JSON.stringify(draft)),
              revision: draft.revision,
            },
          );
          draft.revision = result.draft.revision;
          if (stamp === draft.updatedAt) {
            draft.updatedAt = result.draft.updatedAt;
            draft.canonDecision = result.draft.canonDecision || null;
            this.dirty.delete(id);
          }
          this.local();
          window.dispatchEvent(
            new CustomEvent("console-saved", { detail: id }),
          );
          return result.draft;
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent("console-save-error", {
              detail: error.message + " · 修改已保留在本机",
            }),
          );
          throw error;
        }
      });
    this.queues.set(id, next);
    const cleanup = () => {
      if (this.queues.get(id) === next) this.queues.delete(id);
    };
    next.then(cleanup, cleanup);
    return next;
  }
  async flushAll() {
    for (let pass = 0; pass < 3; pass++) {
      const ids = new Set([...this.dirty, ...this.timers.keys()]);
      await Promise.all([...ids].filter(id => this.drafts[id]).map(id => this.flush(id)));
      await Promise.all([...this.queues.values()]);
      if (!this.dirty.size) return;
    }
    throw new Error('仍有新的修改待保存，请稍后再试');
  }
  all() {
    return Object.values(this.drafts).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
}
class ConsoleAPI {
  static async request(path, method = "GET", body) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("无法连接本机服务，请启动后端后重试");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "请求未完成，请重试");
    return data;
  }
  static textConfig() {
    const c = ConfigManager.getCurrentConfig();
    return {
      api_key: ConfigManager.loadApiKey(),
      google_api_key: ConfigManager.loadGoogleApiKey(),
      base_url: c.baseUrl,
      model: c.model,
      text_provider: c.textProvider,
      reasoning_effort: c.reasoningEffort,
    };
  }
  static imageConfig() {
    return {
      ...ConfigManager.getCurrentConfig(),
      openaiApiKey: ConfigManager.loadApiKey(),
      googleApiKey: ConfigManager.loadGoogleApiKey(),
    };
  }
  static imageURL(value) {
    if (typeof value !== "string") return "";
    if (/^data:image\/(?:png|jpeg|webp);base64,/.test(value)) return value;
    if (
      /^\/(?:backend\/)?static\/images\/[\w.-]+\.(?:png|jpe?g|webp|gif)$/i.test(
        value,
      )
    )
      return API_BASE_URL.replace(/\/api\/?$/, "") + value.replace(/^\/backend/, '');
    // Legacy sessions may contain absolute localhost image URLs.
    try {
      const u = new URL(value);
      if (
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
        /^\/(?:backend\/)?static\/images\/[\w.-]+$/i.test(u.pathname)
      )
        return this.imageURL(u.pathname);
    } catch {}
    return "";
  }
}
window.ConsoleStore = ConsoleStore;
window.ConsoleAPI = ConsoleAPI;
