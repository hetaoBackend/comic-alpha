const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function runtime(initial = {}) {
  const values = new Map(Object.entries(initial)),
    events = [];
  const window = {
    addEventListener() {},
    dispatchEvent(e) {
      events.push(e);
    },
  };
  const ctx = vm.createContext({
    window,
    URL,
    Blob,
    TextEncoder,
    structuredClone,
    crypto: require("node:crypto").webcrypto,
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    localStorage: {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    },
    setTimeout,
    clearTimeout,
    API_BASE_URL: "http://localhost:5003/api",
    console,
  });
  for (const file of [
    "storyboardImageReconciler.js",
    "consoleStore.js",
    "consoleViews.js",
    "app.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../js", file), "utf8"),
      ctx,
    );
  return {
    ctx,
    values,
    events,
    Store: window.ConsoleStore,
    API: window.ConsoleAPI,
    controller: vm.runInContext("UIController.prototype", ctx),
  };
}
const page = {
  title: "第一页",
  rows: [{ height: "200px", panels: [{ text: "主角作出选择" }] }],
};

test("existing series can plan with an empty idea and preserve classic inspiration for review", async () => {
  const r = runtime(), c = Object.create(r.controller), store = new r.Store();
  const d = store.create("series", "test", "draft-auto");
  d.inspirationReference = "武林外传";
  c.store = { flush: async () => {} };
  c.render = () => {};
  c.changed = () => {};
  c.textConfig = () => ({});
  let request;
  const inspiration = { work: "武林外传", reference: "临时头衔", mechanism: "权责错位", adaptation: "值日队长收拾残局", sourceStatus: "机制启发" };
  r.API.request = async (path, method, body) => {
    request = { path, body };
    return { plan: { chapters: [{ title: "下一话", beats: ["起", "承", "果"], inspiration }], ruleApplications: [] } };
  };
  await c.plan(d);
  assert.equal(request.path, "/console/plan");
  assert.equal(request.body.idea, "");
  assert.equal(request.body.inspiration_reference, "武林外传");
  assert.equal(d.step, 2);
  assert.equal(d.chapters[0].inspiration.work, "武林外传");
  assert.equal(d.chapters[0].aiOriginal.inspiration.mechanism, "权责错位");
  const html = vm.runInContext("ConsoleViews.prototype", r.ctx).inspiration(d);
  assert.match(html, /值日队长收拾残局/);
  assert.match(html, /机制启发/);
  const single = store.create("single", null, "draft-single-empty");
  await assert.rejects(c.plan(single), /写下一句想法/);
});

test("legacy sessions retain generated images with the matching visual fingerprint", () => {
  const r = runtime({
    comic_sessions: JSON.stringify({
      old: {
        id: "old",
        name: "原作品",
        prompt: "灵感",
        comicData: { pages: [page] },
        generatedImages: { 0: { imageUrl: "/static/images/old.png" } },
        updatedAt: "2026-01-01T00:00:00Z",
      },
    }),
  });
  const store = new r.Store();
  assert.equal(store.drafts.old.images[0].versions.length, 1);
  assert.equal(vm.runInContext("isFresh", r.ctx)(store.drafts.old, 0), true);
});

test("editing and switching chapters keeps each chapter story and image history", () => {
  const r = runtime(),
    c = Object.create(r.controller);
  const d = {
    chapterIndex: 0,
    title: "第一话",
    pages: [structuredClone(page)],
    images: {
      0: { versions: [{ imageUrl: "/static/images/a.png" }], current: 0 },
    },
    storyDirty: false,
    coverTitle: "封面一",
    coverBrief: "第一话主视觉",
    chapters: [
      { title: "第一话", beats: ["开场", "选择", "代价"] },
      { title: "第二话", beats: ["承接", "选择", "代价"] },
    ],
  };
  c.active = d;
  c.store = { save() {} };
  c.snapshotChapter(d);
  d.chapterIndex = 1;
  c.restoreChapter(d);
  assert.equal(d.title, "第二话");
  assert.equal(d.pages.length, 0);
  d.pages = [structuredClone(page)];
  d.title = "第二话修订";
  c.snapshotChapter(d);
  d.chapterIndex = 0;
  c.restoreChapter(d);
  assert.equal(d.title, "第一话");
  assert.equal(d.images[0].versions[0].imageUrl, "/static/images/a.png");
  assert.equal(d.coverBrief, "第一话主视觉");
  d.chapterIndex = 1;
  c.restoreChapter(d);
  assert.equal(d.title, "第二话修订");
});

