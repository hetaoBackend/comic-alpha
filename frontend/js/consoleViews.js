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
// Rare or destructive actions stay quiet: never a second boxed button beside the main one.
const textButton = (text, action, extra = "", danger = false) =>
  `<button class="text-button${danger ? " danger" : ""}" data-action="${action}" ${extra}>${E(text)}</button>`;
const moreMenu = (items, label = "更多操作") =>
  `<details class="more-menu"><summary aria-label="${E(label)}" title="${E(label)}">⋯</summary><div class="more-menu-items">${items}</div></details>`;
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
// 起承转合 is the planned shape. Drafts saved before it keep three editable beats.
const BEATS = [
  ["起", "欲望与处境 · 主角想要什么，什么在拦他"],
  ["承", "选择与升级 · 哪个选择让撤退更难，局面如何变大"],
  ["转", "反转 · 谁主动出手，让局面倒过来"],
  ["合", "兑现与收尾 · 后果落地，停在最后一拍"],
];
const LEGACY_BEATS = [
  ["开场", "事情如何开始"],
  ["发展", "人物如何选择"],
  ["收束", "后果与下一话"],
];
const beatLabels = (count) => (count === 3 ? LEGACY_BEATS : BEATS);
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
const isNewSeries = (d) => d.seriesId?.startsWith("draft-");
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
// Model page titles often repeat the chapter and say "第一页面"; show the useful part only.
const pageHeading = (p, i, chapterTitle = "") => {
  let title = String(p.title || "").trim();
  if (chapterTitle && title.startsWith(chapterTitle))
    title = title.slice(chapterTitle.length);
  title = title.replace(/^[·•:：\s-]+/, "").replace(/^第\s*[\d零一二三四五六七八九十百]+\s*页\s*面?\s*[·:：-]?\s*/, "");
  return /^PAGE[-_ ]?\d*$/i.test(title) || !title
    ? `第 ${i + 1} 页`
    : `第 ${i + 1} 页 · ${title}`;
};
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
    return `<a class="activity-row" href="${E(path)}">${artwork(this.app.draftCover(d), d.title || "创作中", true)}<div class="activity-title"><h3>${E(d.title || (d.mode === "single" ? "单篇漫画草稿" : "下一话剧情草稿"))}</h3><p>${E(d.mode === "single" ? "单篇漫画" : this.app.series(d.seriesId)?.name || "新系列")} · ${d.pages?.length ? d.pages.length + " 页分镜" : d.chapters?.length ? d.chapters.length + " 话剧情" : "想法已保存"}</p></div>${badge(readable ? imageCount(d) + "/" + d.pages.length + " 页已生成" : status(d), readable)}<span class="time">${E(dateLabel(d.updatedAt))}</span><span class="quiet-arrow" aria-hidden="true">→</span></a>`;
  }
  home() {
    const a = this.app;
    const latest = this.drafts.filter(d => unfinishedDraft(d))[0];
    const series = a.seriesList.filter(s => !["deprecated", "archived"].includes(s.status));
    return `<div class="studio-home">${heading("创作工作台", "接着上次的故事，或开始一篇新漫画。")}
      ${latest ? `<section class="resume-work"><div class="resume-art">${artwork(a.draftCover(latest), latest.title || "创作草稿", true)}</div><div class="resume-content"><p class="resume-status">${E(status(latest))} · ${E(a.series(latest.seriesId)?.name || "单篇漫画")}</p><h2>${E(latest.title || "未命名草稿")}</h2><p class="hint">${E(latest.pages?.length ? latest.pages.length + " 页分镜，随时继续修改" : latest.chapters?.length ? "剧情已设计，接着调整起承转合" : "想法已保存，继续完善故事")}</p></div><a class="button primary" href="#draft/${E(latest.id)}">继续创作</a></section>` : `<section class="studio-welcome"><h2>从一个想法开始</h2><p>写下故事，确认分镜，再把它画出来。</p><a class="button primary" href="#single">创作第一篇漫画</a>${assistantButton("和助手一起构思")}</section>`}
      <div class="home-columns"><section class="studio-section"><div class="section-header"><h2>最近创作</h2>${link("全部作品", "#library")}</div><div class="activity-list">${this.drafts.length ? this.drafts.slice(0,5).map(d=>this.recent(d)).join("") : empty("还没有创作记录", "新建漫画后，草稿会自动保留。")}</div></section><aside class="home-tools"><h2>开始新的创作</h2><a class="creation-route" href="#single"><strong>单篇漫画</strong><span>一个想法，一篇完整作品</span><span aria-hidden="true">→</span></a><a class="creation-route" href="#new-series"><strong>建立系列</strong><span>积累人物，持续讲述故事</span><span aria-hidden="true">→</span></a><div class="home-assistant"><h3>还没想好怎么写？</h3><p>让助手一起推敲冲突、人物和下一话方向。</p>${assistantButton("一起构思")}</div></aside></div>
      <section class="studio-section home-series"><div class="section-header"><h2>我的系列 <span class="count">${series.length}</span></h2>${link("全部系列", "#series")}</div><div class="series-grid">${series.slice(0,4).map(s=>this.seriesCard(s)).join("") || empty("建立你的第一个系列", "系列会记住人物、世界与之前的剧情。", link("建立系列", "#new-series"))}</div></section></div>`;
  }
  seriesList() {
    return `${heading("我的系列", "故事、人物与每一话漫画，都在各自的系列里。", '<a class="button primary" href="#new-series">建立新系列 +</a>')}<div class="toolbar"><label class="visually-hidden" for="series-search">搜索系列</label><input class="input search" id="series-search" type="search" placeholder="搜索系列" value="${E(this.app.search)}"></div><div class="series-grid section" id="series-results">${this.filteredSeries()}</div>`;
  }
  filteredSeries() {
    const list = this.app.seriesList.filter((s) =>
      (s.name + s.genre).toLowerCase().includes(this.app.search.toLowerCase()),
    );
    return list.length
      ? list.map((s) => this.seriesCard(s)).join("")
      : empty("没有匹配的系列", "换个关键词，或建立一个新系列。");
  }
  seriesDocuments(s) {
    const docs = (s.documents || []).filter((doc) => doc.id !== "index");
    return (
      ["系列设定", "人物", "世界观"]
        .map((group) => {
          const list = docs.filter(
            (doc) =>
              (doc.group || (/人物/.test(doc.id) ? "人物" : "系列设定")) === group,
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
        const open = d
          ? `<a class="button primary" href="${count ? "#work/" : "#draft/"}${E(d.id)}">${count ? "阅读漫画" : "检查分镜并出图"}</a>${count ? `<a class="text-link" href="#draft/${E(d.id)}">修改分镜</a>` : ""}`
          : project
            ? button("打开分镜", "import", true, `data-series="${E(s.id)}" data-chapter="${E(id)}"`)
            : '<span class="hint">尚无制作分镜</span>';
        return `<article class="chapter-row" data-chapter-id="${E(id)}">${artwork(d ? this.app.draftCover(d) : null, c?.title || project?.title || id, true)}<div class="chapter-main"><div class="chapter-heading"><h3>${E(c?.title || project?.title || d?.title || `第 ${i + 1} 话`)}</h3>${badge(label, count === pages && count > 0)}</div><p>${pages ? pages + " 页分镜 · " : ""}${c?.status === "canonical" ? "故事已定稿" : "故事尚未定稿"}</p>${c ? `<details><summary>故事概要与章节卡</summary><div class="document-copy">${markdown(c.content)}</div></details>` : ""}</div><div class="chapter-actions">${open}${textButton("删除", "delete-chapter", `data-series="${E(s.id)}" data-chapter="${E(id)}"`, true)}</div></article>`;
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
    const move = (label, action, i, disabled) => `<button class="button icon-button" data-action="${action}" ${attrs} data-index="${i}" aria-label="${label}" title="${label}" ${disabled ? "disabled" : ""}>${label === "上移" ? "↑" : label === "下移" ? "↓" : "✕"}</button>`;
    return `<section class="reference-scenes" aria-label="亮点剧情与系列脉络"><h3>亮点剧情与系列脉络</h3><p class="hint">每次查找 10 个适合短漫画的局部小片段。想掌握走向时，把片段加入脉络并排好顺序；设计剧情时可以按顺序使用，也可以自己挑。这些是待创作计划，保存本话到系列后才标为已采用。</p><div class="field"><label class="field-label" for="reference-keywords">原作检索关键词（选填）</label><input class="input" id="reference-keywords" data-reference-keywords ${attrs} maxlength="200" value="${E(search.keywords || "")}" placeholder="例如：分点心、藏零食、借东西"></div>${button(search.candidates?.length ? "重新查找 10 个片段" : "查找 10 个亮点片段", "search-reference-scenes", false, attrs)}${search.notice ? `<p class="hint" role="status">${E(search.notice)}</p>` : ""}<div class="reference-candidates">${(search.candidates || []).map(scene => `<article class="reference-candidate"><div class="section-header"><h4>${E(scene.title)}</h4><button class="button" data-action="toggle-reference-scene" ${attrs} data-scene="${E(scene.id)}" aria-pressed="${selected.some(s => s.id === scene.id)}">${selected.some(s => s.id === scene.id) ? "已加入脉络 · 移除" : "加入系列脉络"}</button></div><p>${brief(scene.reference,65)}</p><p class="hint">亮点：${brief(scene.mechanism,35)} · 漫画切入：${brief(scene.adaptationHint,45)}</p><details><summary>来源 · ${E(scene.sourceStatus)}</summary><p>${E(scene.reference)}</p><p>亮点：${E(scene.mechanism)}</p><p>改编方向：${E(scene.adaptationHint)}</p><p class="hint">原作片段：${E([scene.sourceScene?.setup, scene.sourceScene?.choice, scene.sourceScene?.result].filter(Boolean).join(' → '))}</p>${sources(scene)}</details></article>`).join("")}</div><h4>系列脉络 · ${selected.length} 个片段</h4>${selected.length ? `<ol class="reference-storyline">${selected.map((scene,i) => `<li><div class="section-header"><strong>${E(scene.title)}</strong><span class="hint">${config.skippedReferenceIds?.includes(scene.id) ? "已删除，跳过" : config.usedReferenceIds?.includes(scene.id) ? "已采用" : "待创作"}</span></div><p>${brief(scene.reference,65)}</p><details><summary>原作片段与来源</summary><p>${E(scene.reference)}</p><p>亮点：${E(scene.mechanism)}</p><p>改编方向：${E(scene.adaptationHint)}</p><p class="hint">${E(scene.sourceStatus)}</p>${sources(scene)}</details><div class="inline-actions scene-controls">${move("上移", "move-reference-up", i, i === 0)}${move("下移", "move-reference-down", i, i === selected.length-1)}${move("移除", "remove-reference-scene", i, false)}</div></li>`).join("")}</ol>` : '<p class="hint">还没有片段。可以直接让 AI 自动选段，或先查找再加入。</p>'}</section>`;
  }
  referenceForm(config, sid = null) {
    const value = config || { work: "", mode: "plot", brief: "" };
    const attrs = key => `data-series-reference="${key}" ${sid ? `data-reference-series="${E(sid)}"` : ""}`;
    return `<section class="series-reference-settings"><h3>系列长期参考</h3><p class="hint">设置一次，后续每话自动沿用；留空则自主设计。</p>${field("参考作品（选填）", "referenceWork", value.work, false, `${attrs("work")} maxlength="200" placeholder="例如：家有儿女"`)}${select("参考方式", "referenceMode", value.mode, [["plot", "每话选原作的具体片段再改编"], ["tone", "只参考基调与人物互动，剧情可原创"]], attrs("mode"))}${field("借鉴重点（选填）", "referenceBrief", value.brief, true, `${attrs("brief")} maxlength="4000" placeholder="例如：家庭日常、亲子代际误会、温暖收尾；改编为本系列的人物和场景。"`)}${this.referenceScenes(value, sid)}${sid ? `<div class="inline-actions">${button("保存参考与系列脉络", "save-series-reference", true, `data-series="${E(sid)}"`)}${button("重新载入", "reload-series-reference", false, `data-series="${E(sid)}"`)}</div>` : '<p class="hint">建立系列并保存本话时，会一起保存这项长期设定。</p>'}</section>`;
  }
  // The planned scenes of the series' reference work, picked for this plan.
  scenePicker(d, s) {
    const fresh = isNewSeries(d);
    const config = fresh ? d.seriesReference : s?.referenceSettings;
    const manage = fresh
      ? button("上一步设置参考与亮点剧情", "back-context")
      : button(config?.mode === "tone" ? "去「参考与脉络」调整" : "查找更多亮点剧情、调整顺序", "open-series-reference", false, `data-series="${E(d.seriesId)}"`);
    const head = `<div class="section-header"><h3>这一话参考哪段？</h3>${manage}</div>`;
    const open = `<section class="scene-picker" aria-label="参考片段">`;
    if (!config?.work)
      return `${open}<h3>参考片段</h3><p class="hint">这个系列还没有参考作品，AI 会按系列设定原创。想每话改编经典片段，可以先设置参考作品并查找亮点剧情。</p>${manage}</section>`;
    const work = E(config.work);
    // Tone mode adapts no scene, and an empty storyline leaves nothing to pick or order.
    if (config.mode === "tone")
      return `${open}${head}<p class="hint">这个系列只参考《${work}》的基调与人物互动，剧情可以原创。想每话改编具体片段，去「参考与脉络」把参考方式改成“每话选原作的具体片段再改编”。</p></section>`;
    const scenes = config.storyline || [];
    if (!scenes.length)
      return `${open}${head}<p class="hint">脉络里还没有片段，AI 会从《${work}》里自动选一段没用过的小片段来改编。</p></section>`;
    const count = d.chapterCount || 1;
    const chosen = d.referenceSceneIds || [];
    const used = (scene) => config.usedReferenceIds?.includes(scene.id);
    const skipped = (scene) => config.skippedReferenceIds?.includes(scene.id);
    const unused = scenes.filter((scene) => !used(scene) && !skipped(scene));
    const mode = d.referenceMode || (unused.length ? "queue" : "auto");
    const modes = [["queue", "按脉络顺序"], ["chosen", "我来选"], ["auto", "AI 自动选段"]];
    const body =
      mode === "auto"
        ? `<p class="hint">不按脉络顺序，从《${work}》里自动找一段没用过的小片段来改编。</p>`
        : mode === "queue"
          ? (unused.length
              ? `<ol class="scene-queue">${unused.slice(0, count).map((scene, i) => `<li><strong>${i + 1}. ${E(scene.title)}</strong><span>${E(scene.mechanism)}</span></li>`).join("")}</ol><p class="hint">按这个顺序用到第 ${count} 话。</p>`
              : `<p class="hint">脉络里的片段都已采用，这一话将由 AI 自动选段。</p>`)
          : `<div class="scene-options" role="group" aria-label="选择参考片段">${scenes.map((scene) => { const order = chosen.indexOf(scene.id); return `<button type="button" class="scene-option${order >= 0 ? " selected" : ""}" data-reference-scene="${E(scene.id)}" aria-pressed="${order >= 0}" ${used(scene) ? "disabled" : ""}>${order >= 0 ? `<span class="scene-order">${order + 1}</span>` : ""}<span class="scene-text"><strong>${E(scene.title)}</strong><span>${E(scene.reference)}</span></span>${used(scene) ? badge("已采用", true) : skipped(scene) ? badge("可重新使用", true) : ""}</button>`; }).join("")}</div><p class="hint">按点击顺序对应第 1—${count} 话，已选 ${chosen.length} / ${count}；不选则按脉络顺序。</p>`;
    return `${open}${head}<div class="segmented" role="group" aria-label="参考片段方式">${modes.map(([value, title]) => `<button data-reference-mode="${value}" class="${mode === value ? "active" : ""}" aria-pressed="${mode === value}">${title}</button>`).join("")}</div>${body}</section>`;
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
    const nextLabel = ongoing.length ? "继续剧情草稿 →" : rows ? "设计下一话 →" : "设计第一话 →";
    const reference = !archived && !isNewSeries({ seriesId: s.id });
    const body =
      tab === "characters"
        ? this.characterSettings(s)
        : tab === "reference" && reference
        ? this.referenceForm(a.referenceEdits?.[s.id] || s.referenceSettings, s.id)
        : tab === "context"
        ? `${this.seriesDocuments(s) || ""}`
        : tab === "history"
          ? `${drafts.map((d) => `<div class="version-row"><div><h3>${E(d.title || "下一话剧情草稿")}</h3><p>${E(dateLabel(d.updatedAt))} · ${Object.values(d.images || {}).reduce((n, e) => n + e.versions.length, 0)} 个图像版本${d.canonDecision ? " · 已定稿并保存到创作记忆" : ""}</p></div>${link(imageCount(d) ? "查看漫画与版本" : "继续编辑", (imageCount(d) ? "#work/" : "#draft/") + d.id)}</div>`).join("") || empty("还没有创作记录", "开始设计剧情后，修改记录与图像版本会保留在这里。")}<section class="danger-zone"><div><h3>永久删除这个系列</h3><p class="hint">删除全部章节、人物、设定、草稿和专属生成图片，无法恢复。</p></div>${button("永久删除系列", "delete-series", false, `data-series="${E(s.id)}"`)}</section>`
          : `${ongoing.length ? `<section class="ongoing-drafts"><h2>正在创作</h2><div class="activity-list">${ongoing.map((d) => this.recent(d)).join("")}</div></section>` : ""}<div class="section-header"><h2>章节 <span class="count">${new Set([...s.chapters.map((c) => c.id), ...s.projects.map((p) => p.chapter_id)]).size}</span></h2></div><div class="chapter-list">${rows || empty("还没有章节", "点右上角的按钮开始第一话。")}</div>`;
    return `${heading(s.name, s.summary, `<div class="inline-actions">${archived ? badge("历史系列 · 保留阅读", true) : `<a class="button primary" href="${E(nextPath)}">${nextLabel}</a>`}${!archived ? assistantButton("和助手讨论这个系列", "series", `data-assistant-series="${E(s.id)}"`) : ""}</div>`)}<div class="tabs" role="tablist" aria-label="系列内容">${[
      ["chapters", "章节与漫画"],
      ["characters", "人物设定"],
      ["reference", "参考与脉络"],
      ["context", "系列资料"],
      ["history", "创作记录"],
    ]
      .map(
        ([id, t]) =>
          `<button class="tab ${tab === id ? "active" : ""}" role="tab" id="series-tab-${id}" aria-controls="series-panel" tabindex="${tab === id ? 0 : -1}" aria-selected="${tab === id}" data-tab="${id}">${t}</button>`,
      )
      .join(
        "",
      )}</div><div class="detail-grid"><section class="panel" id="series-panel" role="tabpanel" tabindex="0" aria-labelledby="series-tab-${tab}">${body}</section></div>`;
  }
  // How the source scene became this episode, so a dropped reversal is visible.
  inspiration(d) {
    const source = d.chapters?.[d.chapterIndex]?.inspiration;
    if (!source || typeof source !== "object") return "";
    const map = Array.isArray(source.beatMap) ? source.beatMap : [];
    const turn = map.find((item) => /转/.test(item.ours || ""));
    const line = (label, value) => E(value) ? `<p><span class="hint">${label}</span><span>${E(value)}</span></p>` : "";
    const table = map.length
      ? `<table class="beat-map"><tbody>${map.map((item) => `<tr><td>${E(item.source)}</td><td aria-hidden="true">→</td><td>${E(item.ours)}${item.kept === "等价替换" ? ' <span class="hint">等价替换</span>' : ""}${item.note ? `<span class="hint">${E(item.note)}</span>` : ""}</td></tr>`).join("")}</tbody></table>`
      : "";
    // What was borrowed and where its reversal landed come first; the rest is on demand.
    return `<details class="story-inspiration" open><summary>参考片段 · ${E(source.title || source.reference)}<span class="hint">${E(source.sourceStatus)}</span></summary><div class="adaptation">${line("原作", source.reference)}${turn ? line("本话的「转」", turn.ours) : ""}${source.mechanism || source.adaptation || map.length ? `<details><summary>原作亮点、改编方式与逐拍对应</summary>${line("原作亮点", source.mechanism)}${line("改编方式", source.adaptation)}${table}</details>` : ""}</div></details>`;
  }
  engine(d) {
    const engine = d.chapters?.[d.chapterIndex]?.engine;
    const turn = engine?.turn;
    if (!engine || !turn) return "";
    const row = (label, value) =>
      E(value) ? `<div class="engine-row"><dt>${label}</dt><dd>${E(value)}</dd></div>` : "";
    const reversal = turn.by || turn.how || turn.result
      ? `<div class="engine-turn"><strong>反转</strong>${row("谁出手", turn.by)}${row("怎么倒转", turn.how)}${row("倒转后", turn.result)}</div>`
      : "";
    return `<details class="story-engine" open><summary>故事骨架 · 这一话怎么转</summary><dl class="engine-grid">${row("想要", engine.desire)}${row("阻力", engine.obstacle)}${row("锁死", engine.choice)}${row("升级", engine.escalation)}${reversal}${row("兑现", engine.payoff)}</dl></details>`;
  }
  qualityReview(d) {
    const entry = (d.qualityReview || []).find(
      (item) => item.chapter === (d.chapterIndex || 0) + 1,
    );
    if (!entry?.issues?.length) return "";
    const kinds = [...new Set(entry.issues.map((issue) => issue.kind))];
    if (entry.revised)
      // The listed problems belonged to the earlier draft, so they stay folded away.
      return `<div class="review-note" role="status"><strong>设计稿已自动补强</strong>，处理了${kinds.map((kind) => `<b>${E(kind)}</b>`).join("、")}。<details><summary>审稿当时指出的问题</summary><ul>${entry.issues.map((issue) => `<li><b>${E(issue.kind)}</b>：${E(issue.detail)}</li>`).join("")}</ul></details></div>`;
    return `<div class="review-note" role="status"><strong>审稿发现下面的问题，没能自动修好</strong><ul>${entry.issues.map((issue) => `<li><b>${E(issue.kind)}</b>：${E(issue.detail)}。建议：${E(issue.fix)}</li>`).join("")}</ul></div>`;
  }
  ruleNote(d) {
    const rules = d.ruleApplications || [];
    return rules.length
      ? `<details class="rule-note"><summary>创作依据 · 本次应用 ${rules.length} 项</summary><ul class="rule-items">${rules.map((r) => `<li><strong>${E(r.rule)} · ${E(r.status)}</strong>${E(r.reason)}</li>`).join("")}</ul></details>`
      : "";
  }
  principles() {
    const a = this.app,
      docs = [...a.workspace.principles, ...a.workspace.preferences];
    const doc = docs[a.rule] || docs[0];
    return `${heading("创作原则", "在设计剧情之前，先建立共同的创作语言。", link("回到创作", a.returnHash || "#series"))}<p class="hint">当前有效的创作原则与全局偏好。</p>${doc ? `<div class="rules-layout"><nav class="rule-menu" aria-label="原则与偏好">${docs.map((r, i) => `<button class="${a.rule === i ? "active" : ""}" data-rule="${i}" aria-current="${a.rule === i ? "page" : "false"}">${E(documentTitle(r))}</button>`).join("")}</nav><article class="rule-document"><div class="rule-edit-entry"><p class="hint">不必自己改规则措辞。告诉助手想解决什么问题，审阅修改后再应用。</p>${doc.documentKey ? assistantButton("和助手调整这份创作依据", "document", `data-assistant-document="${E(doc.documentKey)}"`) : ""}</div><div class="document-copy">${markdown(doc.content)}</div><aside class="rule-callout"><h3>读原则，不必逐条打勾</h3><p>设计剧情时会扫描全局原则、全局偏好、系列约束与偏好，具体应用在「调整剧情」页底逐条列出。</p></aside></article></div>` : empty("创作依据尚未载入", "检查本机工作空间或重新连接服务。", button("重新载入", "refresh"))}`;
  }
  pageEditor(d) {
    return `<div class="page-editor-list">${d.pages.map((p, pi) => `<details class="page-edit" id="edit-page-${pi}" ${pi === (this.app.editPage || 0) ? "open" : ""}><summary>${E(pageHeading(p, pi, d.title))}<span class="hint">${p.rows.reduce((n, r) => n + r.panels.length, 0)} 格 · 点击修改</span></summary><div class="inline-actions">${assistantButton("让助手调整这一页", "page", `data-assistant-page="${pi}"`)}</div>${p.rows.map((r, ri) => r.panels.map((panel, ni) => `<div class="field"><label class="field-label" for="panel-${pi}-${ri}-${ni}">第 ${ri + 1} 行，第 ${ni + 1} 格 · 画面与对白</label><textarea id="panel-${pi}-${ri}-${ni}" data-panel="${pi},${ri},${ni}">${E(panel.text)}</textarea></div>`).join("")).join("")}</details>`).join("")}</div>`;
  }
  editor(d) {
    const a = this.app,
      single = d.mode === "single",
      planned = isPlanned(d),
      fresh = isNewSeries(d),
      s = a.series(d.seriesId);
    const names = planned
      ? ["系列设定", "设计剧情", "调整剧情", "确认分镜", "生成漫画"]
      : single
        ? ["描述想法", "确认分镜", "生成漫画"]
        : ["了解系列", "调整分镜", "漫画成品"];
    // An established series opens on its story; only a new series starts with setup.
    const steps = planned
      ? fresh
        ? [0, 1, 2, 3, 4]
        : [1, 2, 3, 4]
      : single
        ? [0, 1, 2]
        : [1, 2];
    const blocked = (i) =>
      i !== steps[0] &&
      (planned
        ? (i >= 2 && !d.chapters.length) || (i >= 3 && !d.pages.length)
        : !d.pages.length);
    const stepper = `<nav class="stepper" aria-label="创作阶段">${steps
      .map(
        (i) =>
          `<button data-step="${i}" class="${d.step === i ? "active" : ""}" aria-current="${d.step === i ? "step" : "false"}" ${blocked(i) ? "disabled" : ""}>${names[i]}</button>`,
      )
      .join("")}</nav>`;
    const back = link(
      single ? "返回工作台" : "返回系列",
      single ? "#home" : "#series/" + d.seriesId,
    );
    const title =
      d.title ||
      (single ? "创作一篇漫画" : d.seriesName || s?.name || "建立新系列");
    const subtitle = d.source
      ? "已有分镜与漫画版本可以继续编辑，修改不会覆盖旧版图像。"
      : single
        ? "描述想法 → 检查分镜 → 生成漫画"
        : "先讲顺剧情，再检查每页分镜，最后生成漫画。";
    const header = `<div class="story-header"><div><h1>${E(title)}</h1><p class="subtitle">${subtitle}</p></div><div class="inline-actions">${back}${moreMenu(this.deletionButton(d))}</div></div>${stepper}`;
    const finalStep = outputStep(d);
    if (d.step === finalStep) return header + this.output(d);
    if (planned && d.step === 3) return header + this.output(d, false, true);
    const chapter = d.chapters[d.chapterIndex] || {};
    const cover = `<details><summary>封面描述</summary>${field("封面短标题", "coverTitle", d.coverTitle || d.title)}${field("封面视觉描述", "coverBrief", d.coverBrief || "", true)}</details>`;
    let content;
    if (!single && d.step === 0) {
      content = `<h2>建立系列的起点</h2><p class="subtitle">写清人物和方向，后面每一话都会带上。</p>${field("系列名称", "seriesName", d.seriesName, false, 'placeholder="为这个系列起个名字"')}${field("系列方向与人物设想", "seriesBrief", d.seriesBrief || "", true, 'placeholder="谁是主角？他想要什么？这个系列会反复遇到怎样的冲突？"')}${this.referenceForm(d.seriesReference)}<div class="editor-actions"><span class="save-state">也可以先往下走，之后再补充</span>${button("开始设计剧情 →", "next", true)}</div>`;
    } else if ((single && d.step === 0) || (planned && d.step === 1)) {
      content = `<h2>${single ? "你想画一个怎样的故事？" : "下一话，让 AI 来设计"}</h2>${single ? '<p class="subtitle">一句灵感或一段故事都可以。</p>' : this.scenePicker(d, s)}${field(single ? "漫画想法" : "剧情方向（选填）", "idea", d.idea, true, `placeholder="${single ? "例如：一个总迟到的人，遇到一班只等他的末班车……" : "留空，让 AI 自主设计；也可以写：让主角因一个歪点子惹出新麻烦。"}"`)}${single ? "" : field("补充要求（选填）", "inspirationReference", d.inspirationReference || "", true, 'rows="3" maxlength="4000" placeholder="对这次改编的补充要求；也可以直接写想参考的作品或片段，会优先于上面的选择。"')}<div class="inline-options generation-params">${select(d.mode === "single" ? "漫画页数" : "规划话数", d.mode === "single" ? "pageCount" : "chapterCount", d.mode === "single" ? d.pageCount : d.chapterCount, [1,2,3,4,5].map(n=>[n,n+(single ? " 页" : " 话")]))}${select("画风", "style", d.style, single ? STYLES : [["reference","跟随系列视觉"],...STYLES])}</div><details class="generation-settings"><summary>更多设置 · 语言、每页行数、页数与参考图</summary><div class="inline-options">${select("漫画语言", "language", d.language, [["zh", "中文"],["en", "English"],["ja", "日本語"]])}${select("每页行数", "rows", d.rows, [1, 2, 3, 4, 5].map((n) => [n, n + " 行"]))}${single ? "" : select("每话漫画页数", "pageCount", d.pageCount, [1, 2, 3, 4, 5, 8, 10].map((n) => [n, n + " 页"]))}</div><div class="field"><label class="field-label" for="reference-upload">参考图 · 可上传、拖放或粘贴</label><input type="file" id="reference-upload" accept="image/png,image/jpeg,image/webp"><div id="reference-drop" class="reference-drop" tabindex="0">${d.reference ? `<img src="${E(ConsoleAPI.imageURL(d.reference))}" alt="本次创作参考图">${button("移除参考图", "remove-reference")}` : "将图片拖到这里，或粘贴剪贴板图片"}</div></div></details><div class="editor-actions"><span class="save-state">${single ? "草稿自动保存" : "草稿自动保存 · 设计生成的剧情可以先改再出图"}</span><span class="inline-actions">${fresh ? button("← 上一步", "back-context") : ""}${button(single ? "生成文字分镜 →" : "让 AI 设计剧情 →", "plan", true)}</span></div>`;
    } else if (planned && d.step === 2) {
      const labels = beatLabels((chapter.beats || []).length);
      content = `<div class="section-header"><h2>先把剧情讲顺</h2><span class="save-state">修改自动保存</span></div>${d.chapters.length > 1 ? `<div class="tabs" aria-label="选择要调整的章节">${d.chapters.map((c, i) => `<button class="tab ${d.chapterIndex === i ? "active" : ""}" data-chapter-index="${i}" aria-pressed="${d.chapterIndex === i}">第 ${i + 1} 话 · ${E(c.title)}</button>`).join("")}</div>` : ""}${this.inspiration(d)}${this.qualityReview(d)}${field("本话标题", "title", d.title)}${field("核心冲突与前后承接", "summary", chapter.summary || "", true)}${this.engine(d)}${(chapter.beats || []).map((b, i) => { const [name, hint] = labels[i] || [`第 ${i + 1} 拍`, ""]; return `<div class="field beat-field${name === "转" ? " turn" : ""}"><label class="field-label" for="beat-${i}"><strong>${name}</strong><span class="hint">${hint}</span></label><textarea id="beat-${i}" data-beat="${i}">${E(String(b ?? "").replace(new RegExp("^" + name + "\\s*[：:]\\s*"), ""))}</textarea></div>`; }).join("")}${this.revisionEditor(d)}${cover}${this.ruleNote(d)}<div class="editor-actions"><span class="save-state">确认后生成本话分镜，不会立即出图</span>${button(d.pages.length && !d.storyDirty ? "检查本话分镜 →" : "确认剧情，生成本话分镜 →", "storyboard", true)}</div>`;
    } else {
      content = `<div class="section-header"><h2>检查每一页的画面与对白</h2><span class="save-state">${d.pages.length} 页分镜</span></div>${field("作品标题", "title", d.title)}${this.pageEditor(d)}${this.revisionEditor(d)}${cover}<div class="editor-actions"><span class="save-state">修改自动保存 · 旧图像版本保留</span><span class="inline-actions">${d.pages.length > 1 ? button(imageCount(d) ? "查看已有漫画" : "先试画第 1 页", imageCount(d) ? "view-output" : "redraw", false, 'data-page="0"') : ""}${button(imageCount(d) === d.pages.length ? "查看漫画与更新 →" : "确认分镜，生成漫画 →", imageCount(d) === d.pages.length ? "view-output" : "generate", true)}</span></div>`;
    }
    return `${header}<section class="editor-paper reading">${content}</section>`;
  }
  // One place to ask for a change: a sentence replans, the assistant discusses.
  revisionEditor(d) {
    const story = isPlanned(d) && d.step === 2;
    return `<section class="adjust-card"><div class="section-header"><h3>${story ? "哪里不满意？" : "画面、对白不合适？"}</h3>${assistantButton("和助手来回讨论", story ? "story" : "storyboard")}</div>${field("调整方向", "revisionText", d.revisionText || "", true, 'rows="3" placeholder="比如：反转不够意外，让敖丙主动出手。"')}${button("按此方向调整", "revise")}</section>`;
  }
  output(d, historical = false, reviewing = false) {
    const a = this.app,
      sketch = reviewing || a.output === "sketch";
    const pending = d.pages.filter((_, i) => !isFresh(d, i)).length;
    const chapterTabs =
      d.chapters?.length > 1
        ? `<div class="tabs" aria-label="连续规划章节">${d.chapters.map((ch, i) => `<button class="tab ${i === d.chapterIndex ? "active" : ""}" data-chapter-index="${i}">第 ${i + 1} 话 · ${E(ch.title)}</button>`).join("")}</div>`
        : "";
    const state = reviewing
      ? "逐页确认画面与对白，修改自动保存。"
      : pending
        ? "已完成的页面会保留，只生成待更新的页面。"
        : "漫画已生成，可下载或继续编辑。";
    const tools = reviewing
      ? assistantButton("和助手讨论分镜", "storyboard")
      : assistantButton("讨论与调整", d.chapters?.length ? "story" : "storyboard") +
        button("修改分镜", "edit-pages");
    const primary = reviewing
      ? button("确认分镜，生成漫画 →", "generate", true)
      : pending
        ? button("生成待更新的 " + pending + " 页", "generate", true)
        : link("查看作品库", "#library");
    return `<section class="editor-paper output-paper"><div class="section-header"><div><h2>${reviewing ? "确认逐页分镜" : "漫画预览"}</h2><p class="hint">${d.pages.length} 页 · ${pending ? pending + " 页待生成或更新" : "漫画已就绪"}${d.canonDecision ? " · 已定稿" : ""}</p></div>${reviewing ? "" : `<div class="segmented" role="group" aria-label="预览模式">${["comic", "sketch"].map((v) => `<button class="${a.output === v ? "active" : ""}" data-output="${v}" aria-pressed="${a.output === v}">${v === "comic" ? "漫画" : "分镜"}</button>`).join("")}</div>`}</div>${chapterTabs}<div class="output-toolbar"><p>${state}</p><div class="inline-actions">${tools}</div></div><div class="output-grid ${sketch ? "storyboard-review" : ""}">${d.pages
      .map((p, i) => {
        const entry = d.images[i],
          versions = entry?.versions || [],
          image = currentImage(entry);
        return `<article class="comic-sheet"><h3>${E(pageHeading(p, i, d.title))}</h3>${sketch ? `<div class="page-sketch">${p.rows.map((r, ri) => `<div class="sketch-row">${r.panels.map((panel, ni) => `<div class="sketch-panel"><strong>第 ${ri + 1} 行 · 第 ${ni + 1} 格</strong><span>${E(panel.text)}</span></div>`).join("")}</div>`).join("")}</div>${reviewing ? `<details><summary>编辑本页画面与对白</summary><div class="inline-actions">${assistantButton("让助手改这一页", "page", `data-assistant-page="${i}"`)}</div>${p.rows.map((r, ri) => r.panels.map((panel, ni) => `<div class="field"><label class="field-label" for="review-${i}-${ri}-${ni}">第 ${ri + 1} 行，第 ${ni + 1} 格</label><textarea id="review-${i}-${ri}-${ni}" data-panel="${i},${ri},${ni}">${E(panel.text)}</textarea></div>`).join("")).join("")}</details>` : ""}` : image?.imageUrl ? `<button class="image-preview" data-preview="${i}" aria-label="放大第 ${i + 1} 页"><img src="${E(ConsoleAPI.imageURL(image.imageUrl))}" alt="第 ${i + 1} 页漫画" loading="lazy"></button>${!isFresh(d, i) ? '<p class="hint">旧版漫画 · 当前分镜有变更</p>' : ""}` : empty("分镜已就绪", "生成后在这里查看漫画。")}<div class="page-actions">${reviewing ? "" : assistantButton("让助手改这一页", "page", `data-assistant-page="${i}"`) + button(sketch ? "修改这一页" : versions.length ? "重新生成此页" : "生成这一页", sketch ? "edit-page" : "redraw", false, `data-page="${i}"`)}${versions.length ? `<label class="visually-hidden" for="version-${i}">第 ${i + 1} 页图像版本</label><select id="version-${i}" data-version-page="${i}">${versions.map((v, vi) => `<option value="${vi}" ${vi === (entry.current || 0) ? "selected" : ""}>版本 ${vi + 1} · ${E(dateLabel(v.createdAt || v.timestamp))}</option>`).join("")}</select>` : ""}${image?.imageUrl ? button("下载此页", "download-page", false, `data-page="${i}"`) : ""}</div></article>`;
      })
      .join(
        "",
      )}</div>${reviewing ? "" : this.memory(d)}<details id="publishing-tools"><summary>封面、发布文案与导出</summary><div class="version-row"><div><h3>作品导出</h3><p>下载当前漫画图片，或导出含剧情与分镜的完整草稿。</p></div><div class="inline-actions">${button("导出漫画", "export-work")}${button("导出草稿", "export-draft")}</div></div><div class="version-row"><div><h3>封面</h3><p>${E(d.coverBrief || "使用独立封面描述与当前页面参考生成封面。")}</p></div><div class="inline-actions">${assistantButton("调整封面描述", "cover")}${button("生成封面", "cover")}</div></div>${d.coverImages?.length ? `<div class="cover-versions">${d.coverImages.map((v, i) => `<div class="cover-version"><a href="${E(ConsoleAPI.imageURL(v.imageUrl))}" target="_blank" rel="noopener"><img src="${E(ConsoleAPI.imageURL(v.imageUrl))}" alt="封面版本 ${i + 1}"></a>${button("下载封面", "download-cover", false, `data-cover="${i}" aria-label="下载封面版本 ${i + 1}"`)}</div>`).join("")}</div>` : ""}<div class="version-row"><div><h3>社交文案</h3><p>从当前故事生成可复制的发布文案。</p></div><div class="inline-actions">${button("小红书", "social", false, 'data-platform="xiaohongshu"')}${button("Twitter / X", "social", false, 'data-platform="twitter"')}</div></div>${d.social ? this.socialCopy(d.social) : ""}</details><div class="editor-actions">${button(reviewing ? "← 返回调整剧情" : "← 修改分镜", reviewing ? "edit-again" : "edit-pages")}<span class="inline-actions">${!reviewing && imageCount(d) ? button("下载漫画 ZIP", "export-work") : ""}${primary}</span></div></section>`;
  }
  socialCopy(social) {
    const part = (label, key, value) => `<section class="social-part"><div class="social-part-heading"><h4>${label}</h4>${value ? button("复制" + label, "copy-social", false, `data-social-part="${key}"`) : ""}</div><p>${E(value || "尚未生成，重新生成文案后查看。")}</p></section>`;
    return `<div class="social-copy"><h3>${social.platform === "twitter" ? "Twitter / X" : "小红书"}发布文案</h3>${social.schemaVersion !== 2 ? '<p class="hint">这是旧版文案，可能未读取完整剧情。请点击上方平台按钮重新生成。</p>' : ""}${part("标题", "title", social.title)}${part("正文", "content", social.content)}${part("话题标签", "tags", (social.tags || []).map(t => "#" + t.replace(/^#+/, "")).join(" "))}${part("首条互动评论建议", "comment", social.comment)}<p class="hint">互动评论供作者自行发布，不包含在帖子正文中。</p>${button("复制完整帖子（标题、正文、标签）", "copy-social")}</div>`;
  }
  memory(d) {
    if (d.mode !== "series") return "";
    const review = d.retrospectives?.[String(d.chapterIndex || 0)];
    const learning = d.learningReviews?.[String(d.chapterIndex || 0)];
    return `<section class="series-memory" aria-label="系列创作记忆"><div class="version-row"><div><h3>${d.canonDecision ? "本话已保存到系列" : "保存本话，供后续续写使用"}</h3><p>${d.canonDecision ? "下次续写会参考本话剧情、人物变化和复盘。修改剧情后可再次保存。" : "把这一话存为系列正式剧情，让下一话记住发生过的事和人物变化；用到的参考片段会标为已采用。AI 会生成复盘，并分析你对剧情的修改。草稿和漫画版本会保留。"}</p></div>${button(d.canonDecision ? "已保存到系列" : "保存本话到系列", "canon", !d.canonDecision, d.canonDecision ? "disabled" : "")}</div><details><summary>哪些修改希望以后也沿用？</summary>${field("后续创作要求（选填）", "futureGuidance", d.futureGuidance || "", true, 'placeholder="例如：以后每话都让主角主动做选择，并展示选择带来的后果。"')}<p class="hint">只改本话剧情即可；填写这里，表示希望 AI 判断并更新本系列后续使用的创作要求。</p></details>${learning ? `<details><summary>本次修改对创作原则的影响</summary><p>${E(learning.reason)}</p><p>${E(learning.effect)}</p>${learning.recommendation ? `<p>${E(learning.recommendation)}</p>` : ""}</details>` : ""}<details id="retrospective-section" ${review?.content ? "open" : ""}><summary>本话复盘 · 查看与调整</summary><p class="hint">保存本话时会生成或更新复盘。你也可以手工编辑，或填写方向让 AI 重新分析；手工编辑的正文会保留。</p>${field("复盘调整方向（选填）", "retrospectiveDirection", d.retrospectiveDirection || "", true, 'placeholder="例如：重点检查哪吒的选择是否有代价，缩短节奏建议"')}<div class="inline-actions">${button(review?.content ? "按当前分镜重新生成复盘" : "生成本话复盘", "retrospective")}</div>${`<div class="field"><label class="field-label" for="chapter-retrospective">复盘正文 · 可直接编辑</label><textarea class="textarea" id="chapter-retrospective" data-retrospective rows="8" placeholder="可直接写下本话的得失与后续改进，也可以先让 AI 生成。">${E(review?.content || "")}</textarea></div><div class="inline-actions">${button("保存复盘到系列", "save-retrospective", false, d.canonDecision ? "" : "disabled")}</div><p class="hint">${d.canonDecision ? "这里仅保存复盘正文。调整剧情或后续创作要求后，请用上方“保存本话到系列”一并更新。" : "保存本话时会一并收录复盘。也可以先生成或手工填写，草稿会自动保留。"}</p>${
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
