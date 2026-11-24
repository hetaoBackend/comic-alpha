/* Render only escaped workspace data. Event handling and persistence live in app.js. */
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const E = escapeHTML;
const link = (text, href) =>
  `<a class="text-link" href="${E(href)}">${E(text)} <span aria-hidden="true">→</span></a>`;
const button = (text, action, primary = false, extra = "") =>
  `<button class="button ${primary ? "primary" : ""}" data-action="${action}" ${extra}>${E(text)}</button>`;
const assistantButton = (text, kind = "context", extra = "") =>
  `<button class="button" data-assistant="${E(kind)}" ${extra}>${E(text)}</button>`;
const badge = (text, neutral = false) =>
  `<span class="badge ${neutral ? "neutral" : ""}">${E(text)}</span>`;
const heading = (title, subtitle, action = "") =>
  `<div class="page-heading"><div><h1>${E(title)}</h1><p class="subtitle">${E(subtitle)}</p></div>${action}</div>`;
const empty = (title, copy, action = "") =>
  `<div class="empty-state"><h2>${E(title)}</h2><p>${E(copy)}</p>${action}</div>`;
const field = (label, name, value, textarea = false, extra = "") =>
  `<div class="field"><label class="field-label" for="field-${name}">${E(label)}</label>${textarea ? `<textarea class="textarea" id="field-${name}" data-field="${name}" ${extra}>${E(value)}</textarea>` : `<input class="input" id="field-${name}" data-field="${name}" value="${E(value)}" ${extra}>`}</div>`;
const select = (label, name, value, options, extra = "") =>
  `<div class="field"><label class="field-label" for="field-${name}">${E(label)}</label><select id="field-${name}" data-field="${name}" ${extra}>${options.map(([v, t]) => `<option value="${E(v)}" ${String(v) === String(value) ? "selected" : ""}>${E(t)}</option>`).join("")}</select></div>`;
const STYLES = [
  ["doraemon", "哆啦A梦"],
  ["american", "美式漫画"],
  ["watercolor", "清淡水彩"],
  ["disney", "迪士尼"],
  ["ghibli", "吉卜力"],
  ["pixar", "皮克斯"],
  ["shonen", "黑白少年漫画"],
  ["nezha", "哪吒"],
  ["langlangshan", "浪浪山小妖怪"],
];
const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const currentImage = (entry) =>
  entry?.versions?.[entry.current ?? entry.currentVersion ?? 0];
const isFresh = (d, i) => {
  const v = currentImage(d.images?.[i]);
  return (
    !d.storyDirty &&
    !!v?.imageUrl &&
    (!d.source?.metadata?.source?.snapshot_hash ||
      !v.snapshotHash ||
      v.snapshotHash === d.source.metadata.source.snapshot_hash ||
      v.acceptedSnapshotHash === d.source.metadata.source.snapshot_hash) &&
    v.fingerprint === StoryboardImageReconciler.pageFingerprint(d.pages[i])
  );
};
const status = (d) =>
  d.pages?.length
    ? d.pages.every((_, i) => isFresh(d, i))
      ? "已生成"
      : Object.values(d.images || {}).some((e) => e.versions?.length)
        ? "待重新生成"
        : "待生成"
    : d.chapters?.length
      ? "剧情草稿"
      : "创作草稿";
const hasContent = (d) =>
  !!(
    d.idea?.trim() ||
    d.seriesBrief?.trim() ||
    d.pages?.length ||
    d.chapters?.length
  );
const isPlanned = (d) => d.mode === "series" && !d.source;
const reviewStep = (d) => (isPlanned(d) ? 3 : 1);
const outputStep = (d) => (isPlanned(d) ? 4 : 2);
const documentTitle = (doc) => {
  const purpose = String(doc.id || "").replace(/^\d+[-_]/, "");
  return /^\d+[-_]/.test(doc.id || "")
    ? purpose
    : String(doc.title || purpose)
        .split(/[·｜]/)
        .at(-1)
        .trim();
};
const pageHeading = (p, i) =>
  /^PAGE[-_ ]?\d+$/i.test(p.title || "")
    ? `第 ${i + 1} 页`
    : `第 ${i + 1} 页${p.title ? " · " + p.title : ""}`;
const imageCount = (d) =>
  (d.pages || []).filter((_, i) => currentImage(d.images?.[i])?.imageUrl)
    .length;
const unfinishedDraft = (d) =>
  d.chapters?.length
    ? d.chapters.some(
        (ch, i) =>
          status(i === d.chapterIndex ? d : { ...d, ...ch }) !== "已生成",
      )
    : status(d) !== "已生成";