test("dirty story invalidates current images without deleting any old version", () => {
  const r = runtime(),
    fingerprint = vm.runInContext(
      "(page)=>StoryboardImageReconciler.pageFingerprint(page)",
      r.ctx,
    )(page);
  const draft = {
    pages: [page],
    images: {
      0: {
        versions: [{ imageUrl: "/static/images/a.png", fingerprint }],
        current: 0,
      },
    },
  };
  const fresh = vm.runInContext("isFresh", r.ctx);
  assert.equal(fresh(draft, 0), true);
  draft.storyDirty = true;
  assert.equal(fresh(draft, 0), false);
  assert.equal(draft.images[0].versions.length, 1);
});

test("queued saves use the last server revision and retain changes during the request", async () => {
  const r = runtime(),
    store = new r.Store(),
    d = store.create("single", null, "draft-test"),
    requests = [];
  let release;
  r.API.request = async (_path, _method, body) => {
    requests.push(body);
    if (requests.length === 1)
      await new Promise((resolve) => {
        release = resolve;
      });
    return {
      draft: {
        ...body.draft,
        revision: String(requests.length),
        updatedAt: body.draft.updatedAt,
        canonDecision: null,
      },
    };
  };
  const first = store.flush(d.id);
  await new Promise((resolve) => setImmediate(resolve));
  d.title = "请求期间的人工作品标题";
  d.updatedAt = "2026-10-11T08:00:00Z";
  const second = store.flush(d.id);
  release();
  await Promise.all([first, second]);
  assert.equal(requests[1].revision, "1");
  assert.equal(requests[1].draft.title, "请求期间的人工作品标题");
  assert.equal(d.revision, "2");
});

