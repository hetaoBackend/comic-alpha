/* ComicPerfect console: route lifecycle, async jobs and deliberate canon confirmation. */
class UIController {
  constructor() {
    this.store = new ConsoleStore();
    this.views = new ConsoleViews(this);
    this.workspace = {
      series: [],
      principles: [],
      preferences: [],
      projects: [],
    };
    this.connected = false;
    this.loading = true;
    this.error = "";
    this.busy = false;
    this.characterEdits = {};
    this.disclosures = new Map();
    this.renderKey = "";
    this.tab = "chapters";
    this.rule = 0;
    this.output = "comic";
    this.filter = "all";
    this.librarySeries = "";
    this.search = "";
    this.returnHash = null;
    this.main = document.getElementById("content");
    this.bind();
    this.commands = new AppCommands(this);
    this.commands.install();
    this.render();
    this.assistant = window.CreativeAssistant ? new window.CreativeAssistant(this) : null;
    this.workspaceUI = window.WorkspaceUI ? new window.WorkspaceUI(this) : null;
    this.refresh();
  }
  get seriesList() {
    const list = [...this.workspace.series];
    for (const d of this.store.all())
      if (
        d.mode === "series" &&
        d.seriesId &&
        hasContent(d) &&
        !list.some((s) => s.id === d.seriesId)
      )
        list.push({
          id: d.seriesId,
          name: d.seriesName || "新系列",
          summary: d.seriesBrief || d.idea,
          genre: "新系列 · 草稿",
          chapters: [],
          documents: [],
          projects: [],
        });
    return list;
  }
  works() {
    return this.visibleDrafts().flatMap((d) =>
      d.chapters?.length
        ? d.chapters.map((ch, index) =>
            index === d.chapterIndex
              ? { ...d, workPath: d.id + "/" + index }
              : {
                  ...d,
                  title: ch.title,
                  pages: ch.pages || [],
                  aiPages: ch.aiPages || null,
                  futureGuidance: ch.futureGuidance || "",
                  images: ch.images || {},
                  storyDirty: ch.storyDirty,
                  coverImages: ch.coverImages || [],
                  workPath: d.id + "/" + index,
                },
          )
        : [{ ...d, workPath: d.id }],
    );
  }
  mergeSourceVersions(target, others) {
    let changed = false;
    target.images ||= {};
    for (const [i, page] of (target.pages || []).entries()) {
      const entry = (target.images[i] ||= { versions: [], current: 0 });
      const selected = currentImage(entry)?.imageUrl;
      const urls = new Set(entry.versions.map((v) => v.imageUrl));
      for (const other of others) {
        const matched = page.id
          ? other.pages?.findIndex((p) => p.id === page.id)
          : i;
        const index = matched >= 0 ? matched : i;
        for (const version of other.images?.[index]?.versions || []) {
          if (!version.imageUrl || urls.has(version.imageUrl)) continue;
          entry.versions.push({ ...version });
          urls.add(version.imageUrl);
          changed = true;
        }
      }
      if (!selected && entry.versions.length) {
        const fingerprint = StoryboardImageReconciler.pageFingerprint(page);
        let index = entry.versions.findLastIndex(
          (v) => v.fingerprint === fingerprint,
        );
        entry.current = index >= 0 ? index : entry.versions.length - 1;
        changed = true;
      }
    }
    for (const other of others) {
      const urls = new Set((target.coverImages || []).map((v) => v.imageUrl));
      for (const v of other.coverImages || [])
        if (v.imageUrl && !urls.has(v.imageUrl)) {
          (target.coverImages ||= []).push({ ...v });
          urls.add(v.imageUrl);
          changed = true;
        }
    }
    return changed;
  }
  visibleDrafts() {
    const seen = new Map();
    const list = this.store.all().filter((d) => {
      if (!hasContent(d)) return false;
      const key =
        d.source?.seriesId && d.source?.chapterId
          ? d.source.seriesId + "/" + d.source.chapterId
          : d.id;
      if (seen.has(key)) {
        const target = seen.get(key);
        if (d.source) this.mergeSourceVersions(target, [d]);
        return false;
      }
      seen.set(key, d);
      return true;
    });
    return list;
  }
  series(id) {
    return this.seriesList.find((s) => s.id === id);
  }
  draftCover(d) {
    return (
      d.coverImages?.at(-1)?.imageUrl || currentImage(d.images?.[0])?.imageUrl
    );
  }
  seriesCover(id) {
    return this.draftCover(
      this.store.all().find((d) => d.seriesId === id && this.draftCover(d)) ||
        {},
    );
  }
  notify(message) {
    const el = document.getElementById("toast");
    el.textContent = String(message).replace(/ComicBrain/gi, "创作记忆");
    el.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove("visible"), 5500);
  }
  async refresh() {
    this.loading = true;
    this.render();
    try {
      this.workspace = await ConsoleAPI.request("/console/workspace");
      this.store.merge(this.workspace.drafts || []);
      if (this.store.dirty.size) this.store.flushAll().catch(error => this.notify(error.message));
      for (const result of this.workspace.production || [])
        this.hydrateProject(result);
      this.connected = true;
      this.error = "";
    } catch (error) {
      this.connected = false;
      this.error = error.message;
    } finally {
      this.loading = false;
      this.render();
    }
  }
  route() {
    return (location.hash.slice(1) || "home").split("/").map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  }
  navigate(hash) {
    if (location.hash === hash) this.render();
    else location.hash = hash;
  }
  create(mode, sid) {
    const d = this.store.create(mode, sid);
    if (sid) d.style = "reference";
    if (mode === "series" && !sid) {
      d.seriesId = "draft-" + crypto.randomUUID();
      d.seriesName = "";
    }
    this.active = d;
    this.store.save(d);
    this.navigate("#draft/" + d.id);
  }
  render() {
    const focused = document.activeElement;
    if (
      this.lastRenderedHash === location.hash &&
      this.main.contains(focused)
    ) {
      const attributes = [
        "id",
        "data-tab",
        "data-rule",
        "data-step",
        "data-filter",
        "data-output",
        "data-version-page",
        "data-chapter-index",
        "data-action",
        "data-page",
      ];
      const parts = attributes
        .filter((name) => focused.hasAttribute(name))
        .map((name) => `[${name}="${CSS.escape(focused.getAttribute(name))}"]`);
      if (parts.length) this.restoreFocusSelector = parts.join("");
    } else if (this.lastRenderedHash !== location.hash)
      this.restoreFocusSelector = null;
    if (this.renderKey) {
      const states = new Map();
      this.main
        .querySelectorAll("details")
        .forEach((el, i) =>
          states.set(
            i + ":" + el.querySelector("summary")?.textContent,
            el.open,
          ),
        );
      this.disclosures.set(this.renderKey, states);
    }
    const [route, id, chapterIndex] = this.route();
    if (route === "single") {
      const existing = this.store
        .all()
        .find((d) => d.mode === "single" && status(d) !== "已生成");
      if (existing) {
        this.navigate("#draft/" + existing.id);
        return;
      }
      this.create("single");
      return;
    }
    if (route === "new-series") {
      this.create("series");
      return;
    }
    if (route === "editor") {
      if (this.loading) {
        this.main.innerHTML = empty("正在载入系列…", "稍等片刻");
        return;
      }
      const existing = this.store
        .all()
        .find(
          (d) =>
            d.seriesId === id &&
            !d.source &&
            !d.canonDecision &&
            unfinishedDraft(d),
        );
      if (existing) {
        this.navigate("#draft/" + existing.id);
        return;
      }
      if (["deprecated", "archived"].includes(this.series(id)?.status)) {
        this.navigate("#series/" + id);
        return;
      }
      if (!this.series(id)) {
        this.main.innerHTML = empty(
          "系列尚未载入",
          "请回到系列列表，连接工作空间后重试。",
          link("我的系列", "#series"),
        );
        return;
      }
      this.create("series", id);
      return;
    }
    const nav = ["draft", "editor", "new-series"].includes(route)
      ? this.store.drafts[id]?.mode === "single"
        ? "single"
        : "series"
      : route === "work"
        ? "library"
        : route;
    document.querySelectorAll("[data-nav]").forEach((el) => {
      const active = el.dataset.nav === nav;
      el.classList.toggle("active", active);
      if (active) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
    const labels = {
      home: "创作工作台",
      series: id ? this.series(id)?.name : "我的系列",
      library: "漫画作品",
      principles: "创作原则",
      draft: "创作编辑",
      work: "阅读漫画",
      settings: "创作设置",
      workspace: "创作空间",
    };
    document.getElementById("breadcrumb").innerHTML =
      `我的空间 <span>/</span> ${E(labels[route] || "创作工作台")}`;
    let html = "";
    if (route === "home") html = this.views.home();
    else if (route === "series")
      html = id
        ? this.series(id)
          ? this.views.seriesDetail(this.series(id))
          : empty(
              "系列尚未载入",
              "重新同步后查看系列。",
              button("重新同步", "refresh"),
            )
        : this.views.seriesList();
    else if (route === "principles") html = this.views.principles();
    else if (route === "library") html = this.views.library();
    else if (route === "settings") html = this.views.settings();
    else if (route === "workspace") html = this.workspaceUI?.view() || empty("正在读取创作空间…", "稍等片刻");
    else if (route === "draft" || route === "work") {
      this.active = this.store.drafts[id];
      if (!this.active)
        html = empty(
          "没有找到这份作品",
          "连接工作空间后重试，或返回工作台。",
          link("返回工作台", "#home"),
        );
      else {
        if (
          route === "work" &&
          chapterIndex !== undefined &&
          Number(chapterIndex) !== this.active.chapterIndex &&
          this.active.chapters?.[Number(chapterIndex)]
        )
          this.switchChapter(Number(chapterIndex));
        html =
          route === "work"
            ? `${heading(this.active.title || "漫画作品", this.series(this.active.seriesId)?.name || "单篇漫画", link(this.active.mode === "series" ? "返回系列" : "返回作品库", this.active.mode === "series" ? "#series/" + this.active.seriesId : "#library"))}${this.views.output(this.active, true)}`
            : this.views.editor(this.active);
      }
    } else html = this.views.home();
    if (this.loading)
      html =
        `<div class="connection-status" role="status">正在同步创作记忆…</div>` +
        html;
    else if (this.error)
      html =
        `<div class="connection-status error" role="alert"><span>${E(this.error.replace(/ComicBrain/gi, "创作记忆"))} · 本机草稿仍可查看</span>${button("重新连接", "refresh")}</div>` +
        html;
    if (this.jobError && this.jobError.hash === location.hash)
      html =
        `<div class="connection-status error" role="alert"><div><strong>操作未完成</strong><p>${E(this.jobError.message.replace(/ComicBrain/gi, "创作记忆"))}</p><p>已完成内容已保留，可修正后重试。</p></div><div class="inline-actions">${button("重试", "retry-job")}${link("检查创作设置", "#settings")}${button("关闭提示", "dismiss-error")}</div></div>` +
        html;
    if (this.busy)
      html =
        `<div class="job-status" role="status"><span class="spinner" aria-hidden="true"></span><div><span>${E(this.progress || "正在生成，请稍候…")}</span><p class="hint" id="job-elapsed">生成可能需要几分钟 · 已完成内容会自动保留</p></div>${button("完成当前页后暂停", "pause", false, this.canPause ? "" : "hidden")}</div>` +
        html;
    this.main.innerHTML = html;
    this.renderKey =
      location.hash +
      ":" +
      (this.active?.step ?? "") +
      ":" +
      (this.active?.chapterIndex ?? "") +
      ":" +
      this.output;
    const disclosure = this.disclosures.get(this.renderKey);
    if (disclosure)
      this.main.querySelectorAll("details").forEach((el, i) => {
        const key = i + ":" + el.querySelector("summary")?.textContent;
        if (disclosure.has(key)) el.open = disclosure.get(key);
      });
    if (this.busy)
      this.main
        .querySelectorAll(
          'input,textarea,select,button:not([data-action="pause"])',
        )
        .forEach((el) => (el.disabled = true));
    this.main.setAttribute("aria-busy", String(this.busy));
    this.lastRenderedHash = location.hash;
    const restore =
      this.restoreFocusSelector &&
      this.main.querySelector(this.restoreFocusSelector);
    if (restore && !restore.disabled) restore.focus({ preventScroll: true });
    this.commands?.reportState();
    this.assistant?.syncContext();
  }
  bind() {
    window.addEventListener("storage", (e) => {
      if (e.key !== this.store.key || this.busy || !e.newValue) return;
      try {
        this.store.merge(Object.values(JSON.parse(e.newValue)), false);
        if (
          !this.main.contains(document.activeElement) ||
          !document.activeElement.matches("input,textarea,select")
        )
          this.render();
      } catch {}
    });
    document.querySelector(".skip-link").addEventListener("click", (e) => {
      e.preventDefault();
      this.main.focus();
      this.main.scrollIntoView({ block: "start" });
    });
    window.addEventListener("hashchange", () => {
      this.render();
      this.main.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    });
    window.addEventListener("console-save-error", (e) => {
      const el = document.getElementById("save-state");
      if (el) el.textContent = e.detail;
      this.notify(e.detail);
    });
    window.addEventListener("console-saved", (e) => {
      if (this.active?.id === e.detail) {
        const el = document.getElementById("save-state");
        if (el) el.textContent = "已保存到本机与工作空间";
      }
    });
    this.main.addEventListener("keydown", (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
        return;
      const tabs = [
        ...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]'),
      ];
      let index = tabs.indexOf(tab);
      index =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? tabs.length - 1
            : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      e.preventDefault();
      tabs[index].focus();
      tabs[index].click();
    });
    this.main.addEventListener("input", (e) => this.input(e));
    this.main.addEventListener("change", (e) => this.change(e));
    this.main.addEventListener("click", (e) => this.click(e));
    this.main.addEventListener("keydown", (e) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        e.target.id === "field-idea" &&
        this.active &&
        !this.busy
      ) {
        e.preventDefault();
        this.job(() => this.plan(this.active));
      }
    });
    this.main.addEventListener("paste", (e) => {
      const image = [...(e.clipboardData?.files || [])].find((f) =>
        f.type.startsWith("image/"),
      );
      if (image && this.active) {
        e.preventDefault();
        this.reference(image);
      }
    });
    this.main.addEventListener("dragover", (e) => {
      if (e.target.closest("#reference-drop")) e.preventDefault();
    });
    this.main.addEventListener("drop", (e) => {
      if (e.target.closest("#reference-drop")) {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) this.reference(f);
      }
    });
    document
      .getElementById("design-notes")
      .addEventListener("click", () =>
        document.getElementById("notes-dialog").showModal(),
      );
    document
      .getElementById("close-notes")
      .addEventListener("click", () =>
        document.getElementById("notes-dialog").close(),
      );
    document.addEventListener("click", (e) => {
      if (e.target.matches("[data-close-preview]"))
        document.getElementById("image-dialog")?.close();
    });
    window.addEventListener("pagehide", () => this.store.local());
  }
  changed(d, story = false) {
    if (story) {
      d.storyDirty = true;
      d.canonDecision = null;
    }
    this.snapshotChapter(d);
    this.store.save(d);
    const el = document.getElementById("save-state");
    if (el) el.textContent = "本机已保留 · 正在同步工作空间";
    this.commands?.reportState();
  }
  input(e) {
    const characterInput = e.target;
    if (characterInput.dataset.characterName) {
      const config = this.editCharacters(characterInput.dataset.series);
      config.characters.find(c => c.id === characterInput.dataset.characterName).name = characterInput.value;
      return;
    }
    const el = e.target;
    if (el.id === "series-search") {
      this.search = el.value;
      document.getElementById("series-results").innerHTML =
        this.views.filteredSeries();
      return;
    }
    if (el.hasAttribute("data-config")) {
      const c = ConfigManager.loadConfig();
      c[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
      const ok = ConfigManager.saveConfig(c);
      const s = document.getElementById("settings-state");
      if (s)
        s.textContent = ok
          ? "设置已自动保存"
          : "设置保存失败，请检查浏览器存储";
      return;
    }
    if (el.hasAttribute("data-key")) {
      const ok =
        el.dataset.field === "apiKey"
          ? ConfigManager.saveApiKey(el.value)
          : ConfigManager.saveGoogleApiKey(el.value);
      const s = document.getElementById("settings-state");
      if (s) s.textContent = ok ? "凭据已保存在本机" : "凭据保存失败";
      return;
    }
    const d = this.active;
    if (!d) return;
    if (el.hasAttribute("data-retrospective")) {
      const key = String(d.chapterIndex || 0);
      d.retrospectives ||= {};
      d.retrospectives[key] ||= {};
      d.retrospectives[key].content = el.value;
      d.retrospectives[key].basedOn = null;
      d.retrospectives[key].manual = true;
      this.changed(d);
      return;
    }
    if (el.dataset.field) {
      const name = el.dataset.field;
      d[name] = ["pageCount", "chapterCount", "rows"].includes(name)
        ? Number(el.value)
        : el.value;
      if (name === "title" && d.chapters[d.chapterIndex])
        d.chapters[d.chapterIndex].title = el.value;
      if (name === "summary" && d.chapters[d.chapterIndex])
        d.chapters[d.chapterIndex].summary = el.value;
      if (
        ["coverTitle", "coverBrief"].includes(name) &&
        d.chapters[d.chapterIndex]
      )
        d.chapters[d.chapterIndex].cover = {
          title: d.coverTitle,
          description: d.coverBrief,
        };
      this.changed(d, ["summary", "title"].includes(name) && isPlanned(d));
      if (
        d.source &&
        ["title", "coverTitle", "coverBrief", "style", "language"].includes(
          name,
        )
      )
        this.saveReview(d);
      if (["style", "language"].includes(name)) {
        for (const images of [
          d.images,
          ...(d.chapters || []).map((ch) => ch.images),
        ])
          for (const entry of Object.values(images || {}))
            for (const v of entry.versions || []) v.fingerprint = null;
        this.changed(d);
      }
    }
    if (el.dataset.beat !== undefined) {
      d.chapters[d.chapterIndex].beats[Number(el.dataset.beat)] = el.value;
      this.changed(d, true);
    }
    if (el.dataset.panel) {
      const [p, r, n] = el.dataset.panel.split(",").map(Number);
      d.pages[p].rows[r].panels[n].text = el.value;
      const article = el.closest(".comic-sheet");
      const preview = article
        ?.querySelectorAll(".sketch-row")
        [r]?.querySelectorAll(".sketch-panel span")[n];
      if (preview) preview.textContent = el.value;
      d.canonDecision = null;
      this.changed(d);
      this.saveReview(d);
    }
  }
  async change(e) {
    const el = e.target;
    if (el.hasAttribute("data-config")) {
      const c = ConfigManager.loadConfig();
      if (el.dataset.field === "modelProvider") {
        c.modelProvider = el.value;
        c.model =
          el.value === "codex"
            ? "gpt-6.1-sol"
            : el.value === "google"
              ? "gemini-3-flash-preview"
              : "gpt-4o-mini";
        c.imageProvider = el.value;
        c.imageModel =
          el.value === "google"
            ? "gemini-3.1-flash-image-preview"
            : "gpt-image-2";
        c.customModel = "";
        c.customImageModel = "";
      }
      ConfigManager.saveConfig(c);
      this.render();
      return;
    }
    if (el.id === "library-series") {
      this.librarySeries = el.value;
      this.render();
    }
    if (el.dataset.versionPage !== undefined) {
      this.active.images[Number(el.dataset.versionPage)].current = Number(
        el.value,
      );
      this.changed(this.active);
      this.render();
    }
    if (el.dataset.characterUpload && el.files?.length) {
      const sid = el.dataset.series;
      const config = this.editCharacters(sid);
      const character = config.characters.find(c => c.id === el.dataset.characterUpload);
      try {
        if (character.references.length + el.files.length > 8) throw new Error("每位人物最多添加 8 张参考图");
        const images = [];
        for (const file of el.files) {
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("请上传 10 MB 以内的 PNG、JPG 或 WebP 图片");
          images.push(await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("图片读取失败，请重新选择"));
            reader.readAsDataURL(file);
          }));
        }
        character.references.push(...images);
        this.render();
        this.notify("参考图已添加，点击保存人物设定后生效。");
      } catch (error) { this.notify(error.message); }
      return;
    }
    if (el.id === "reference-upload" && el.files[0])
      this.reference(el.files[0]);
    if (el.dataset.field && !el.hasAttribute("data-config")) this.input(e);
  }
  editCharacters(sid) {
    return this.characterEdits[sid] ||= structuredClone(this.series(sid)?.characterSettings || { revision: 1, characters: [] });
  }
  async characterAction(action, el) {
    const sid = el.dataset.series;
    const config = this.editCharacters(sid);
    if (action === "add-character") config.characters.push({id: "character-" + crypto.randomUUID(), name: "", references: []});
    if (action === "remove-character") config.characters = config.characters.filter(c => c.id !== el.dataset.character);
    if (action === "remove-character-reference") config.characters.find(c => c.id === el.dataset.character)?.references.splice(Number(el.dataset.reference), 1);
    if (action === "save-characters" || action === "reload-characters") {
      try {
        const value = await ConsoleAPI.request(`/console/series/${encodeURIComponent(sid)}/characters`, action === "save-characters" ? "PUT" : "GET", action === "save-characters" ? config : undefined);
        this.characterEdits[sid] = value;
        const series = this.series(sid);
        if (series) series.characterSettings = value;
        this.notify(action === "save-characters" ? "人物设定已保存，下次出图会使用这些参考图。" : "已载入保存的人物设定。");
      } catch (error) { this.notify(error.message); }
    }
    this.render();
  }
  async click(e) {
    const anchor = e.target.closest("a");
    if (
      ["#principles", "#settings"].includes(anchor?.getAttribute("href")) &&
      ["draft", "work", "series"].includes(this.route()[0])
    )
      this.returnHash = location.hash;
    const el = e.target.closest("button");
    if (!el) return;
    if (el.dataset.action === "pause") {
      this.pause = true;
      this.notify("当前页完成后暂停，已生成图片会保留。");
      return;
    }
    if (this.busy) return;
    if (el.dataset.tab) {
      this.tab = el.dataset.tab;
      if (this.tab === "characters") {
        const sid = this.route()[1];
        if (!this.characterEdits[sid] && !this.series(sid)?.characterSettings) {
          try { this.characterEdits[sid] = await ConsoleAPI.request(`/console/series/${encodeURIComponent(sid)}/characters`); }
          catch (error) { this.notify(error.message); }
        }
      }
      this.render();
    }
    if (el.dataset.rule !== undefined) {
      this.rule = Number(el.dataset.rule);
      this.render();
    }
    if (el.dataset.filter) {
      this.filter = el.dataset.filter;
      this.librarySeries = "";
      this.render();
    }
    if (el.dataset.output) {
      this.output = el.dataset.output;
      this.render();
    }
    if (el.dataset.step !== undefined) {
      this.active.step = Number(el.dataset.step);
      if (isPlanned(this.active) && this.active.step === 3)
        this.output = "sketch";
      this.changed(this.active);
      this.render();
      this.main
        .querySelector(".editor-paper h2")
        ?.scrollIntoView({ block: "start" });
    }
    if (el.dataset.chapterIndex !== undefined) {
      if (this.route()[0] === "work")
        this.navigate(
          "#work/" + this.active.id + "/" + el.dataset.chapterIndex,
        );
      else {
        this.switchChapter(Number(el.dataset.chapterIndex));
        this.render();
      }
    }
    if (el.dataset.preview !== undefined)
      this.preview(Number(el.dataset.preview));
    const d = this.active,
      action = el.dataset.action;
    if (!action) return;
    if (["add-character", "remove-character", "remove-character-reference", "save-characters", "reload-characters"].includes(action)) {
      await this.characterAction(action, el);
      return;
    }
    if (action === "refresh") {
      await this.refresh();
      return;
    }
    if (action === "new-series-draft" || action === "new-single") {
      this.create(
        action === "new-single" ? "single" : "series",
        el.dataset.series,
      );
      return;
    }
    if (action === "dismiss-error") {
      this.jobError = null;
      this.render();
      return;
    }
    if (action === "retry-job") {
      const retry = this.retryJob;
      await this.job(retry);
      return;
    }
    if (action === "back-context") {
      d.step = 0;
      this.changed(d);
      this.render();
      return;
    }
    if (action === "view-output") {
      d.step = outputStep(d);
      this.output = "comic";
      this.changed(d);
      this.render();
      return;
    }
    if (action === "next") {
      if (
        d.seriesName !== undefined &&
        d.seriesId?.startsWith("draft-") &&
        !d.seriesName.trim()
      ) {
        this.notify("先给新系列一个名字。");
        return;
      }
      if (d.seriesId?.startsWith("draft-") && !d.seriesBrief?.trim()) {
        this.notify("请描述系列方向与人物设想，让下一步剧情有所依据。");
        document.getElementById("field-seriesBrief")?.focus();
        return;
      }
      d.step = 1;
      this.changed(d);
      this.render();
      return;
    }
    if (["edit-again", "edit-pages", "edit-page"].includes(action)) {
      d.step = action === "edit-again" && isPlanned(d) ? 2 : reviewStep(d);
      this.editPage = Number(el.dataset.page || 0);
      if (isPlanned(d) && d.step === 3) this.output = "sketch";
      this.changed(d);
      this.navigate("#draft/" + d.id);
      if (action === "edit-page")
        requestAnimationFrame(() => {
          const field = this.main.querySelector(
            `[data-panel^="${this.editPage},"]`,
          );
          if (field) {
            const details = field.closest("details");
            if (details) details.open = true;
            field.focus();
            field.scrollIntoView({ block: "center" });
          }
        });
      return;
    }
    if (action === "remove-reference") {
      d.reference = null;
      this.changed(d);
      this.render();
      return;
    }
    if (action === "export-draft") {
      this.downloadBlob(
        new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
        (d.title || "漫画草稿") + ".json",
      );
      return;
    }
    if (action === "copy-social") {
      try {
        await navigator.clipboard.writeText(
          [
            d.social.title,
            d.social.content,
            (d.social.tags || []).join(" "),
          ].join("\n\n"),
        );
        this.notify("文案已复制");
      } catch {
        this.notify("复制未完成，请直接选择文案复制");
      }
      return;
    }
    this.scrollAfterJob = ["plan", "storyboard", "revise", "generate"].includes(
      action,
    );
    await this.job(async () => {
      if (action === "storyboard") {
        await this.storyboard(d);
        d.step = reviewStep(d);
        this.output = "sketch";
        this.changed(d);
      } else if (action === "plan") await this.plan(d);
      else if (action === "revise") {
        if (!d.revisionText?.trim()) throw new Error("先填写希望调整的方向。");
        if (isPlanned(d) && d.step === 2) await this.plan(d, true);
        else await this.reviseStoryboard(d);
      } else if (action === "generate") await this.generate(d);
      else if (action === "redraw")
        await this.generate(d, Number(el.dataset.page));
      else if (action === "import")
        await this.importProject(el.dataset.series, el.dataset.chapter);
      else if (action === "download-page")
        await this.downloadImage(
          currentImage(d.images[Number(el.dataset.page)]).imageUrl,
          `${d.title}-${Number(el.dataset.page) + 1}.png`,
        );
      else if (action === "export-work") await this.exportWork(d);
      else if (action === "cover") await this.cover(d);
      else if (action === "social") await this.social(d, el.dataset.platform);
      else if (action === "optimize") await this.optimize(d);
      else if (action === "canon") await this.saveToSeries(d);
      else if (action === "retrospective") await this.generateRetrospective(d);
      else if (action === "save-retrospective") await this.saveRetrospective(d);
    });
  }
  async job(work) {
    if (this.busy) return;
    const initialStep = this.active?.step;
    this.busy = true;
    this.jobStartedAt = Date.now();
    this.elapsedTimer = setInterval(() => {
      const el = document.getElementById("job-elapsed");
      if (el)
        el.textContent =
          "已等待 " +
          Math.floor((Date.now() - this.jobStartedAt) / 1000) +
          " 秒 · 生成期间请保持页面打开";
    }, 1000);
    this.retryJob = work;
    this.jobError = null;
    this.progress = "正在准备…";
    this.pause = false;
    this.render();
    try {
      await work();
    } catch (error) {
      this.jobError = {
        hash: location.hash,
        message: error.message || "操作未完成，请重试",
      };
      if (error.message?.includes("写下"))
        document.getElementById("field-idea")?.focus();
    } finally {
      this.busy = false;
      clearInterval(this.elapsedTimer);
      this.canPause = false;
      this.progress = "";
      this.render();
      if (
        this.scrollAfterJob ||
        this.jobError ||
        initialStep !== this.active?.step
      ) {
        window.scrollTo(0, 0);
        this.main.focus({ preventScroll: true });
      }
      this.scrollAfterJob = false;
    }
  }
  textConfig() {
    const c = ConsoleAPI.textConfig();
    if (c.text_provider === "google" && !c.google_api_key)
      throw new Error("请在创作设置中填写 Google API Key");
    if (c.text_provider === "openai" && !c.api_key)
      throw new Error("请在创作设置中填写 OpenAI API Key");
    return c;
  }
  async plan(d, revise = false) {
    if (d.mode === "single" && !d.idea.trim()) throw new Error("写下一句想法，就可以开始。");
    if (d.mode === "series" && d.seriesId?.startsWith("draft-") &&
        !d.idea.trim() && !d.seriesBrief?.trim())
      throw new Error("先填写新系列的方向，就可以让 AI 设计剧情。");
    const c = this.textConfig();
    this.progress = revise
      ? "正在根据调整方向重新设计…"
      : d.mode === "single"
        ? "正在生成可编辑分镜…"
        : "正在结合创作原则、系列记忆与经典剧情参考，设计下一话…";
    this.render();
    if (d.mode === "single") {
      await this.store.flush(d.id);
      const data = await ConsoleAPI.request("/console/storyboard", "POST", {
        ...c,
        draft_id: d.id,
        revise,
      });
      d.pages = data.pages;
      d.aiPages ||= structuredClone(data.pages);
      d.title = d.title || data.pages[0]?.title || "我的漫画";
      d.step = reviewStep(d);
      d.storyDirty = false;
    } else {
      const result = await ConsoleAPI.request("/console/plan", "POST", {
        ...c,
        idea: [d.seriesBrief, d.idea].filter(Boolean).join("\n"),
        inspiration_reference: d.inspirationReference || "",
        series_id: d.seriesId,
        chapter_count: revise ? 1 : d.chapterCount,
        revision: revise ? d.revisionText : "",
        previous: revise ? [d.chapters[d.chapterIndex]] : null,
      });
      // Preserve each chapter's rendered history before replacing its story.
      this.snapshotChapter(d);
      const old = d.chapters;
      const revised = result.plan.chapters.map((ch, i) => ({
        ...ch,
        aiOriginal: structuredClone(
          (revise && old[d.chapterIndex]?.aiOriginal) || ch,
        ),
        pages: old[revise ? d.chapterIndex : i]?.pages || [],
        images: old[revise ? d.chapterIndex : i]?.images || {},
        coverImages: old[revise ? d.chapterIndex : i]?.coverImages || [],
        storyDirty: true,
      }));
      if (revise) d.chapters[d.chapterIndex] = revised[0];
      else {
        d.chapters = revised;
        d.chapterIndex = 0;
      }
      d.ruleApplications = result.plan.ruleApplications;
      d.contextHash = result.plan.contextHash;
      this.restoreChapter(d);
      d.step = 2;
    }
    d.canonDecision = null;
    if (revise && d.revisionText?.trim()) {
      d.revisionRequests ||= {};
      (d.revisionRequests[String(d.chapterIndex || 0)] ||= []).push(
        d.revisionText,
      );
    }
    d.revisionText = "";
    this.snapshotChapter(d);
    this.changed(d);
    await this.store.flush(d.id);
  }
  async reviseStoryboard(d) {
    this.progress = "正在根据调整方向修改分镜…";
    this.render();
    await this.store.flush(d.id);
    const result = await ConsoleAPI.request("/console/storyboard", "POST", {
      ...this.textConfig(),
      draft_id: d.id,
      revise: true,
    });
    d.aiPages ||= structuredClone(d.pages);
    d.pages = result.pages.map((page, i) => ({
      ...page,
      ...(d.source
        ? {
            id:
              d.source.metadata?.pages?.[i]?.id ||
              d.pages[i]?.id ||
              `page-${i + 1}`,
          }
        : {}),
    }));
    d.storyDirty = false;
    if (d.revisionText?.trim()) {
      d.revisionRequests ||= {};
      (d.revisionRequests[String(d.chapterIndex || 0)] ||= []).push(
        d.revisionText,
      );
    }
    d.revisionText = "";
    d.step = reviewStep(d);
    d.canonDecision = null;
    this.snapshotChapter(d);
    this.changed(d);
    await this.store.flush(d.id);
    if (d.source) await this.persistReview(d);
  }
  snapshotChapter(d) {
    const ch = d.chapters?.[d.chapterIndex];
    if (ch)
      Object.assign(ch, {
        title: d.title,
        pages: d.pages,
        aiPages: d.aiPages,
        futureGuidance: d.futureGuidance,
        images: d.images,
        storyDirty: d.storyDirty,
        cover: {
          title: d.coverTitle || ch.cover?.title || d.title,
          description: d.coverBrief || ch.cover?.description || "",
        },
        coverImages: d.coverImages || [],
      });
  }
  restoreChapter(d) {
    const ch = d.chapters[d.chapterIndex];
    if (!ch) return;
    Object.assign(d, {
      title: ch.title,
      canonDecision: null,
      pages: ch.pages || [],
      aiPages: ch.aiPages || null,
      futureGuidance: ch.futureGuidance || "",
      images: ch.images || {},
      storyDirty: ch.storyDirty ?? true,
      coverTitle: ch.cover?.title || ch.title,
      coverBrief: ch.cover?.description || "",
      coverImages: ch.coverImages || [],
    });
  }
  switchChapter(index) {
    this.snapshotChapter(this.active);
    this.active.chapterIndex = index;
    this.restoreChapter(this.active);
    if (
      isPlanned(this.active) &&
      this.active.step >= 3 &&
      (!this.active.pages.length || this.active.storyDirty)
    )
      this.active.step = 2;
    this.changed(this.active);
  }
  async storyboard(d) {
    if (d.mode !== "series" || (!d.storyDirty && d.pages.length)) return;
    this.progress = "正在把本话剧情转换为分镜…";
    this.render();
    const c = this.textConfig(),
      ch = d.chapters[d.chapterIndex];
    if (!ch) throw new Error("请先设计本话剧情。");
    await this.store.flush(d.id);
    const result = await ConsoleAPI.request("/console/storyboard", "POST", {
      ...c,
      draft_id: d.id,
    });
    d.pages = result.pages;
    d.aiPages ||= structuredClone(result.pages);
    d.storyDirty = false;
    this.snapshotChapter(d);
    this.changed(d);
    await this.store.flush(d.id);
  }
  source(d) {
    if (!d.source) return null;
    const p = d.source;
    return {
      series_id: p.seriesId,
      chapter_id: p.chapterId,
      ...(p.metadata?.source || {}),
    };
  }
  async generate(d, onlyPage = null) {
    const config = {
      ...ConsoleAPI.imageConfig(),
      consoleDraftId: d.source ? null : d.mode === "series" ? d.id : null,
    };
    if (config.imageProvider === "google" && !config.googleApiKey)
      throw new Error("请在创作设置中填写 Google API Key");
    if (config.imageProvider === "openai" && !config.openaiApiKey)
      throw new Error("请在创作设置中填写 OpenAI API Key");
    if (isPlanned(d) && (d.storyDirty || !d.pages.length)) {
      await this.storyboard(d);
      d.step = reviewStep(d);
      this.output = "sketch";
      this.changed(d);
      this.notify("分镜已更新。请确认画面与对白，再开始出图。");
      return;
    }
    await this.store.flush(d.id);
    if (d.source) await this.persistReview(d);
    if (!d.pages.length) throw new Error("请先生成分镜。");
    const indices =
      onlyPage === null
        ? d.pages.map((_, i) => i).filter((i) => !isFresh(d, i))
        : [onlyPage];
    d.step = outputStep(d);
    this.canPause = true;
    for (const i of indices) {
      this.progress = `正在生成第 ${i + 1} / ${d.pages.length} 页 · 完成的页面自动保留`;
      this.render();
      const page = d.pages[i];
      const previous = d.pages
        .slice(0, i)
        .map((_, pi) => currentImage(d.images[pi]))
        .filter(Boolean)
        .slice(-2)
        .map((v) => ({ imageUrl: v.imageUrl }));
      if (d.reference) previous.unshift(d.reference);
      const source = this.source(d);
      const render = source
        ? {
            page_index: i,
            page_id:
              d.source?.metadata?.pages?.[i]?.id || page.id || `page-${i + 1}`,
            page_title: page.title,
            page_script_fingerprint:
              StoryboardImageReconciler.pageFingerprint(page),
          }
        : null;
      const result = await ComicAPI.generateComicImage(
        page,
        await this.sketchData(page),
        previous,
        d.style,
        page.rows.length,
        d.language,
        config,
        source,
        render,
      );
      if (!result.image_url) throw new Error("没有收到生成图片，请重试当前页");
      d.images[i] ||= { versions: [], current: 0 };
      d.images[i].versions.push({
        imageUrl: result.image_url,
        createdAt: new Date().toISOString(),
        fingerprint: StoryboardImageReconciler.pageFingerprint(page),
        prompt: result.prompt,
        snapshotHash: d.source?.metadata?.source?.snapshot_hash,
      });
      d.images[i].current = d.images[i].versions.length - 1;
      this.snapshotChapter(d);
      this.changed(d);
      await this.store.flush(d.id);
      await this.playDrawing(result.image_url, `第 ${i + 1} 页`);
      if (this.pause) break;
    }
    this.output = "comic";
    this.notify(
      this.pause
        ? "已暂停，已完成页面和版本已保留。"
        : "漫画已更新，历史版本已保留。",
    );
  }
  async sketchData(page) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1536;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1024, 1536);
    ctx.strokeStyle = "#252d35";
    const rows = page.rows,
      rh = 1400 / Math.max(1, rows.length);
    rows.forEach((r, ri) =>
      r.panels.forEach((p, pi) => {
        const w = 960 / r.panels.length,
          x = 32 + pi * w,
          y = 80 + ri * rh;
        ctx.strokeRect(x + 5, y + 5, w - 10, rh - 10);
        ctx.fillStyle = "#252d35";
        ctx.font = "22px sans-serif";
        const chars = [...p.text];
        let line = "",
          dy = 34;
        for (const ch of chars) {
          if (ctx.measureText(line + ch).width > w - 40) {
            ctx.fillText(line, x + 20, y + dy);
            line = "";
            dy += 30;
            if (dy > rh - 25) break;
          }
          line += ch;
        }
        if (dy <= rh - 25) ctx.fillText(line, x + 20, y + dy);
      }),
    );
    return canvas.toDataURL("image/png");
  }
  async importProject(sid, cid) {
    this.progress = "正在载入已编译分镜与图像版本…";
    this.render();
    const result = await ComicAPI.getComicBrainProject(sid, cid),
      project = result.project;
    let d = this.store
      .all()
      .find((d) => d.source?.seriesId === sid && d.source?.chapterId === cid);
    if (d) {
      this.navigate("#draft/" + d.id);
      return;
    }
    d = this.store.create("series", sid);
    const pkg = result.review && !result.reviewStale ? result.review : project;
    Object.assign(d, {
      title: pkg.title || cid,
      pages: pkg.pages || [],
      style: pkg.settings?.comic_style || "doraemon",
      language: pkg.settings?.language || "zh",
      pageCount: pkg.pages?.length || 3,
      step: 1,
      storyDirty: false,
      coverTitle: pkg.cover?.title,
      coverBrief:
        pkg.cover?.brief ||
        pkg.cover?.visual_brief ||
        pkg.cover?.description ||
        "",
      source: { seriesId: sid, chapterId: cid, metadata: project },
    });
    if (result.reviewStale)
      this.notify("检测到旧草稿与新版分镜冲突，已打开新版；旧 review 未覆盖。");
    for (const page of result.renders?.pages || []) {
      const i = page.page_index;
      d.images[i] = {
        current: page.current_version || 0,
        versions: page.versions.map((v) => ({
          imageUrl: v.image_url,
          createdAt: v.created_at,
          fingerprint: v.page_script_fingerprint,
          snapshotHash:
            v.snapshot_hash || result.renders?.source?.snapshot_hash,
        })),
      };
    }
    this.active = d;
    this.changed(d);
    await this.store.flush(d.id);
    this.navigate("#draft/" + d.id);
  }
  hydrateProject(result) {
    const project = result.project,
      source = project.source || {},
      sid = source.series_id,
      cid = source.chapter_id;
    if (!sid || !cid) return;
    const pkg = result.review && !result.reviewStale ? result.review : project;
    const did = `production-${sid}-${cid}`;
    const existing = this.store.drafts[did];
    const d = existing || this.store.create("series", sid, did);
    const history = {
      pages: d.pages,
      images: d.images,
      coverImages: d.coverImages,
    };
    if (!existing || !d.pages?.length)
      Object.assign(d, {
        title: pkg.title || project.title || cid,
        pages: pkg.pages || [],
        aiPages: structuredClone(pkg.pages || []),
        style: pkg.settings?.comic_style || "reference",
        language: pkg.settings?.language || "zh",
        pageCount: pkg.pages?.length || 3,
        step: 1,
        storyDirty: false,
        updatedAt:
          result.renders?.updated_at || source.exported_at || d.updatedAt,
        coverTitle: pkg.cover?.title,
        coverBrief: pkg.cover?.brief || pkg.cover?.description || "",
        source: { seriesId: sid, chapterId: cid, metadata: project },
        staleReview: result.reviewStale,
      });
    const manifest = { pages: project.pages, images: {} };
    for (const page of result.renders?.pages || [])
      manifest.images[page.page_index] = {
        current: page.current_version || 0,
        versions: page.versions.map((v) => ({
          imageUrl: v.image_url,
          createdAt: v.created_at,
          fingerprint: v.page_script_fingerprint,
          snapshotHash:
            v.snapshot_hash || result.renders?.source?.snapshot_hash,
        })),
      };
    this.mergeSourceVersions(d, [history, manifest]);
    this.store.local();
  }
  saveReview(d) {
    if (!d.source) return;
    this.reviewTimers ||= new Map();
    this.pendingReviews ||= new Set();
    this.pendingReviews.add(d.id);
    clearTimeout(this.reviewTimers.get(d.id));
    this.reviewTimers.set(
      d.id,
      setTimeout(
        () =>
          this.persistReview(d).catch((e) =>
            this.notify("分镜同步未完成：" + e.message),
          ),
        700,
      ),
    );
  }
  async persistReview(d) {
    this.reviewRequests ||= new Map();
    if (this.reviewRequests.has(d.id)) {
      await this.reviewRequests.get(d.id);
      if (!this.pendingReviews?.has(d.id)) return;
    }
    clearTimeout(this.reviewTimers?.get(d.id));
    this.reviewTimers?.delete(d.id);
    const stamp = d.updatedAt;
    const operation = ComicAPI.saveComicBrainReview(
      d.source.seriesId,
      d.source.chapterId,
      {
        ...d.source.metadata,
        title: d.title,
        pages: d.pages,
        cover: {
          ...(d.source.metadata.cover || {}),
          title: d.coverTitle,
          brief: d.coverBrief,
        },
        settings: {
          ...d.source.metadata.settings,
          comic_style: d.style,
          language: d.language,
        },
      },
    );
    this.reviewRequests.set(d.id, operation);
    try {
      const result = await operation;
      if (stamp === d.updatedAt) this.pendingReviews?.delete(d.id);
      return result;
    } finally {
      if (this.reviewRequests.get(d.id) === operation) this.reviewRequests.delete(d.id);
    }
  }
  async reference(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      this.notify("请使用 PNG、JPEG 或 WebP 图片");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.notify("参考图不能超过 10MB");
      return;
    }
    const image = await createImageBitmap(file),
      scale = Math.min(1, 1024 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    this.active.reference = canvas.toDataURL("image/jpeg", 0.8);
    this.changed(this.active);
    this.render();
  }
  preview(i) {
    let dialog = document.getElementById("image-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "image-dialog";
      dialog.setAttribute("aria-labelledby", "image-dialog-title");
      document.body.append(dialog);
    }
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="image-dialog-title">第 ${i + 1} 页</h2><button class="quiet-button" data-close-preview>关闭 ×</button></div><img class="full-preview" src="${E(ConsoleAPI.imageURL(currentImage(this.active.images[i]).imageUrl))}" alt="第 ${i + 1} 页漫画放大预览">`;
    dialog.showModal();
  }
  downloadBlob(blob, name) {
    const u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  async downloadImage(url, name) {
    const safe = ConsoleAPI.imageURL(url);
    if (!safe) throw new Error("图片路径无效");
    const response = await fetch(safe);
    if (!response.ok) throw new Error("图片下载失败，请确认本机服务正在运行");
    this.downloadBlob(await response.blob(), name);
  }
  async exportWork(d) {
    const images = Object.entries(d.images)
      .map(([i, e]) => ({ i, v: currentImage(e) }))
      .filter((x) => x.v?.imageUrl);
    if (!images.length) throw new Error("还没有漫画图片，请先生成。");
    // One archive avoids browser blocking multiple automatic downloads.
    const files = [];
    for (const { i, v } of images) {
      const r = await fetch(ConsoleAPI.imageURL(v.imageUrl));
      if (!r.ok) throw new Error(`第 ${Number(i) + 1} 页下载失败`);
      files.push({
        name: `page-${Number(i) + 1}.png`,
        data: new Uint8Array(await r.arrayBuffer()),
      });
    }
    this.downloadBlob(this.zip(files), (d.title || "漫画") + ".zip");
  }
  zip(files) {
    const chunks = [],
      central = [];
    let offset = 0;
    const enc = new TextEncoder();
    const crc = (bytes) => {
      let c = 0xffffffff;
      for (const b of bytes) {
        c ^= b;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
      return (c ^ 0xffffffff) >>> 0;
    };
    for (const file of files) {
      const name = enc.encode(file.name),
        len = file.data.length,
        checksum = crc(file.data),
        header = new Uint8Array(30 + name.length),
        v = new DataView(header.buffer);
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint32(14, checksum, true);
      v.setUint32(18, len, true);
      v.setUint32(22, len, true);
      v.setUint16(26, name.length, true);
      header.set(name, 30);
      chunks.push(header, file.data);
      const c = new Uint8Array(46 + name.length),
        cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint32(16, checksum, true);
      cv.setUint32(20, len, true);
      cv.setUint32(24, len, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      c.set(name, 46);
      central.push(c);
      offset += header.length + len;
    }
    const size = central.reduce((n, c) => n + c.length, 0),
      end = new Uint8Array(22),
      v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, files.length, true);
    v.setUint16(10, files.length, true);
    v.setUint32(12, size, true);
    v.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end], { type: "application/zip" });
  }
  async cover(d) {
    await this.store.flush(d.id);
    this.progress = "正在生成独立封面…";
    this.render();
    const result = await ComicAPI.generateCover(
      d.style,
      Object.values(d.images)
        .map(currentImage)
        .filter(Boolean)
        .slice(0, 4)
        .map((v) => ({ imageUrl: v.imageUrl })),
      d.language,
      `标题：${d.coverTitle || d.title}\n描述：${d.coverBrief || d.idea}`,
      {
        ...ConsoleAPI.imageConfig(),
        consoleDraftId: d.source ? null : d.mode === "series" ? d.id : null,
      },
      this.source(d),
    );
    if (!result.image_url) throw new Error("未收到封面图片");
    d.coverImages ||= [];
    d.coverImages.push({
      imageUrl: result.image_url,
      createdAt: new Date().toISOString(),
    });
    this.snapshotChapter(d);
    this.changed(d);
    await this.store.flush(d.id);
    await this.playDrawing(result.image_url, "封面");
  }
  async playDrawing(imageUrl, title) {
    if (!window.DrawingPlayback ||
        ConfigManager.loadConfig().drawingPlayback === false ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    this.output = "comic";
    this.render();
    // Playback is presentation only: a display failure must not retry generation.
    try {
      await window.DrawingPlayback.play(ConsoleAPI.imageURL(imageUrl), { title });
    } catch (error) {
      console.warn("Drawing playback unavailable", error);
    }
  }
  async social(d, platform) {
    const c = this.textConfig();
    this.progress = "正在生成发布文案…";
    this.render();
    d.social = await ComicAPI.generateSocialMediaContent(
      c.api_key,
      { pages: d.pages },
      c.base_url,
      c.model,
      c.text_provider,
      c.reasoning_effort,
      platform,
      c.google_api_key,
    );
    this.changed(d);
    await this.store.flush(d.id);
  }
  async optimize(d) {
    if (!d.idea.trim()) throw new Error("先写下一句想法，再进行优化。");
    this.progress = "正在优化创作想法…";
    this.render();
    const result = await ConsoleAPI.request("/optimize-prompt", "POST", {
      ...this.textConfig(),
      prompt: d.idea,
      comic_style: d.style,
      language: d.language,
    });
    d.idea = result.optimized_prompt || result.prompt || d.idea;
    this.changed(d);
  }
  async saveToSeries(d) {
    await this.store.flush(d.id);
    this.progress = "正在整理本话剧情、复盘修改，并判断对后续创作要求的影响…";
    this.render();
    const result = await ConsoleAPI.request("/console/canon/save", "POST", {
      ...this.textConfig(),
      draft_id: d.id,
      revision: d.revision,
    });
    this.acceptSavedDraft(d, result.draft);
    this.notify(
      result.already_saved
        ? "本话已在系列中，无需重复保存。"
        : "本话已保存，下次续写会参考本话剧情、复盘与创作要求。",
    );
    await this.refresh();
  }
  acceptSavedDraft(d, saved) {
    Object.assign(d, saved);
    const snapshot = d.source?.metadata?.source?.snapshot_hash;
    if (snapshot)
      for (const [index, entry] of Object.entries(d.images || {})) {
        const image = currentImage(entry);
        const page = d.pages?.[Number(index)];
        if (
          image &&
          page &&
          image.fingerprint === StoryboardImageReconciler.pageFingerprint(page)
        )
          image.acceptedSnapshotHash = snapshot;
      }
    this.store.drafts[d.id] = d;
    this.store.local();
  }
  async generateRetrospective(d) {
    await this.store.flush(d.id);
    this.progress = "正在按当前分镜生成复盘，不会修改剧情或创作原则…";
    this.render();
    const result = await ConsoleAPI.request("/console/retrospective", "POST", {
      ...this.textConfig(),
      draft_id: d.id,
      direction: d.retrospectiveDirection || "",
    });
    const key = String(d.chapterIndex || 0);
    d.retrospectives ||= {};
    const previous = d.retrospectives[key];
    const history = [...(previous?.history || [])];
    if (previous?.content)
      history.push({
        content: previous.content,
        basedOn: previous.basedOn,
        createdAt: new Date().toISOString(),
      });
    d.retrospectives[key] = { ...result, history };
    this.changed(d);
    this.notify("复盘已生成，可直接修改；需要收录时再保存到系列。");
  }
  async saveRetrospective(d) {
    await this.store.flush(d.id);
    this.progress = "正在保存本话复盘…";
    this.render();
    const result = await ConsoleAPI.request("/console/retrospective", "PUT", {
      draft_id: d.id,
      revision: d.revision,
    });
    this.acceptSavedDraft(d, result.draft);
    this.notify("本话复盘已保存，剧情与创作原则保持原样。");
  }
}
window.addEventListener("DOMContentLoaded", () => {
  window.app = new UIController();
});