function artwork(url, name, mini = false) {
  const safe = ConsoleAPI.imageURL(url);
  return safe
    ? `<img class="${mini ? "mini-cover" : "cover-art real-cover"}" src="${E(safe)}" alt="${E(name)}" loading="lazy">`
    : `<div class="${mini ? "mini-cover" : "cover-art"} cover-empty" aria-label="${E(name)}暂无封面"><span>${E(mini ? "待出图" : name)}</span>${mini ? "" : "<small>故事等待成画</small>"}</div>`;
}
function markdown(text) {
  // Markdown subset without raw HTML or arbitrary links: private documents are data.
  const clean = String(text || "").replace(/^---\n[\s\S]*?\n---\n/, "");
  return clean
    .split(/\n/)
    .map((line) => {
      const m = /^(#{1,6})\s+(.+)/.exec(line);
      if (m)
        return `<h${Math.min(4, m[1].length + 1)}>${E(m[2])}</h${Math.min(4, m[1].length + 1)}>`;
      if (!line.trim()) return '<div class="paragraph-gap"></div>';
      return `<p>${E(line)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(
          /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
          (_, a, b) => `<span class="wiki-reference">${b || a}</span>`,
        )}</p>`;
    })
    .join("");
}
class ConsoleViews {
  constructor(app) {
    this.app = app;
  }
  get drafts() {
    return this.app.visibleDrafts();
  }
  seriesCard(s) {
    const works = this.app.works().filter((d) => d.seriesId === s.id);
    const comics = works.filter((d) => imageCount(d));
    const archived = ["deprecated", "archived"].includes(s.status);
    return `<a class="series-card" href="#series/${encodeURIComponent(s.id)}">${artwork(this.app.seriesCover(s.id), s.name)}<div class="card-info"><div class="card-title"><h3>${E(s.name)}</h3>${archived ? badge("历史系列", true) : ""}</div><p>${E(s.genre || "系列创作")}</p><div class="card-meta"><span>${s.chapters.length} 话故事 · ${comics.length} 话已有漫画</span><span>查看系列 →</span></div></div></a>`;
  }
  deletionButton(d) {
    const cid = d.source?.chapterId || d.canonChapters?.[String(d.chapterIndex || 0)]?.chapterId;
    return cid ? button("永久删除本话", "delete-chapter", false, `data-series="${E(d.seriesId)}" data-chapter="${E(cid)}"`)
      : button("永久删除草稿", "delete-draft", false, `data-draft="${E(d.id)}"`);
  }
  deletionConfirmation(p) {
    const scope = p.kind === "series" ? "整个系列的人物、设定、全部章节、草稿和专属生成图片" : p.kind === "chapter" ? "本话脚本、分镜、复盘、相关草稿和专属生成图片，并清理系列中的剧情引用" : "这份草稿的剧情、分镜、生成版本和助手修改记录";
    return `<form method="dialog"><h2 id="delete-title">永久删除「${E(p.name)}」？</h2><p id="delete-description">将删除${scope}。删除后无法恢复，后续剧情不再参考这些内容。</p><p class="hint">关联草稿 ${E(p.draftCount)} 份 · 需清理的剧情资料 ${E(p.memoryCount)} 份</p><div class="inline-actions"><button class="button" value="cancel" autofocus>取消，保留内容</button><button class="button danger-button" value="delete">确认永久删除</button></div></form>`;
  }
  recent(d) {
    const readable = imageCount(d) > 0;
    const path = readable && !unfinishedDraft(d) ? "#work/" + (d.workPath || d.id) : "#draft/" + d.id;
    return `<div class="activity-entry"><a class="activity-row" href="${E(path)}">${artwork(this.app.draftCover(d), d.title || "创作中", true)}<div class="activity-title"><h3>${E(d.title || (d.mode === "single" ? "单篇漫画草稿" : "下一话剧情草稿"))}</h3><p>${E(d.mode === "single" ? "单篇漫画" : this.app.series(d.seriesId)?.name || "新系列")} · ${d.pages?.length ? d.pages.length + " 页分镜" : d.chapters?.length ? d.chapters.length + " 话剧情" : "想法已保存"}</p></div>${badge(readable ? imageCount(d) + "/" + d.pages.length + " 页已生成" : status(d), readable)}<span class="time">${E(dateLabel(d.updatedAt))}</span><span class="quiet-arrow" aria-hidden="true">→</span></a><div class="activity-delete">${this.deletionButton(d)}</div></div>`;
  }
  home() {
    const a = this.app;
    const ongoing = this.drafts.filter(d => unfinishedDraft(d));
    const latest = ongoing[0];
    const series = a.seriesList.filter(s => !["deprecated", "archived"].includes(s.status));
    return `<div class="studio-home">${heading("创作工作台", "接着上次的故事，或开始一篇新漫画。", '<a class="button primary" href="#single">新建漫画</a>')}
      ${latest ? `<section class="resume-work"><div class="resume-art">${artwork(a.draftCover(latest), latest.title || "创作草稿", true)}</div><div class="resume-content"><p class="resume-status">${E(status(latest))} · ${E(a.series(latest.seriesId)?.name || "单篇漫画")}</p><h2>${E(latest.title || "未命名草稿")}</h2><p class="hint">${E(latest.pages?.length ? latest.pages.length + " 页分镜，随时继续修改" : "想法已保存，继续完善故事")}</p></div><a class="button primary" href="#draft/${E(latest.id)}">继续创作</a></section>` : `<section class="studio-welcome"><h2>从一个想法开始</h2><p>写下故事，确认分镜，再把它画出来。</p><a class="button primary" href="#single">创作第一篇漫画</a>${assistantButton("和助手一起构思")}</section>`}
      <div class="home-columns"><section class="studio-section"><div class="section-header"><h2>最近创作</h2>${link("全部作品", "#library")}</div><div class="activity-list">${this.drafts.length ? this.drafts.slice(0,5).map(d=>this.recent(d)).join("") : empty("还没有创作记录", "新建漫画后，草稿会自动保留。")}</div></section><aside class="home-tools"><h2>开始新的创作</h2><a class="creation-route" href="#single"><strong>单篇漫画</strong><span>一个想法，一篇完整作品</span><span aria-hidden="true">→</span></a><a class="creation-route" href="#new-series"><strong>建立系列</strong><span>积累人物，持续讲述故事</span><span aria-hidden="true">→</span></a><div class="home-assistant"><h3>还没想好怎么写？</h3><p>让助手一起推敲冲突、人物和下一话方向。</p>${assistantButton("一起构思")}</div></aside></div>
      <section class="studio-section home-series"><div class="section-header"><h2>我的系列 <span class="count">${series.length}</span></h2>${link("全部系列", "#series")}</div><div class="series-grid">${series.slice(0,4).map(s=>this.seriesCard(s)).join("") || empty("建立你的第一个系列", "系列会记住人物、世界与之前的剧情。", link("建立系列", "#new-series"))}</div></section></div>`;
  }
  seriesList() {
    return `${heading("我的系列", "故事、人物与每一话漫画，都在各自的系列里。", '<a class="button primary" href="#new-series">建立新系列 +</a>')}<div class="toolbar"><span class="prototype-note">已保存的系列与新系列草稿</span><label class="visually-hidden" for="series-search">搜索系列</label><input class="input search" id="series-search" type="search" placeholder="搜索系列" value="${E(this.app.search)}"></div><div class="series-grid section" id="series-results">${this.filteredSeries()}</div><div class="principle-banner"><p>创作原则在所有系列间共享，人物、世界观和剧情记忆各自独立。</p>${link("查看创作原则", "#principles")}</div>`;
  }
  filteredSeries() {
    const list = this.app.seriesList.filter((s) =>
      (s.name + s.genre).toLowerCase().includes(this.app.search.toLowerCase()),
    );
    return list.length
      ? list.map((s) => this.seriesCard(s)).join("")
      : empty("没有匹配的系列", "换个关键词，或建立一个新系列。");
  }
  seriesDocuments(s, compact = false) {
    const docs = (s.documents || []).filter((doc) => doc.id !== "index");
    const groups = compact
      ? ["创作前需要了解"]
      : ["系列设定", "人物", "世界观"];
    const selected = compact
      ? docs.filter((doc) => /当前状态|故事主线|创作约束|系列偏好/.test(doc.id))
      : docs;
    return (
      groups
        .map((group) => {
          const list = compact
            ? selected
            : selected.filter(
                (doc) =>
                  (doc.group || (/人物/.test(doc.id) ? "人物" : "系列设定")) ===
                  group,
              );
          return list.length
            ? `<section class="context-group"><h3>${E(group === "系列设定" ? "故事与创作方向" : group)}</h3>${list.map((doc) => `<details class="context-document"><summary>${E(documentTitle(doc))}</summary><div class="document-copy">${markdown(doc.content)}</div>${doc.documentKey && !["deprecated", "archived"].includes(doc.status) ? assistantButton("和助手调整这份资料", "document", `data-assistant-document="${E(doc.documentKey)}"`) : ""}</details>`).join("")}</section>`
            : "";
        })
        .join("") ||
      '<p class="hint">系列设定尚未建立。本次创作会保留为草稿。</p>'
    );
  }
  chapterRows(s) {
    const drafts = this.drafts.filter((d) => d.seriesId === s.id);
    const ids = [
      ...new Set([
        ...s.chapters.map((c) => c.id),
        ...s.projects.map((p) => p.chapter_id),
        ...drafts.filter((d) => d.source).map((d) => d.source.chapterId),
      ]),
    ];
    return ids
      .map((id, i) => {
        const c = s.chapters.find((c) => c.id === id);
        const project = s.projects.find((p) => p.chapter_id === id);
        const d = drafts.find((d) => d.source?.chapterId === id);
        const count = d ? imageCount(d) : 0;
        const pages = d?.pages?.length || project?.page_count || 0;
        const label = count
          ? `${count}/${pages} 页已生成`
          : pages
            ? "分镜待出图"
            : "待制作分镜";
        const actions = d
          ? `${count ? `<a class="button primary" href="#work/${E(d.id)}">阅读漫画</a>` : `<a class="button primary" href="#draft/${E(d.id)}">检查分镜并出图</a>`}${count ? `<a class="text-link" href="#draft/${E(d.id)}">修改分镜</a>` : ""}`
          : project
            ? button(
                "打开分镜",
                "import",
                true,
                `data-series="${E(s.id)}" data-chapter="${E(id)}"`,
              )
            : '<span class="hint">尚无制作分镜</span>';
        return `<article class="chapter-row unified-chapter" data-chapter-id="${E(id)}">${artwork(d ? this.app.draftCover(d) : null, c?.title || project?.title || id, true)}<div class="chapter-main"><div class="chapter-heading"><h3>${E(c?.title || project?.title || d?.title || `第 ${i + 1} 话`)}</h3>${badge(label, count === pages && count > 0)}</div><p>${pages ? pages + " 页分镜 · " : ""}${c?.status === "canonical" ? "故事已定稿" : "故事尚未定稿"}</p>${c ? `<details><summary>故事概要与章节卡</summary><div class="document-copy">${markdown(c.content)}</div></details>` : ""}</div><div class="chapter-actions">${actions}${button("永久删除本话", "delete-chapter", false, `data-series="${E(s.id)}" data-chapter="${E(id)}"`)}</div></article>`;
      })
      .join("");
  }
  characterSettings(s) {
    const config = this.app.characterEdits?.[s.id] || s.characterSettings;
    if (!config) return `<p role="status">正在载入人物设定…</p>`;
    return `<div class="section-header"><h2>人物设定</h2><div class="inline-actions">${button("添加人物", "add-character", false, `data-series="${E(s.id)}"`)}${button("保存人物设定", "save-characters", true, `data-series="${E(s.id)}"`)}</div></div><p class="hint">设置人物名字与参考图，生成本系列的漫画和封面时自动使用。修改后点击保存；已有漫画保持原样。</p><div class="character-list">${config.characters.map((c, i) => `<article class="character-setting" data-character-id="${E(c.id)}"><div class="character-fields"><label class="field-label" for="character-name-${i}">人物名字</label><input type="text" id="character-name-${i}" data-character-name="${E(c.id)}" data-series="${E(s.id)}" maxlength="80" value="${E(c.name)}" placeholder="例如：哪吒"><div class="inline-actions"><label class="button" for="character-upload-${i}">添加参考图</label><input class="visually-hidden" id="character-upload-${i}" type="file" data-character-upload="${E(c.id)}" data-series="${E(s.id)}" accept="image/png,image/jpeg,image/webp" multiple>${button("移除人物", "remove-character", false, `data-series="${E(s.id)}" data-character="${E(c.id)}"`)}</div></div><div class="character-references">${c.references.length ? c.references.map((url, n) => `<figure><img src="${E(ConsoleAPI.imageURL(url))}" alt="${E(c.name || '人物')}参考图 ${n + 1}" loading="lazy"><figcaption>${button("移除此图", "remove-character-reference", false, `data-series="${E(s.id)}" data-character="${E(c.id)}" data-reference="${n}"`)}</figcaption></figure>`).join("") : '<p class="hint">尚未添加参考图。可上传正面、侧面或人物设定图。</p>'}</div></article>`).join("") || empty("还没有人物设定", "添加人物名字和参考图，让后续漫画保持人物形象一致。")}</div><div class="editor-actions">${button("保存人物设定", "save-characters", true, `data-series="${E(s.id)}"`)}${button("重新载入", "reload-characters", false, `data-series="${E(s.id)}"`)}</div>`;
  }
  referenceScenes(config, sid) {
    const key = sid || this.app.active?.id || "new";
    const search = this.app.referenceSearches?.[key] || {};
    const selected = config.storyline || [];
    const attrs = `data-series="${E(sid || "")}"`;
    const brief = (value, limit) => { const chars = Array.from(value || ""); return E(chars.slice(0, limit).join("")) + (chars.length > limit ? "…" : ""); };
    const sources = scene => (scene.sources || []).filter(s => /^https?:\/\//i.test(s.url)).map(s => `<a class="text-link" href="${E(s.url)}" target="_blank" rel="noopener noreferrer">${E(s.title)}</a>`).join(" · ");
    return `<section class="reference-scenes" aria-label="亮点剧情与系列脉络"><h3>亮点剧情与系列脉络</h3><p class="hint">每次查找 10 个适合短漫画的局部小片段，聚焦一件小事与一次反转。不用预先选段，也能让 AI 自动设计。想掌握走向时，可查找片段并按顺序加入脉络；这些是待创作计划，保存本话到系列后才标为已采用。</p><div class="field"><label class="field-label" for="reference-keywords">原作检索关键词（选填）</label><input class="input" id="reference-keywords" data-reference-keywords ${attrs} maxlength="200" value="${E(search.keywords || "")}" placeholder="例如：分点心、藏零食、借东西"></div>${button(search.candidates?.length ? "重新查找 10 个片段" : "查找 10 个亮点片段", "search-reference-scenes", false, attrs)}${search.notice ? `<p class="hint" role="status">${E(search.notice)}</p>` : ""}<div class="reference-candidates">${(search.candidates || []).map(scene => `<article class="reference-candidate"><div class="section-header"><h4>${E(scene.title)}</h4><button class="button" data-action="toggle-reference-scene" ${attrs} data-scene="${E(scene.id)}" aria-pressed="${selected.some(s => s.id === scene.id)}">${selected.some(s => s.id === scene.id) ? "已加入脉络 · 移除" : "加入系列脉络"}</button></div><p>${brief(scene.reference,65)}</p><p class="hint">漫画切入：${brief(scene.adaptationHint,45)}</p><details><summary>亮点与来源 · ${E(scene.sourceStatus)}</summary><p>${E(scene.reference)}</p><p>亮点：${E(scene.mechanism)}</p><p>改编方向：${E(scene.adaptationHint)}</p>${sources(scene)}</details></article>`).join("")}</div><h4>已选系列脉络 · ${selected.length} 个片段</h4>${selected.length ? `<ol class="reference-storyline">${selected.map((scene,i) => `<li><div class="section-header"><strong>${E(scene.title)}</strong><span class="hint">${config.skippedReferenceIds?.includes(scene.id) ? "已删除，跳过" : config.usedReferenceIds?.includes(scene.id) ? "已采用" : "待创作"}</span></div><p>${brief(scene.adaptationHint,45)}</p><details><summary>原作片段与来源</summary><p>${E(scene.reference)}</p><p>改编方向：${E(scene.adaptationHint)}</p><p class="hint">${E(scene.sourceStatus)}</p>${sources(scene)}</details><div class="inline-actions">${button("上移", "move-reference-up", false, `${attrs} data-index="${i}" ${i === 0 ? "disabled" : ""}`)}${button("下移", "move-reference-down", false, `${attrs} data-index="${i}" ${i === selected.length-1 ? "disabled" : ""}`)}${button("移除", "remove-reference-scene", false, `${attrs} data-index="${i}"`)}</div></li>`).join("")}</ol>` : '<p class="hint">未选择片段，将由 AI 自动选段。选入脉络后按顺序优先使用；已采用片段跳过，全部用完后继续自动选段。</p>'}</section>`;
  }
  referenceForm(config, sid = null) {
    const value = config || { work: "", mode: "plot", brief: "" };
    const attrs = key => `data-series-reference="${key}" ${sid ? `data-reference-series="${E(sid)}"` : ""}`;
    return `<section class="series-reference-settings"><h3>系列长期参考</h3><p class="hint">只需设置一次，后续每话自动沿用。留空则自主设计；本话临时换参考不会改动这里。</p>${field("参考作品（选填）", "referenceWork", value.work, false, `${attrs("work")} maxlength="200" placeholder="例如：家有儿女"`)}${select("参考方式", "referenceMode", value.mode, [["plot", "AI 自动选原作片段再改编"], ["tone", "只参考基调与人物互动，剧情可原创"]], attrs("mode"))}${field("借鉴重点（选填）", "referenceBrief", value.brief, true, `${attrs("brief")} maxlength="4000" placeholder="例如：家庭日常、亲子代际误会、温暖收尾；改编为本系列的人物和场景。"`)}${this.referenceScenes(value, sid)}${sid ? `<div class="inline-actions">${button("保存参考与系列脉络", "save-series-reference", true, `data-series="${E(sid)}"`)}${button("重新载入", "reload-series-reference", false, `data-series="${E(sid)}"`)}</div>` : '<p class="hint">建立系列并保存本话时，会一起保存这项长期设定。</p>'}</section>`;
  }
  referenceSummary(d, s) {
    const config = d.seriesId?.startsWith("draft-") ? d.seriesReference : s?.referenceSettings;
    return config?.work ? `<p class="hint">系列长期参考：《${E(config.work)}》 · ${config.mode === "tone" ? "参考基调，剧情可原创" : "每话选具体剧情再改编"}${config.storyline?.length ? ` · 已选 ${config.storyline.length} 个脉络片段` : config.mode === "plot" ? " · AI 自动选段" : ""}</p>${button(config.mode === "tone" ? "调整系列参考" : "查看或选择系列脉络", "open-series-reference", false, `data-series="${E(d.seriesId)}"`)}` : "";
  }
  seriesDetail(s) {
    const a = this.app,
      tab = a.tab;
    const drafts = this.drafts.filter((d) => d.seriesId === s.id);
    const ongoing = drafts.filter(
      (d) => !d.source && !d.canonDecision && unfinishedDraft(d),
    );
    const archived = ["deprecated", "archived"].includes(s.status);
    const rows = this.chapterRows(s);
    const nextPath = ongoing.length
      ? "#draft/" + ongoing[0].id
      : "#editor/" + s.id;
    const nextLabel = ongoing.length ? "继续剧情草稿 →" : "设计下一话 →";
    const body =
      tab === "characters"
        ? this.characterSettings(s)
        : tab === "context"
        ? `<div class="section-header"><h2>系列设定</h2></div><p class="hint">按用途阅读：先了解故事与当前状态，再查看人物和世界。创作时会自动带入这些资料。</p>${!archived && !s.id.startsWith("draft-") ? this.referenceForm(this.app.referenceEdits?.[s.id] || s.referenceSettings, s.id) : ""}${this.seriesDocuments(s)}`
        : tab === "history"
          ? `<h2>创作与版本记录</h2><p class="hint">同一话的图像版本在漫画页面内切换；这里记录草稿与最近修改。</p>${drafts.map((d) => `<div class="version-row"><div><h3>${E(d.title || "下一话剧情草稿")}</h3><p>${E(dateLabel(d.updatedAt))} · ${Object.values(d.images || {}).reduce((n, e) => n + e.versions.length, 0)} 个图像版本${d.canonDecision ? " · 已定稿并保存到创作记忆" : ""}</p></div>${link(imageCount(d) ? "查看漫画与版本" : "继续编辑", (imageCount(d) ? "#work/" : "#draft/") + d.id)}</div>`).join("") || empty("还没有创作记录", "开始设计剧情后，修改记录与图像版本会保留在这里。")}`
          : `${ongoing.length ? `<section class="ongoing-drafts"><h2>正在创作</h2><p class="hint">这些是尚未定稿的剧情规划，可继续编辑。</p>${ongoing.map((d) => this.recent(d)).join("")}</section>` : ""}<div class="section-header"><h2>章节</h2><span class="prototype-note">${new Set([...s.chapters.map((c) => c.id), ...s.projects.map((p) => p.chapter_id)]).size} 话</span></div><p class="hint">每一话的故事、分镜和漫画都归在同一处。</p><div class="chapter-list">${rows || empty("开始这个系列的第一话", "先浏览设定，再设计一段剧情。", archived ? "" : `<a class="button primary" href="#editor/${E(s.id)}">设计第一话</a>`)}</div>`;
    return `${heading(s.name, s.summary, `<div class="inline-actions">${archived ? badge("历史系列 · 保留阅读", true) : `<a class="button primary" href="${E(nextPath)}">${nextLabel}</a>`}${button("永久删除系列", "delete-series", false, `data-series="${E(s.id)}"`)}</div>`)}<div class="tabs" role="tablist" aria-label="系列内容">${[
      ["chapters", "章节与漫画"],
      ["characters", "人物设定"],
      ["context", "系列设定"],
      ["history", "创作记录"],
    ]
      .map(
        ([id, t]) =>
          `<button class="tab ${tab === id ? "active" : ""}" role="tab" id="series-tab-${id}" aria-controls="series-panel" tabindex="${tab === id ? 0 : -1}" aria-selected="${tab === id}" data-tab="${id}">${t}</button>`,
      )
      .join(
        "",
      )}</div><div class="detail-grid"><section class="panel" id="series-panel" role="tabpanel" tabindex="0" aria-labelledby="series-tab-${tab}">${body}</section><aside class="editor-aside"><div class="inspector-heading"><h2>创作工具</h2><span>上下文与参数</span></div><section class="panel"><h3>从这里继续</h3><p class="hint">${archived ? "这个系列保留历史内容，创作请选用当前系列。" : "已有分镜可以直接出图；续写下一话会建立独立的剧情草稿。"}</p>${!archived ? `<a class="button primary" href="${E(nextPath)}">${nextLabel}</a>` : ""}${ongoing.length ? button("另起一份剧情草稿", "new-series-draft", false, `data-series="${E(s.id)}"`) : ""}</section><section class="panel"><h3>创作原则自动带入</h3><p class="hint">人物、世界与最近章节随剧情一起读取，不必复制粘贴。</p>${link("浏览创作原则", "#principles")}${!archived ? `<div class="inline-actions">${assistantButton("讨论系列方向", "context")}${assistantButton("调整后续创作要求", "series", `data-assistant-series="${E(s.id)}"`)}</div>` : ""}</section></aside></div>`;
  }
  inspiration(d) {
    const source = d.chapters?.[d.chapterIndex]?.inspiration;
    if (!source || typeof source !== "object") return "";
    return `<details class="story-inspiration"><summary>本话经典剧情借鉴 · ${E(source.work)}</summary><p class="hint">${E(source.sourceStatus)}</p><p><strong>参考冲突：</strong>${E(source.reference)}</p><p><strong>借鉴机制：</strong>${E(source.mechanism)}</p><p><strong>本话改写：</strong>${E(source.adaptation)}</p></details>`;
  }
  principles() {
    const a = this.app,
      docs = [...a.workspace.principles, ...a.workspace.preferences];
    const doc = docs[a.rule] || docs[0];
    return `${heading("创作原则", "在设计剧情之前，先建立共同的创作语言。", link("回到创作", a.returnHash || "#series"))}<p class="hint">当前有效的创作原则与全局偏好。</p>${doc ? `<div class="rules-layout"><nav class="rule-menu" aria-label="原则与偏好">${docs.map((r, i) => `<button class="${a.rule === i ? "active" : ""}" data-rule="${i}" aria-current="${a.rule === i ? "page" : "false"}">${E(documentTitle(r))}</button>`).join("")}</nav><article class="rule-document"><div class="rule-edit-entry"><p class="hint">不必自己改规则措辞。告诉助手想解决什么问题，审阅修改后再应用。</p>${doc.documentKey ? assistantButton("和助手调整这份创作依据", "document", `data-assistant-document="${E(doc.documentKey)}"`) : ""}</div><div class="document-copy">${markdown(doc.content)}</div><aside class="rule-callout"><h3>读原则，不必逐条打勾</h3><p>设计剧情时扫描全局原则、全局偏好、系列约束与偏好，具体应用显示在创作侧栏。</p></aside></article></div>` : empty("创作依据尚未载入", "检查本机工作空间或重新连接服务。", button("重新载入", "refresh"))}`;
  }
  aside(d) {
    const s = this.app.series(d.seriesId);
    const choosing = (d.mode === "single" && d.step === 0) || (isPlanned(d) && d.step === 1);
    return `<aside class="editor-aside" id="creation-inspector"><div class="inspector-heading"><h2>创作工具</h2><span>当前作品</span></div>
      ${choosing ? `<section class="panel inspector-options"><h3>生成参数</h3>${select(d.mode === "single" ? "漫画页数" : "规划话数", d.mode === "single" ? "pageCount" : "chapterCount", d.mode === "single" ? d.pageCount : d.chapterCount, [1,2,3,4,5].map(n=>[n,n+(d.mode === "single" ? " 页" : " 话")]))}${select("画风", "style", d.style, d.mode === "single" ? STYLES : [["reference","跟随系列视觉"],...STYLES])}</section>` : ""}
      <section class="panel"><h3>和助手一起改</h3><p class="hint">助手会带上当前作品和相关资料。</p>${assistantButton("调整当前作品")}${d.mode === "series" && !d.seriesId?.startsWith("draft-") ? assistantButton("调整系列创作要求", "series") : ""}</section>
      <section class="panel"><h3>创作依据</h3>${s ? `<details><summary>${E(s.name)}</summary><p class="hint">${E(s.summary)}</p></details>` : '<p class="hint">单篇创作 · 采用全局创作原则</p>'}${link("浏览创作原则", "#principles")}${d.ruleApplications?.length ? `<details><summary>本次原则应用 · ${d.ruleApplications.length} 项</summary><ul class="rule-items">${d.ruleApplications.map(r=>`<li><strong>${E(r.rule)} · ${E(r.status)}</strong>${E(r.reason)}</li>`).join("")}</ul></details>` : ""}<p class="hint inspector-save" id="save-state">自动保存到本机与工作空间</p></section></aside>`;
  }
  pageEditor(d) {
    return `<div class="page-editor-list">${d.pages.map((p, pi) => `<details class="page-edit" id="edit-page-${pi}" ${pi === (this.app.editPage || 0) ? "open" : ""}><summary>${E(pageHeading(p, pi))}<span class="hint">${p.rows.reduce((n, r) => n + r.panels.length, 0)} 格 · 点击修改</span></summary><div class="inline-actions">${assistantButton("让助手调整这一页", "page", `data-assistant-page="${pi}"`)}</div>${p.rows.map((r, ri) => r.panels.map((panel, ni) => `<div class="field"><label class="field-label" for="panel-${pi}-${ri}-${ni}">第 ${ri + 1} 行，第 ${ni + 1} 格 · 画面与对白</label><textarea id="panel-${pi}-${ri}-${ni}" data-panel="${pi},${ri},${ni}">${E(panel.text)}</textarea></div>`).join("")).join("")}</details>`).join("")}</div>`;
  }
  editor(d) {
    const a = this.app,
      single = d.mode === "single",
      planned = isPlanned(d),
      s = a.series(d.seriesId);
    const labels = planned
      ? ["了解系列", "设计剧情", "调整剧情", "确认分镜", "生成漫画"]
      : single
        ? ["描述想法", "确认分镜", "生成漫画"]
        : ["了解系列", "调整分镜", "漫画成品"];
    const finalStep = outputStep(d);
    const stepper = `<nav class="stepper" aria-label="创作阶段">${labels
      .map((t, i) => {
        const disabled =
          i > 0 &&
          (planned
            ? (i >= 2 && !d.chapters.length) || (i >= 3 && !d.pages.length)
            : !d.pages.length);
        return `<button data-step="${i}" class="${d.step === i ? "active" : ""}" aria-current="${d.step === i ? "step" : "false"}" ${disabled ? "disabled" : ""}><span class="step-number">${i + 1}</span>${t}</button>`;
      })
      .join("")}</nav>`;
    const back = link(
      single ? "返回工作台" : "返回系列",
      single ? "#home" : "#series/" + d.seriesId,
    );
    const title =
      d.title ||
      (single ? "创作一篇漫画" : d.seriesName || s?.name || "建立新系列");
    const header = `<div class="story-header"><div><h1>${E(title)}</h1><p class="subtitle">${d.source ? "已有分镜与漫画版本可以继续编辑，修改不会覆盖旧版图像。" : single ? "描述想法 → 检查分镜 → 生成漫画" : "先讲顺剧情，再检查每页分镜，最后生成漫画。"}</p></div><div class="inline-actions">${back}${this.deletionButton(d)}</div></div>${stepper}`;
    if (d.step === finalStep) return header + `<div class="editor-layout">${this.output(d)}${this.aside(d)}</div>`;
    if (planned && d.step === 3) return header + `<div class="editor-layout">${this.output(d, false, true)}${this.aside(d)}</div>`;
    let content;
    if (!single && d.step === 0) {
      content = `<h2>${d.seriesId?.startsWith("draft-") ? "建立系列的起点" : "了解这个系列，再开始创作"}</h2><p class="subtitle">这些资料会自动带入生成，不需要逐项确认。</p>${d.seriesId?.startsWith("draft-") ? field("系列名称", "seriesName", d.seriesName, false, 'placeholder="为这个系列起个名字"') + field("系列方向与人物设想", "seriesBrief", d.seriesBrief || "", true, 'placeholder="谁是主角？他想要什么？这个系列会反复遇到怎样的冲突？"') + this.referenceForm(d.seriesReference) : `<p>${E(s?.summary || "")}</p>${this.seriesDocuments(s || { documents: [] }, true)}`}<div class="rule-callout"><h3>共同的创作原则</h3><p>故事因果、人物选择与视觉连续性会用于本次创作。</p>${link("按需浏览完整原则", "#principles")}</div><div class="editor-actions"><span class="save-state">${d.source ? "已有分镜可以直接编辑" : "可直接让 AI 设计，也可以补充自己的方向"}</span>${button(d.source ? "开始调整分镜 →" : "开始设计剧情 →", "next", true)}</div>`;
    } else if (d.step === 0 || (planned && d.step === 1)) {
      content = `<h2>${single ? "你想画一个怎样的故事？" : "下一话，让 AI 来设计"}</h2><p class="subtitle">${single ? "一句灵感或一段故事都可以。先生成文字分镜，确认后再出图。" : "不用先想好剧情。AI 会结合创作原则、系列人物与最近剧情设计下一话；也可以补充方向或指定经典作品参考。"}</p>${field(single ? "漫画想法" : "剧情方向（选填）", "idea", d.idea, true, `placeholder="${single ? "例如：一个总迟到的人，遇到一班只等他的末班车……" : "留空，让 AI 自主设计；也可以写：让主角因一个歪点子惹出新麻烦。"}"`)}${!single ? this.referenceSummary(d, s) + field("本话临时参考（选填）", "inspirationReference", d.inspirationReference || "", true, 'maxlength="4000" placeholder="例如：参考《武林外传》的一个经典小冲突，改写成本系列自己的故事。也可指定片段。"') + '<p class="hint">留空沿用系列长期参考；填写仅影响本次剧情设计。生成后可查看参考片段和改写方式。</p>' : ""}<details class="generation-settings"><summary>更多设置 · 语言、布局与参考图</summary><div data-inline-generation></div><div class="inline-options">${select(
        "漫画语言",
        "language",
        d.language,
        [
          ["zh", "中文"],
          ["en", "English"],
          ["ja", "日本語"],
        ],
      )}${select(
        "每页行数",
        "rows",
        d.rows,
        [1, 2, 3, 4, 5].map((n) => [n, n + " 行"]),
      )}${
        !single
          ? select(
              "每话漫画页数",
              "pageCount",
              d.pageCount,
              [1, 2, 3, 4, 5, 8, 10].map((n) => [n, n + " 页"]),
            )
          : ""
      }</div><div class="field"><label class="field-label" for="reference-upload">参考图 · 可上传、拖放或粘贴</label><input type="file" id="reference-upload" accept="image/png,image/jpeg,image/webp"><div id="reference-drop" class="reference-drop" tabindex="0">${d.reference ? `<img src="${E(ConsoleAPI.imageURL(d.reference))}" alt="本次创作参考图">${button("移除参考图", "remove-reference")}` : "将图片拖到这里，或粘贴剪贴板图片"}</div></div></details><div class="editor-actions">${single ? button("帮我完善想法", "optimize") : button("← 返回系列资料", "back-context")}${button(single ? "生成文字分镜 →" : "让 AI 设计剧情 →", "plan", true)}</div>`;
    } else if (planned && d.step === 2) {
      content = `<div class="section-header"><h2>先把剧情讲顺</h2><span class="save-state">修改自动保存</span></div><p class="hint">逐话检查：人物想要什么、做了什么选择、承担什么后果。确认后生成可编辑的逐页分镜。</p>${d.chapters.length > 1 ? `<div class="tabs" aria-label="选择要调整的章节">${d.chapters.map((c, i) => `<button class="tab ${d.chapterIndex === i ? "active" : ""}" data-chapter-index="${i}" aria-pressed="${d.chapterIndex === i}">第 ${i + 1} 话 · ${E(c.title)}</button>`).join("")}</div>` : ""}${this.inspiration(d)}${field("本话标题", "title", d.title)}${field("核心冲突与前后承接", "summary", d.chapters[d.chapterIndex]?.summary || "", true)}${(d.chapters[d.chapterIndex]?.beats || []).map((b, i) => `<div class="field"><label class="field-label" for="beat-${i}">${["开场 · 事情如何开始", "发展 · 人物如何选择", "收束 · 后果与下一话"][i]}</label><textarea id="beat-${i}" data-beat="${i}">${E(b)}</textarea></div>`).join("")}${this.revisionEditor(d)}<details><summary>封面描述</summary>${field("封面短标题", "coverTitle", d.coverTitle || d.title)}${field("封面视觉描述", "coverBrief", d.coverBrief || "", true)}</details><div class="editor-actions"><span class="save-state">仅生成当前这一话的分镜，不会立即出图</span>${button(d.pages.length && !d.storyDirty ? "检查本话分镜 →" : "确认剧情，生成本话分镜 →", "storyboard", true)}</div>`;
    } else {
      content = `<div class="section-header"><h2>检查每一页的画面与对白</h2><span class="save-state">${d.pages.length} 页分镜</span></div><p class="hint">展开页面直接修改。确认后可批量出图，也可先试画一页；已生成的旧版本会保留。</p>${field("作品标题", "title", d.title)}${this.pageEditor(d)}${this.revisionEditor(d)}<details><summary>封面描述</summary>${field("封面短标题", "coverTitle", d.coverTitle || d.title)}${field("封面视觉描述", "coverBrief", d.coverBrief || "", true)}</details><div class="editor-actions">${d.pages.length > 1 ? button(imageCount(d) ? "查看已有漫画" : "先试画第 1 页", imageCount(d) ? "view-output" : "redraw", false, 'data-page="0"') : '<span class="save-state">修改自动保存 · 旧图像版本保留</span>'}${button(imageCount(d) === d.pages.length ? "查看漫画与更新 →" : "确认分镜，生成漫画 →", imageCount(d) === d.pages.length ? "view-output" : "generate", true)}</div>`;
    }
    return `${header}${single && hasContent(d) ? `<div class="resume-note"><span>当前为已保存草稿</span>${button("另起一篇", "new-single")}</div>` : ""}<div class="editor-layout"><section class="editor-paper">${content}</section>${this.aside(d)}</div>`;
  }
  revisionEditor(d) {
    return `<section class="assistant-inline"><div><h3>${isPlanned(d) && d.step === 2 ? "这段剧情还可以怎么改？" : "画面、对白不合适，直接说"}</h3><p class="hint">可以连续讨论，查看具体修改后再采用。无需重新描述整个故事。</p></div>${assistantButton("和助手一起调整", isPlanned(d) && d.step === 2 ? "story" : "storyboard")}</section><details><summary>快速调整 · 输入一句话立即更新文字</summary><p class="hint">直接编辑也可以。AI 调整会更新文字，历史图片继续保留。</p>${field("调整方向", "revisionText", d.revisionText || "", true, 'placeholder="比如：缩短开场对白，让主角主动做选择。"')}${button("按此方向调整", "revise")}</details>`;
  }
  output(d, historical = false, reviewing = false) {
    const a = this.app,
      sketch = reviewing || a.output === "sketch";
    const pending = d.pages.filter((_, i) => !isFresh(d, i)).length;
    const chapterTabs =
      d.chapters?.length > 1
        ? `<div class="tabs" aria-label="连续规划章节">${d.chapters.map((ch, i) => `<button class="tab ${i === d.chapterIndex ? "active" : ""}" data-chapter-index="${i}">第 ${i + 1} 话 · ${E(ch.title)}</button>`).join("")}</div>`
        : "";
    return `<section class="editor-paper"><div class="section-header"><div><h2>${reviewing ? "确认逐页分镜" : "漫画预览"}</h2><p class="hint">${d.pages.length} 页 · ${pending ? pending + " 页待生成或更新" : "漫画已就绪"}${d.canonDecision ? " · 已定稿" : ""}</p></div>${reviewing ? "" : `<div class="segmented" role="group" aria-label="预览模式">${["comic", "sketch"].map((v) => `<button class="${a.output === v ? "active" : ""}" data-output="${v}" aria-pressed="${a.output === v}">${v === "comic" ? "漫画" : "分镜"}</button>`).join("")}</div>`}</div>${chapterTabs}<div class="output-toolbar"><p>${reviewing ? "逐页确认画面与对白；修改自动保存。准备好后，再生成漫画。" : pending ? "已完成的页面会保留，只生成待更新的页面。" : "漫画已生成，可下载当前版本或继续编辑。"}</p><div class="inline-actions">${assistantButton("讨论与调整", d.chapters?.length && !reviewing ? "story" : "storyboard")}${reviewing ? button("返回调整剧情", "edit-again") + button("确认分镜，生成漫画 →", "generate", true) : (pending ? button("生成待更新的 " + pending + " 页", "generate", true) : "") + (imageCount(d) ? button("下载漫画 ZIP", "export-work", !pending) : "") + button("修改分镜", "edit-pages")}</div></div><div class="output-grid ${sketch ? "storyboard-review" : ""}">${d.pages
      .map((p, i) => {
        const entry = d.images[i],
          versions = entry?.versions || [],
          image = currentImage(entry);
        return `<article class="comic-sheet"><h3>${E(pageHeading(p, i))}</h3>${sketch ? `<div class="page-sketch">${p.rows.map((r, ri) => `<div class="sketch-row">${r.panels.map((panel, ni) => `<div class="sketch-panel"><strong>第 ${ri + 1} 行 · 第 ${ni + 1} 格</strong><span>${E(panel.text)}</span></div>`).join("")}</div>`).join("")}</div>${reviewing ? `<details><summary>编辑本页画面与对白</summary>${p.rows.map((r, ri) => r.panels.map((panel, ni) => `<div class="field"><label class="field-label" for="review-${i}-${ri}-${ni}">第 ${ri + 1} 行，第 ${ni + 1} 格</label><textarea id="review-${i}-${ri}-${ni}" data-panel="${i},${ri},${ni}">${E(panel.text)}</textarea></div>`).join("")).join("")}</details>` : ""}` : image?.imageUrl ? `<button class="image-preview" data-preview="${i}" aria-label="放大第 ${i + 1} 页"><img src="${E(ConsoleAPI.imageURL(image.imageUrl))}" alt="第 ${i + 1} 页漫画" loading="lazy"></button>${!isFresh(d, i) ? '<p class="hint">旧版漫画 · 当前分镜有变更</p>' : ""}` : empty("分镜已就绪", "生成后在这里查看漫画。")}<div class="page-actions">${assistantButton("让助手改这一页", "page", `data-assistant-page="${i}"`)}${reviewing ? "" : button(sketch ? "修改这一页" : versions.length ? "重新生成此页" : "生成这一页", sketch ? "edit-page" : "redraw", false, `data-page="${i}"`)}${versions.length ? `<label class="visually-hidden" for="version-${i}">第 ${i + 1} 页图像版本</label><select id="version-${i}" data-version-page="${i}">${versions.map((v, vi) => `<option value="${vi}" ${vi === (entry.current || 0) ? "selected" : ""}>版本 ${vi + 1} · ${E(dateLabel(v.createdAt || v.timestamp))}</option>`).join("")}</select>` : ""}</div>${image?.imageUrl ? button("下载此页", "download-page", false, `data-page="${i}"`) : ""}</article>`;
      })
      .join(
        "",
      )}</div><div class="editor-actions">${button(reviewing ? "← 返回调整剧情" : "← 修改分镜", reviewing ? "edit-again" : "edit-pages")}${pending ? button(reviewing ? "确认分镜，生成漫画 →" : "生成待更新页面 →", "generate", true) : link("查看作品库", "#library")}</div>${this.memory(d)}<details id="publishing-tools"><summary>封面、发布文案与导出</summary><div class="version-row"><div><h3>作品导出</h3><p>下载当前漫画图片，或导出含剧情与分镜的完整草稿。</p></div><div class="inline-actions">${button("导出漫画", "export-work")}${button("导出草稿", "export-draft")}</div></div><div class="version-row"><div><h3>封面</h3><p>${E(d.coverBrief || "使用独立封面描述与当前页面参考生成封面。")}</p></div><div class="inline-actions">${assistantButton("调整封面描述", "cover")}${button("生成封面", "cover")}</div></div>${d.coverImages?.length ? `<div class="cover-versions">${d.coverImages.map((v, i) => `<div class="cover-version"><a href="${E(ConsoleAPI.imageURL(v.imageUrl))}" target="_blank" rel="noopener"><img src="${E(ConsoleAPI.imageURL(v.imageUrl))}" alt="封面版本 ${i + 1}"></a>${button("下载封面", "download-cover", false, `data-cover="${i}" aria-label="下载封面版本 ${i + 1}"`)}</div>`).join("")}</div>` : ""}<div class="version-row"><div><h3>社交文案</h3><p>从当前故事生成可复制的发布文案。</p></div><div class="inline-actions">${button("小红书", "social", false, 'data-platform="xiaohongshu"')}${button("Twitter / X", "social", false, 'data-platform="twitter"')}</div></div>${d.social ? this.socialCopy(d.social) : ""}</details></section>`;
  }
  socialCopy(social) {
    const part = (label, key, value) => `<section class="social-part"><div class="social-part-heading"><h4>${label}</h4>${value ? button("复制" + label, "copy-social", false, `data-social-part="${key}"`) : ""}</div><p>${E(value || "尚未生成，重新生成文案后查看。")}</p></section>`;
    return `<div class="social-copy"><h3>${social.platform === "twitter" ? "Twitter / X" : "小红书"}发布文案</h3>${social.schemaVersion !== 2 ? '<p class="hint">这是旧版文案，可能未读取完整剧情。请点击上方平台按钮重新生成。</p>' : ""}${part("标题", "title", social.title)}${part("正文", "content", social.content)}${part("话题标签", "tags", (social.tags || []).map(t => "#" + t.replace(/^#+/, "")).join(" "))}${part("首条互动评论建议", "comment", social.comment)}<p class="hint">互动评论供作者自行发布，不包含在帖子正文中。</p>${button("复制完整帖子（标题、正文、标签）", "copy-social")}</div>`;
  }
  memory(d) {
    if (d.mode !== "series") return "";
    const review = d.retrospectives?.[String(d.chapterIndex || 0)];
    const learning = d.learningReviews?.[String(d.chapterIndex || 0)];
    return `<section class="series-memory" aria-label="系列创作记忆"><div class="version-row"><div><h3>${d.canonDecision ? "本话已保存到系列" : "保存本话，供后续续写使用"}</h3><p>${d.canonDecision ? "下次续写会参考本话剧情、人物变化和复盘。修改剧情后可再次保存。" : "将当前故事保存为系列正式剧情，让下一话记住发生过的事和人物变化。AI 会生成或更新复盘，并分析你对剧情的修改，判断是否需要调整本系列的创作原则。草稿和漫画版本会保留。"}</p></div>${button(d.canonDecision ? "已保存到系列" : "保存本话到系列", "canon", !d.canonDecision, d.canonDecision ? "disabled" : "")}</div><details><summary>哪些修改希望以后也沿用？</summary>${field("后续创作要求（选填）", "futureGuidance", d.futureGuidance || "", true, 'placeholder="例如：以后每话都让主角主动做选择，并展示选择带来的后果。"')}<p class="hint">只改本话剧情即可；填写这里，表示希望 AI 判断并更新本系列后续使用的创作要求。</p></details>${learning ? `<details><summary>本次修改对创作原则的影响</summary><p>${E(learning.reason)}</p><p>${E(learning.effect)}</p>${learning.recommendation ? `<p>${E(learning.recommendation)}</p>` : ""}</details>` : ""}<details id="retrospective-section" ${review?.content ? "open" : ""}><summary>本话复盘 · 查看与调整</summary><p class="hint">保存本话时会生成或更新复盘，回顾剧情得失、人工修改的效果和后续改进。你也可以手工编辑，或填写方向让 AI 重新分析；手工编辑的正文会保留。</p>${field("复盘调整方向（选填）", "retrospectiveDirection", d.retrospectiveDirection || "", true, 'placeholder="例如：重点检查哪吒的选择是否有代价，缩短节奏建议"')}<div class="inline-actions">${button(review?.content ? "按当前分镜重新生成复盘" : "生成本话复盘", "retrospective")}</div>${`<div class="field"><label class="field-label" for="chapter-retrospective">复盘正文 · 可直接编辑</label><textarea class="textarea" id="chapter-retrospective" data-retrospective rows="8" placeholder="可直接写下本话的得失与后续改进，也可以先让 AI 生成。">${E(review?.content || "")}</textarea></div><div class="inline-actions">${button("保存复盘到系列", "save-retrospective", false, d.canonDecision ? "" : "disabled")}</div><p class="hint">${d.canonDecision ? "这里仅保存复盘正文。调整剧情或后续创作要求后，请用上方“保存本话到系列”一并更新。" : "保存本话时会一并收录复盘。也可以先生成或手工填写，草稿会自动保留。"}</p>${
      review?.history?.length
        ? `<details><summary>之前的复盘草稿（${review.history.length}）</summary>${review.history
            .slice()
            .reverse()
            .map((v) => `<pre class="canon-copy">${E(v.content)}</pre>`)
            .join("")}</details>`
        : ""
    }`}</details></section>`;
  }
  library() {
    const a = this.app;
    let ds = a
      .works()
      .filter((d) =>
        Object.values(d.images || {}).some((e) => e.versions?.length),
      );
    if (a.filter !== "all") ds = ds.filter((d) => d.mode === a.filter);
    if (a.filter === "series" && a.librarySeries)
      ds = ds.filter((d) => d.seriesId === a.librarySeries);
    return `${heading("漫画作品", "回看完成的故事，也保留每一个创作版本。", '<a class="button primary" href="#single">创作单篇 →</a>')}<div class="toolbar"><div class="segmented" role="group" aria-label="作品分类">${[
      ["all", "全部作品"],
      ["series", "系列漫画"],
      ["single", "单篇漫画"],
    ]
      .map(
        ([v, t]) =>
          `<button data-filter="${v}" class="${a.filter === v ? "active" : ""}" aria-pressed="${a.filter === v}">${t}</button>`,
      )
      .join(
        "",
      )}</div><span class="prototype-note">${ds.length} 部漫画</span></div>${a.filter === "series" ? `<div class="field"><label class="field-label" for="library-series">选择系列</label><select id="library-series" style="max-width:280px"><option value="">全部系列</option>${a.seriesList.map((s) => `<option value="${s.id}" ${s.id === a.librarySeries ? "selected" : ""}>${E(s.name)}</option>`).join("")}</select></div>` : ""}<div class="gallery-grid">${ds.map((d) => `<a class="series-card" href="#work/${d.workPath}">${artwork(a.draftCover(d), d.title || "未命名漫画")}<div class="card-info"><div class="card-title"><h3>${E(d.title || "未命名漫画")}</h3>${badge(status(d), true)}</div><p>${E(a.series(d.seriesId)?.name || "单篇作品")} · ${d.pages.length} 页</p><div class="card-meta"><span>历史版本保留</span><span>阅读 →</span></div></div></a>`).join("")}</div>${!ds.length ? empty("一个灵感，也值得成为作品", "完成漫画生成后，作品会自动收纳在这里。", link("开始单篇创作", "#single")) : ""}`;
  }
  settings() {
    const c = ConfigManager.loadConfig();
    const storageLabel = window.DesktopHost ? '当前应用' : '当前浏览器';
    const providers = [
      ["codex", "Codex · 本机使用"],
      ["google", "Google Gemini"],
      ["openai", "OpenAI / 兼容接口"],
    ];
    return `${heading("创作设置", "设置自动保存，完成后回到刚才的创作。", this.app.returnHash ? link("返回刚才的页面", this.app.returnHash) : link("返回工作台", "#home"))}<div class="settings-grid"><section class="panel"><h2>当前创作空间</h2><p>${E(this.app.workspaceUI?.info?.name || "本机创作空间")}</p><p class="hint">系列、原则与草稿按空间分别保存。</p>${link("选择或切换创作空间", "#workspace")}</section><section class="panel"><h2>生成方式</h2><p class="hint">更改后自动保存，凭据仅保存在${storageLabel}。</p>${select("文字模型来源", "modelProvider", c.modelProvider, providers, "data-config")}${c.modelProvider === "openai" ? field("OpenAI API Key", "apiKey", ConfigManager.loadApiKey(), false, 'type="password" autocomplete="off" data-key') : ""}${c.modelProvider === "google" || c.imageProvider === "google" ? field("Google API Key", "googleKey", ConfigManager.loadGoogleApiKey(), false, 'type="password" autocomplete="off" data-key') : ""}${c.imageProvider === "openai" && c.modelProvider !== "openai" ? field("OpenAI API Key", "apiKey", ConfigManager.loadApiKey(), false, 'type="password" autocomplete="off" data-key') : ""}${select("图像模型来源", "imageProvider", c.imageProvider, providers, "data-config")}<details><summary>模型、尺寸与质量等高级设置</summary>${field("文字模型", "model", c.model, false, "data-config")}${field("图像模型", "imageModel", c.imageModel, false, "data-config")}${field("兼容接口地址", "baseUrl", c.baseUrl, false, 'type="url" data-config')}<div class="inline-options">${select(
      "图像质量",
      "imageQuality",
      c.imageQuality,
      [
        ["low", "快速"],
        ["medium", "标准"],
        ["high", "高质量"],
        ["auto", "自动"],
      ],
      "data-config",
    )}${select(
      "页面比例",
      "imageSize",
      c.imageSize,
      [
        ["1024x1536", "竖版漫画 · 2:3"],
        ["1024x1024", "方形 · 1:1"],
        ["1536x1024", "横版 · 3:2"],
      ],
      "data-config",
    )}</div>${select(
      "推理强度",
      "reasoningEffort",
      c.reasoningEffort,
      [
        ["low", "低"],
        ["medium", "中"],
        ["high", "高"],
      ],
      "data-config",
    )}</details><p class="hint" id="settings-state" role="status">设置自动保存</p></section><section class="panel"><h2>绘制过程</h2><label class="drawing-setting"><input type="checkbox" data-config data-field="drawingPlayback" ${c.drawingPlayback !== false ? "checked" : ""} aria-describedby="drawing-setting-help"><span>出图后播放绘制过程</span></label><p class="hint" id="drawing-setting-help">图片生成后，全屏播放约 1 分钟的描线与上色过程，可随时跳过。关闭后直接显示成图。系统开启减少动态效果时直接显示成图。</p></section><section class="panel"><h2>创作记忆</h2><p class="spaced-copy">保存系列设定、人物与历史剧情，继续创作时自动带入。草稿与图像版本自动保留，故事定稿前可检查具体变更。</p><p class="hint">${this.app.connected ? "已连接本机工作空间" : "尚未连接本机服务"} · ${this.app.workspace.principles.length} 份创作原则 · ${this.app.seriesList.length} 个系列</p>${button("重新同步创作记忆", "refresh")}</section></div>`;
  }
}
window.ConsoleViews = ConsoleViews;