test("ZIP export has a valid local file and central directory", async () => {
  const r = runtime(),
    zip = r.controller.zip([
      { name: "page-1.png", data: new Uint8Array([1, 2, 3]) },
    ]),
    bytes = new Uint8Array(await zip.arrayBuffer()),
    v = new DataView(bytes.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(v.getUint16(bytes.length - 14, true), 1);
});

test("image URLs allow only local output or supported inline images", () => {
  const { API } = runtime();
  assert.equal(API.imageURL("https://outside.example/image.png"), "");
  assert.equal(API.imageURL("/ComicBrain/wiki/secret.png"), "");
  assert.equal(API.imageURL("javascript:alert(1)"), "");
  assert.equal(
    API.imageURL("/static/images/page.png"),
    "http://localhost:5003/static/images/page.png",
  );
});

test("old saved stages migrate once without sending series output back to story editing", () => {
  const r = runtime({
    comicperfect_console_v1: JSON.stringify({
      source: {
        id: "source",
        mode: "series",
        source: { seriesId: "s", chapterId: "c" },
        step: 3,
      },
      planned: { id: "planned", mode: "series", step: 3 },
      single: { id: "single", mode: "single", step: 1 },
    }),
  });
  const store = new r.Store();
  assert.equal(store.drafts.source.step, 2);
  assert.equal(store.drafts.planned.step, 4);
  assert.equal(store.drafts.single.step, 1);
  store.normalize(store.drafts.source);
  assert.equal(store.drafts.source.step, 2);
});

test("chapter list merges production, local edits and chapter cards into one row", () => {
  const r = runtime(),
    c = Object.create(r.controller);
  c.store = {
    all: () => [
      {
        id: "d",
        seriesId: "s",
        title: "第一话",
        pages: [page],
        images: {},
        source: { seriesId: "s", chapterId: "ch1" },
      },
    ],
  };
  c.workspace = { series: [] };
  c.views = vm.runInContext("ConsoleViews", r.ctx);
  const view = new c.views(c);
  const html = view.chapterRows({
    id: "s",
    chapters: [
      { id: "ch1", title: "第一话", status: "draft", content: "# 第一话" },
    ],
    projects: [{ chapter_id: "ch1", page_count: 1, title: "第一话" }],
  });
  assert.equal((html.match(/data-chapter-id=/g) || []).length, 1);
  assert.match(html, /检查分镜并出图/);
  assert.doesNotMatch(html, /activity-row/);
});

test("duplicate imported sessions remain stored but appear once in work listings", () => {
  const r = runtime(),
    c = Object.create(r.controller);
  const source = { seriesId: "s", chapterId: "c" };
  c.store = {
    all: () => [
      { id: "new", pages: [page], source },
      { id: "old", pages: [page], source },
      { id: "blank", idea: "", pages: [] },
    ],
  };
  assert.equal(c.visibleDrafts().length, 1);
  assert.equal(c.works()[0].id, "new");
  assert.equal(c.store.all().length, 3);
});

test("series story generation stops at storyboard review before any image request", async () => {
  const r = runtime(),
    c = Object.create(r.controller);
  const d = {
    mode: "series",
    storyDirty: true,
    pages: [],
    images: {},
    chapters: [{}],
    chapterIndex: 0,
  };
  r.API.imageConfig = () => ({});
  c.storyboard = async () => {
    d.pages = [page];
    d.storyDirty = false;
  };
  c.changed = () => {};
  c.notify = () => {};
  await c.generate(d);
  assert.equal(d.step, 3);
  assert.equal(c.output, "sketch");
  assert.equal(Object.keys(d.images).length, 0);
});

test("editing imported title does not demand a missing series plot", () => {
  const r = runtime(),
    c = Object.create(r.controller);
  const d = {
    mode: "series",
    source: { seriesId: "s", chapterId: "c" },
    chapters: [],
    pages: [page],
    chapterIndex: 0,
  };
  c.active = d;
  c.changed = (_d, story) => {
    d.storyDirty = story;
  };
  c.saveReview = () => {};
  c.input({
    target: {
      id: "field-title",
      dataset: { field: "title" },
      value: "新标题",
      hasAttribute: () => false,
    },
  });
  assert.equal(d.title, "新标题");
  assert.equal(d.storyDirty, false);
});

test("series multi-chapter flow separates review, preserves other chapters and updates changed pages only", async () => {
  const r = runtime(),
    c = Object.create(r.controller),
    store = new r.Store();
  const d = store.create("series", "test", "draft-flow");
  Object.assign(d, { idea: "一个选择带来后果", chapterCount: 3, pageCount: 2 });
  c.active = d;
  c.store = { all: () => [d], save: () => {}, flush: async () => {} };
  c.render = () => {};
  c.notify = () => {};
  c.textConfig = () => ({});
  c.sketchData = async () => "sketch";
  c.changed = (draft, story) => {
    if (story) draft.storyDirty = true;
    c.snapshotChapter(draft);
  };
  const requests = [];
  let imageCalls = 0;
  r.API.imageConfig = () => ({ imageProvider: "codex" });
  r.ctx.ComicAPI = {
    generateComicImage: async () => ({
      image_url: `/static/images/test-${++imageCalls}.png`,
    }),
  };
  r.API.request = async (path, _method, body) => {
    requests.push({ path, body });
    if (path === "/console/plan")
      return {
        plan: {
          chapters: Array.from({ length: body.chapter_count }, (_, i) => ({
            title: `第${i + 1}话`,
            summary: "冲突",
            beats: ["起", "承", "果"],
          })),
          ruleApplications: [],
        },
      };
    if (path === "/console/storyboard")
      return {
        pages: [
          structuredClone(page),
          { ...structuredClone(page), title: "第二页" },
        ],
      };
  };
  await c.plan(d);
  assert.equal(d.step, 2);
  assert.equal(d.chapters.length, 3);
  await c.generate(d);
  assert.equal(d.step, 3);
  assert.equal(imageCalls, 0);
  await c.generate(d);
  assert.equal(d.step, 4);
  assert.equal(imageCalls, 2);
  d.pages[1].rows[0].panels[0].text = "只修改第二页";
  await c.generate(d);
  assert.equal(imageCalls, 3);
  assert.equal(d.images[0].versions.length, 1);
  assert.equal(d.images[1].versions.length, 2);
  c.switchChapter(1);
  assert.equal(d.step, 2);
  assert.equal(d.pages.length, 0);
  d.revisionText = "只调整第二话";
  await c.plan(d, true);
  assert.equal(requests.at(-1).body.chapter_count, 1);
  assert.equal(d.chapterIndex, 1);
  assert.equal(d.chapters[0].images[0].versions.length, 1);
  assert.equal(d.chapters.length, 3);
});

test("source session consolidation keeps all image versions and restores server renders", () => {
  const r = runtime(),
    c = Object.create(r.controller),
    store = new r.Store();
  const fingerprint = vm.runInContext(
    "(page)=>StoryboardImageReconciler.pageFingerprint(page)",
    r.ctx,
  )(page);
  const source = {
    seriesId: "s",
    chapterId: "c",
    metadata: { pages: [{ ...page, id: "page-001" }] },
  };
  const latest = store.create("series", "s", "new");
  Object.assign(latest, {
    source,
    pages: [{ ...page, id: "page-001" }],
    images: {},
  });
  const old = store.create("series", "s", "old");
  Object.assign(old, {
    source,
    pages: [{ ...page, id: "page-001" }],
    images: {
      0: {
        current: 0,
        versions: [{ imageUrl: "/static/images/old.png", fingerprint }],
      },
    },
  });
  latest.updatedAt = "2026-10-12";
  old.updatedAt = "2026-10-11";
  c.store = store;
  assert.equal(c.visibleDrafts().length, 1);
  assert.equal(latest.images[0].versions.length, 1);
  c.hydrateProject({
    project: {
      title: "章节",
      pages: [{ ...page, id: "page-001" }],
      source: { series_id: "s", chapter_id: "c", exported_at: "2026-10-10" },
    },
    renders: {
      pages: [
        {
          page_index: 0,
          versions: [
            {
              image_url: "/static/images/server.png",
              page_script_fingerprint: fingerprint,
            },
          ],
        },
      ],
    },
  });
  c.visibleDrafts();
  assert.deepEqual(
    Array.from(latest.images[0].versions, (v) => v.imageUrl),
    ["/static/images/old.png", "/static/images/server.png"],
  );
  c.visibleDrafts();
  assert.equal(latest.images[0].versions.length, 2);
  assert.equal(store.all().length, 3);
});

test("multi-chapter continuation remains unfinished after the selected chapter is rendered", () => {
  const r = runtime();
  const fingerprint = vm.runInContext(
    "(page)=>StoryboardImageReconciler.pageFingerprint(page)",
    r.ctx,
  )(page);
  const d = {
    mode: "series",
    pages: [page],
    images: {
      0: { versions: [{ imageUrl: "/static/images/a.png", fingerprint }] },
    },
    chapterIndex: 0,
    chapters: [{ pages: [page] }, { pages: [], images: {} }],
  };
  assert.equal(vm.runInContext("unfinishedDraft", r.ctx)(d), true);
});

test("AI revision of imported pages preserves original exporter identity", async () => {
  const r = runtime(),
    c = Object.create(r.controller);
  const d = {
    id: "source",
    mode: "series",
    pages: [page],
    images: {},
    chapters: [],
    source: { metadata: { pages: [{ ...page, id: "page-001" }] } },
    revisionText: "更清楚",
  };
  c.store = { flush: async () => {} };
  c.render = () => {};
  c.textConfig = () => ({});
  c.changed = () => {};
  c.persistReview = async () => {};
  r.API.request = async () => ({ pages: [structuredClone(page)] });
  await c.reviseStoryboard(d);
  assert.equal(d.pages[0].id, "page-001");
  assert.equal(d.step, 1);
});

test("revised source redraw submits the original page ID and persists review first", async () => {
  const r = runtime(),
    c = Object.create(r.controller),
    events = [];
  const d = {
    id: "source",
    mode: "series",
    style: "reference",
    pages: [{ ...structuredClone(page), id: "page-001" }],
    images: {},
    chapters: [],
    source: {
      seriesId: "s",
      chapterId: "c",
      metadata: { pages: [{ ...page, id: "page-001" }] },
    },
  };
  c.store = { flush: async () => events.push("draft") };
  c.render = () => {};
  c.changed = () => {};
  c.notify = () => {};
  c.sketchData = async () => "sketch";
  c.persistReview = async () => events.push("review");
  r.API.imageConfig = () => ({ imageProvider: "codex" });
  r.ctx.ComicAPI = {
    generateComicImage: async (...args) => {
      events.push("image");
      assert.equal(args[8].page_id, "page-001");
      return { image_url: "/static/images/revised.png" };
    },
  };
  await c.generate(d, 0);
  assert.ok(events.indexOf("review") < events.indexOf("image"));
  assert.equal(d.images[0].versions.length, 1);
});

test("series saving uses one direct request and accepts the new server revision", async () => {
  const r = runtime(),
    c = Object.create(r.controller),
    calls = [];
  const d = { id: "test", revision: "before", pages: [page] };
  c.store = { drafts: { test: d }, flush: async () => {}, local() {} };
  c.render = () => {};
  c.textConfig = () => ({});
  c.notify = () => {};
  c.refresh = async () => {};
  r.API.request = async (url, method, body) => {
    calls.push({ url, method, body });
    return { draft: { ...d, revision: "after", canonDecision: "saved" } };
  };
  await c.saveToSeries(d);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/console/canon/save");
  assert.equal(calls[0].body.revision, "before");
  assert.equal(d.revision, "after");
  assert.equal(c.store.drafts.test.canonDecision, "saved");
});

test("regenerating a retrospective keeps edited history and other chapters intact", async () => {
  const r = runtime(),
    c = Object.create(r.controller);
  const d = {
    id: "test",
    chapterIndex: 1,
    pages: [page],
    canonDecision: "saved",
    retrospectives: {
      0: { content: "第一话复盘" },
      1: { content: "手工修改的第二话复盘", basedOn: "old" },
    },
  };
  c.store = { flush: async () => {} };
  c.render = () => {};
  c.textConfig = () => ({});
  c.notify = () => {};
  c.changed = () => {};
  r.API.request = async () => ({ content: "新复盘", basedOn: "new" });
  await c.generateRetrospective(d);
  assert.equal(d.retrospectives[0].content, "第一话复盘");
  assert.equal(d.retrospectives[1].history[0].content, "手工修改的第二话复盘");
  assert.equal(d.retrospectives[1].content, "新复盘");
  assert.equal(d.canonDecision, "saved");
  assert.equal(d.pages[0], page);
});

test("memory actions are visible independently of optional exports", () => {
  const r = runtime(),
    Views = r.ctx.window.ConsoleViews;
  const views = new Views({});
  const html = views.memory({ mode: "series", chapterIndex: 0 });
  assert.match(html, /保存本话到系列/);
  assert.match(html, /data-retrospective/);
  assert.match(html, /生成本话复盘/);
  assert.doesNotMatch(html, /ComicBrain|先查看拟更新|确认后保存/);
  assert.equal(views.memory({ mode: "single" }), "");
});

test("AI plot originals survive human edits and chapter switching", async () => {
  const r = runtime(),
    c = Object.create(r.controller);
  const original = {
    title: "AI标题",
    summary: "AI冲突",
    beats: ["开场", "选择", "后果"],
    cover: { title: "封面", description: "视觉瞬间" },
  };
  const d = {
    id: "learning",
    mode: "series",
    idea: "新故事",
    seriesId: "test",
    chapterCount: 1,
    chapterIndex: 0,
    chapters: [],
    pages: [],
    images: {},
  };
  c.store = { flush: async () => {} };
  c.textConfig = () => ({});
  c.render = () => {};
  c.changed = () => {};
  r.API.request = async () => ({
    plan: { chapters: [structuredClone(original)], ruleApplications: [] },
  });
  await c.plan(d);
  d.chapters[0].beats[1] = "人工调整：主角主动承认错误";
  d.title = "人工新标题";
  c.snapshotChapter(d);
  assert.equal(d.chapters[0].aiOriginal.title, "AI标题");
  assert.equal(d.chapters[0].aiOriginal.beats[1], "选择");
  d.futureGuidance = "以后也展示选择的后果";
  c.snapshotChapter(d);
  d.futureGuidance = "";
  c.restoreChapter(d);
  assert.equal(d.futureGuidance, "以后也展示选择的后果");
});
