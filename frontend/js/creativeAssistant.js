/* A contextual, multi-turn writing workspace; changes are previewed before adoption. */
class CreativeAssistant {
  constructor(app) {
    this.app = app;
    this.opened = false;
    this.pending = false;
    this.sessions = {};
    this.storageKey = `comicperfect_assistant_v1:${window.COMIC_RUNTIME?.workspaceId || "local"}`;
    try { this.sessions = JSON.parse(localStorage.getItem(this.storageKey) || "{}"); } catch {}
    if (!this.sessions || typeof this.sessions !== "object" || Array.isArray(this.sessions)) this.sessions = {};
    this.element = document.createElement("aside");
    this.element.className = "creative-assistant";
    this.element.id = "creative-assistant-panel";
    this.element.hidden = true;
    this.element.setAttribute("aria-label", "创作助手对话");
    document.body.append(this.element);
    this.mobileQuery = window.matchMedia("(max-width: 600px)");
    this.mobileQuery.addEventListener("change", () => this.accessibility());
    document.addEventListener("click", event => {
      const entry = event.target.closest("[data-assistant]");
      if (entry) this.open(this.targetFor(entry), entry.dataset.assistantPrompt);
    });
    this.element.addEventListener("click", event => this.click(event));
    this.element.addEventListener("input", event => {
      if (event.target.id === "assistant-instruction") {
        this.session.input = event.target.value;
        this.save();
      }
    });
    this.element.addEventListener("change", event => {
      if (event.target.id === "assistant-target") this.open(JSON.parse(event.target.value));
      if (event.target.name === "assistant-mode") { this.session.mode = event.target.value; this.save(); }
    });
    this.element.addEventListener("keydown", event => {
      if (event.isComposing) return;
      if (event.key === "Tab" && this.mobileQuery.matches) {
        const controls = [...this.element.querySelectorAll('button:not(:disabled),select:not(:disabled),textarea:not(:disabled),input:not(:disabled)')].filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); this.send(); }
      if (event.key === "Escape") { event.preventDefault(); this.close(); }
    });
    window.addEventListener("hashchange", () => {
      if (this.opened && !this.pending) this.open(this.defaultTarget(), null, false);
    });
  }
  get session() { return this.sessions[this.sessionKey]; }
  accessibility() {
    const modal = this.opened && this.mobileQuery.matches;
    this.element.setAttribute("role", modal ? "dialog" : "complementary");
    if (modal) this.element.setAttribute("aria-modal", "true");
    else this.element.removeAttribute("aria-modal");
    document.querySelector(".app-shell").inert = modal;
    document.querySelector(".skip-link").inert = modal;
    for (const launcher of document.querySelectorAll('.topbar [data-assistant="context"]'))
      launcher.setAttribute("aria-expanded", String(this.opened));
    if (modal && !this.element.contains(document.activeElement)) {
      const input = this.element.querySelector("textarea");
      (input && !input.disabled ? input : this.element.querySelector('[data-assistant-action="close"]'))?.focus({ preventScroll: true });
    }
  }
  save() {
    const entries = Object.entries(this.sessions).slice(-12);
    try { localStorage.setItem(this.storageKey, JSON.stringify(Object.fromEntries(entries))); }
    catch { /* The in-memory discussion and instruction stay available. */ }
  }
  currentDraft() {
    const [route, id] = this.app.route();
    return ["draft", "work"].includes(route) ? this.app.store.drafts[id] : null;
  }
  surfaceKey() {
    return JSON.stringify([this.app.route(), this.currentDraft()?.chapterIndex || 0,
      this.app.route()[0] === "principles" ? this.app.rule : null]);
  }
  syncContext() {
    if (this.opened && !this.pending && this.boundSurface !== this.surfaceKey())
      this.open(this.defaultTarget(), null, false);
  }
  draftTarget(kind, pageIndex) {
    const d = this.currentDraft();
    if (!d) return this.defaultTarget();
    return { kind, draft_id: d.id, chapter_index: d.chapterIndex || 0,
      ...(kind === "page" ? { page_index: Number(pageIndex) } : {}) };
  }
  document(key) {
    for (const doc of [...this.app.workspace.principles, ...this.app.workspace.preferences])
      if (doc.documentKey === key) return { doc, sid: null };
    for (const series of this.app.seriesList)
      for (const doc of series.documents || [])
        if (doc.documentKey === key) return { doc, sid: series.id };
    return null;
  }
  defaultTarget() {
    const d = this.currentDraft();
    if (d) {
      const kind = d.step < 2 && !d.pages?.length ? "idea" :
        d.chapters?.length && d.step === 2 ? "story" : d.pages?.length ? "storyboard" : "idea";
      return this.draftTarget(kind);
    }
    const [route, id] = this.app.route();
    if (route === "principles") {
      const docs = [...this.app.workspace.principles, ...this.app.workspace.preferences];
      const doc = docs[this.app.rule] || docs[0];
      if (doc?.documentKey) return { kind: "document", document_key: doc.documentKey };
    }
    return { kind: "discuss", ...(route === "series" && id ? { series_id: id } : {}) };
  }
  targetFor(entry) {
    const kind = entry.dataset.assistant;
    if (["idea", "story", "storyboard", "page", "cover"].includes(kind)) return this.draftTarget(kind, entry.dataset.assistantPage);
    if (kind === "document") {
      const found = this.document(entry.dataset.assistantDocument);
      return { kind: "document", document_key: entry.dataset.assistantDocument,
        ...(found?.sid ? { series_id: found.sid } : {}) };
    }
    if (kind === "series") {
      const sid = entry.dataset.assistantSeries || this.currentDraft()?.seriesId || this.app.route()[1];
      const series = this.app.series(sid);
      const doc = series?.documents?.find(d => d.id === "05-系列偏好") || series?.documents?.find(d => d.id === "01-创作约束");
      if (doc?.documentKey) return { kind: "document", document_key: doc.documentKey, series_id: sid };
      return { kind: "discuss", ...(sid && !sid.startsWith("draft-") ? { series_id: sid } : {}) };
    }
    return this.defaultTarget();
  }
  describe(target) {
    if (target.kind === "document") {
      const found = this.document(target.document_key);
      return { title: found?.doc.title || "创作资料", scope: target.series_id ? "影响本系列后续创作" : "影响所有系列的创作依据" };
    }
    const draft = target.draft_id ? this.app.store.drafts[target.draft_id] : null;
    const names = { idea: "创作方向", story: "本话剧情", storyboard: "本话分镜", cover: "封面描述", page: `第 ${(target.page_index || 0) + 1} 页画面与对白`, discuss: "创作讨论" };
    return { title: names[target.kind], scope: draft ? `${draft.title || this.app.series(draft.seriesId)?.name || "当前草稿"} · 只改本话草稿` : target.series_id ? `${this.app.series(target.series_id)?.name || "当前系列"} · 讨论后再决定` : "讨论创作方法与下一步，不自动修改内容" };
  }
  open(target = this.defaultTarget(), prompt, focus = true) {
    if (this.pending && JSON.stringify(target) !== JSON.stringify(this.target)) {
      this.app.notify("助手正在处理当前指令，完成后可以切换调整对象。");
      return;
    }
    this.returnFocus = this.opened ? this.returnFocus : document.activeElement;
    this.target = target;
    this.boundSurface = this.surfaceKey();
    this.sessionKey = JSON.stringify(target);
    this.sessions[this.sessionKey] ||= { messages: [], input: "", mode: target.kind === "discuss" ? "discuss" : "revise" };
    if (!Array.isArray(this.session.messages)) this.session.messages = [];
    if (prompt) this.session.input = prompt;
    this.opened = true;
    this.error = "";
    this.element.hidden = false;
    document.body.classList.add("assistant-open");
    this.render();
    this.accessibility();
    if (focus) this.element.querySelector("textarea")?.focus({ preventScroll: true });
  }
  close() {
    this.opened = false;
    this.element.hidden = true;
    document.body.classList.remove("assistant-open");
    this.accessibility();
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
  }
  options() {
    const options = [];
    const add = (label, target) => options.push({ label, target });
    const d = this.currentDraft();
    if (d) {
      add("本话 · 创作方向", this.draftTarget("idea"));
      if (d.chapters?.length) add("本话 · 剧情", this.draftTarget("story"));
      if (d.pages?.length) {
        add("本话 · 全部分镜", this.draftTarget("storyboard"));
        d.pages.forEach((_, i) => add(`仅第 ${i + 1} 页`, this.draftTarget("page", i)));
      }
      add("本话 · 封面描述", this.draftTarget("cover"));
    }
    const sid = d?.seriesId || this.target.series_id || (this.app.route()[0] === "series" ? this.app.route()[1] : null);
    for (const doc of this.app.series(sid)?.documents || [])
      if (doc.documentKey && !["deprecated", "archived"].includes((doc.content.match(/^status:\s*(\w+)/m) || [])[1]))
        add(`本系列 · ${doc.title}`, { kind: "document", document_key: doc.documentKey, series_id: sid });
    for (const doc of [...this.app.workspace.principles, ...this.app.workspace.preferences])
      if (doc.documentKey) add(`所有系列 · ${doc.title}`, { kind: "document", document_key: doc.documentKey });
    add("自由讨论", { kind: "discuss", ...(sid && !sid.startsWith("draft-") ? { series_id: sid } : {}) });
    if (!options.some(o => JSON.stringify(o.target) === this.sessionKey)) add(this.describe(this.target).title, this.target);
    return options;
  }
  suggestions() {
    const kind = this.target.kind;
    if (kind === "document") return ["检查这份资料是否有冲突或难以执行的要求", "把这些要求改得更具体，保留原有有效内容", "解释这份资料会怎样影响下一话"];
    if (kind === "story") return ["让主角的选择更主动，后果更明确", "缩短开场，让冲突更快出现", "保留核心冲突，让结尾更有喜剧反转"];
    if (["page", "storyboard"].includes(kind)) return ["减少对白，让画面承担更多信息", "检查人物动作与前后连续性", "把笑点改成能一眼看懂的画面"];
    if (kind === "cover") return ["用本话最有冲突的一瞬间重写封面", "让封面短标题更有悬念", "简化构图，突出主角和关键道具"];
    return ["结合系列原则，给我三个下一话方向并说明取舍", "我第一次使用，接下来应该做什么？", "帮我把这个想法变成一个清晰的冲突"];
  }
  patchText(patch) {
    if (!patch) return "";
    if (patch.idea) return patch.idea;
    if (patch.description) return `${patch.title}\n\n${patch.description}`;
    if (patch.beats) return [patch.title, patch.summary, ...patch.beats, patch.cover?.title, patch.cover?.description].filter(Boolean).join("\n\n");
    return (patch.pages || (patch.page ? [patch.page] : [])).map(page => [page.title, ...page.rows.flatMap((row, ri) => row.panels.map((panel, pi) => `第 ${ri + 1} 行第 ${pi + 1} 格：${panel.text}`))].join("\n\n")).join("\n\n");
  }
  beforeText() {
    const d = this.app.store.drafts[this.target.draft_id];
    if (!d) return "";
    if (this.target.kind === "idea") return d.idea;
    if (this.target.kind === "story") return this.patchText(d.chapters[d.chapterIndex]);
    if (this.target.kind === "cover") return this.patchText({ title: d.coverTitle, description: d.coverBrief });
    return this.patchText(this.target.kind === "page" ? { page: d.pages[this.target.page_index] } : { pages: d.pages });
  }
  proposalHTML(message, index) {
    const p = message.proposal;
    if (!p) return "";
    const scope = this.describe(this.target).scope;
    const pairs = p.changes?.length ? p.changes : [{ title: this.describe(this.target).title, before: message.before || "（尚未填写）", after: this.patchText(p.patch) }];
    const disabled = this.pending || this.app.busy ? "disabled" : "";
    return `<section class="assistant-proposal" aria-label="修改预览"><h4>${E(p.summary || "修改预览")}</h4><p class="hint">${E(scope)}</p>${pairs.map(pair => `<details><summary>查看「${E(pair.title)}」修改前后</summary><div class="assistant-diff"><section><h5>修改前</h5><div class="assistant-copy">${E(pair.before)}</div></section><section><h5>修改后</h5><div class="assistant-copy">${E(pair.after)}</div></section></div></details>`).join("")}${p.ruleApplications?.length ? `<details><summary>创作依据 · ${p.ruleApplications.length} 项</summary><ul>${p.ruleApplications.map(rule => `<li>${E(rule.documentId)} · ${E(rule.status)}：${E(rule.reason)}</li>`).join("")}</ul></details>` : ""}<div class="inline-actions">${message.undone ? '<span class="hint">已撤销，原稿已恢复</span>' : message.applied ? `<span class="hint">已应用</span>${this.target.draft_id ? `<button class="button" data-assistant-action="undo" data-message="${index}" ${disabled}>撤销这次修改</button>` : ""}` : message.dismissed ? '<span class="hint">已保留原稿</span>' : `<button class="button primary" data-assistant-action="apply" data-message="${index}" ${disabled}>${this.target.kind === "document" ? (this.target.series_id ? "应用到本系列资料" : "应用到所有系列的创作依据") : "采用到本话草稿"}</button><button class="button" data-assistant-action="dismiss" data-message="${index}" ${disabled}>保留原稿</button>`}</div></section>`;
  }
  render() {
    if (!this.target) return;
    const description = this.describe(this.target);
    const provider = ConfigManager.loadConfig().modelProvider || "codex";
    const providerName = { codex: "Codex", google: "Gemini", openai: "当前文字模型" }[provider] || "当前文字模型";
    const disabled = this.pending || this.app.busy ? "disabled" : "";
    this.element.innerHTML = `<header class="assistant-header"><div><h2>创作助手</h2><p>${E(providerName)} · 可以接着讨论和调整</p></div><button class="quiet-button" data-assistant-action="close" aria-label="关闭创作助手">关闭</button></header><div class="assistant-context"><label for="assistant-target">正在讨论或调整</label><select class="input" id="assistant-target" ${disabled}>${this.options().map(option => `<option value="${E(JSON.stringify(option.target))}" ${JSON.stringify(option.target) === this.sessionKey ? "selected" : ""}>${E(option.label)}</option>`).join("")}</select><p class="hint">${E(description.scope)}</p></div><div class="assistant-thread" role="log" aria-label="创作对话记录" aria-live="polite">${this.session.messages.length ? this.session.messages.map((message, i) => `<article class="assistant-message ${message.role === "user" ? "from-user" : "from-assistant"}"><h3>${message.role === "user" ? "你" : E(providerName)}</h3><div class="assistant-copy">${E(message.content)}</div>${this.proposalHTML(message, i)}</article>`).join("") : `<div class="assistant-empty"><h3>直接说你想怎么改</h3><p>当前内容与创作资料会一起带入。可以先讨论，也可以让助手给出具体修改。</p><div class="assistant-suggestions">${this.suggestions().map((prompt, i) => `<button data-assistant-action="suggest" data-suggestion="${i}" ${disabled}>${E(prompt)}</button>`).join("")}</div></div>`}${this.pending ? '<p class="assistant-working" role="status">正在阅读资料并处理指令…</p>' : ""}</div><form class="assistant-composer"><fieldset ${disabled}><legend class="visually-hidden">指令处理方式</legend><label><input type="radio" name="assistant-mode" value="discuss" ${this.session.mode === "discuss" ? "checked" : ""}>先讨论</label><label><input type="radio" name="assistant-mode" value="revise" ${this.session.mode !== "discuss" ? "checked" : ""}>提出具体修改</label></fieldset><label class="visually-hidden" for="assistant-instruction">给创作助手的指令</label><textarea class="textarea" id="assistant-instruction" rows="3" maxlength="8000" placeholder="比如：这段不够好笑，保留人物动机，换一个更直观的反转。" ${disabled}>${E(this.session.input || "")}</textarea>${this.error ? `<p class="assistant-error" role="alert">${E(this.error)}</p>` : ""}<div class="assistant-send-row"><button type="button" class="text-link" data-assistant-action="new" ${disabled}>新讨论</button><span class="hint">⌘ / Ctrl + Enter</span><button type="submit" class="button primary" ${disabled}>发送指令</button></div></form>`;
    this.element.querySelector("form").addEventListener("submit", event => { event.preventDefault(); this.send(); });
    const log = this.element.querySelector(".assistant-thread");
    log.scrollTop = log.scrollHeight;
    this.accessibility();
  }
  async click(event) {
    const button = event.target.closest("[data-assistant-action]");
    if (!button) return;
    const action = button.dataset.assistantAction;
    if (action === "close") return this.close();
    if (this.pending || this.app.busy) return;
    if (action === "suggest") {
      this.session.input = this.suggestions()[Number(button.dataset.suggestion)];
      this.save(); this.render(); this.element.querySelector("textarea").focus();
    } else if (action === "new") {
      this.session.messages = []; this.session.input = ""; this.error = ""; this.save(); this.render();
    } else if (action === "dismiss") {
      this.session.messages[Number(button.dataset.message)].dismissed = true;
      this.save(); this.render();
    } else if (["apply", "undo"].includes(action)) await this.adopt(action, Number(button.dataset.message));
  }
  async send() {
    if (this.pending || this.app.busy) return;
    const instruction = (this.session.input || "").trim();
    if (!instruction) { this.error = "先写下你的问题或调整指令。"; this.render(); this.element.querySelector("textarea").focus(); return; }
    const target = structuredClone(this.target), session = this.session;
    const history = session.messages.filter(m => !m.failed).slice(-12).map(m => ({ role: m.role,
      content: (m.content + (m.proposal && !m.applied && !m.dismissed ? "\n待采用的修改：" + JSON.stringify(m.proposal.patch || m.proposal.changes) : "")).slice(0, 16000) }));
    const before = this.beforeText();
    const lastMessage = session.messages.at(-1);
    const retry = lastMessage?.failed && lastMessage.content === instruction;
    const user = retry ? lastMessage : { role: "user", content: instruction };
    delete user.failed;
    if (!retry) session.messages.push(user);
    this.pending = true; this.error = ""; this.render();
    await this.app.job(async () => {
      this.app.progress = "创作助手正在阅读当前内容与创作依据…";
      this.app.render();
      try {
        const config = this.app.textConfig();
        if (target.draft_id) await this.app.store.flush(target.draft_id);
        const result = await ConsoleAPI.request("/console/assistant", "POST", { ...config, target, instruction, history, mode: session.mode });
        // A newer proposal replaces older unadopted previews in this discussion.
        if (result.proposal) for (const m of session.messages) if (m.proposal && !m.applied) m.dismissed = true;
        session.messages.push({ role: "assistant", content: result.message, proposal: result.proposal, before });
        session.messages = session.messages.slice(-24);
        session.input = "";
      } catch (error) {
        user.failed = true;
        this.error = error.message || "助手暂时没有完成，请保留指令后重试。";
      }
    });
    this.pending = false; this.save(); this.syncContext(); this.render();
  }
  async adopt(action, index) {
    const message = this.session.messages[index];
    if (!message?.proposal || (action === "apply" && (message.applied || message.dismissed))) return;
    const target = structuredClone(this.target);
    this.pending = true; this.error = ""; this.render();
    await this.app.job(async () => {
      try {
        const draft = this.app.store.drafts[target.draft_id];
        if (draft) await this.app.store.flush(draft.id);
        const result = await ConsoleAPI.request(`/console/assistant/${action}`, "POST", { token: message.proposal.token, ...(action === "undo" ? { revision: draft?.revision } : {}) });
        if (result.draft) {
          this.app.acceptSavedDraft(draft, result.draft);
          if (draft.source) await this.app.persistReview(draft);
        } else await this.app.refresh();
        if (action === "undo") message.undone = true;
        else message.applied = true;
        this.app.notify(action === "undo" ? "已恢复修改前的草稿。" : target.kind === "document" ? "创作资料已更新，后续生成会使用新要求。" : "已采用到草稿，可以继续调整或生成。旧图片版本已保留。");
      } catch (error) { this.error = error.message || "修改未完成，请检查后重试。"; }
    });
    this.pending = false; this.save(); this.syncContext(); this.render();
  }
}
window.CreativeAssistant = CreativeAssistant;
